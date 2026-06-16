import { describe, expect, it } from "vitest";
import {
	mapIncludeSelection,
	type SelectionMismatchDiagnostic,
} from "../../src/book-entry/include-selection-mapper";

const taggedSource = [
	"before",
	"// tag::a[]",
	"a1",
	"// tag::skip[]",
	"skip1",
	"// end::skip[]",
	"a2",
	"// end::a[]",
	"between",
	"// tag::b[]",
	"b1",
	"// end::b[]",
	"after",
].join("\n");

const numberedSource = Array.from(
	{ length: 45 },
	(_, index) => `line ${index + 1}`,
).join("\n");

describe("book-entry include selection mapper", () => {
	it("maps tag=main to physical source lines inside the tag", () => {
		const source = [
			"before",
			"// tag::main[]",
			"body 1",
			"body 2",
			"// end::main[]",
		].join("\n");

		expect(mapIncludeSelection(source, { kind: "tag", name: "main" })).toEqual({
			ok: true,
			lines: [3, 4],
		});
	});

	it("maps tags=a;b in physical order", () => {
		expect(
			mapIncludeSelection(taggedSource, { kind: "tags", expression: "a;b" }),
		).toEqual({
			ok: true,
			lines: [3, 5, 7, 11],
		});
	});

	it("maps tags=a;b;!skip and excludes nested skip regions", () => {
		expect(
			mapIncludeSelection(taggedSource, {
				kind: "tags",
				expression: "a;b;!skip",
			}),
		).toEqual({
			ok: true,
			lines: [3, 7, 11],
		});
	});

	it("maps tag=* to all tagged regions", () => {
		expect(
			mapIncludeSelection(taggedSource, { kind: "tag", name: "*" }),
		).toEqual({
			ok: true,
			lines: [3, 5, 7, 11],
		});
	});

	it("maps tag=** to all non-directive lines", () => {
		expect(
			mapIncludeSelection(taggedSource, { kind: "tag", name: "**" }),
		).toEqual({
			ok: true,
			lines: [1, 3, 5, 7, 9, 11, 13],
		});
	});

	it("maps closed and open line ranges", () => {
		expect(
			mapIncludeSelection(numberedSource, {
				kind: "lines",
				expression: "2..5",
			}),
		).toEqual({ ok: true, lines: [2, 3, 4, 5] });
		expect(
			mapIncludeSelection(numberedSource, {
				kind: "lines",
				expression: "12..",
			}),
		).toEqual({
			ok: true,
			lines: Array.from({ length: 34 }, (_, index) => index + 12),
		});
		expect(
			mapIncludeSelection(numberedSource, {
				kind: "lines",
				expression: "12..-1",
			}),
		).toEqual({
			ok: true,
			lines: Array.from({ length: 34 }, (_, index) => index + 12),
		});
	});

	it("maps quoted comma-separated and semicolon-separated range lists", () => {
		expect(
			mapIncludeSelection(numberedSource, {
				kind: "lines",
				expression: '"1..3,8"',
			}),
		).toEqual({ ok: true, lines: [1, 2, 3, 8] });
		expect(
			mapIncludeSelection(numberedSource, {
				kind: "lines",
				expression: "7;14..25;28..43",
			}),
		).toEqual({
			ok: true,
			lines: [
				7, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 31, 32,
				33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43,
			],
		});
	});

	it("reports selection mismatch diagnostics", () => {
		const result = mapIncludeSelection("only line", {
			kind: "tag",
			name: "missing",
		});

		expect(result.ok).toBe(false);
		expect((result as SelectionMismatchDiagnostic).diagnostic).toEqual(
			expect.objectContaining({
				code: "origin-map.selection-mismatch",
				level: "warning",
			}),
		);
	});
});
