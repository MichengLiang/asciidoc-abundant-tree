import { describe, expect, it } from "vitest";
import type { AbundantNode, ListingNode, SectionNode } from "../src/model";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

// 元数据照官方的读法附着（09 号书第 8 章 Metadata Attachment；asciidoc-abundant-tree#025）：元数据之后的空行、
// 行注释与块注释不打断附着；隔着别的块时附给那个块；段落末尾的 `.标题` 行是段落的文字，不是下一个块的元数据。
describe("metadata attachment", () => {
	it("attaches a block title across blank lines, so its xrefs are recognized", async () => {
		const document = await parse(
			"metadata-blank-line-title.adoc",
			"= T\n\n== 甲\n\n.块标题见 xref:甲[]\n\n段落。\n\n.紧挨的块标题见 xref:甲[]\n段落二。\n",
		);

		expect(
			document.xrefOccurrences.map((xref) => [
				xref.sourceSpan?.start.line,
				xref.asciidoctor?.href,
			]),
		).toEqual([
			[5, "#甲"],
			[9, "#甲"],
		]);
		expect(spans(document.children, "paragraph")).toEqual([
			{ startLine: 5, endLine: 7 },
			{ startLine: 9, endLine: 10 },
		]);
	});

	it("leaves a title-like last line of a paragraph to that paragraph", async () => {
		const document = await parse(
			"metadata-paragraph-tail.adoc",
			"= T\n\n文字\n.Foo\n[[x]]\n\n段落B\n",
		);

		// 官方：.Foo 是第一段的文字；[[x]] 断开段落，隔着空行附给段落B（段落B 的 id 是 x，没有标题）。
		expect(spans(document.children, "paragraph")).toEqual([
			{ startLine: 3, endLine: 4 },
			{ startLine: 5, endLine: 7 },
		]);
	});

	it("attaches metadata to a section across blank lines", async () => {
		const document = await parse(
			"metadata-section-blank-lines.adoc",
			"= T\n\n.节前标题\n\n[#s1]\n\n== 节\n\n正文\n",
		);
		const section = document.children.find(
			(node): node is SectionNode => node.kind === "section",
		);

		expect(section?.ids).toEqual(["s1"]);
		expect(
			section?.metadata?.map((item) => [item.metadataKind, item.line]),
		).toEqual([
			["title", 3],
			["id", 5],
		]);
	});

	it("reads past line and block comments between metadata and its block", async () => {
		const document = await parse(
			"metadata-comments.adoc",
			"= T\n\n.标题\n// 注释\n\n////\n块注释\n////\n\n[source]\n\n----\nx\n----\n",
		);
		const [listing] = collect(document.children, "listing") as ListingNode[];

		expect(listing?.span).toEqual({ startLine: 3, endLine: 14 });
		expect(listing?.style).toBe("source");
		expect(
			listing?.metadata?.map((item) => [item.metadataKind, item.line]),
		).toEqual([
			["title", 3],
			["attrlist", 10],
		]);
	});

	it("attaches metadata to the next block, not to a block after it", async () => {
		const document = await parse(
			"metadata-next-block.adoc",
			"= T\n\n.标题见 xref:甲[]\n\n----\nx\n----\n\n段落\n\n[#甲]\n== 甲\n",
		);

		expect(spans(document.children, "listing")).toEqual([
			{ startLine: 3, endLine: 7 },
		]);
		expect(spans(document.children, "paragraph")).toEqual([
			{ startLine: 9, endLine: 9 },
		]);
		expect(
			document.xrefOccurrences.map((xref) => xref.sourceSpan?.start.line),
		).toEqual([3]);
	});
});

async function parse(name: string, source: string) {
	return parseAbundantTree({ sourcePath: writeFixture(name, source) });
}

function collect(nodes: readonly AbundantNode[], kind: string): AbundantNode[] {
	return nodes.flatMap((node) => [
		...(node.kind === kind ? [node] : []),
		...collect(node.children ?? [], kind),
	]);
}

function spans(nodes: readonly AbundantNode[], kind: string) {
	return collect(nodes, kind).map((node) =>
		"span" in node ? node.span : node.source?.span,
	);
}
