import { describe, expect, it } from "vitest";
import {
	assertSourceAwareLogicalDocumentInvariants,
	type SourceAwareLogicalDocument,
} from "../../src/book-entry/line-origin-model";
import { buildLineTable } from "../../src/source-lines";

describe("book-entry source-aware logical document model", () => {
	it("accepts source-preserving, selected, transformed, generated, and degraded records", () => {
		const document = makeDocument();

		expect(() =>
			assertSourceAwareLogicalDocumentInvariants(document),
		).not.toThrow();
		expect(document.lines[0]).toEqual(
			expect.objectContaining({ kind: "source-preserving" }),
		);
		expect(document.lines[1]).toEqual(
			expect.objectContaining({ kind: "selected-source" }),
		);
		expect(document.lines[2]).toEqual(
			expect.objectContaining({ kind: "transformed-source" }),
		);
		expect(document.lines[3]).toEqual(
			expect.objectContaining({ kind: "generated-control" }),
		);
		expect(document.lines[4]).toEqual(
			expect.objectContaining({ kind: "degraded" }),
		);
	});

	it("rejects mismatched logical text and record counts", () => {
		const document = { ...makeDocument(), logicalText: "one" };

		expect(() => assertSourceAwareLogicalDocumentInvariants(document)).toThrow(
			/logical-line-record\.count-mismatch/u,
		);
	});

	it("rejects source-backed records whose source file is missing", () => {
		const document = { ...makeDocument(), sourceFiles: [] };

		expect(() => assertSourceAwareLogicalDocumentInvariants(document)).toThrow(
			/line-origin\.source-file-missing/u,
		);
	});

	it("rejects source-backed records whose source line is out of range", () => {
		const document = makeDocument();
		const first = document.lines[0];
		if (first?.kind !== "source-preserving") {
			throw new Error("Missing source-preserving record.");
		}
		const broken: SourceAwareLogicalDocument = {
			...document,
			lines: [{ ...first, origin: { ...first.origin, sourceLine: 99 } }],
			logicalText: first.text,
		};

		expect(() => assertSourceAwareLogicalDocumentInvariants(broken)).toThrow(
			/line-origin\.source-line-out-of-range/u,
		);
	});
});

function makeDocument(): SourceAwareLogicalDocument {
	const text = ["one", "three", "  two", ":leveloffset: +1", "unknown"].join(
		"\n",
	);
	const sourceText = ["one", "two", "three"].join("\n");
	return {
		entryPath: "/book.adoc",
		documentRoot: "/",
		logicalText: text,
		sourceFiles: [
			{
				absolutePath: "/book.adoc",
				relativePath: "book.adoc",
				text: sourceText,
				lineTable: buildLineTable(sourceText),
			},
		],
		diagnostics: [
			{
				level: "warning",
				code: "source-coordinate.degraded-line",
				message: "Reader cursor could not be mapped.",
			},
		],
		lines: [
			{
				kind: "source-preserving",
				logicalLine: 1,
				text: "one",
				origin: {
					absolutePath: "/book.adoc",
					relativePath: "book.adoc",
					sourceLine: 1,
				},
				columnMap: { kind: "identity" },
			},
			{
				kind: "selected-source",
				logicalLine: 2,
				text: "three",
				origin: {
					absolutePath: "/book.adoc",
					relativePath: "book.adoc",
					sourceLine: 3,
				},
				selector: { kind: "lines", expression: "3" },
				columnMap: { kind: "identity" },
			},
			{
				kind: "transformed-source",
				logicalLine: 3,
				text: "  two",
				originText: "two",
				origin: {
					absolutePath: "/book.adoc",
					relativePath: "book.adoc",
					sourceLine: 2,
				},
				transform: { kind: "indent", columns: 2 },
				columnMap: {
					kind: "offset",
					logicalStartColumn: 3,
					originStartColumn: 1,
				},
			},
			{
				kind: "generated-control",
				logicalLine: 4,
				text: ":leveloffset: +1",
				generatedKind: "leveloffset-push",
			},
			{
				kind: "degraded",
				logicalLine: 5,
				text: "unknown",
				evidence: {},
				diagnostic: {
					level: "warning",
					code: "source-coordinate.degraded-line",
					message: "Reader cursor could not be mapped.",
				},
			},
		],
	};
}
