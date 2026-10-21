import {
	collectPrecedingMetadata,
	type MetadataSurface,
} from "./metadata-parser";
import type { LineSpan, SourceSpan, ToolDiagnostic } from "./model";
import type { OfficialBlockSurface } from "./official-block-walker";
import { delimiterOpens, officialDelimiter } from "./official-delimiter";
import { listItemTextEndLine, paragraphEndLine } from "./official-paragraph";
import {
	borrowsChildSourceLocation,
	isMarkdownQuote,
	markdownQuoteDepth,
	takesParentSourceLocation,
} from "./official-source-location";
import type { LineTable } from "./source-lines";
import {
	lineText,
	paragraphLine,
	quotedLineTable,
	sourceSpanFromLineSpan,
	spanForLineText,
} from "./source-lines";

export type SourceInterval = {
	blockStartLine: number;
	metadata: MetadataSurface[];
	metadataSpan?: LineSpan;
	contentSpan?: LineSpan;
	span: LineSpan;
	sourceSpan?: SourceSpan;
	titleSpan?: SourceSpan;
	diagnostics: ToolDiagnostic[];
};

export function resolveSourceInterval(
	surface: OfficialBlockSurface,
	sourceTable: LineTable,
): SourceInterval | undefined {
	if (surface.sourceLine === undefined) {
		return undefined;
	}

	// 结构按官方读到的行判断：套在 markdown 引语里的块，官方读到的是去掉前缀的行（09 号书「段落写法的引语」）。
	// span、列号与诊断位置取源行；递归解析别的块时传源行表，它们各按自己的深度取视图。引语里的块属性行
	// 也按视图读，记下的是官方读到的那一行。
	const lineTable = quotedLineTable(
		sourceTable,
		markdownQuoteDepth(surface.block),
	);
	const blockStartLine = surface.sourceLine;
	const metadata = metadataForSurface(surface, lineTable, blockStartLine);
	const startLine = metadata.at(0)?.line ?? blockStartLine;
	const diagnostics: ToolDiagnostic[] = [];
	const delimitedContext = isDelimitedContext(surface.context);
	// 合成的容器借的是第一个子块的锚点行，那一行可能是列表项或分隔符：它没有自己的分隔符，也不必核对第一行源文。
	// 它装着部标题之后、第一节之前的全部内容，结束行交给下面的兜底（下一个兄弟块之前）；不能向子块要——
	// 没有结束线索的子块（如列表）会反过来向父块要，互相递归。
	const synthesized = borrowsChildSourceLocation(surface.block);
	const delimited = delimitedContext
		? resolveDelimitedBlockSpan(lineTable, blockStartLine, surface)
		: undefined;
	const undelimited =
		delimitedContext && delimited === undefined && !synthesized
			? resolveUndelimitedBlockSpan(
					lineTable,
					sourceTable,
					blockStartLine,
					surface,
				)
			: undefined;
	const sourceContentSpan = sourceContentSpanForContext(
		surface,
		lineTable,
		blockStartLine,
	);
	const nextSiblingStart = nextSiblingStartLine(surface, lineTable);
	const childEndLine =
		surface.context === "dlist"
			? lastChildEndLine(surface, lineTable)
			: undefined;
	const endLine =
		delimited?.span.endLine ??
		undelimited?.span.endLine ??
		sourceContentSpan?.endLine ??
		childEndLine ??
		(nextSiblingStart !== undefined ? nextSiblingStart - 1 : undefined) ??
		parentEndLine(surface, sourceTable) ??
		lineTable.lines.length;
	const span = normalizeLineSpan({
		startLine,
		endLine: Math.max(startLine, endLine),
	});
	const metadataSpan =
		metadata.length > 0
			? { startLine, endLine: blockStartLine - 1 }
			: undefined;

	if (
		delimitedContext &&
		delimited === undefined &&
		undelimited === undefined &&
		!synthesized &&
		blockStartLine <= lineTable.lines.length
	) {
		diagnostics.push({
			level: "warning",
			code: "source-interval.delimiter-not-found",
			message: `Could not locate ${surface.context} block delimiter from official source line ${blockStartLine}.`,
			source: spanForLineText(sourceTable, blockStartLine, 1),
		});
	}

	const contentSpan =
		delimited?.contentSpan ??
		undelimited?.contentSpan ??
		sourceContentSpan ??
		contentSpanForContext(surface, span, lineTable);
	const sourceSpan = sourceSpanFromLineSpan(sourceTable, span);
	const titleSpan = titleSpanForSurface(surface, sourceTable);
	return {
		blockStartLine,
		metadata,
		span,
		diagnostics,
		...(metadataSpan ? { metadataSpan } : {}),
		...(contentSpan ? { contentSpan } : {}),
		...(sourceSpan ? { sourceSpan } : {}),
		...(titleSpan ? { titleSpan } : {}),
	};
}

