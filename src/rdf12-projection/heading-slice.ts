import type {
	AbundantDocument,
	AbundantNode,
	LineSpan,
	MetadataNode,
	ParagraphNode,
	SectionNode,
} from "../model";
import { buildLineTable, sourceLines } from "../source-lines";

export type HeadingSlice = {
	readonly span: LineSpan;
	readonly headingLine: number;
	readonly metadataSpan?: LineSpan;
	readonly contentSpan?: LineSpan;
	readonly raw: string;
};

export function resolveHeadingSlice(
	node: SectionNode,
): HeadingSlice | undefined {
	// Origin-aware book-entry sections already carry the exact heading slice.
	// Single-file fallback raw can still include child sections and must be sliced below.
	if (
		node.source?.relativePath !== undefined &&
		node.source.raw !== undefined &&
		node.source.span !== undefined
	) {
		return headingSliceFromSourceLayer(node);
	}

	const headingLine = node.line ?? node.titleSpan?.start.line;
	if (headingLine === undefined) {
		return undefined;
	}

	const startLine = headingStartLine(node, headingLine);
	const endLine = headingEndLine(node, startLine);
	const metadataSpan = metadataLineSpan(node.metadata);
	const contentSpan =
		contentLineSpanFromSourceRaw(node, headingLine, endLine) ??
		contentLineSpan(node.children, headingLine, endLine);
	const raw = headingRaw(node, {
		startLine,
		endLine,
		headingLine,
	});

	return {
		span: { startLine, endLine },
		headingLine,
		raw,
		...(metadataSpan !== undefined ? { metadataSpan } : {}),
		...(contentSpan !== undefined ? { contentSpan } : {}),
	};
}

function headingSliceFromSourceLayer(
	node: SectionNode,
): HeadingSlice | undefined {
	const span = node.source?.span;
	const raw = node.source?.raw;
	if (span === undefined || raw === undefined) {
		return undefined;
	}
	const headingLine = node.line ?? node.titleSpan?.start.line;
	if (headingLine === undefined) {
		return undefined;
	}

	const metadataSpan =
		span.startLine < headingLine
			? { startLine: span.startLine, endLine: headingLine - 1 }
			: undefined;
	const contentSpan =
		contentLineSpanFromSourceRaw(node, headingLine, span.endLine) ??
		contentLineSpan(node.children, headingLine, span.endLine);

	return {
		span,
		headingLine,
		raw,
		...(metadataSpan !== undefined ? { metadataSpan } : {}),
		...(contentSpan !== undefined ? { contentSpan } : {}),
	};
}

export function resolveDocumentTitleHeadingSlice(
	document: AbundantDocument,
	input: { readonly sourceText?: string },
): HeadingSlice | undefined {
	const title = document.title;
	const headingLine = title?.source?.line;

	if (title === undefined || headingLine === undefined) {
		return undefined;
	}

	if (input.sourceText === undefined) {
		return {
			span: { startLine: headingLine, endLine: headingLine },
			headingLine,
			raw: `${"=".repeat(1)} ${title.text}\n`,
		};
	}

	const lineTable = buildLineTable(input.sourceText);
	const firstSectionStart = firstSectionHeadingStartLine(document.children);
	const endLine = Math.max(
		headingLine,
		firstSectionStart !== undefined
			? firstSectionStart - 1
			: lineTable.lines.length,
	);
	const span = { startLine: headingLine, endLine };
	const contentSpan = documentTitleContentSpan({
		headingLine,
		endLine,
		rawLines: sourceLines(lineTable, span.startLine, span.endLine),
	});

	return {
		span,
		headingLine,
		raw: `${sourceLines(lineTable, span.startLine, span.endLine).join("\n")}\n`,
		...(contentSpan !== undefined ? { contentSpan } : {}),
	};
}

function headingStartLine(node: SectionNode, headingLine: number): number {
	return metadataLineSpan(node.metadata)?.startLine ?? headingLine;
}

function firstSectionHeadingStartLine(
	nodes: readonly AbundantNode[] | undefined,
): number | undefined {
	return (nodes ?? [])
		.filter((node): node is SectionNode => node.kind === "section")
		.map((section) =>
			headingStartLine(
				section,
				section.line ??
					section.titleSpan?.start.line ??
					section.span?.startLine ??
					1,
			),
		)
		.sort((left, right) => left - right)[0];
}

function documentTitleContentSpan(input: {
	readonly headingLine: number;
	readonly endLine: number;
	readonly rawLines: readonly string[];
}): LineSpan | undefined {
	const contentLines = input.rawLines
		.map((text, index) => ({
			line: input.headingLine + index,
			text,
		}))
		.filter(
			(line) => line.line > input.headingLine && line.text.trim().length > 0,
		);

	if (contentLines.length === 0) {
		return undefined;
	}

	return {
		startLine: contentLines[0]?.line ?? input.headingLine + 1,
		endLine: contentLines.at(-1)?.line ?? input.endLine,
	};
}

function headingEndLine(node: SectionNode, startLine: number): number {
	const childSectionStart = (node.children ?? [])
		.filter((child): child is SectionNode => child.kind === "section")
		.map((child) =>
			headingStartLine(
				child,
				child.line ?? child.titleSpan?.start.line ?? startLine,
			),
		)
		.sort((left, right) => left - right)[0];

	if (childSectionStart !== undefined) {
		return Math.max(startLine, childSectionStart - 1);
	}

	return node.span?.endLine ?? node.source?.sourceSpan?.end.line ?? startLine;
}

