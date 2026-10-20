import { existsSync, readFileSync } from "node:fs";
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
import { constructionError } from "./diagnostics";
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
	type IncludeDirectiveEvidence,
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
	readonly optionalIncludes: IncludeDirectiveEvidence[];
	readonly includeStack: string[];
	officialIndex: number;
};

const includeDirectivePattern =
	/^(?<indent>\s*)(?<escape>\\?)include::(?<target>[^[]+)\[(?<attrlist>[^\]]*)\]\s*$/u;

function validateIncludeGraph(
	absolutePath: string,
	documentRoot: string,
	stack: string[],
): void {
	const cycleStart = stack.indexOf(absolutePath);
	if (cycleStart !== -1) {
		const cycle = [...stack.slice(cycleStart), absolutePath];
		throw constructionError(
			"include.cycle",
			`Include graph contains a cycle: ${cycle.join(" -> ")}.`,
		);
	}
	const nextStack = [...stack, absolutePath];
	for (const line of authoredTextLines(readFileSync(absolutePath, "utf8"))) {
		const directive = parseReaderIncludeDirective(line);
		if (!directive || directive.escaped) {
			continue;
		}
		const attributes = parseIncludeAttributes(directive.attrlist);
		if (attributes.classification === "unmapped") {
			continue;
		}
		if (isUriTarget(directive.target) || directive.target.includes("{")) {
			throwDiagnostic(
				classifyReaderBoundaryDiagnostic({
					target: directive.target,
					attrlist: directive.attrlist,
					containingFilePath: absolutePath,
					documentRoot,
					missing: false,
				}),
			);
		}
		const includePath = resolveIncludeTarget(absolutePath, directive.target);
		try {
			relativePathWithinDocumentRoot(documentRoot, includePath);
		} catch {
			throwDiagnostic(
				classifyReaderBoundaryDiagnostic({
					target: directive.target,
					attrlist: directive.attrlist,
					containingFilePath: absolutePath,
					documentRoot,
					missing: false,
				}),
			);
		}
		if (!existsSync(includePath)) {
			if (hasOptionalSurface(attributes)) {
				continue;
			}
			throwDiagnostic(
				classifyReaderBoundaryDiagnostic({
					target: directive.target,
					attrlist: directive.attrlist,
					containingFilePath: absolutePath,
					documentRoot,
					missing: true,
				}),
			);
		}
		if (firstSelectionSurface(attributes)) {
			continue;
		}
		validateIncludeGraph(includePath, documentRoot, nextStack);
	}
}

export function preprocessBookEntryWithOfficialReader(
	options: PreprocessBookEntryOptions,
): SourceAwareLogicalDocument {
	const entryPath = resolveEntryPath(options.sourcePath);
	const documentRoot = normalizeDocumentRoot(options.documentRoot);
	relativePathWithinDocumentRoot(documentRoot, entryPath);
	if (!existsSync(entryPath)) {
		throw constructionError(
			"entry.missing-source",
			`Entry source file does not exist: ${entryPath}.`,
		);
	}
	validateIncludeGraph(entryPath, documentRoot, []);
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
		optionalIncludes: [],
		includeStack: [],
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
		...(state.optionalIncludes.length > 0
			? { optionalIncludes: state.optionalIncludes }
			: {}),
	};
	assertSourceAwareLogicalDocumentInvariants(document);
	return document;
}

function appendSourceFile(
	absolutePath: string,
	state: PreprocessorState,
): void {
	const existingIndex = state.includeStack.indexOf(absolutePath);
	if (existingIndex !== -1) {
		const cycle = [...state.includeStack.slice(existingIndex), absolutePath];
		throw constructionError(
			"include.cycle",
			`Include graph contains a cycle: ${cycle.join(" -> ")}.`,
		);
	}
	state.includeStack.push(absolutePath);
	const sourceFile = state.sourceSet.registerFile(absolutePath);
	try {
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
			appendIncludeDirective(sourceFile, line, directive, state);
		}
	} finally {
		state.includeStack.pop();
	}
}

