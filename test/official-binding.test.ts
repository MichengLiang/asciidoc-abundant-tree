import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

const shelf = join(process.cwd(), "docs/bookshelf");
const books = readdirSync(join(shelf, "books"));

function bindings(document: Awaited<ReturnType<typeof parseAbundantTree>>) {
	return document.xrefOccurrences.map((xref) => [
		xref.raw,
		xref.sourceSpan?.start.line,
		xref.asciidoctor?.href,
		xref.asciidoctor?.reftext,
	]);
}

describe("official binding", () => {
	// 09 号书「Binding Merge」：每个 xref occurrence 都在某个块的文字里，都带 official href。书会继续改写，这条一直成立。
	it.each(books)("gives every xref in %s an official href", async (book) => {
		const document = await parseAbundantTree({
			sourcePath: join(shelf, "books", book, "book.adoc"),
			mode: "book-entry",
			documentRoot: shelf,
		});

		expect(document.xrefOccurrences.length).toBeGreaterThan(0);
		expect(
			document.xrefOccurrences
				.filter((xref) => !xref.asciidoctor?.href)
				.map((xref) => [
					xref.raw,
					xref.source?.relativePath,
					xref.source?.line,
				]),
		).toEqual([]);
	});

	it("binds xrefs in olist, ulist and colist items, continuation lines included", async () => {
		const document = await parseAbundantTree({
			sourcePath: writeFixture(
				"official-binding-list-items.adoc",
				[
					"= 文",
					"",
					"== 节",
					"",
					"* 条目 xref:a[甲]",
					"* 再一条",
					"续行 xref:a[]",
					"",
					". 有序 xref:nope[]",
					"",
					"----",
					"x // <1>",
					"----",
					"<1> 说明 <<a>>",
					"",
					"[#a]",
					"== 目标",
					"",
				].join("\n"),
			),
		});

		expect(document.toolDiagnostics).toEqual([]);
		expect(bindings(document)).toEqual([
			["xref:a[甲]", 5, "#a", "甲"],
			["xref:a[]", 7, "#a", "目标"],
			["xref:nope[]", 9, "#nope", "[nope]"],
			["<<a>>", 14, "#a", "目标"],
		]);
	});

	it("binds xrefs in list items of an included chapter", async () => {
		writeFixture(
			"official-binding-chapter.adoc",
			"== 章\n\n* 条目 xref:a[甲]\n续行 xref:a[]\n\n[#a]\n=== 目标\n",
		);
		const sourcePath = writeFixture(
			"official-binding-book.adoc",
			"= 书\n\ninclude::official-binding-chapter.adoc[]\n",
		);
		const document = await parseAbundantTree({
			sourcePath,
			mode: "book-entry",
			documentRoot: dirname(sourcePath),
		});

		expect(document.toolDiagnostics).toEqual([]);
		expect(bindings(document)).toEqual([
			["xref:a[甲]", 3, "#a", "甲"],
			["xref:a[]", 4, "#a", "目标"],
		]);
	});
});
