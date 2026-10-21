import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import {
	recoverSourceAwarePointSourceLayer,
	sourceAwareDocumentForLineTable,
} from "./book-entry/source-aware-coordinate";
import { interpretHeadingInlineMetadataAttributes } from "./heading-inline-metadata";
import { parseMacroArguments } from "./macro-argument-parser";
import type {
	AnchorOccurrenceNode,
	HeadingInlineMetadataOccurrenceNode,
	LineSpan,
	SectionNode,
	SourceSpan,
	ToolDiagnostic,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";
import { officialBlockPolicy } from "./official-block-policy";
import {
	asciidocCellDocuments,
	cellDocument,
	tableCells,
} from "./official-block-utils";
import {
	type OfficialBlockSurface,
	walkOfficialBlocks,
} from "./official-block-walker";
import { cellSourceLine, markdownQuoteDepth } from "./official-source-location";
import {
	resolveSourceInterval,
	type SourceInterval,
} from "./source-interval-resolver";
import type { LineRange, LineTable, SourceLine } from "./source-lines";
import {
	isLineComment,
	lineText,
	quotedLineTable,
	sourceSpanForRange,
} from "./source-lines";

const shorthandXrefPattern = /<<([^>,]+)(?:,\s*([^>]+))?>>/gu;
const macroXrefPattern = /xref:([^\s[]+)\[([^\]]*)\]/gu;
// 锚点照 Asciidoctor 4.1.1 的 rx.js：ID 首字符是字母、_ 或 :（InlineAnchorScanRx）；[[ 前面是 [ 或 \ 时不是锚点，
// 所以 [[[id]]] 不会读出 ID "[id"。参考文献锚点 [[[id]]] 只在 bibliography 样式的无序列表项开头成立
// （InlineBiblioAnchorRx，parser.js 建列表项时登记），由 bibliographyAnchorPattern 认。
const anchorId = String.raw`[\p{Alphabetic}_:][\p{Alphabetic}\p{N}\p{Pc}\-:.]*`;
const anchorPattern = new RegExp(
	String.raw`(?<![\\\[])\[\[(${anchorId})(?:, *(.+?))? ?\]\]` +
		String.raw`|(?<!\\)anchor:(${anchorId})\[(?:\]|(.*?[^\\])\])`,
	"gu",
);
const bibliographyAnchorPattern = new RegExp(
	String.raw`^(\s*[*-]+\s+)\[\[\[(${anchorId})(?:, *(.+?))?\]\]\]`,
	"u",
);
const headingInlineMetadataPattern = /hmeta:([^\s[]+)\[([^\]]*)\]/gu;

export function scanInlineOccurrencesInOfficialBlocks(options: {
	lineTable: LineTable;
	blockSurfaces: OfficialBlockSurface[];
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>;
	sectionByLine: Map<number, SectionNode>;
	toolDiagnostics?: ToolDiagnostic[];
}): {
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[];
} {
	const collected: Collected = {
		lineTable: options.lineTable,
		xrefOccurrences: [],
		anchorOccurrences: [],
		headingInlineMetadataOccurrences: [],
		toolDiagnostics: options.toolDiagnostics,
	};
	scanSurfaces(collected, options.blockSurfaces, options.intervalByBlock);
	const {
		xrefOccurrences,
		anchorOccurrences,
		headingInlineMetadataOccurrences,
	} = collected;

	// 所属 section 是逻辑文档上的结构关系，要趁出现处还带着逻辑行时判定；下面回源以后只剩来源坐标。
	assignContainingSectionIds(
		xrefOccurrences,
		anchorOccurrences,
		headingInlineMetadataOccurrences,
		options.sectionByLine,
	);
	const sourceAwareDocument = sourceAwareDocumentForLineTable(
		options.lineTable,
	);
	const recover = <
		T extends Parameters<typeof recoverSourceAwareInlineOrigins>[0][number],
	>(
		occurrences: T[],
	): T[] =>
		sourceAwareDocument
			? recoverSourceAwareInlineOrigins(
					occurrences,
					sourceAwareDocument,
					options.toolDiagnostics,
				)
			: occurrences;
	const recoveredXrefs = recover(xrefOccurrences);
	const recoveredAnchors = recover(anchorOccurrences);
	const recoveredHeadingInlineMetadata = recover(
		headingInlineMetadataOccurrences,
	);

	return {
		xrefOccurrences: dedupeOccurrences(recoveredXrefs).sort(compareSourceSpans),
		anchorOccurrences:
			dedupeOccurrences(recoveredAnchors).sort(compareSourceSpans),
		headingInlineMetadataOccurrences: dedupeOccurrences(
			recoveredHeadingInlineMetadata,
		).sort(compareSourceSpans),
	};
}

function recoverSourceAwareInlineOrigins<
	T extends {
		raw: string;
		sourceSpan?: SourceSpan;
		source?: {
			raw?: string;
			line?: number;
			sourceSpan?: SourceSpan;
			relativePath?: string;
		};
	},
>(
	occurrences: T[],
	sourceAwareDocument: NonNullable<
		ReturnType<typeof sourceAwareDocumentForLineTable>
	>,
	toolDiagnostics: ToolDiagnostic[] | undefined,
): T[] {
	const recoveredOccurrences: T[] = [];
	for (const occurrence of occurrences) {
		if (!occurrence.sourceSpan) {
			recoveredOccurrences.push(occurrence);
			continue;
		}
		const recovered = recoverSourceAwarePointSourceLayer(
			sourceAwareDocument,
			occurrence.sourceSpan,
			occurrence.raw,
		);
		if (!recovered.ok) {
			toolDiagnostics?.push(recovered.diagnostic);
			if (recovered.sourceLayer) {
				delete occurrence.sourceSpan;
				occurrence.source = {
					...occurrence.source,
					...recovered.sourceLayer,
				};
			}
			recoveredOccurrences.push(occurrence);
			continue;
		}
		if (recovered.sourceSpan) {
			occurrence.sourceSpan = recovered.sourceSpan;
		}
		occurrence.source = {
			...occurrence.source,
			...recovered.sourceLayer,
		};
		recoveredOccurrences.push(occurrence);
	}
	return recoveredOccurrences;
}

type Collected = {
	lineTable: LineTable;
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[];
	toolDiagnostics: ToolDiagnostic[] | undefined;
};

// 正文的块与 a| 单元格里的块走同一个循环（09 号书「Inline 扫描边界」）：按 policy 扫描、递归或跳过。
function scanSurfaces(
	collected: Collected,
	surfaces: OfficialBlockSurface[],
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
): void {
	for (const surface of surfaces) {
		const interval = intervalByBlock.get(surface.block);
		if (!interval) {
			continue;
		}
		if (hasDiagnosticPolicyAncestor(surface)) {
			if (isPreambleParagraph(surface)) {
				scanHeadingInlineMetadataRange(
					collected.lineTable,
					interval.contentSpan?.startLine ?? interval.span.startLine,
					interval.contentSpan?.endLine ?? interval.span.endLine,
					collected.headingInlineMetadataOccurrences,
					collected.toolDiagnostics,
				);
			}
			continue;
		}
		if (interval.metadataSpan) {
			scanMetadataRange(
				collected.lineTable,
				interval.metadataSpan.startLine,
				interval.metadataSpan.endLine,
				collected.xrefOccurrences,
				collected.anchorOccurrences,
			);
		}
		const span = interval.contentSpan ?? interval.span;
		const policy = officialBlockPolicy(surface.block);
		if (policy !== "scan") {
			continue;
		}
		if (!scansMacroSubstitutedContent(surface)) {
			continue;
		}
		if (surface.context === "table") {
			scanTable(collected, surface.block);
		} else {
			scanInlineRange(
				collected.lineTable,
				span.startLine,
				span.endLine,
				collected.xrefOccurrences,
				collected.anchorOccurrences,
				collected.headingInlineMetadataOccurrences,
				collected.toolDiagnostics,
				descendantUnscannableRanges(surface, intervalByBlock),
				isBibliographyList(surface),
				skipsLineComments(surface, interval)
					? quotedLineTable(
							collected.lineTable,
							markdownQuoteDepth(surface.block),
						)
					: null,
			);
		}
	}
}

// 官方按段落读的文字跳过行注释（parser.js 1066、1525 行）；按分隔符读的内容不跳过（1531 行），分隔的 verse 块里的
// `//` 行是内容。复合块的内容会再读成块，块与块之间的注释行被当作 metadata 读掉，同样不是文字。
function skipsLineComments(
	surface: OfficialBlockSurface,
	interval: SourceInterval,
): boolean {
	return (
		interval.delimited !== true ||
		surface.block.getContentModel?.() === "compound"
	);
}

function hasDiagnosticPolicyAncestor(surface: OfficialBlockSurface): boolean {
	let current = surface.parent;
	while (current) {
		if (officialBlockPolicy(current.block) === "diagnostic") {
			return true;
		}
		current = current.parent;
	}
	return false;
}

function isPreambleParagraph(surface: OfficialBlockSurface): boolean {
	return (
		surface.context === "paragraph" && surface.parent?.context === "preamble"
	);
}

function scansMacroSubstitutedContent(surface: OfficialBlockSurface): boolean {
	// Asciidoctor exposes term/cell inline substitutions below these containers,
	// not as a useful "macros" entry on the container block itself.
	if (surface.context === "dlist" || surface.context === "table") {
		return true;
	}
	const substitutions = surface.block.getSubstitutions?.();
	return !Array.isArray(substitutions) || substitutions.includes("macros");
}

function assignContainingSectionIds(
	xrefs: XrefOccurrenceNode[],
	anchors: AnchorOccurrenceNode[],
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[],
	sectionByLine: Map<number, SectionNode>,
): void {
	for (const occurrence of [
		...xrefs,
		...anchors,
		...headingInlineMetadataOccurrences,
	]) {
		const line = occurrence.sourceSpan?.start.line;
		const sectionId =
			line === undefined ? undefined : sectionByLine.get(line)?.ids[0];
		if (sectionId !== undefined) {
			occurrence.containingSectionId = sectionId;
		}
	}
}

function makeXref(
	lineTable: LineTable,
	line: SourceLine,
	index: number,
	raw: string,
	parts: {
		syntax: XrefOccurrenceNode["syntax"];
		target: string;
		label?: string;
		attributes?: Record<string, string | number | boolean>;
	},
): XrefOccurrenceNode {
	const sourceSpan = sourceSpanForRange(lineTable, line.number, index, raw);
	return definedObject({
		kind: "xref",
		...parts,
		raw,
		sourceSpan,
		targetKind: parts.target.includes(".adoc#")
			? "document-target"
			: parts.target.includes(".")
				? "natural-title-candidate"
				: "id-or-anchor",
		scope: parts.target.includes(".adoc#") ? "external" : undefined,
		source: {
			raw,
			line: line.number,
			sourceSpan,
		},
	}) as XrefOccurrenceNode;
}

function parseMacroLabel(raw: string): {
	label?: string;
	attributes?: Record<string, string | number | boolean>;
} {
	const parsed = parseMacroArguments(raw);
	const label = parsed.positional[0];
	return definedObject({
		label: label || undefined,
		attributes: Object.keys(parsed.named).length > 0 ? parsed.named : undefined,
	}) as {
		label?: string;
		attributes?: Record<string, string | number | boolean>;
	};
}

function compareSourceSpans(
	left: { sourceSpan?: SourceSpan },
	right: { sourceSpan?: SourceSpan },
): number {
	return (
		(left.sourceSpan?.start.line ?? 0) - (right.sourceSpan?.start.line ?? 0) ||
		(left.sourceSpan?.start.column ?? 0) - (right.sourceSpan?.start.column ?? 0)
	);
}

function scanInlineRange(
	lineTable: LineTable,
	startLine: number,
	endLine: number,
	xrefOccurrences: XrefOccurrenceNode[],
	anchorOccurrences: AnchorOccurrenceNode[],
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[],
	toolDiagnostics: ToolDiagnostic[] | undefined,
	skipRanges: LineRange[],
	bibliography: boolean,
	// 按官方读到的行认行注释：markdown 引语里的块，读到的是去掉前缀的行。null 表示内容按分隔符读进，不跳过注释。
	commentView: LineTable | null,
): void {
	for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
		if (isLineInRanges(lineNumber, skipRanges)) {
			continue;
		}
		const line = lineTable.lines[lineNumber - 1];
		if (
			!line ||
			(commentView && isLineComment(lineText(commentView, lineNumber)))
		) {
			continue;
		}
		scanXrefMatches(lineTable, line, xrefOccurrences);
		if (bibliography) {
			scanBibliographyAnchor(lineTable, line, anchorOccurrences);
		}
		scanAnchorMatches(lineTable, line, anchorOccurrences);
		scanHeadingInlineMetadataMatches(
			lineTable,
			line,
			headingInlineMetadataOccurrences,
			toolDiagnostics,
		);
	}
}