function nextSiblingStartLine(
	surface: OfficialBlockSurface,
	lineTable: LineTable,
): number | undefined {
	const siblings = surface.parent?.children ?? surface.siblings;
	const next = siblings?.[surface.indexInParent + 1];
	if (!next) {
		return undefined;
	}
	if (next.sourceLine === undefined) {
		return undefined;
	}
	const metadata = collectPrecedingMetadata(lineTable, next.sourceLine);
	return metadata.at(0)?.line ?? next.sourceLine;
}

function metadataForSurface(
	surface: OfficialBlockSurface,
	lineTable: LineTable,
	blockStartLine: number,
): MetadataSurface[] {
	if (surface.context === "list_item") {
		return [];
	}
	if (takesParentSourceLocation(surface.block)) {
		return [];
	}
	return collectPrecedingMetadata(lineTable, blockStartLine);
}

function lastChildEndLine(
	surface: OfficialBlockSurface,
	lineTable: LineTable,
): number | undefined {
	const childLines = surface.children.flatMap((child) =>
		descendantSourceLines(child),
	);
	if (childLines.length === 0) {
		return undefined;
	}
	return Math.min(Math.max(...childLines), lastContentLine(lineTable));
}

function descendantSourceLines(surface: OfficialBlockSurface): number[] {
	return [
		...(surface.sourceLine === undefined ? [] : [surface.sourceLine]),
		...surface.children.flatMap((child) => descendantSourceLines(child)),
	];
}

function parentEndLine(
	surface: OfficialBlockSurface,
	lineTable: LineTable,
): number | undefined {
	const parent = surface.parent;
	if (!parent) {
		return lineTable.lines.length;
	}
	return resolveSourceInterval(parent, lineTable)?.span.endLine;
}

function resolveDelimitedBlockSpan(
	lineTable: LineTable,
	startLine: number,
	surface: OfficialBlockSurface,
): { span: LineSpan; contentSpan: LineSpan } | undefined {
	// Delimiter matching is intentionally local to an official block anchor.
	// It must never be promoted back into whole-file structure discovery.
	const delimiter = officialDelimiter(lineText(lineTable, startLine).trimEnd());
	if (
		!delimiter ||
		!delimiterOpens(delimiter, surface.context, surface.block.getStyle?.())
	) {
		return undefined;
	}
	for (let line = startLine + 1; line <= lineTable.lines.length; line += 1) {
		if (lineText(lineTable, line).trimEnd() === delimiter.terminator) {
			return {
				span: { startLine, endLine: line },
				contentSpan: {
					startLine: startLine + 1,
					endLine: Math.max(startLine + 1, line - 1),
				},
			};
		}
	}
	return undefined;
}

