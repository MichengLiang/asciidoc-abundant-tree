import { bindPendingSourceAwareDocumentToLineTable } from "./book-entry/source-aware-coordinate";
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
	const lineTable = {
		source,
		lines: source.split(/\r?\n/).map((text, index) => ({
			number: index + 1,
			text,
		})),
	};
	bindPendingSourceAwareDocumentToLineTable(lineTable);
	return lineTable;
}

export function lineText(lineTable: LineTable, line: number): string {
	return lineTable.lines[line - 1]?.text ?? "";
}

const quotedViews = new WeakMap<LineTable, Map<number, LineTable>>();

// markdown 引语里的行，官方每进一层引语去掉一个 `> `，只有 `>` 的行变成空行（parser.js 1103-1107 行）。这个视图给出
// 套在 depth 层引语里的块被官方读到的样子：行号不变，结构判断（分隔符、第一行、段落在哪里断开）都按它做；
// 列号与 raw 仍取原行。
export function quotedLineTable(
	lineTable: LineTable,
	depth: number,
): LineTable {
	if (depth === 0) {
		return lineTable;
	}
	const views = quotedViews.get(lineTable) ?? new Map<number, LineTable>();
	quotedViews.set(lineTable, views);
	const cached = views.get(depth);
	if (cached) {
		return cached;
	}
	const view: LineTable = {
		source: lineTable.source,
		lines: lineTable.lines.map((line) => {
			let text = line.text;
			for (let level = 0; level < depth; level += 1) {
				text =
					text.trimEnd() === ">"
						? ""
						: text.startsWith("> ")
							? text.slice(2)
							: text;
			}
			return { number: line.number, text };
		}),
	};
	views.set(depth, view);
	return view;
}

// 官方读段落时跳过行注释（reader.js 528 行：`//` 开头、但不是 `///`），注释行不在读进的行里，段落却没有断开；
// verbatim 块不跳。所以官方读进的第 n 行，是从锚点行往下数、数的时候跳过这些注释行数到的第 n 行源文。
// 源文先于 n 行结束时取最后一行。
export function paragraphLine(
	lineTable: LineTable,
	startLine: number,
	n: number,
	skipsLineComments: boolean,
): number {
	let counted = 0;
	for (let line = startLine; line <= lineTable.lines.length; line += 1) {
		const text = lineText(lineTable, line);
		if (skipsLineComments && text.startsWith("//") && !text.startsWith("///")) {
			continue;
		}
		counted += 1;
		if (counted === n) {
			return line;
		}
	}
	return Math.max(startLine, lineTable.lines.length);
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
