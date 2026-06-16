import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAsciidoctorAdapter } from "../../src/asciidoctor-adapter";
import { parseIncludeAttributes } from "../../src/book-entry/include-attribute-model";
import { preprocessBookEntryWithOfficialReader } from "../../src/book-entry/official-reader-preprocessor";

const fixtureRoot = join(process.cwd(), "tmp/book-entry-official-reader");

describe("book-entry official Reader preprocessor", () => {
	it("reads full-file and nested includes through Reader.readLine cursor evidence", () => {
		const entryPath = writeFixture(
			"full/book.adoc",
			["= Book", "include::chapter.adoc[]"].join("\n"),
		);
		writeFixture(
			"full/chapter.adoc",
			["chapter line", "include::nested.adoc[]"].join("\n"),
		);
		writeFixture("full/nested.adoc", "nested line\n");

		const document = preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorAdapter(),
			sourcePath: entryPath,
			documentRoot: join(fixtureRoot, "full"),
		});

		expect(document.logicalText.split(/\r?\n/u)).toEqual([
			"= Book",
			"chapter line",
			"nested line",
		]);
		expect(document.lines.map((line) => line.kind)).toContain(
			"source-preserving",
		);
		expect(document.lines.find((line) => line.text === "nested line")).toEqual(
			expect.objectContaining({
				origin: expect.objectContaining({
					relativePath: "nested.adoc",
					sourceLine: 1,
				}),
			}),
		);
	});

	it("preprocesses includes inside source blocks", () => {
		const entryPath = writeFixture(
			"source-block/book.adoc",
			["[source,js]", "----", "include::snippet.js[]", "----"].join("\n"),
		);
		writeFixture("source-block/snippet.js", "console.log('reader');\n");

		const document = preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorAdapter(),
			sourcePath: entryPath,
			documentRoot: join(fixtureRoot, "source-block"),
		});

		expect(document.logicalText).toContain("console.log('reader');");
		expect(document.logicalText).not.toContain("include::snippet.js[]");
	});

	it("classifies include attributes without treating supported surfaces as unmapped", () => {
		expect(parseIncludeAttributes("tag=main").classification).toBe("mapped");
		expect(parseIncludeAttributes("tags=a;b;!skip").classification).toBe(
			"mapped",
		);
		expect(parseIncludeAttributes('lines="1..3,8"').classification).toBe(
			"mapped",
		);
		expect(
			parseIncludeAttributes("indent=2,leveloffset=+1,opts=optional")
				.classification,
		).toBe("mapped");
		expect(parseIncludeAttributes("unknown=value")).toEqual(
			expect.objectContaining({
				classification: "unmapped",
				diagnostics: [
					expect.objectContaining({ code: "include.attrlist-unmapped" }),
				],
			}),
		);
	});

	it("records tag, tags, and line-range selected source origins", () => {
		const entryPath = writeFixture(
			"selection/book.adoc",
			[
				"include::tagged.adoc[tag=main]",
				"include::tagged.adoc[tags=a;b;!skip]",
				'include::lines.adoc[lines="1..3,8"]',
			].join("\n"),
		);
		writeFixture(
			"selection/tagged.adoc",
			[
				"// tag::main[]",
				"main body",
				"// end::main[]",
				"// tag::a[]",
				"a body",
				"// tag::skip[]",
				"skip body",
				"// end::skip[]",
				"// end::a[]",
				"// tag::b[]",
				"b body",
				"// end::b[]",
			].join("\n"),
		);
		writeFixture(
			"selection/lines.adoc",
			Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join("\n"),
		);

		const document = preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorAdapter(),
			sourcePath: entryPath,
			documentRoot: join(fixtureRoot, "selection"),
		});

		expect(selectedSourceLines(document, "tagged.adoc")).toEqual(
			expect.arrayContaining([2, 5, 11]),
		);
		expect(selectedSourceLines(document, "lines.adoc")).toEqual([1, 2, 3, 8]);
	});

	it("does not treat unmapped include attributes as source contributions", () => {
		const entryPath = writeFixture(
			"unmapped/book.adoc",
			"include::chapter.adoc[foo=bar]\n",
		);
		writeFixture("unmapped/chapter.adoc", "included\n");

		const document = preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorAdapter(),
			sourcePath: entryPath,
			documentRoot: join(fixtureRoot, "unmapped"),
		});

		expect(document.logicalText).not.toContain("included");
		expect(document.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					level: "error",
					code: "include.attrlist-unmapped",
				}),
			]),
		);
		expect(document.sourceFiles.map((file) => file.relativePath)).toEqual([
			"book.adoc",
		]);
	});

	it("records indentation transforms, leveloffset controls, optional missing includes, and escaped includes", () => {
		const entryPath = writeFixture(
			"surfaces/book.adoc",
			[
				"include::indent.txt[indent=2]",
				"include::chapter.adoc[leveloffset=+1]",
				"include::missing.adoc[opts=optional]",
				"\\include::escaped.adoc[]",
			].join("\n"),
		);
		writeFixture("surfaces/indent.txt", "body\n");
		writeFixture("surfaces/chapter.adoc", "== Chapter\n");
		writeFixture("surfaces/escaped.adoc", "must not appear\n");

		const document = preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorAdapter(),
			sourcePath: entryPath,
			documentRoot: join(fixtureRoot, "surfaces"),
		});

		expect(document.lines).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "transformed-source",
					text: "  body",
				}),
				expect.objectContaining({ kind: "generated-control" }),
				expect.objectContaining({
					kind: "source-preserving",
					text: "include::escaped.adoc[]",
					escapedInclude: true,
				}),
			]),
		);
		expect(document.logicalText).toContain("\\include::escaped.adoc[]");
		expect(document.logicalText).not.toContain("must not appear");
		expect(document.optionalIncludes).toEqual([
			expect.objectContaining({
				relativePath: "book.adoc",
				sourceLine: 3,
				target: "missing.adoc",
			}),
		]);
	});
});

function selectedSourceLines(
	document: ReturnType<typeof preprocessBookEntryWithOfficialReader>,
	relativePath: string,
): number[] {
	return document.lines
		.filter(
			(
				line,
			): line is Extract<
				(typeof document.lines)[number],
				{ kind: "selected-source" }
			> =>
				line.kind === "selected-source" &&
				line.origin.relativePath === relativePath,
		)
		.map((line) => line.origin.sourceLine);
}

function writeFixture(relativePath: string, source: string): string {
	const path = join(fixtureRoot, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source, "utf8");
	return path;
}