function scanXrefMatches(
	lineTable: LineTable,
	line: SourceLine,
	xrefOccurrences: XrefOccurrenceNode[],
): void {
	for (const match of line.text.matchAll(shorthandXrefPattern)) {
		if (match.index === undefined || !match[1]) {
			continue;
		}
		const label = match[2]?.trim();
		xrefOccurrences.push(
			makeXref(
				lineTable,
				line,
				match.index,
				match[0],
				label
					? {
							syntax: "shorthand",
							target: match[1].trim(),
							label,
						}
					: {
							syntax: "shorthand",
							target: match[1].trim(),
						},
			),
		);
	}
	for (const match of line.text.matchAll(macroXrefPattern)) {
		if (match.index === undefined || !match[1]) {
			continue;
		}
		const parsed = parseMacroLabel(match[2] ?? "");
		const parts = definedObject({
			syntax: "macro",
			target: match[1].trim(),
			label: parsed.label,
			attributes: parsed.attributes,
		}) as {
			syntax: "macro";
			target: string;
			label?: string;
			attributes?: Record<string, string | number | boolean>;
		};
		xrefOccurrences.push(
			makeXref(lineTable, line, match.index, match[0], parts),
		);
	}
}

// 表格自己不扫：普通单元格扫它的文本行；a| 单元格的内嵌文档按正文的规则解析区间、交给 scanSurfaces。
function scanTable(collected: Collected, block: AsciidoctorBlock): void {
	for (const range of mergeLineSpans(ordinaryCellRanges(block))) {
		scanInlineRange(
			collected.lineTable,
			range.startLine,
			range.endLine,
			collected.xrefOccurrences,
			collected.anchorOccurrences,
			collected.headingInlineMetadataOccurrences,
			collected.toolDiagnostics,
			[],
			false,
			collected.lineTable,
		);
	}
	for (const document of asciidocCellDocuments(block)) {
		const surfaces = walkOfficialBlocks(document);
		const intervalByBlock = new WeakMap<AsciidoctorBlock, SourceInterval>();
		for (const surface of surfaces) {
			const interval = resolveSourceInterval(surface, collected.lineTable);
			if (interval) {
				intervalByBlock.set(surface.block, interval);
				collected.toolDiagnostics?.push(...interval.diagnostics);
			}
		}
		scanSurfaces(collected, surfaces, intervalByBlock);
	}
}

