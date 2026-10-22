import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/index";
import type {
	AbundantNode,
	DescriptionListNode,
	XrefOccurrenceNode,
} from "../../src/model";

// book-entry 中出现处只剩来源坐标；术语与描述同在一行时按列分，要在同一套坐标里比（issue 016）。
// 入口文件的前言把引入的章节推后几行，逻辑行与来源行不同。
const fixtureRoot = join(
	process.cwd(),
	"test/book-entry/fixtures/description-occurrences",
);

describe("book-entry description list occurrences", () => {
	it("splits the xrefs on a term line between the term and the description, and binds them", async () => {
		const document = await parseAbundantTree({
			sourcePath: join(fixtureRoot, "book.adoc"),
			mode: "book-entry",
			documentRoot: fixtureRoot,
		});
		const [list] = collectAll(document.children).filter(
			(node): node is DescriptionListNode => node.kind === "descriptionList",
		);

		expect(
			list?.items.map((item) => [
				item.terms.flatMap((term) => labels(term.children)),
				labels(item.description?.children),
			]),
		).toEqual([
			[["术"], ["甲"]],
			[[], ["乙", "丙"]],
			[[], ["丁"]],
		]);
		const description = list?.items[1]?.description;
		expect(description?.source).toMatchObject({
			relativePath: "parts/a.adoc",
			span: { startLine: 7, endLine: 8 },
			raw: "说明 xref:target[乙]\n续行 xref:target[丙]",
		});
		expect(list?.items[0]?.terms[0]?.source?.raw).toBe("术语 xref:target[术]");
		expect(list?.items[0]?.description?.source?.raw).toBe(
			"说明 xref:target[甲]",
		);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.label,
				xref.asciidoctor?.href,
			]),
		).toEqual([
			["术", "#target"],
			["甲", "#target"],
			["乙", "#target"],
			["丙", "#target"],
			["丁", "#target"],
		]);
	});
});

function labels(children: AbundantNode[] | undefined): (string | undefined)[] {
	return (children ?? [])
		.filter((child): child is XrefOccurrenceNode => child.kind === "xref")
		.map((xref) => xref.label);
}

function collectAll(nodes: AbundantNode[]): AbundantNode[] {
	return nodes.flatMap((node) => [node, ...collectAll(node.children ?? [])]);
}