function appendIncludeDirective(
	containingFile: SourceFileRecord,
	line: SourceLine,
	directive: IncludeDirective,
	state: PreprocessorState,
): void {
	const attributes = parseIncludeAttributes(directive.attrlist);
	state.diagnostics.push(...attributes.diagnostics);
	if (attributes.classification === "unmapped") {
		discardRejectedIncludeOutput(containingFile, directive, state);
		return;
	}
	if (isUriTarget(directive.target) || directive.target.includes("{")) {
		throwDiagnostic(
			classifyReaderBoundaryDiagnostic({
				target: directive.target,
				attrlist: directive.attrlist,
				containingFilePath: containingFile.absolutePath,
				documentRoot: state.documentRoot,
				missing: false,
			}),
		);
	}

	const includePath = resolveIncludeTarget(
		containingFile.absolutePath,
		directive.target,
	);
	try {
		relativePathWithinDocumentRoot(state.documentRoot, includePath);
	} catch {
		throwDiagnostic(
			classifyReaderBoundaryDiagnostic({
				target: directive.target,
				attrlist: directive.attrlist,
				containingFilePath: containingFile.absolutePath,
				documentRoot: state.documentRoot,
				missing: false,
			}),
		);
	}
	if (!existsSync(includePath)) {
		if (hasOptionalSurface(attributes)) {
			state.optionalIncludes.push(
				includeEvidence(containingFile, line.number, directive, attributes.raw),
			);
		} else {
			throwDiagnostic(
				classifyReaderBoundaryDiagnostic({
					target: directive.target,
					attrlist: directive.attrlist,
					containingFilePath: containingFile.absolutePath,
					documentRoot: state.documentRoot,
					missing: true,
				}),
			);
		}
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
			`${containingFile.relativePath}:${line.number}`,
		);
	} else {
		appendFullFileInclude(targetFile, indentSurface(attributes), state);
	}
	if (hasLeveloffsetSurface(attributes)) {
		consumeGeneratedTailForInclude(state);
	}
}

function throwDiagnostic(diagnostic: BookEntryDiagnostic): never {
	throw constructionError(
		diagnostic.code,
		diagnostic.message,
		diagnostic.source,
	);
}

function includeEvidence(
	containingFile: SourceFileRecord,
	sourceLine: number,
	directive: IncludeDirective,
	attrlist: string,
): IncludeDirectiveEvidence {
	return {
		absolutePath: containingFile.absolutePath,
		relativePath: containingFile.relativePath,
		sourceLine,
		target: directive.target,
		attrlist,
	};
}

