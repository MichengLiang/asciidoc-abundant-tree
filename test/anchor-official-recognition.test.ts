import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTreeFromSource } from "../src/browser-parser";
import type { AbundantDocument } from "../src/model";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

// 锚点由官方认定（09 号书第 8 章 Anchor Occurrence；asciidoc-abundant-tree#026）：行内锚点看官方转换时
// convert_inline_anchor 接到了谁，与 xref 同一个机制；块锚点、节标题末尾的锚点与参考文献条目看 refs 目录里的登记。
describe("anchors recognized by Asciidoctor", () => {
	it("leaves out anchors written inside passthroughs", async () => {
		const document = await parse(
			"= T\n\n== 甲\n\n写法：`pass:[[[锚点]]]`，真锚点 [[真锚点]] 在这里。\n\n+++[[三加号]]+++\n",
		);

		expect(anchorIds(document)).toEqual(["真锚点"]);
		expect(
			document.targets
				.filter((target) => target.targetType === "inline-anchor")
				.map((target) => target.id),
		).toEqual(["真锚点"]);
	});

	it("keeps anchors that Asciidoctor converts but does not catalog", async () => {
		const document = await parse(
			[
				"= T",
				"",
				"== 节标题 [[sec-anchor]]",
				"",
				"术语:: 描述里 anchor:desc-anchor[] 在这里",
				"",
				"* 列表项 [[li-anchor]]",
				"",
				"|===",
				"|单元格 [[cell-anchor]]",
				"|===",
				"",
				".块标题 [[title-anchor]]",
				"段落",
				"",
				"[[block-para]]",
				"段落二",
				"",
				"[bibliography]",
				"* [[[书目]]] 某书",
				"",
			].join("\n"),
		);

		expect(anchorIds(document).toSorted()).toEqual(
			[
				"sec-anchor",
				"desc-anchor",
				"li-anchor",
				"cell-anchor",
				"title-anchor",
				"block-para",
				"书目",
			].toSorted(),
		);
	});

	it("keeps identical anchors written at the same place in different included files", async () => {
		const book = writeBook("same-place", {
			"book.adoc": [
				"= 书",
				"",
				"include::a.adoc[]",
				"",
				"include::b.adoc[]",
				"",
			].join("\n"),
			"a.adoc": "== 甲\n\n* 同项 [[同锚]]\n",
			"b.adoc": "== 乙\n\n* 同项 [[同锚]]\n",
		});
		const document = await parseAbundantTree({
			sourcePath: book,
			mode: "book-entry",
			documentRoot: dirname(book),
		});

		expect(
			document.anchorOccurrences.map((anchor) => [
				anchor.ids[0],
				anchor.source?.relativePath,
				anchor.sourceSpan?.start.line,
				anchor.sourceSpan?.start.column,
			]),
		).toEqual([
			["同锚", "a.adoc", 3, 6],
			["同锚", "b.adoc", 3, 6],
		]);
	});
});

function parse(sourceText: string): Promise<AbundantDocument> {
	return parseAbundantTreeFromSource({ sourceText });
}

function anchorIds(document: AbundantDocument): string[] {
	return document.anchorOccurrences.flatMap((anchor) => anchor.ids);
}

function writeBook(name: string, files: Record<string, string>): string {
	const root = join(
		dirname(writeFixture(`anchor-${name}.marker`, "")),
		`anchor-${name}`,
	);
	mkdirSync(root, { recursive: true });
	for (const [file, text] of Object.entries(files)) {
		writeFileSync(join(root, file), text, "utf8");
	}
	return join(root, "book.adoc");
}
