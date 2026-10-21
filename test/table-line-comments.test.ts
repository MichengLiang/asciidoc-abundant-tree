import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

// 官方读表格先去掉行注释，再逐行编号，注释之后的单元格与 a| 单元格里的块行号偏小（09 号书「表格里的行注释」）。
describe("line comments in tables", () => {
	it("puts cells and the blocks of a| cells back on their source lines", async () => {
		expect(
			await xrefLines("table-comments.adoc", [
				"|===",
				"|一 xref:a[A]",
				"// 注释 xref:c[C]",
				"|二 xref:b[B]",
				"// 注释",
				"a|",
				"====",
				"三 xref:d[D]",
				"====",
				"|===",
			]),
		).toEqual([
			["a", 6],
			["b", 8],
			["d", 12],
		]);
	});

	it("counts the comments of a table inside a markdown quote at both levels", async () => {
		expect(
			await xrefLines("quoted-table-comments.adoc", [
				"> // 引语读到的注释",
				"> |===",
				"> |甲",
				"> // 表格读到的注释",
				"> |乙 xref:e[E]",
				"> |===",
			]),
		).toEqual([["e", 9]]);
	});

	it("relocates a table nested in an a| cell after the outer comments", async () => {
		expect(
			await xrefLines("nested-table-comments.adoc", [
				"|===",
				"|一",
				"// 外层注释",
				"a|",
				"// 单元格里的注释",
				'[cols="1"]',
				"!===",
				"!内一",
				"!内二 xref:f[F]",
				"!===",
				"|===",
			]),
		).toEqual([["f", 13]]);
	});
});

async function xrefLines(name: string, body: string[]) {
	const document = await parseAbundantTree({
		sourcePath: writeFixture(
			name,
			["= 文", "", "== 节", "", ...body, ""].join("\n"),
		),
	});
	expect(document.toolDiagnostics).toEqual([]);
	return document.xrefOccurrences.map((xref) => [
		xref.target,
		xref.sourceSpan?.start.line,
	]);
}