function discardRejectedIncludeOutput(
	containingFile: SourceFileRecord,
	directive: IncludeDirective,
	state: PreprocessorState,
): void {
	const includePath = resolveIncludeTarget(
		containingFile.absolutePath,
		directive.target,
	);
	while (state.officialIndex < state.officialLines.length) {
		const next = state.officialLines[state.officialIndex];
		if (!next || next.cursor.file !== includePath) {
			break;
		}
		state.officialIndex += 1;
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
			appendIncludeDirective(targetFile, line, directive, state);
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
	includeSite: string,
): void {
	const selection = mapIncludeSelection(targetFile.text, selector);
	if (!selection.ok) {
		state.diagnostics.push({
			...selection.diagnostic,
			message: `Include '${targetFile.relativePath}' at ${includeSite} with ${selectorSurface(selector)} selects no source lines.`,
		});
	}
	// 逐行与官方 Reader 的输出配对，同整份引入一样：选中的行里有 include 时交给 appendIncludeDirective，
	// 嵌套文件的官方行由它消费。普通行要确认下一条官方行属于这次推入（见 belongsToPush）、文本就是这一行，
	// 才认它是这一行；选中区域里的条件指令（ifdef 等）被官方吃掉时，文本对不上，不会把后一行认成前一行。
	const selected = selection.ok ? selection.lines : [];
	const lastSelected = selected.at(-1);
	let last: OfficialReaderLine | undefined;
	const mismatch = (): void =>
		degradeRestOfPush(
			targetFile,
			selector,
			includeSite,
			last,
			lastSelected,
			state,
		);
	for (const sourceLine of selected) {
		const line = targetFile.lineTable.lines[sourceLine - 1];
		const directive = line && parseReaderIncludeDirective(line.text);
		if (line && directive && !directive.escaped) {
			appendIncludeDirective(targetFile, line, directive, state);
			continue;
		}
		const official = state.officialLines[state.officialIndex];
		if (
			!line ||
			!belongsToPush(targetFile.absolutePath, last, lastSelected, official) ||
			!sameLine(official.text, line.text, indent)
		) {
			mismatch();
			return;
		}
		state.officialIndex += 1;
		last = official;
		appendIncludedPhysicalLine(
			targetFile,
			line,
			indent,
			selector,
			state,
			official,
		);
	}
	const next = state.officialLines[state.officialIndex];
	if (belongsToPush(targetFile.absolutePath, last, lastSelected, next)) {
		mismatch();
	}
}

// 算出的选中行与官方输出对不上时，这次推入剩下的行不知道各自来自哪里：登记为 degraded，坐标保持缺失，
// 而不是逐行硬配——硬配会让这一段之后的每一行都错位（10 号书「选取引入」）。
// 只收这个文件自己的行：对不上之后，选中区域里若还有嵌套 include，它的行不在这里，会留给后面的记录；
// 那要条件指令与嵌套 include 同处一个选中区域才会出现。
function degradeRestOfPush(
	targetFile: SourceFileRecord,
	selector: IncludeLineSelector,
	includeSite: string,
	last: OfficialReaderLine | undefined,
	lastSelected: number | undefined,
	state: PreprocessorState,
): void {
	const rest: OfficialReaderLine[] = [];
	for (
		let next = state.officialLines[state.officialIndex];
		next &&
		belongsToPush(
			targetFile.absolutePath,
			rest.at(-1) ?? last,
			lastSelected,
			next,
		);
		next = state.officialLines[state.officialIndex]
	) {
		rest.push(next);
		state.officialIndex += 1;
	}
	const diagnostic: BookEntryDiagnostic = {
		level: "warning",
		code: "origin-map.selection-mismatch",
		message: `Include '${targetFile.relativePath}' at ${includeSite} with ${selectorSurface(selector)}: the selected source lines do not line up with the official Reader output; ${rest.length} line(s) are left without source coordinates.`,
	};
	state.diagnostics.push(diagnostic);
	for (const line of rest) {
		state.records.push({
			kind: "degraded",
			logicalLine: state.records.length + 1,
			text: line.text,
			evidence: line.cursor,
			diagnostic,
		});
	}
}

function selectorSurface(selector: IncludeLineSelector): string {
	return selector.kind === "tag"
		? `tag=${selector.name}`
		: `${selector.kind}=${selector.expression}`;
}

function sameLine(
	officialText: string,
	sourceText: string,
	indent: ReturnType<typeof indentSurface>,
): boolean {
	return indent
		? officialText.trimStart() === sourceText.trimStart()
		: officialText === sourceText;
}

// 一条官方行属于这次推入：游标（经适配器校正）指向被引入的文件，行号比上一行大，且不超过最后一条
// 选中的源行。Asciidoctor 一次推入的行号从第一条选中行起算，每读一行加一，被条件指令吃掉的行也算
// （reader.rb：“not accounting for skipped lines in reader line numbering”）；读过的行数不超过选中的行数，
// 所以行号递增、不越过最后一条选中行，有空隙时只会少算。紧挨着再引入同一个文件时，下一次推入从它
// 自己的首行重新起算，违反其中一条，就此分界。
function belongsToPush(
	absolutePath: string,
	previous: OfficialReaderLine | undefined,
	lastSelected: number | undefined,
	next: OfficialReaderLine | undefined,
): next is OfficialReaderLine {
	if (next?.cursor.file !== absolutePath) {
		return false;
	}
	const before = previous?.cursor.lineNumber;
	const after = next.cursor.lineNumber;
	if (after === undefined) {
		return true;
	}
	return (
		(before === undefined || after > before) &&
		(lastSelected === undefined || after <= lastSelected)
	);
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
	official: OfficialReaderLine | undefined = consumeOfficialLine(state),
): void {
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
	const official = consumeEscapedIncludeOfficialLine(state);
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
		const official = consumeOfficialLine(state);
		if (official?.text.startsWith(":leveloffset")) {
			appendGeneratedControl(official.text, state);
			break;
		}
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

function consumeEscapedIncludeOfficialLine(
	state: PreprocessorState,
): OfficialReaderLine | undefined {
	const first = consumeOfficialLine(state);
	const second = state.officialLines[state.officialIndex];
	if (first?.text === "\\" && second?.text.startsWith("include::")) {
		state.officialIndex += 1;
		return { ...second, text: second.text };
	}
	return first;
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

function authoredTextLines(sourceText: string): readonly string[] {
	const lines = sourceText.split(/\r?\n/u);
	if (sourceText.endsWith("\n") && lines.at(-1) === "") {
		return lines.slice(0, -1);
	}
	return lines;
}
