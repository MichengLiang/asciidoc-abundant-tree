import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	AbundantDocument,
	AbundantNode,
	ListingNode,
	XrefOccurrenceNode,
} from "../../src/model";
import { parseAbundantTree } from "../../src/parser";

// 10 号书「Block Raw」与「结构关系在 Logical Document 上判定」：块中间的 include 指令不让块失去作者文件的坐标，
// 被引入的行里的出现处仍属于这个块。
const fixtureRoot = join(
	process.cwd(),
	"test/book-entry/fixtures/included-lines-in-blocks",
);

describe("book-entry blocks with included lines", () => {
	it("gives a source block its author file coordinates and keeps the include directive in raw", async () => {
		const document = await parseFixture();
		const listing = blockById(document, "lst") as ListingNode;

		expect(listing.source?.relativePath).toBe("parts/a.adoc");
		expect(listing.source?.raw).toBe(
			"[#lst]\n[source,python]\n----\ninclude::../code/values.py[]\n----\n",
		);
		expect(listing.span).toEqual({ startLine: 4, endLine: 8 });
		expect(listing.contentSpan).toEqual({ startLine: 7, endLine: 7 });
		expect(listing.content).toBe("def value():\n    return 1");
	});

	it("gives tables and paragraphs with an included line their author file coordinates", async () => {
		const document = await parseFixture();

		expect(blockById(document, "tbl").source).toMatchObject({
			relativePath: "parts/a.adoc",
			span: { startLine: 10, endLine: 14 },
			raw: "[#tbl]\n|===\n| Col\ninclude::rows.adoc[]\n|===\n",
		});
		expect(paragraphContaining(document, "Opening line").source).toMatchObject({
			relativePath: "parts/a.adoc",
			span: { startLine: 16, endLine: 19 },
			raw: "[#para]\nOpening line of the paragraph.\ninclude::middle.adoc[]\nClosing line.\n",
		});
	});

	it("keeps xrefs from included lines under the block that includes them", async () => {
		const document = await parseFixture();

		expect(xrefLabels(blockById(document, "tbl"))).toEqual(["T1"]);
		expect(xrefLabels(paragraphContaining(document, "Opening line"))).toEqual([
			"T2",
		]);
		const t1 = childXrefs(blockById(document, "tbl"))[0];
		expect(t1?.source?.relativePath).toBe("parts/rows.adoc");
		expect(t1?.asciidoctor?.href).toBe("#target");
	});

	it("reports only blocks whose ends lie in different files or re-read their author file", async () => {
		const document = await parseFixture();
		const reread = collectNodes(document.children, "listing").find((node) =>
			(node as ListingNode).content?.includes("reread body"),
		) as ListingNode;

		expect(reread.source).toBeUndefined();
		expect(
			document.toolDiagnostics.filter(
				(diagnostic) => diagnostic.code === "block-origin.multi-source-span",
			),
		).toEqual([
			expect.objectContaining({
				level: "warning",
				message:
					"listing block from parts/reread.adoc:6 to parts/reread.adoc:3 reads parts/reread.adoc out of source order; no contiguous raw exists.",
			}),
		]);
	});
});

function parseFixture(): Promise<AbundantDocument> {
	return parseAbundantTree({
		sourcePath: join(fixtureRoot, "book.adoc"),
		mode: "book-entry",
		documentRoot: fixtureRoot,
	});
}

function blockById(document: AbundantDocument, id: string): AbundantNode {
	const found = collectAll(document.children).find(
		(node) => node.kind !== "section" && "ids" in node && node.ids.includes(id),
	);
	if (!found) {
		throw new Error(`Missing block #${id}`);
	}
	return found;
}

function paragraphContaining(
	document: AbundantDocument,
	text: string,
): AbundantNode {
	const found = collectNodes(document.children, "paragraph").find(
		(node) => "text" in node && node.text.includes(text),
	);
	if (!found) {
		throw new Error(`Missing paragraph containing: ${text}`);
	}
	return found;
}

function childXrefs(node: AbundantNode): XrefOccurrenceNode[] {
	return (node.children ?? []).filter(
		(child): child is XrefOccurrenceNode => child.kind === "xref",
	);
}

function xrefLabels(node: AbundantNode): (string | undefined)[] {
	return childXrefs(node).map((xref) => xref.label);
}

function collectNodes(nodes: AbundantNode[], kind: string): AbundantNode[] {
	return collectAll(nodes).filter((node) => node.kind === kind);
}

function collectAll(nodes: AbundantNode[]): AbundantNode[] {
	return nodes.flatMap((node) => [node, ...collectAll(node.children ?? [])]);
}
