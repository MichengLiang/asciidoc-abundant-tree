import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import {
	recoverSourceAwarePointSourceLayer,
	sourceAwareDocumentForLineTable,
} from "./book-entry/source-aware-coordinate";
import { interpretHeadingInlineMetadataAttributes } from "./heading-inline-metadata";
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
import type { XrefProbeRegion } from "./xref-recognition";

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

// xref 由官方认定（09 号书第 7 章《Xref 由官方认定》）：这里只交出收下 xref 的官方节点与它们的文字区域，
// 由 xref-recognition 交给官方探测；anchor 与 hmeta 仍由扫描器按源文本认。
export function scanInlineOccurrencesInOfficialBlocks(options: {
	lineTable: LineTable;
	blockSurfaces: OfficialBlockSurface[];
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>;
	sectionByLine: Map<number, SectionNode>;
	officialDocument?: AsciidoctorBlock;
	toolDiagnostics?: ToolDiagnostic[];
}): {
	xrefRegions: XrefProbeRegion[];
	anchorOccurrences: AnchorOccurrenceNode[];
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[];
} {
	const collected: Collected = {
		lineTable: options.lineTable,
		xrefRegions: [],
		regionsByOwner: new Map(),
		anchorOccurrences: [],
		headingInlineMetadataOccurrences: [],
		toolDiagnostics: options.toolDiagnostics,
	};
	if (options.officialDocument) {
		addDocumentTitleSegment(collected, options.officialDocument);
	}
	scanSurfaces(collected, options.blockSurfaces, options.intervalByBlock);
	const { anchorOccurrences, headingInlineMetadataOccurrences } = collected;

	// 所属 section 是逻辑文档上的结构关系，要趁出现处还带着逻辑行时判定；下面回源以后只剩来源坐标。
	assignContainingSectionIds(
		[],
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
	const recoveredAnchors = recover(anchorOccurrences);
	const recoveredHeadingInlineMetadata = recover(
		headingInlineMetadataOccurrences,
	);

	return {
		xrefRegions: collected.xrefRegions,
		anchorOccurrences:
			dedupeOccurrences(recoveredAnchors).sort(compareSourceSpans),
		headingInlineMetadataOccurrences: dedupeOccurrences(
			recoveredHeadingInlineMetadata,
		).sort(compareSourceSpans),
	};
}

// 官方认下的 xref 的收尾：判定所属 section、去重、book-entry 下回源、按源位置排序。
// 同一个 xref 可能出现在两个区域里（描述列表的术语与描述共用一行），去重留下一个。去重要在回源之前：
// 逻辑文档的坐标在整本书里唯一，回源以后只剩文件内的行列，几个文件同一行同一列写着同样的 xref 时会被当成重复。
export function finishXrefOccurrences(
	xrefs: XrefOccurrenceNode[],
	options: {
		lineTable: LineTable;
		sectionByLine: Map<number, SectionNode>;
		toolDiagnostics?: ToolDiagnostic[] | undefined;
	},
): XrefOccurrenceNode[] {
	assignContainingSectionIds(xrefs, [], [], options.sectionByLine);
	const unique = dedupeOccurrences(xrefs);
	const sourceAwareDocument = sourceAwareDocumentForLineTable(
		options.lineTable,
	);
	const recovered = sourceAwareDocument
		? recoverSourceAwareInlineOrigins(
				unique,
				sourceAwareDocument,
				options.toolDiagnostics,
			)
		: unique;
	return recovered.sort(compareSourceSpans);
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
	xrefRegions: XrefProbeRegion[];
	regionsByOwner: Map<
		AsciidoctorBlock,
		{ title?: XrefProbeRegion; content?: XrefProbeRegion }
	>;
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
				collected,
				surface.block,
				interval.metadataSpan.startLine,
				interval.metadataSpan.endLine,
			);
		}
		if (isHeading(surface) && surface.sourceLine !== undefined) {
			const line = collected.lineTable.lines[surface.sourceLine - 1];
			if (line) {
				addXrefSegment(
					collected,
					surface.block,
					true,
					line,
					headingMarkerPattern.exec(line.text)?.[0].length ?? 0,
				);
				scanAnchorMatches(
					collected.lineTable,
					line,
					collected.anchorOccurrences,
				);
			}
		}
		if (surface.context === "quote") {
			addAttributionSegment(collected, surface.block, interval);
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
				collected,
				surface.block,
				span.startLine,
				span.endLine,
				[
					...descendantUnscannableRanges(surface, intervalByBlock),
					...(interval.discardedSpan ? [interval.discardedSpan] : []),
				],
				isBibliographyList(surface),
				interval.readsLineComments
					? null
					: quotedLineTable(
							collected.lineTable,
							markdownQuoteDepth(surface.block),
						),
			);
		}
	}
}

