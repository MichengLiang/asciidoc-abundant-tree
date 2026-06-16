import { existsSync } from "node:fs";
import type {
	AsciidoctorParserAdapter,
	OfficialReaderLine,
} from "../asciidoctor-adapter";
import type { SourceLine } from "../source-lines";
import {
	createIdentityColumnMap,
	createIndentOffsetColumnMap,
} from "./column-map";
import type { BookEntryDiagnostic } from "./diagnostics";
import {
	firstSelectionSurface,
	hasLeveloffsetSurface,
	hasOptionalSurface,
	indentSurface,
	parseIncludeAttributes,
} from "./include-attribute-model";
import {
	type IncludeLineSelector,
	mapIncludeSelection,
} from "./include-selection-mapper";
import {
	assertSourceAwareLogicalDocumentInvariants,
	type LogicalLineRecord,
	type SourceAwareLogicalDocument,
	type SourceFileRecord,
} from "./line-origin-model";
import { buildParserSafeLogicalText } from "./parser-safe-logical-text";
import {
	normalizeDocumentRoot,
	relativePathWithinDocumentRoot,
	resolveEntryPath,
	resolveIncludeTarget,
} from "./path-boundary";
import {
	classifyReaderBoundaryDiagnostic,
	isUriTarget,
	readerPreprocessingOptions,
} from "./reader-boundary-policy";
import { createSourceSet } from "./source-set";

export type PreprocessBookEntryOptions = {
	readonly adapter: AsciidoctorParserAdapter;
	readonly sourcePath: string;
	readonly documentRoot: string;
	readonly attributes?: Record<string, unknown> | undefined;
};

type IncludeDirective = {
	readonly target: string;
	readonly attrlist: string;
	readonly escaped: boolean;
};

type PreprocessorState = {
	readonly documentRoot: string;
	readonly officialLines: readonly OfficialReaderLine[];
	readonly sourceSet: ReturnType<typeof createSourceSet>;
	readonly records: LogicalLineRecord[];
	readonly diagnostics: BookEntryDiagnostic[];
	officialIndex: number;
};

const includeDirectivePattern =
	/^(?<indent>\s*)(?<escape>\\?)include::(?<target>[^[]+)\[(?<attrlist>[^\]]*)\]\s*$/u;

export function preprocessBookEntryWithOfficialReader(
	options: PreprocessBookEntryOptions,
): SourceAwareLogicalDocument {
	const entryPath = resolveEntryPath(options.sourcePath);
	const documentRoot = normalizeDocumentRoot(options.documentRoot);
	relativePathWithinDocumentRoot(documentRoot, entryPath);
	const officialLines = options.adapter.readPreprocessedLines(
		readerPreprocessingOptions({
			sourcePath: entryPath,
			documentRoot,
			attributes: options.attributes,
		}),
	);
	const state: PreprocessorState = {
		documentRoot,
		officialLines,
		sourceSet: createSourceSet({ documentRoot }),
		records: [],
		diagnostics: [],
		officialIndex: 0,
	};

	appendSourceFile(entryPath, state);
	consumeUnmappedOfficialTail(state);
	const safe = buildParserSafeLogicalText(state.records);
	const document: SourceAwareLogicalDocument = {
		entryPath,
		documentRoot,
		logicalText: safe.text,
		lines: safe.lineRecords,
		sourceFiles: state.sourceSet.records(),
		diagnostics: state.diagnostics,
	};
	assertSourceAwareLogicalDocumentInvariants(document);
	return document;
}

function appendSourceFile(
	absolutePath: string,
	state: PreprocessorState,
): void {
	const sourceFile = state.sourceSet.registerFile(absolutePath);
	for (const line of authoredLines(sourceFile)) {
		const directive = parseReaderIncludeDirective(line.text);
		if (!directive) {
			appendPhysicalLine(sourceFile, line, state);
			continue;
		}
		if (directive.escaped) {
			appendEscapedIncludeLine(sourceFile, line, state);
			continue;
		}
		appendIncludeDirective(sourceFile, directive, state);
	}
}

