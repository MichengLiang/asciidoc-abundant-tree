import { existsSync, readFileSync } from "node:fs";
import type {
	AsciidoctorParserAdapter,
	OfficialReaderLine,
	ReaderPush,
} from "../asciidoctor-adapter";
import type { SourceLine } from "../source-lines";
import {
	createIdentityColumnMap,
	createIndentOffsetColumnMap,
} from "./column-map";
import type { BookEntryDiagnostic } from "./diagnostics";
import { constructionError } from "./diagnostics";
import {
	hasLeveloffsetSurface,
	hasOptionalSurface,
	indentSurface,
	parseIncludeAttributes,
	selectionSurface,
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
import { includeDirectivePattern } from "./reader-directive-patterns";
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
	// 正在登记的那一次官方推入（见 ReaderPush）；进入一次 include 时换成它的推入，读完换回。
	currentPush: ReaderPush;
};

const asciidocExtensionPattern = /\.(?:adoc|asciidoc|asc|ad|txt)$/u;

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
		// 被引入的非 AsciiDoc 文件，Reader 不处理其中的指令（见 appendSelectedInclude），里面字面写着的
		// include:: 不是图的一部分；入口文件不论扩展名都处理。
		if (
			selectionSurface(attributes) ||
			!asciidocExtensionPattern.test(includePath)
		) {
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
		currentPush: { id: 0, depth: 0 },
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
	const selector = selectionSurface(attributes);
	const leveloffset = hasLeveloffsetSurface(attributes);
	// 下一条官方行比当前推入深一层，就是这次 include 的推入；没有这样的行，说明官方这次什么也没推入。
	const parent = state.currentPush;
	const first = state.officialLines[state.officialIndex];
	const selection = selector
		? mapIncludeSelection(targetFile.text, selector)
		: undefined;
	// 什么也没推入的 include（选取为空），下一条官方行可能是紧挨着的下一次 include 的推入，深度同样是父层加一：
	// 选取为空就不认推入，并且这次推入里要有出自被引入文件的行（推入的第一行可能是 leveloffset 补的行，
	// 游标还记在外层文件上，所以看整次推入）。
	const candidate =
		first && first.push.depth === parent.depth + 1 && selection?.ok !== false
			? first.push
			: undefined;
	const own =
		candidate &&
		state.officialLines
			.slice(state.officialIndex, pushEnd(candidate, state))
			.some(
				(official) =>
					official.push.id === candidate.id &&
					official.cursor.file === includePath,
			)
			? candidate
			: undefined;
	const end = own ? pushEnd(own, state) : state.officialIndex;
	state.currentPush = own ?? parent;
	consumeGeneratedPreludeForInclude(leveloffset, own, state);
	if (selector && selection) {
		appendSelectedInclude(
			targetFile,
			selector,
			indentSurface(attributes),
			state,
			`${containingFile.relativePath}:${line.number}`,
			selection,
			own,
			leveloffset ? generatedTailStart(end, state) : end,
		);
	} else {
		appendFullFileInclude(targetFile, indentSurface(attributes), state);
	}
	// 没有推入就没有 Reader 补的尾行；照旧去吃会把父文件的空行当成补出来的行。
	if (leveloffset && own) {
		consumeGeneratedTailForInclude(state);
	}
	state.currentPush = parent;
}

// 一次推入在官方行里止于何处：同一次推入的行，以及嵌套在它里面、更深的推入的行。紧挨着的下一次 include
// 与它同深而 id 不同，就此分界。
function pushEnd(own: ReaderPush, state: PreprocessorState): number {
	let index = state.officialIndex;
	for (; index < state.officialLines.length; index += 1) {
		const push = state.officialLines[index]?.push;
		if (!push || (push.id !== own.id && push.depth <= own.depth)) {
			break;
		}
	}
	return index;
}

