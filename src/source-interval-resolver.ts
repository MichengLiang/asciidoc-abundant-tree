import {
	collectPrecedingMetadata,
	type MetadataSurface,
} from "./metadata-parser";
import type { LineSpan, SourceSpan, ToolDiagnostic } from "./model";
import type { OfficialBlockSurface } from "./official-block-walker";
import { delimiterOpens, officialDelimiter } from "./official-delimiter";
import { takesParentSourceLocation } from "./official-source-location";
import type { LineTable } from "./source-lines";
import {
	lineText,
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
	lineTable: LineTable,
): SourceInterval | undefined {
	if (surface.sourceLine === undefined) {
		return undefined;
	}

	const blockStartLine = surface.sourceLine;
	const metadata = metadataForSurface(surface, lineTable, blockStartLine);
	const startLine = metadata.at(0)?.line ?? blockStartLine;
	const diagnostics: ToolDiagnostic[] = [];
	const delimitedContext = isDelimitedContext(surface.context);
	const delimited = delimitedContext
		? resolveDelimitedBlockSpan(lineTable, blockStartLine, surface)
		: undefined;
	const undelimited =
		delimitedContext && delimited === undefined
			? resolveUndelimitedBlockSpan(lineTable, blockStartLine, surface)
			: undefined;
	const sourceContentSpan = sourceContentSpanForContext(
		surface,
		blockStartLine,
	);
	const nextSiblingStart = nextSiblingStartLine(surface, lineTable);
	const childEndLine =
		surface.context === "dlist"
			? lastChildEndLine(surface, lineTable)
			: undefined;
	const endLine =
		delimited?.span.endLine ??
		undelimited?.endLine ??
		sourceContentSpan?.endLine ??
		childEndLine ??
		(nextSiblingStart !== undefined ? nextSiblingStart - 1 : undefined) ??
		parentEndLine(surface, lineTable) ??
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
		blockStartLine <= lineTable.lines.length
	) {
		diagnostics.push({
			level: "warning",
			code: "source-interval.delimiter-not-found",
			message: `Could not locate ${surface.context} block delimiter from official source line ${blockStartLine}.`,
			source: spanForLineText(lineTable, blockStartLine, 1),
		});
	}

	const contentSpan =
		delimited?.contentSpan ??
		undelimited ??
		sourceContentSpan ??
		contentSpanForContext(surface, span);
	const sourceSpan = sourceSpanFromLineSpan(lineTable, span);
	const titleSpan = titleSpanForSurface(surface, lineTable);
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

// 隐身段落与官方合成的开放块都不写分隔符（09 号书「隐身段落」「官方合成的块」），锚点行就是块的第一行源文。
// 锚点行对不上第一行源文时不在这里认领：那是坐标漂移，交给 delimiter-not-found 报出来。
function resolveUndelimitedBlockSpan(
	lineTable: LineTable,
	startLine: number,
	surface: OfficialBlockSurface,
): LineSpan | undefined {
	const firstLine = firstSourceLine(surface);
	if (
		firstLine === undefined ||
		lineText(lineTable, startLine).trim() !== firstLine.trim()
	) {
		return undefined;
	}
	if (surface.children.length > 0) {
		const childEnds = surface.children
			.map((child) => resolveSourceInterval(child, lineTable)?.span.endLine)
			.filter((line): line is number => line !== undefined);
		return { startLine, endLine: Math.max(startLine, ...childEnds) };
	}
	const lineCount = surface.block.getSourceLines?.().length ?? 1;
	return { startLine, endLine: startLine + Math.max(1, lineCount) - 1 };
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
): LineSpan | undefined {
	if (surface.context === "paragraph") {
		return {
			startLine: surface.sourceLine ?? span.startLine,
			endLine: span.endLine,
		};
	}
	if (surface.context === "list_item") {
		const line = surface.sourceLine ?? span.startLine;
		return {
			startLine: line,
			endLine: line,
		};
	}
	return undefined;
}

function sourceContentSpanForContext(
	surface: OfficialBlockSurface,
	startLine: number,
): LineSpan | undefined {
	if (surface.context !== "paragraph" && surface.context !== "admonition") {
		return undefined;
	}
	const source = surface.block.getSource?.();
	if (source === undefined) {
		return undefined;
	}
	const lineCount = Math.max(1, source.split(/\r?\n/u).length);
	return {
		startLine,
		endLine: startLine + lineCount - 1,
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