function appendIncludeDirective(
	containingFile: SourceFileRecord,
	directive: IncludeDirective,
	state: PreprocessorState,
): void {
	const attributes = parseIncludeAttributes(directive.attrlist);
	state.diagnostics.push(...attributes.diagnostics);
	if (isUriTarget(directive.target) || directive.target.includes("{")) {
		state.diagnostics.push(
			classifyReaderBoundaryDiagnostic({
				target: directive.target,
				attrlist: directive.attrlist,
				containingFilePath: containingFile.absolutePath,
				documentRoot: state.documentRoot,
				missing: false,
			}),
		);
		return;
	}

	const includePath = resolveIncludeTarget(
		containingFile.absolutePath,
		directive.target,
	);
	try {
		relativePathWithinDocumentRoot(state.documentRoot, includePath);
	} catch {
		state.diagnostics.push(
			classifyReaderBoundaryDiagnostic({
				target: directive.target,
				attrlist: directive.attrlist,
				containingFilePath: containingFile.absolutePath,
				documentRoot: state.documentRoot,
				missing: false,
			}),
		);
		return;
	}
	if (!existsSync(includePath)) {
		state.diagnostics.push(
			classifyReaderBoundaryDiagnostic({
				target: directive.target,
				attrlist: directive.attrlist,
				containingFilePath: containingFile.absolutePath,
				documentRoot: state.documentRoot,
				missing: true,
			}),
		);
		return;
	}

	const targetFile = state.sourceSet.registerFile(includePath);
	const selector = firstSelectionSurface(attributes);
	consumeGeneratedPreludeForInclude(
		targetFile,
		hasLeveloffsetSurface(attributes),
		state,
	);
	if (selector) {
		appendSelectedInclude(
			targetFile,
			selector,
			indentSurface(attributes),
			state,
		);
	} else {
		appendFullFileInclude(targetFile, indentSurface(attributes), state);
	}
	if (hasLeveloffsetSurface(attributes)) {
		consumeGeneratedTailForInclude(state);
	}
	if (hasOptionalSurface(attributes)) {
		return;
	}
}

function appendFullFileInclude(
	targetFile: SourceFileRecord,
	indent: ReturnType<typeof indentSurface>,
	state: PreprocessorState,
): void {
	for (const line of authoredLines(targetFile)) {
		const directive = parseReaderIncludeDirective(line.text);
		if (directive && !directive.escaped) {
			appendIncludeDirective(targetFile, directive, state);
			continue;
		}
		appendIncludedPhysicalLine(targetFile, line, indent, undefined, state);
	}
}

function appendSelectedInclude(
	targetFile: SourceFileRecord,
	selector: IncludeLineSelector,
	indent: ReturnType<typeof indentSurface>,
	state: PreprocessorState,
): void {
	const selection = mapIncludeSelection(targetFile.text, selector);
	if (!selection.ok) {
		state.diagnostics.push(selection.diagnostic);
		return;
	}
	for (const sourceLine of selection.lines) {
		const line = targetFile.lineTable.lines[sourceLine - 1];
		if (!line) {
			continue;
		}
		appendIncludedPhysicalLine(targetFile, line, indent, selector, state);
	}
}

function appendPhysicalLine(
	sourceFile: SourceFileRecord,
	line: SourceLine,
	state: PreprocessorState,
): void {
	const official = consumeOfficialLine(state);
	state.records.push({
		kind: "source-preserving",
		logicalLine: state.records.length + 1,
		text: official?.text ?? line.text,
		origin: {
			absolutePath: sourceFile.absolutePath,
			relativePath: sourceFile.relativePath,
			sourceLine: line.number,
		},
		columnMap: createIdentityColumnMap(),
	});
}

