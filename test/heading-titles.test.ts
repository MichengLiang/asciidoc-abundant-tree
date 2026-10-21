import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

// section 与 discrete 标题的标题文字做 macros 替换（09 号书「Inline 扫描边界」）。
describe("heading titles", () => {
	it("scans the xrefs and anchors of section and discrete titles", async () => {
		const document = await parseAbundantTree({
			sourcePath: writeFixture(
				"heading-titles.adoc",
				[
					"= 文",
					"",
					"== 节 xref:target[目标] [[sec-anchor]]",
					"",
					"正文。",
					"",
					"[discrete]",
					"=== 散标题 <<目标>>",
					"",
					"[#target]",
					"== 目标",
					"",
				].join("\n"),
			),
		});

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
				xref.containingSectionId,
				xref.scope,
				xref.asciidoctor?.resolvedId,
			]),
		).toEqual([
			["target", 3, "sec-anchor", "local", "target"],
			// 写成标题文字的自然引用要靠官方解析才认得出目标。
			["目标", 8, "sec-anchor", "local", "target"],
		]);
		expect(
			document.anchorOccurrences.map((anchor) => [
				anchor.ids,
				anchor.sourceSpan?.start.line,
			]),
		).toEqual([[["sec-anchor"], 3]]);
		expect(
			document.targets
				.filter((target) => target.targetType === "block")
				.map((target) => [target.id, target.idOrigin]),
		).toEqual([["_散标题_目标", "asciidoctor-generated"]]);
	});
});
