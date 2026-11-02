import { describe, expect, it } from "vitest";
import type { AbundantNode, MetadataNode, SectionNode } from "../src/model";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

// 09 号书第 5 章：节的 style 是官方从第一个位置属性推出的名字，交在官方层 asciidoctor.style，不在 metadata 的
// attributes 里（第 8 章「Metadata Attachment」）。
describe("section style from the official layer", () => {
	it("carries Asciidoctor's style of each section", async () => {
		const path = writeFixture(
			"section-style.adoc",
			[
				"= 书",
				":doctype: book",
				"",
				"[preface]",
				"== 前言",
				"",
				"== 正文",
				"",
				"[.dish, style=炖]",
				"== 红烧肉",
				"",
				"[appendix]",
				"== 附表",
				"",
				"[colophon]",
				"== 版权页",
			].join("\n"),
		);
		const document = await parseAbundantTree({ sourcePath: path });
		const sections = collectSections(document.children);

		expect(
			sections.map((section) => [section.title, section.asciidoctor?.style]),
		).toEqual([
			["前言", "preface"],
			["正文", undefined],
			// 官方把命名的 style= 同样当节的 style（实测 Asciidoctor.js 4.1.1）。
			["红烧肉", "炖"],
			["附表", "appendix"],
			["版权页", "colophon"],
		]);
		expect(sections[1]?.asciidoctor).not.toHaveProperty("style");
		const attrlistOf = (section: SectionNode | undefined) =>
			section?.metadata?.find(
				(item: MetadataNode) => item.metadataKind === "attrlist",
			);
		expect(attrlistOf(sections[0])?.attributes).toEqual({});
		expect(attrlistOf(sections[2])?.attributes).toEqual({ style: "炖" });
	});
});

function collectSections(
	nodes: readonly AbundantNode[] | undefined,
): SectionNode[] {
	return (nodes ?? []).flatMap((node) =>
		node.kind === "section"
			? [node as SectionNode, ...collectSections(node.children)]
			: collectSections(node.children),
	);
}