function metadataLineSpan(
	metadata: readonly MetadataNode[] | undefined,
): LineSpan | undefined {
	const lines = (metadata ?? [])
		.map((item) => item.line)
		.filter((line): line is number => line !== undefined);

	if (lines.length === 0) {
		return undefined;
	}

	return {
		startLine: Math.min(...lines),
		endLine: Math.max(...lines),
	};
}

function contentLineSpan(
	children: readonly AbundantNode[] | undefined,
	headingLine: number,
	endLine: number,
): LineSpan | undefined {
	const spans = (children ?? [])
		.filter((child) => child.kind !== "section")
		.flatMap((child) => nodeLineSpan(child))
		.filter((span) => span.startLine <= endLine);

	if (spans.length === 0) {
		return undefined;
	}

	const startLine = Math.max(
		headingLine + 1,
		Math.min(...spans.map((span) => span.startLine)),
	);
	const contentEndLine = Math.min(
		endLine,
		Math.max(...spans.map((span) => span.endLine)),
	);

	if (startLine > contentEndLine) {
		return undefined;
	}

	return {
		startLine,
		endLine: contentEndLine,
	};
}

function contentLineSpanFromSourceRaw(
	node: SectionNode,
	headingLine: number,
	endLine: number,
): LineSpan | undefined {
	const source = node.source;
	if (source?.raw === undefined || source.span === undefined) {
		return undefined;
	}
	const span = source.span;

	const contentLines = source.raw
		.split(/\r?\n/u)
		.slice(0, span.endLine - span.startLine + 1)
		.map((text, index) => ({
			line: span.startLine + index,
			text,
		}))
		.filter((line) => line.line > headingLine && line.line <= endLine)
		.filter((line) => line.text.trim().length > 0);

	if (contentLines.length === 0) {
		return undefined;
	}

	return {
		startLine: contentLines[0]?.line ?? headingLine + 1,
		endLine: contentLines.at(-1)?.line ?? endLine,
	};
}

function nodeLineSpan(node: AbundantNode): LineSpan[] {
	switch (node.kind) {
		case "paragraph":
			return node.source?.span === undefined ? [] : [node.source.span];
		case "listing":
		case "table":
			return node.span === undefined ? [] : [node.span];
		default:
			return node.source?.span === undefined ? [] : [node.source.span];
	}
}

function headingRaw(
	node: SectionNode,
	input: {
		readonly startLine: number;
		readonly endLine: number;
		readonly headingLine: number;
	},
): string {
	if (node.source?.raw !== undefined && node.source.span !== undefined) {
		const offsetStart = input.startLine - node.source.span.startLine;
		const offsetEnd = input.endLine - node.source.span.startLine;
		const lines = node.source.raw
			.split(/\r?\n/u)
			.slice(offsetStart, offsetEnd + 1);
		return `${lines.join("\n")}\n`;
	}

	const lineByNumber = new Map<number, string>();

	for (const metadata of node.metadata ?? []) {
		if (metadata.line !== undefined) {
			lineByNumber.set(metadata.line, metadata.raw);
		}
	}
	lineByNumber.set(input.headingLine, headingLineText(node));

	for (const child of node.children ?? []) {
		if (child.kind === "section") {
			continue;
		}
		for (const [line, text] of childRawLines(child)) {
			if (line >= input.startLine && line <= input.endLine) {
				lineByNumber.set(line, text);
			}
		}
	}

	const lines: string[] = [];
	for (let line = input.startLine; line <= input.endLine; line += 1) {
		lines.push(lineByNumber.get(line) ?? "");
	}

	return `${lines.join("\n")}\n`;
}

function headingLineText(node: SectionNode): string {
	return `${"=".repeat(node.level + 1)} ${node.title}`;
}

function childRawLines(
	node: AbundantNode,
): ReadonlyArray<readonly [number, string]> {
	const sourceRawLines = sourceLayerRawLines(node);
	if (sourceRawLines.length > 0) {
		return sourceRawLines;
	}

	switch (node.kind) {
		case "paragraph":
			return paragraphTextRawLines(node);
		case "listing":
			return listingRawLines(node);
		default:
			return [];
	}
}

function sourceLayerRawLines(
	node: AbundantNode,
): ReadonlyArray<readonly [number, string]> {
	const span = node.source?.span;
	const raw = node.source?.raw;
	if (span === undefined || raw === undefined) {
		return [];
	}

	return raw
		.split(/\r?\n/u)
		.slice(0, span.endLine - span.startLine + 1)
		.map((line, index) => [span.startLine + index, line] as const);
}

function paragraphTextRawLines(
	node: ParagraphNode,
): ReadonlyArray<readonly [number, string]> {
	const span = node.source?.span;
	if (span === undefined || node.text === undefined) {
		return [];
	}

	return splitTextLines(span.startLine, node.text);
}

function listingRawLines(
	node: Extract<AbundantNode, { kind: "listing" }>,
): ReadonlyArray<readonly [number, string]> {
	const result: Array<readonly [number, string]> = [];

	for (const metadata of node.metadata ?? []) {
		if (metadata.line !== undefined) {
			result.push([metadata.line, metadata.raw]);
		}
	}
	if (node.span !== undefined) {
		const contentStart = node.contentSpan?.startLine;
		if (contentStart !== undefined && node.content !== undefined) {
			result.push([contentStart - 1, "----"]);
			result.push(...splitTextLines(contentStart, node.content));
			result.push([node.span.endLine, "----"]);
		}
	}

	return result;
}

function splitTextLines(
	startLine: number,
	text: string,
): Array<readonly [number, string]> {
	return text.split(/\r?\n/u).map((line, index) => [startLine + index, line]);
}
