import { describe, expect, it } from "vitest";
import {
	buildLineTable,
	collectOccurrencesInLineRange,
	compareNodesBySource,
	findClosingDelimiter,
	groupByLine,
	isLineInRanges,
	lineText,
	nextBlankLine,
	sourceLines,
	sourceSpanForRange,
	sourceSpanFromLineSpan,
	spanForLineText,
} from "../src/source-lines";

describe("source-lines", () => {
	it("reads lines and spans from a line table", () => {
		const table = buildLineTable("alpha\nbeta\ngamma\n");
		const noBlankTable = buildLineTable("alpha\nbeta\ngamma");

		expect(lineText(table, 2)).toBe("beta");
		expect(lineText(table, 99)).toBe("");
		expect(sourceLines(table, 1, 2)).toEqual(["alpha", "beta"]);
		expect(spanForLineText(table, 2, 2)).toEqual({
			start: { line: 2, column: 2 },
			end: { line: 2, column: 5 },
		});
		expect(sourceSpanForRange(table, 1, 1, "alp")).toEqual({
			start: { line: 1, column: 2 },
			end: { line: 1, column: 5 },
		});
		expect(sourceSpanFromLineSpan(table, { startLine: 1, endLine: 2 })).toEqual(
			{
				start: { line: 1, column: 1 },
				end: { line: 2, column: 5 },
			},
		);
		expect(sourceSpanFromLineSpan(table, undefined)).toBeUndefined();
		expect(nextBlankLine(table, 1)).toBe(4);
		expect(nextBlankLine(noBlankTable, 1)).toBe(4);
	});

	it("tracks ranges, closing delimiters, and grouped occurrences", () => {
		const table = buildLineTable("one\n\n----\ntwo\n----\n");
		const nodes = [
			{
				sourceSpan: {
					start: { line: 4, column: 2 },
					end: { line: 4, column: 3 },
				},
			},
			{
				sourceSpan: {
					start: { line: 2, column: 1 },
					end: { line: 2, column: 2 },
				},
			},
		];

		expect(findClosingDelimiter(table, 3, "----")).toBe(5);
		expect(findClosingDelimiter(table, 3, "|===")).toBe(3);
		expect(isLineInRanges(2, [{ startLine: 2, endLine: 4 }])).toBe(true);
		expect(isLineInRanges(5, [{ startLine: 2, endLine: 4 }])).toBe(false);
		expect(groupByLine([{}]).size).toBe(0);
		expect(groupByLine(nodes).get(4)).toHaveLength(1);
		expect(
			collectOccurrencesInLineRange(groupByLine(nodes), 2, 4),
		).toHaveLength(2);
	});

	it("orders nodes by source position", () => {
		const left = {
			sourceSpan: {
				start: { line: 3, column: 4 },
				end: { line: 3, column: 5 },
			},
		};
		const right = {
			sourceSpan: {
				start: { line: 4, column: 1 },
				end: { line: 4, column: 2 },
			},
		};

		expect(compareNodesBySource(left, right)).toBeLessThan(0);
		expect(compareNodesBySource(right, left)).toBeGreaterThan(0);
		expect(compareNodesBySource(left, left)).toBe(0);
		expect(compareNodesBySource({}, {})).toBe(0);
	});
});
