import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

// 官方按段落读的文字跳过行注释，按分隔符读的内容不跳过（09 号书「Inline 扫描边界」）。
describe("line comments", () => {
	it("leaves out the comments Asciidoctor skips and keeps the lines of a delimited verse", async () => {
		const document = await parseAbundantTree({
			sourcePath: writeFixture(
				"line-comments.adoc",
				[
					"= 文",
					"",
					"== 节",
					"",
					"第一行",
					"// 段落里 xref:p[P] [[pa]]",
					"第二行",
					"",
					"[verse]",
					"____",
					"诗一行",
					"// 诗里 xref:v[V]",
					"____",
					"",
					"> 引语",
					"> // 引语里 xref:q[Q]",
					"> 末行",
					"",
					"NOTE: 提示",
					"// 提示里 xref:n[N]",
					"",
					"* 条目",
					"// 条目里 xref:l[L]",
					"续行 xref:c[C]",
					"",
					"[sidebar]",
					"旁注",
					"// 旁注里 xref:s[S]",
					"",
					"|===",
					"|单元格一行",
					"// 单元格里 xref:t[T]",
					"单元格二行 xref:u[U]",
					"|===",
					"",
				].join("\n"),
			),
		});

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([
			["v", 12],
			["c", 24],
			["u", 33],
		]);
		expect(document.anchorOccurrences).toEqual([]);
	});
});
