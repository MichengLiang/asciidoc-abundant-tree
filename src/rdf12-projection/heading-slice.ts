import type {
	AbundantNode,
	LineSpan,
	MetadataNode,
	ParagraphNode,
	SectionNode,
} from "../model";

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
	const headingLine = node.line ?? node.titleSpan?.start.line;
	if (headingLine === undefined) {
		return undefined;
	}

	const startLine = headingStartLine(node, headingLine);
	const endLine = headingEndLine(node, startLine);
	const metadataSpan = metadataLineSpan(node.metadata);
	const contentSpan = contentLineSpan(node.children, headingLine, endLine);
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

function headingStartLine(node: SectionNode, headingLine: number): number {
	return metadataLineSpan(node.metadata)?.startLine ?? headingLine;
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
	switch (node.kind) {
		case "paragraph":
			return paragraphRawLines(node);
		case "listing":
			return listingRawLines(node);
		default:
			return [];
	}
}

function paragraphRawLines(
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