// section 与 discrete 标题的标题文字做 macros 替换（09 号书「Inline 扫描边界」）：标题行与块标题一样扫 xref 与锚点。
// 标题记号 `=` 里没有可扫的内容，整行扫即可。
export function isHeading(surface: OfficialBlockSurface): boolean {
	return surface.context === "section" || surface.context === "floating_title";
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
	// 表格自己的替换列表是空的，单元格的替换挂在单元格上；表格交给 scanTable 按单元格扫。
	if (surface.context === "table") {
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

function compareSourceSpans(
	left: { sourceSpan?: SourceSpan },
	right: { sourceSpan?: SourceSpan },
): number {
	return (
		(left.sourceSpan?.start.line ?? 0) - (right.sourceSpan?.start.line ?? 0) ||
		(left.sourceSpan?.start.column ?? 0) - (right.sourceSpan?.start.column ?? 0)
	);
}

// owner 是收下这段文字里 xref 的官方节点；表格按行扫 anchor 时不给 owner，xref 由单元格各自交出（scanTable）。
function scanInlineRange(
	collected: Collected,
	owner: AsciidoctorBlock | undefined,
	startLine: number,
	endLine: number,
	skipRanges: LineRange[],
	bibliography: boolean,
	// 按官方读到的行认行注释：markdown 引语里的块，读到的是去掉前缀的行。null 表示内容按分隔符读进，不跳过注释。
	commentView: LineTable | null,
): void {
	for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
		if (isLineInRanges(lineNumber, skipRanges)) {
			continue;
		}
		const line = collected.lineTable.lines[lineNumber - 1];
		if (
			!line ||
			(commentView && isLineComment(lineText(commentView, lineNumber)))
		) {
			continue;
		}
		if (owner) {
			addXrefSegment(collected, owner, false, line);
		}
		if (bibliography) {
			scanBibliographyAnchor(
				collected.lineTable,
				line,
				collected.anchorOccurrences,
			);
		}
		scanAnchorMatches(collected.lineTable, line, collected.anchorOccurrences);
		scanHeadingInlineMetadataMatches(
			collected.lineTable,
			line,
			collected.headingInlineMetadataOccurrences,
			collected.toolDiagnostics,
		);
	}
}

// 表格自己不扫：普通单元格扫它的文本行；a| 单元格的内嵌文档按正文的规则解析区间、交给 scanSurfaces。
function scanTable(collected: Collected, block: AsciidoctorBlock): void {
	const cells = ordinaryCellRanges(block);
	for (const range of mergeLineSpans(cells.map((cell) => cell.range))) {
		scanInlineRange(
			collected,
			undefined,
			range.startLine,
			range.endLine,
			[],
			false,
			collected.lineTable,
		);
	}
	// 一行里可以有几个单元格，替换各按各的（literal 单元格不做 macros）：每个单元格只交出它自己的文字。
	const searchFrom = new Map<number, number>();
	for (const { cell, range, lines } of cells) {
		addCellSegments(collected, cell, range, lines, searchFrom);
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

type OrdinaryCellRange = {
	readonly cell: AsciidoctorBlock;
	readonly range: LineSpan;
	readonly lines: readonly string[];
};

function ordinaryCellRanges(block: AsciidoctorBlock): OrdinaryCellRange[] {
	return tableCells(block).flatMap((cell) => {
		if (cellDocument(cell) !== undefined || !isRecord(cell)) {
			return [];
		}
		const tableCell = cell as TableCell;
		const startLine = tableCell.getLineNumber?.();
		if (startLine === undefined) {
			return [];
		}
		const lines = tableCell.lines?.() ?? [];
		const lineCount = Math.max(1, lines.length);
		return [
			{
				cell: cell as AsciidoctorBlock,
				range: {
					startLine: cellSourceLine(block, startLine),
					endLine: cellSourceLine(block, startLine + lineCount - 1),
				},
				lines,
			},
		];
	});
}

// 单元格的文字在源行里定位：官方给的是去掉分隔符与首尾空白的文字。同一行上的单元格按从左到右的顺序找，
// 每找到一格，下一格从它之后找起；找不到时整行交出（官方会再按自己的读法判断）。
function addCellSegments(
	collected: Collected,
	cell: AsciidoctorBlock,
	range: LineSpan,
	cellLines: readonly string[],
	searchFrom: Map<number, number>,
): void {
	for (
		let lineNumber = range.startLine;
		lineNumber <= range.endLine;
		lineNumber += 1
	) {
		const line = collected.lineTable.lines[lineNumber - 1];
		if (!line || isLineComment(line.text)) {
			continue;
		}
		const from = searchFrom.get(lineNumber) ?? 0;
		const found = cellLines
			.filter((text) => text.trim() !== "")
			.map((text) => ({ text, index: line.text.indexOf(text, from) }))
			.find((match) => match.index !== -1);
		if (!found) {
			addXrefSegment(collected, cell, false, line);
			continue;
		}
		const endIndex = found.index + found.text.length;
		searchFrom.set(lineNumber, endIndex);
		addXrefSegment(collected, cell, false, line, found.index, endIndex);
	}
}

// 一个官方节点的文字区域按标题与内容分开：标题走官方的标题替换。同一行同一起点只收一次。
function addXrefSegment(
	collected: Collected,
	owner: AsciidoctorBlock,
	title: boolean,
	line: SourceLine,
	startIndex = 0,
	endIndex = line.text.length,
): void {
	const regions = collected.regionsByOwner.get(owner) ?? {};
	collected.regionsByOwner.set(owner, regions);
	const kind = title ? "title" : "content";
	let region = regions[kind];
	if (!region) {
		region = { owner, title, segments: [] };
		regions[kind] = region;
		collected.xrefRegions.push(region);
	}
	if (
		region.segments.some(
			(segment) =>
				segment.line.number === line.number &&
				segment.startIndex === startIndex,
		)
	) {
		return;
	}
	region.segments.push({ line, startIndex, endIndex });
}

const headingMarkerPattern = /^(?:=+|#+)[ \t]+/u;

// 文档标题在加载时就被官方替换了，里面的 xref 同样由官方认。aat 把文档标题行取在第一行（parser-core 的 documentTitleSource）。
function addDocumentTitleSegment(
	collected: Collected,
	document: AsciidoctorBlock,
): void {
	const line = collected.lineTable.lines[0];
	const marker = line ? /^=[ \t]+/u.exec(line.text) : null;
	if (!line || !marker || !document.getDocumentTitle?.()) {
		return;
	}
	addXrefSegment(collected, document, true, line, marker[0].length);
}

// 空气引号与 markdown 引语取走最后一行作出处，在 quote 块上做 normal 替换（parser.js 1119-1166 行），
// 出处里的 xref 由官方认。出处行在块的范围里、内容区间之外，文字从 `-- ` 之后算起。
function addAttributionSegment(
	collected: Collected,
	block: AsciidoctorBlock,
	interval: SourceInterval,
): void {
	const contentEnd = interval.contentSpan?.endLine;
	const end = interval.span.endLine;
	if (contentEnd === undefined || end <= contentEnd) {
		return;
	}
	const line = collected.lineTable.lines[end - 1];
	const prefix = line ? /^(?:> ?)*-- /u.exec(line.text) : null;
	if (!line || !prefix || block.getAttributes?.()?.attribution === undefined) {
		return;
	}
	addXrefSegment(collected, block, false, line, prefix[0].length);
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

// 块标题（`.标题`）是块的 metadata，官方用标题替换处理它，收下其中 xref 的是这个块。
function scanMetadataRange(
	collected: Collected,
	owner: AsciidoctorBlock,
	startLine: number,
	endLine: number,
): void {
	for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
		const line = collected.lineTable.lines[lineNumber - 1];
		if (!line) {
			continue;
		}
		if (line.text.startsWith(".")) {
			addXrefSegment(collected, owner, true, line, 1);
		}
		scanAnchorMatches(collected.lineTable, line, collected.anchorOccurrences);
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