// 隐身段落、段落写法的引语与官方合成的开放块都不写分隔符（09 号书「隐身段落」「段落写法的引语」「官方合成的块」），
// 锚点行就是块的第一行源文。锚点行对不上第一行源文时不在这里认领：那是坐标漂移，交给 delimiter-not-found 报出来。
function resolveUndelimitedBlockSpan(
	lineTable: LineTable,
	sourceTable: LineTable,
	startLine: number,
	surface: OfficialBlockSurface,
): { span: LineSpan; contentSpan: LineSpan } | undefined {
	const anchorText = lineText(lineTable, startLine);
	// markdown 引语是按这一行认出来的，子块坐标也从这一行换算，锚点与官方块必然对得上，不再与子块的第一行比。
	if (isMarkdownQuote(surface.block)) {
		return markdownQuoteSpan(lineTable, startLine);
	}
	// 只比可见字符：官方会展开 verbatim 块里的 tab，indent 会改行首。
	const firstLine = firstSourceLine(surface);
	if (firstLine === undefined) {
		return undefined;
	}
	const official = withoutWhitespace(firstLine);
	if (withoutWhitespace(anchorText) === official) {
		const span = cloakedParagraphSpan(
			lineTable,
			sourceTable,
			startLine,
			surface,
		);
		return { span, contentSpan: span };
	}
	if (isAirQuote(surface, anchorText, official)) {
		const contentEnd = lastSourceLine(lineTable, startLine, surface.block);
		return {
			// 出处行是官方读进段落的下一行，取走以后不在块的源行里。
			span: {
				startLine,
				endLine: paragraphLine(lineTable, contentEnd, 2, true),
			},
			contentSpan: { startLine, endLine: contentEnd },
		};
	}
	return undefined;
}

function cloakedParagraphSpan(
	lineTable: LineTable,
	sourceTable: LineTable,
	startLine: number,
	surface: OfficialBlockSurface,
): LineSpan {
	if (surface.children.length > 0) {
		return {
			startLine,
			endLine: lastChildIntervalEnd(sourceTable, startLine, surface),
		};
	}
	return {
		startLine,
		endLine: lastSourceLine(lineTable, startLine, surface.block),
	};
}

function lastChildIntervalEnd(
	sourceTable: LineTable,
	startLine: number,
	surface: OfficialBlockSurface,
): number {
	const childEnds = surface.children
		.map((child) => resolveSourceInterval(child, sourceTable)?.span.endLine)
		.filter((line): line is number => line !== undefined);
	return Math.max(startLine, ...childEnds);
}

// 空气引号（parser.js 1141-1172 行）：官方去掉首行开头与内容末行结尾的 `"`，所以官方的第一行是锚点行去掉开头的引号；
// 内容只有一行时，这一行也是末行，结尾的引号一并去掉。文字恰好以 `"` 开头的 [quote] 隐身段落，官方的第一行与锚点行
// 整行相同，已在上面认作隐身段落。
function isAirQuote(
	surface: OfficialBlockSurface,
	anchorText: string,
	officialFirstLine: string,
): boolean {
	if (
		surface.context !== "quote" ||
		surface.block.getContentModel?.() !== "simple" ||
		!anchorText.startsWith('"')
	) {
		return false;
	}
	const opened = anchorText.slice(1).trimEnd();
	const unquoted =
		surface.block.getSourceLines?.().length === 1 && opened.endsWith('"')
			? opened.slice(0, -1)
			: opened;
	return withoutWhitespace(unquoted) === officialFirstLine;
}

// markdown 引语（parser.js 1102-1140 行）是官方先读成一个段落、再认出来的，范围就是这个段落，按官方读段落的规则从源行算；
// 不向子块要结束行：子块是列表时，列表没有自己的结束线索，会反过来向引语要。段落最后一行去掉前缀后以 `-- ` 开头时是出处，
// 被取走；末尾只有 `>` 的行去掉前缀后是空行。这些行属于引语，不进内容区间。
function markdownQuoteSpan(
	lineTable: LineTable,
	startLine: number,
): { span: LineSpan; contentSpan: LineSpan } {
	const endLine = paragraphEndLine(lineTable, startLine, false);
	let contentEnd =
		endLine > startLine &&
		/^(?:> )?-- /u.test(lineText(lineTable, endLine).trimEnd())
			? endLine - 1
			: endLine;
	while (contentEnd > startLine && isEmptyQuotedLine(lineTable, contentEnd)) {
		contentEnd -= 1;
	}
	return {
		span: { startLine, endLine },
		contentSpan: { startLine, endLine: contentEnd },
	};
}