// leveloffset 的推入末尾是 Reader 补的两行：一个空行与 `:leveloffset!:`（或恢复原值的 `:leveloffset: …`）。
// 它们不是选中的源行，留给 consumeGeneratedTailForInclude。
function generatedTailStart(end: number, state: PreprocessorState): number {
	const last = state.officialLines[end - 1];
	const beforeLast = state.officialLines[end - 2];
	return last?.text.startsWith(":leveloffset") && beforeLast?.text === ""
		? end - 2
		: end;
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
	const asciidoc = asciidocExtensionPattern.test(targetFile.absolutePath);
	for (const line of authoredLines(targetFile)) {
		const directive = asciidoc
			? parseReaderIncludeDirective(line.text)
			: undefined;
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
	selection: ReturnType<typeof mapIncludeSelection>,
	own: ReaderPush | undefined,
	bodyEnd: number,
): void {
	if (!selection.ok) {
		state.diagnostics.push({
			...selection.diagnostic,
			message: `Include '${targetFile.relativePath}' at ${includeSite} with ${selectorSurface(selector)} selects no source lines.`,
		});
	}
	// 逐行与官方 Reader 的输出配对，同整份引入一样：选中的行里有 include 时交给 appendIncludeDirective，
	// 嵌套文件的官方行由它消费。普通行要确认下一条官方行出自这次推入、文本就是这一行，才认它是这一行；
	// 选中区域里的条件指令（ifdef 等）被官方吃掉时，文本对不上，不会把后一行认成前一行。
	// Reader 只对 AsciiDoc 文件处理 include 与条件指令（reader.rb 的 ASCIIDOC_EXTENSIONS）；.py、.md 里字面写着的
	// include:: 原样输出，不能当嵌套 include 展开。
	const asciidoc = asciidocExtensionPattern.test(targetFile.absolutePath);
	for (const sourceLine of selection.ok ? selection.lines : []) {
		const line = targetFile.lineTable.lines[sourceLine - 1];
		const directive =
			asciidoc && line ? parseReaderIncludeDirective(line.text) : undefined;
		if (line && directive && !directive.escaped) {
			appendIncludeDirective(targetFile, line, directive, state);
			continue;
		}
		const official = state.officialLines[state.officialIndex];
		if (
			!line ||
			!official ||
			state.officialIndex >= bodyEnd ||
			official.push.id !== own?.id ||
			!sameLine(official.text, line.text, indent)
		) {
			degradeRestOfPush(targetFile, selector, includeSite, bodyEnd, state);
			return;
		}
		state.officialIndex += 1;
		appendIncludedPhysicalLine(
			targetFile,
			line,
			indent,
			selector,
			state,
			official,
		);
	}
	if (state.officialIndex < bodyEnd) {
		degradeRestOfPush(targetFile, selector, includeSite, bodyEnd, state);
	}
}

// 算出的选中行与官方输出对不上时，这次推入余下的行（连同嵌套在里面的推入）不知道各自来自哪里：登记为
// degraded，坐标保持缺失，而不是逐行硬配——硬配会让这一段之后的每一行都错位（10 号书「选取引入」）。
function degradeRestOfPush(
	targetFile: SourceFileRecord,
	selector: IncludeLineSelector,
	includeSite: string,
	bodyEnd: number,
	state: PreprocessorState,
): void {
	const rest = state.officialLines.slice(state.officialIndex, bodyEnd);
	state.officialIndex = Math.max(state.officialIndex, bodyEnd);
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

// 官方 Reader 读 AsciiDoc 文件时去掉行尾空白，所以只比到行尾空白之前；indent 改的是行首。
function sameLine(
	officialText: string,
	sourceText: string,
	indent: ReturnType<typeof indentSurface>,
): boolean {
	const official = officialText.trimEnd();
	const source = sourceText.trimEnd();
	return indent
		? official.trimStart() === source.trimStart()
		: official === source;
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
	});
}

// leveloffset 的推入开头是 Reader 补的两行：`:leveloffset: …` 与一个空行（reader.rb push_include）。只认这两行，
// 不按“文件第一个非空行”判停：选取的首行本身可以是空行，被当成补出来的行吃掉，整段就错开一行。
function consumeGeneratedPreludeForInclude(
	hasLeveloffset: boolean,
	own: ReaderPush | undefined,
	state: PreprocessorState,
): void {
	const first = state.officialLines[state.officialIndex];
	if (
		!hasLeveloffset ||
		!own ||
		first?.push.id !== own.id ||
		!first.text.startsWith(":leveloffset")
	) {
		return;
	}
	appendGeneratedControl(consumeOfficialLine(state)?.text ?? "", state);
	const blank = state.officialLines[state.officialIndex];
	if (blank?.push.id === own.id && blank.text === "") {
		appendGeneratedControl(consumeOfficialLine(state)?.text ?? "", state);
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