type TableCell = {
	getLineNumber?: () => number | undefined;
	// 4.x 的 Cell#lines 是方法（table.js 616 行），给出单元格文本的行。
	lines?: () => string[];
};

function ordinaryCellRanges(block: AsciidoctorBlock): LineSpan[] {
	return tableCells(block).flatMap((cell) => {
		if (cellDocument(cell) !== undefined || !isRecord(cell)) {
			return [];
		}
		const tableCell = cell as TableCell;
		const startLine = tableCell.getLineNumber?.();
		if (startLine === undefined) {
			return [];
		}
		const lineCount = Math.max(1, tableCell.lines?.().length ?? 1);
		return [
			{
				startLine: cellSourceLine(block, startLine),
				endLine: cellSourceLine(block, startLine + lineCount - 1),
			},
		];
	});
}

function mergeLineSpans(ranges: LineSpan[]): LineSpan[] {
	const sorted = [...ranges].sort(
		(left, right) =>
			left.startLine - right.startLine || left.endLine - right.endLine,
	);
	const merged: LineSpan[] = [];
	for (const range of sorted) {
		const previous = merged.at(-1);
		if (!previous || range.startLine > previous.endLine + 1) {
			merged.push({ ...range });
			continue;
		}
		previous.endLine = Math.max(previous.endLine, range.endLine);
	}
	return merged;
}