function appendIncludedPhysicalLine(
	sourceFile: SourceFileRecord,
	line: SourceLine,
	indent: ReturnType<typeof indentSurface>,
	selector: IncludeLineSelector | undefined,
	state: PreprocessorState,
): void {
	const official = consumeOfficialLine(state);
	const text = official?.text ?? line.text;
	const origin = {
		absolutePath: sourceFile.absolutePath,
		relativePath: sourceFile.relativePath,
		sourceLine: line.number,
	};
	if (indent && text !== line.text) {
		state.records.push({
			kind: "transformed-source",
			logicalLine: state.records.length + 1,
			text,
			originText: line.text,
			origin,
			transform: { kind: "indent", columns: indent.columns },
			columnMap: createIndentOffsetColumnMap({
				insertedColumns: Math.max(0, indent.columns),
			}),
		});
		return;
	}
	if (selector) {
		state.records.push({
			kind: "selected-source",
			logicalLine: state.records.length + 1,
			text,
			origin,
			selector,
			columnMap: createIdentityColumnMap(),
		});
		return;
	}
	state.records.push({
		kind: "source-preserving",
		logicalLine: state.records.length + 1,
		text,
		origin,
		columnMap: createIdentityColumnMap(),
	});
}

function appendEscapedIncludeLine(
	sourceFile: SourceFileRecord,
	line: SourceLine,
	state: PreprocessorState,
): void {
	const official = consumeOfficialLine(state);
	state.records.push({
		kind: "source-preserving",
		logicalLine: state.records.length + 1,
		text: official?.text ?? line.text.replace(/^(\s*)\\/u, "$1"),
		origin: {
			absolutePath: sourceFile.absolutePath,
			relativePath: sourceFile.relativePath,
			sourceLine: line.number,
		},
		columnMap: createIdentityColumnMap(),
		escapedInclude: true,
	});
}

function consumeGeneratedPreludeForInclude(
	targetFile: SourceFileRecord,
	hasLeveloffset: boolean,
	state: PreprocessorState,
): void {
	if (!hasLeveloffset) {
		return;
	}
	const firstAuthored = authoredLines(targetFile).find(
		(line) => line.text !== "",
	);
	while (state.officialIndex < state.officialLines.length) {
		const next = state.officialLines[state.officialIndex];
		if (!next || next.text === firstAuthored?.text) {
			break;
		}
		if (next.text.startsWith(":leveloffset") || next.text === "") {
			appendGeneratedControl(consumeOfficialLine(state)?.text ?? "", state);
			continue;
		}
		break;
	}
}

function consumeGeneratedTailForInclude(state: PreprocessorState): void {
	while (state.officialIndex < state.officialLines.length) {
		const next = state.officialLines[state.officialIndex];
		if (!next || !(next.text === "" || next.text.startsWith(":leveloffset"))) {
			break;
		}
		appendGeneratedControl(consumeOfficialLine(state)?.text ?? "", state);
	}
}

function consumeUnmappedOfficialTail(state: PreprocessorState): void {
	while (state.officialIndex < state.officialLines.length) {
		const official = consumeOfficialLine(state);
		if (!official) {
			break;
		}
		if (official.text.startsWith(":leveloffset")) {
			appendGeneratedControl(official.text, state);
			continue;
		}
		state.records.push({
			kind: "degraded",
			logicalLine: state.records.length + 1,
			text: official.text,
			evidence: official.cursor,
			diagnostic: {
				level: "warning",
				code: "source-coordinate.degraded-line",
				message:
					"Official Reader emitted a line without source mapping evidence.",
			},
		});
	}
}

function appendGeneratedControl(text: string, state: PreprocessorState): void {
	state.records.push({
		kind: "generated-control",
		logicalLine: state.records.length + 1,
		text,
		generatedKind:
			text === ":leveloffset!:" ? "leveloffset-pop" : "leveloffset-push",
	});
}

function consumeOfficialLine(
	state: PreprocessorState,
): OfficialReaderLine | undefined {
	const official = state.officialLines[state.officialIndex];
	state.officialIndex += 1;
	return official;
}

function parseReaderIncludeDirective(
	line: string,
): IncludeDirective | undefined {
	const match = includeDirectivePattern.exec(line);
	if (!match?.groups) {
		return undefined;
	}
	return {
		target: match.groups.target ?? "",
		attrlist: match.groups.attrlist ?? "",
		escaped: match.groups.escape === "\\",
	};
}

function authoredLines(sourceFile: SourceFileRecord): readonly SourceLine[] {
	if (
		sourceFile.text.endsWith("\n") &&
		sourceFile.lineTable.lines.at(-1)?.text === ""
	) {
		return sourceFile.lineTable.lines.slice(0, -1);
	}
	return sourceFile.lineTable.lines;
}
