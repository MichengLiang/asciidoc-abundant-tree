import { describe, expect, it } from "vitest";
import {
	type AsciidoctorBlock,
	createAsciidoctorAdapter,
} from "../../src/asciidoctor-adapter";
import type { LogicalLineRecord } from "../../src/book-entry/line-origin-model";
import { buildParserSafeLogicalText } from "../../src/book-entry/parser-safe-logical-text";

describe("book-entry parser-safe logical text", () => {
	it("writes escaped include records with a leading backslash", () => {
		const safe = buildParserSafeLogicalText([
			escapedIncludeRecord(1, "include::target.adoc[]"),
		]);

		expect(safe.text).toBe("\\include::target.adoc[]");
		expect(safe.lineRecords).toHaveLength(1);
	});

	it("does not expand escaped include target during parser load", () => {
		const safe = buildParserSafeLogicalText([
			escapedIncludeRecord(1, "include::target.adoc[]"),
		]);
		const document = createAsciidoctorAdapter().loadSource(safe.text);
		const [block] = (document.getBlocks?.() ?? []) as AsciidoctorBlock[];

		expect(document.getBlocks?.().length).toBe(1);
		expect(block?.getSource?.()).toBe("include::target.adoc[]");
	});

	it("keeps generated control lines in parser-safe text", () => {
		const safe = buildParserSafeLogicalText([
			{
				kind: "generated-control",
				logicalLine: 1,
				text: ":leveloffset: +1",
				generatedKind: "leveloffset-push",
			},
		]);

		expect(safe.text).toBe(":leveloffset: +1");
	});

	it("keeps parser-safe line count equal to record count", () => {
		const safe = buildParserSafeLogicalText([
			escapedIncludeRecord(1, "include::target.adoc[]"),
			{
				kind: "source-preserving",
				logicalLine: 2,
				text: "normal",
				origin: {
					absolutePath: "/book.adoc",
					relativePath: "book.adoc",
					sourceLine: 2,
				},
				columnMap: { kind: "identity" },
			},
		]);

		expect(safe.text.split(/\r?\n/u)).toHaveLength(safe.lineRecords.length);
	});
});

function escapedIncludeRecord(
	logicalLine: number,
	text: string,
): LogicalLineRecord {
	return {
		kind: "source-preserving",
		logicalLine,
		text,
		origin: {
			absolutePath: "/book.adoc",
			relativePath: "book.adoc",
			sourceLine: logicalLine,
		},
		columnMap: { kind: "identity" },
		escapedInclude: true,
	};
}
