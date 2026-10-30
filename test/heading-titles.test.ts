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
				xref.selector,
				xref.asciidoctor?.resolvedId,
			]),
		).toEqual([
			["target", 3, "sec-anchor", "local", "target", "target"],
			// 官方只在目标带空格或大写字母时按标题去找，`目标` 被当作 ID，官方层没有 resolvedId；
			// 按标题原文绑定由 RDF 投影的 label space 给出（06 号书第 5 章）。
			["目标", 8, "sec-anchor", "local", "目标", undefined],
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