function descendantUnscannableRanges(
	surface: OfficialBlockSurface,
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
): LineRange[] {
	const ranges: LineRange[] = [];
	for (const child of surface.children) {
		collectUnscannableRanges(child, intervalByBlock, ranges);
	}
	return mergeLineSpans(ranges);
}

function collectUnscannableRanges(
	surface: OfficialBlockSurface,
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
	ranges: LineRange[],
): void {
	const policy = officialBlockPolicy(surface.block);
	const interval = intervalByBlock.get(surface.block);
	if (policy === "skip" || policy === "diagnostic") {
		if (interval) {
			ranges.push(interval.span);
		}
		return;
	}
	for (const child of surface.children) {
		collectUnscannableRanges(child, intervalByBlock, ranges);
	}
}

function isLineInRanges(line: number, ranges: LineRange[]): boolean {
	return ranges.some(
		(range) => line >= range.startLine && line <= range.endLine,
	);
}

function scanMetadataRange(
	lineTable: LineTable,
	startLine: number,
	endLine: number,
	xrefOccurrences: XrefOccurrenceNode[],
	anchorOccurrences: AnchorOccurrenceNode[],
): void {
	for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
		const line = lineTable.lines[lineNumber - 1];
		if (!line) {
			continue;
		}
		if (line.text.startsWith(".")) {
			scanXrefMatches(lineTable, line, xrefOccurrences);
		}
		scanAnchorMatches(lineTable, line, anchorOccurrences);
	}
}

