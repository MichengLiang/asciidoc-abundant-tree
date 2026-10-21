import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAsciidoctorFileAdapter } from "../../src/asciidoctor-file-adapter";
import { parseIncludeAttributes } from "../../src/book-entry/include-attribute-model";
import { preprocessBookEntryWithOfficialReader } from "../../src/book-entry/official-reader-preprocessor";
import { parseAbundantTree } from "../../src/index";
import type { SectionNode } from "../../src/model";

const fixtureRoot = join(process.cwd(), "tmp/book-entry-official-reader");

describe("book-entry official Reader preprocessor", () => {
	it("reads full-file and nested includes through Reader.readLine cursor evidence", async () => {
		const entryPath = writeFixture(
			"full/book.adoc",
			["= Book", "include::chapter.adoc[]"].join("\n"),
		);
		writeFixture(
			"full/chapter.adoc",
			["chapter line", "include::nested.adoc[]"].join("\n"),
		);
		writeFixture("full/nested.adoc", "nested line\n");

		const document = await preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorFileAdapter(),
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

	it("preprocesses includes inside source blocks", async () => {
		const entryPath = writeFixture(
			"source-block/book.adoc",
			["[source,js]", "----", "include::snippet.js[]", "----"].join("\n"),
		);
		writeFixture("source-block/snippet.js", "console.log('reader');\n");

		const document = await preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorFileAdapter(),
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

	it("parses positional, quoted, and value-less include attributes structurally", () => {
		expect(parseIncludeAttributes("tag").surfaces).toEqual([]);
		expect(parseIncludeAttributes("tags").surfaces).toEqual([]);
		expect(parseIncludeAttributes("lines").surfaces).toEqual([]);
		expect(parseIncludeAttributes("leveloffset").surfaces).toEqual([]);
		expect(parseIncludeAttributes("indent").surfaces).toEqual([]);
		expect(parseIncludeAttributes("indent=abc").surfaces).toEqual([]);
		expect(parseIncludeAttributes("opts").surfaces).toEqual([]);
		expect(parseIncludeAttributes("opts=optional;nowrap").surfaces).toEqual([
			{ kind: "optional" },
		]);
		expect(parseIncludeAttributes("opts=nowrap").surfaces).toEqual([]);
		expect(parseIncludeAttributes("tag='main,part',lines=\"1..3,8\"")).toEqual(
			expect.objectContaining({
				classification: "mapped",
				entries: [
					{ name: "tag", value: "main,part" },
					{ name: "lines", value: "1..3,8" },
				],
				surfaces: [
					{ kind: "tag", name: "main,part" },
					{ kind: "lines", expression: "1..3,8" },
				],
			}),
		);
		expect(parseIncludeAttributes("flag")).toEqual(
			expect.objectContaining({
				classification: "unmapped",
				entries: [{ name: "flag", value: true }],
				diagnostics: [
					expect.objectContaining({ code: "include.attrlist-unmapped" }),
				],
			}),
		);
	});

	it("records tag, tags, and line-range selected source origins", async () => {
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

		const document = await preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorFileAdapter(),
			sourcePath: entryPath,
			documentRoot: join(fixtureRoot, "selection"),
		});

		expect(selectedSourceLines(document, "tagged.adoc")).toEqual(
			expect.arrayContaining([2, 5, 11]),
		);
		expect(selectedSourceLines(document, "lines.adoc")).toEqual([1, 2, 3, 8]);
	});

	it("does not treat unmapped include attributes as source contributions", async () => {
		const entryPath = writeFixture(
			"unmapped/book.adoc",
			"include::chapter.adoc[foo=bar]\n",
		);
		writeFixture("unmapped/chapter.adoc", "included\n");

		const document = await preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorFileAdapter(),
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

	it("records indentation transforms, leveloffset controls, optional missing includes, and escaped includes", async () => {
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

		const document = await preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorFileAdapter(),
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
	it("keeps both lines Reader appends after a leveloffset include", async () => {
		const root = join(fixtureRoot, "leveloffset-tail");
		writeFixture("leveloffset-tail/inner.adoc", "内文。\n");
		writeFixture(
			"leveloffset-tail/part.adoc",
			"== 部分\n\ninclude::inner.adoc[]\n",
		);
		const entryPath = writeFixture(
			"leveloffset-tail/book.adoc",
			"= 书\n\n== 章\n\ninclude::part.adoc[leveloffset=+1]\n\n== 后一章\n\n后文。\n",
		);
		const adapter = createAsciidoctorFileAdapter();

		const official = await adapter.readPreprocessedLines({
			sourcePath: entryPath,
			baseDir: root,
		});
		const document = await preprocessBookEntryWithOfficialReader({
			adapter,
			sourcePath: entryPath,
			documentRoot: root,
		});
		const parsed = await parseAbundantTree({
			sourcePath: entryPath,
			mode: "book-entry",
			documentRoot: root,
		});
		const [chapter, nextChapter] = parsed.children as SectionNode[];
		const part = chapter?.children?.find((child) => child.kind === "section") as
			| SectionNode
			| undefined;

		// 末尾补的空行若不进 logical document，`:leveloffset!:` 会被读成“内文。”段落的正文，leveloffset 不再复位。
		expect(document.lines.map((line) => line.text)).toEqual(
			official.map((line) => line.text),
		);
		expect(parsed.toolDiagnostics).toEqual([]);
		expect(part?.children).toEqual([
			expect.objectContaining({
				kind: "paragraph",
				text: "内文。",
				source: expect.objectContaining({ relativePath: "inner.adoc" }),
			}),
		]);
		expect(nextChapter).toEqual(
			expect.objectContaining({ title: "后一章", level: 1 }),
		);
	});
});

function selectedSourceLines(
	document: Awaited<ReturnType<typeof preprocessBookEntryWithOfficialReader>>,
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
