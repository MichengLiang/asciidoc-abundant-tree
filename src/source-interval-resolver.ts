import {
	collectPrecedingMetadata,
	type MetadataSurface,
} from "./metadata-parser";
import type { LineSpan, SourceSpan, ToolDiagnostic } from "./model";
import type { OfficialBlockSurface } from "./official-block-walker";
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
	const metadata = collectPrecedingMetadata(lineTable, blockStartLine);
	const startLine = metadata.at(0)?.line ?? blockStartLine;
	const diagnostics: ToolDiagnostic[] = [];
	const delimited = resolveContextDelimitedSpan(
		lineTable,
		blockStartLine,
		surface.context,
	);
	const sourceContentSpan = sourceContentSpanForContext(
		surface,
		blockStartLine,
	);
	const nextSiblingStart = nextSiblingStartLine(surface, lineTable);
	const endLine =
		delimited?.span.endLine ??
		sourceContentSpan?.endLine ??
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
		delimited === undefined &&
		isDelimitedContext(surface.context) &&
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

function resolveContextDelimitedSpan(
	lineTable: LineTable,
	startLine: number,
	context: string | undefined,
): { span: LineSpan; contentSpan: LineSpan } | undefined {
	switch (context) {
		case "listing":
			return resolveDelimitedBlockSpan(lineTable, startLine, ["----", "```"]);
		case "literal":
			return resolveDelimitedBlockSpan(lineTable, startLine, ["...."]);
		case "pass":
			return resolveDelimitedBlockSpan(lineTable, startLine, ["++++"]);
		case "open":
			return resolveDelimitedBlockSpan(lineTable, startLine, ["--"]);
		case "table":
			return resolveDelimitedBlockSpan(lineTable, startLine, ["|==="]);
		default:
			return undefined;
	}
}

function resolveDelimitedBlockSpan(
	lineTable: LineTable,
	startLine: number,
	allowedDelimiters: string[],
): { span: LineSpan; contentSpan: LineSpan } | undefined {
	// Delimiter matching is intentionally local to an official block anchor.
	// It must never be promoted back into whole-file structure discovery.
	const opening = lineText(lineTable, startLine).trim();
	if (!allowedDelimiters.includes(opening)) {
		return undefined;
	}
	for (let line = startLine + 1; line <= lineTable.lines.length; line += 1) {
		if (lineText(lineTable, line).trim() === opening) {
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
	return undefined;
}

function sourceContentSpanForContext(
	surface: OfficialBlockSurface,
	startLine: number,
): LineSpan | undefined {
	if (surface.context !== "paragraph") {
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
	return ["listing", "literal", "pass", "open", "table"].includes(
		context ?? "",
	);
}

function normalizeLineSpan(span: LineSpan): LineSpan {
	return {
		startLine: span.startLine,
		endLine: Math.min(span.endLine, Number.MAX_SAFE_INTEGER),
	};
}