// 只有 `>` 的行与官方跳过的行注释：去掉前缀以后不是内容。
function isEmptyQuotedLine(lineTable: LineTable, line: number): boolean {
	const text = lineText(lineTable, line).trimEnd();
	return text === ">" || (text.startsWith("//") && !text.startsWith("///"));
}

function withoutWhitespace(text: string): string {
	return text.replace(/\s+/gu, "");
}

// 块的最后一行从锚点往下数够官方块的源行数；verbatim 块的源行里留着注释行，不跳。
function lastSourceLine(
	lineTable: LineTable,
	startLine: number,
	block: OfficialBlockSurface["block"],
): number {
	const count = Math.max(
		1,
		block.getSourceLines?.().length ??
			block.getSource?.().split(/\r?\n/u).length ??
			1,
	);
	return paragraphLine(
		lineTable,
		startLine,
		count,
		block.getContentModel?.() !== "verbatim",
	);
}

// 官方把 [partintro] 段落的文本行交给了子段落，合成的开放块自己也没有文本行：第一行源文在第一个子块里。
function firstSourceLine(surface: OfficialBlockSurface): string | undefined {
	const own = surface.block.getSourceLines?.()[0];
	if (own !== undefined) {
		return own;
	}
	const firstChild = surface.children[0];
	return firstChild ? firstSourceLine(firstChild) : undefined;
}

function contentSpanForContext(
	surface: OfficialBlockSurface,
	span: LineSpan,
	lineTable: LineTable,
): LineSpan | undefined {
	if (surface.context === "paragraph") {
		return {
			startLine: surface.sourceLine ?? span.startLine,
			endLine: span.endLine,
		};
	}
	if (surface.context === "list_item") {
		// 条目的文字是标记行加紧挨着的续行：官方把续行读成段落，再并进条目的文字（parser.js 1985-2011 行，foldFirst），
		// 并进以后它不再是子块，没有坐标，只能照官方的读法从标记行往下数（09 号书「Inline 扫描边界」）。
		const line = surface.sourceLine ?? span.startLine;
		return {
			startLine: line,
			endLine: listItemTextEndLine(lineTable, line),
		};
	}
	return undefined;
}

function sourceContentSpanForContext(
	surface: OfficialBlockSurface,
	lineTable: LineTable,
	startLine: number,
): LineSpan | undefined {
	if (surface.context !== "paragraph" && surface.context !== "admonition") {
		return undefined;
	}
	if (
		surface.block.getSourceLines === undefined &&
		surface.block.getSource === undefined
	) {
		return undefined;
	}
	return {
		startLine,
		endLine: lastSourceLine(lineTable, startLine, surface.block),
	};
}

function titleSpanForSurface(
	surface: OfficialBlockSurface,
	lineTable: LineTable,
): SourceSpan | undefined {
	if (surface.context !== "section" || surface.sourceLine === undefined) {
		return undefined;
	}
	const line = lineText(lineTable, surface.sourceLine);
	const marker = /^(=+)\s+/u.exec(line)?.[0];
	if (!marker) {
		return undefined;
	}
	return spanForLineText(lineTable, surface.sourceLine, marker.length + 1);
}

function isDelimitedContext(context: string | undefined): boolean {
	return [
		"example",
		"listing",
		"literal",
		"open",
		"pass",
		"quote",
		"sidebar",
		"stem",
		"table",
		"verse",
	].includes(context ?? "");
}

function normalizeLineSpan(span: LineSpan): LineSpan {
	return {
		startLine: span.startLine,
		endLine: Math.min(span.endLine, Number.MAX_SAFE_INTEGER),
	};
}

function lastContentLine(lineTable: LineTable): number {
	for (let index = lineTable.lines.length - 1; index >= 0; index -= 1) {
		const line = lineTable.lines[index];
		if (line && line.text !== "") {
			return line.number;
		}
	}
	return Math.max(1, lineTable.lines.length);
}
