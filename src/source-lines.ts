import type { LineSpan, SourceSpan } from "./model";

export type SourceLine = {
	number: number;
	text: string;
};

export type LineTable = {
	source: string;
	lines: SourceLine[];
};

export type LineRange = {
	startLine: number;
	endLine: number;
};

export function buildLineTable(source: string): LineTable {
	return {
		source,
		lines: source.split(/\r?\n/).map((text, index) => ({
			number: index + 1,
			text,
		})),
	};
}

export function lineText(lineTable: LineTable, line: number): string {
	return lineTable.lines[line - 1]?.text ?? "";
}

export function sourceLines(
	lineTable: LineTable,
	startLine: number,
	endLine: number,
): string[] {
	return lineTable.lines.slice(startLine - 1, endLine).map((line) => line.text);
}

export function spanForLineText(
	lineTable: LineTable,
	line: number,
	startColumn: number,
): SourceSpan {
	const text = lineText(lineTable, line);
	return {
		start: { line, column: startColumn },
		end: { line, column: [...text].length + 1 },
	};
}

export function sourceSpanForRange(
	lineTable: LineTable,
	line: number,
	startIndex: number,
	raw: string,
): SourceSpan {
	const startColumn =
		[...lineText(lineTable, line).slice(0, startIndex)].length + 1;
	return {
		start: { line, column: startColumn },
		end: { line, column: startColumn + [...raw].length },
	};
}

export function sourceSpanFromLineSpan(
	lineTable: LineTable,
	span: LineSpan | undefined,
): SourceSpan | undefined {
	if (!span) {
		return undefined;
	}
	return {
		start: { line: span.startLine, column: 1 },
		end: {
			line: span.endLine,
			column: [...lineText(lineTable, span.endLine)].length + 1,
		},
	};
}

export function nextBlankLine(lineTable: LineTable, startLine: number): number {
	for (let line = startLine + 1; line <= lineTable.lines.length; line += 1) {
		if (lineText(lineTable, line).trim() === "") {
			return line;
		}
	}
	return lineTable.lines.length + 1;
}

export function findClosingDelimiter(
	lineTable: LineTable,
	startLine: number,
	delimiter: string,
): number {
	for (let line = startLine + 1; line <= lineTable.lines.length; line += 1) {
		if (lineText(lineTable, line).trim() === delimiter) {
			return line;
		}
	}
	return startLine;
}

export function isLineInRanges(line: number, ranges: LineRange[]): boolean {
	return ranges.some(
		(range) => line >= range.startLine && line <= range.endLine,
	);
}

export function groupByLine<T extends { sourceSpan?: SourceSpan }>(
	nodes: T[],
): Map<number, T[]> {
	const grouped = new Map<number, T[]>();
	for (const node of nodes) {
		const line = node.sourceSpan?.start.line;
		if (line === undefined) {
			continue;
		}
		grouped.set(line, [...(grouped.get(line) ?? []), node]);
	}
	return grouped;
}

export function collectOccurrencesInLineRange<T>(
	grouped: Map<number, T[]>,
	startLine: number,
	endLine: number,
): T[] {
	const result: T[] = [];
	for (let line = startLine; line <= endLine; line += 1) {
		result.push(...(grouped.get(line) ?? []));
	}
	return result;
}

export function compareNodesBySource(
	left: { sourceSpan?: SourceSpan },
	right: { sourceSpan?: SourceSpan },
): number {
	return (
		(left.sourceSpan?.start.line ?? 0) - (right.sourceSpan?.start.line ?? 0) ||
		(left.sourceSpan?.start.column ?? 0) - (right.sourceSpan?.start.column ?? 0)
	);
}