function scanHeadingInlineMetadataRange(
	lineTable: LineTable,
	startLine: number,
	endLine: number,
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[],
	toolDiagnostics: ToolDiagnostic[] | undefined,
): void {
	for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
		const line = lineTable.lines[lineNumber - 1];
		if (!line) {
			continue;
		}
		scanHeadingInlineMetadataMatches(
			lineTable,
			line,
			headingInlineMetadataOccurrences,
			toolDiagnostics,
		);
	}
}

function scanAnchorMatches(
	lineTable: LineTable,
	line: SourceLine,
	anchorOccurrences: AnchorOccurrenceNode[],
): void {
	for (const match of line.text.matchAll(anchorPattern)) {
		if (match.index === undefined) {
			continue;
		}
		const doubleBracketId = match[1];
		const macroId = match[3];
		const id = doubleBracketId ?? macroId;
		if (!id) {
			continue;
		}
		const raw = match[0];
		const sourceSpan = sourceSpanForRange(
			lineTable,
			line.number,
			match.index,
			raw,
		);
		anchorOccurrences.push(
			definedObject({
				kind: "anchor",
				syntax: doubleBracketId ? "double-bracket" : "macro",
				raw,
				ids: [id],
				// 官方正则对 anchor:id[] 不捕获 reftext；源表面上那对方括号是空的，记为空串。
				reftext: doubleBracketId ? match[2] : (match[4] ?? ""),
				anchorScope:
					line.text.trim() === raw && doubleBracketId ? "block" : "inline",
				sourceSpan,
				source: {
					raw,
					line: line.number,
					sourceSpan,
				},
			}) as AnchorOccurrenceNode,
		);
	}
}

function scanBibliographyAnchor(
	lineTable: LineTable,
	line: SourceLine,
	anchorOccurrences: AnchorOccurrenceNode[],
): void {
	const match = bibliographyAnchorPattern.exec(line.text);
	const [, marker, id, reftext] = match ?? [];
	if (marker === undefined || id === undefined) {
		return;
	}
	const raw = match?.[0].slice(marker.length) ?? "";
	const sourceSpan = sourceSpanForRange(
		lineTable,
		line.number,
		marker.length,
		raw,
	);
	anchorOccurrences.push(
		definedObject({
			kind: "anchor",
			syntax: "bibliography",
			raw,
			ids: [id],
			reftext,
			anchorScope: "inline",
			sourceSpan,
			source: { raw, line: line.number, sourceSpan },
		}) as AnchorOccurrenceNode,
	);
}

function isBibliographyList(surface: OfficialBlockSurface): boolean {
	const list = surface.context === "list_item" ? surface.parent : surface;
	return (
		list?.context === "ulist" && list.block.getStyle?.() === "bibliography"
	);
}

function scanHeadingInlineMetadataMatches(
	lineTable: LineTable,
	line: SourceLine,
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[],
	toolDiagnostics: ToolDiagnostic[] | undefined,
): void {
	for (const match of line.text.matchAll(headingInlineMetadataPattern)) {
		if (match.index === undefined || !match[1]) {
			continue;
		}
		const raw = match[0];
		const field = match[1].trim();
		const sourceSpan = sourceSpanForRange(
			lineTable,
			line.number,
			match.index,
			raw,
		);
		const interpreted = interpretHeadingInlineMetadataAttributes(
			field,
			match[2] ?? "",
		);
		if (!interpreted.ok) {
			toolDiagnostics?.push({
				level: "warning",
				code: "heading-inline-metadata.missing-value",
				message: `Heading inline metadata macro '${raw}' is missing a value.`,
				source: sourceSpan,
			});
			continue;
		}
		headingInlineMetadataOccurrences.push(
			definedObject({
				kind: "headingInlineMetadata",
				syntax: "macro",
				raw,
				field: interpreted.field,
				value: interpreted.value,
				label: interpreted.label,
				sourceSpan,
				source: {
					raw,
					line: line.number,
					sourceSpan,
				},
			}) as HeadingInlineMetadataOccurrenceNode,
		);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function dedupeOccurrences<T extends { raw: string; sourceSpan?: SourceSpan }>(
	occurrences: T[],
): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const occurrence of occurrences) {
		const key = occurrenceKey(occurrence);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(occurrence);
	}
	return result;
}

function occurrenceKey(occurrence: {
	raw: string;
	sourceSpan?: SourceSpan;
}): string {
	return [
		occurrence.sourceSpan?.start.line ?? 0,
		occurrence.sourceSpan?.start.column ?? 0,
		occurrence.sourceSpan?.end.line ?? 0,
		occurrence.sourceSpan?.end.column ?? 0,
		occurrence.raw,
	].join(":");
}
