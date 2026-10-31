import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import type { Rdf12Graph } from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";

// 被 include 拼进来的文件是这本书的一部分：指向它的 xref 照官方读作书内引用（06 号书「Target Heading」）。
const root = join(process.cwd(), "test/book-entry/fixtures/included-file-xref");

async function bookGraph(): Promise<Rdf12Graph> {
	const document = await parseAbundantTree({
		sourcePath: join(root, "book.adoc"),
		mode: "book-entry",
		documentRoot: root,
	});
	return projectAbundantDocumentToRdf12(document, { documentRoot: root }).graph;
}

describe("xref to a file included into the book", () => {
	it("binds a fragment in an included file, nested includes too, inside the book", async () => {
		const graph = await bookGraph();
		for (const [raw, headline, href] of [
			["xref:chapters/b.adoc#乙[]", "乙", "#乙"],
			["xref:chapters/sub/c.adoc#丙[]", "丙", "#丙"],
		] as const) {
			const edge = edgeByRaw(graph, raw);
			expect(objects(graph, edge, "targetDocument")).toEqual([]);
			expect(objects(graph, edge, "targetSelector")).toEqual([headline]);
			expect(objects(graph, edge, "officialHref")).toEqual([href]);
			expect(objects(graph, edge, "targetHeading")).toEqual([
				headingWithHeadline(graph, headline),
			]);
		}
	});

	it("reads a whole included file as the book itself: no selector, no target heading", async () => {
		const graph = await bookGraph();
		const edge = edgeByRaw(graph, "xref:chapters/b.adoc[整章]");
		expect(objects(graph, edge, "targetDocument")).toEqual([]);
		expect(objects(graph, edge, "targetSelector")).toEqual([]);
		expect(objects(graph, edge, "targetHeading")).toEqual([]);
		expect(objects(graph, edge, "officialHref")).toEqual(["#"]);
	});

	it("reads paths from the entry directory, not from the file writing the xref", async () => {
		const graph = await bookGraph();
		for (const [raw, document, href] of [
			["xref:b.adoc#乙[]", "b.adoc", "b.html#乙"],
			["xref:sub/c.adoc#丙[]", "sub/c.adoc", "sub/c.html#丙"],
		] as const) {
			const edge = edgeByRaw(graph, raw);
			expect(objects(graph, edge, "targetDocument")).toEqual([document]);
			expect(objects(graph, edge, "officialHref")).toEqual([href]);
			expect(objects(graph, edge, "targetHeading")).toEqual([]);
		}
	});

	it("reads a single file referring to itself without a fragment as the document itself", async () => {
		const graph = projectAbundantDocumentToRdf12(
			await parseAbundantTree({ sourcePath: join(root, "self.adoc") }),
			{ documentRoot: root },
		).graph;
		const whole = edgeByRaw(graph, "xref:self.adoc[本文]");
		expect(objects(graph, whole, "targetSelector")).toEqual([]);
		expect(objects(graph, whole, "targetHeading")).toEqual([]);
		expect(objects(graph, whole, "officialHref")).toEqual(["#"]);
		const section = edgeByRaw(graph, "xref:self.adoc#节[]");
		expect(objects(graph, section, "targetHeading")).toEqual([
			headingWithHeadline(graph, "节"),
		]);
	});
});

function edgeByRaw(graph: Rdf12Graph, raw: string): string {
	const [triple] = graph.match({
		predicate: iriTerm(`${namespaces.aat}raw`),
		object: stringLiteral(raw),
	});
	if (triple?.subject.termType !== "iri") {
		throw new Error(`no xref edge with raw ${raw}`);
	}
	return triple.subject.value;
}

function objects(graph: Rdf12Graph, subject: string, local: string): string[] {
	return graph
		.match({
			subject: iriTerm(subject),
			predicate: iriTerm(`${namespaces.aat}${local}`),
		})
		.map((triple) =>
			"value" in triple.object ? String(triple.object.value) : "",
		);
}

function headingWithHeadline(graph: Rdf12Graph, headline: string): string {
	const [triple] = graph.match({
		predicate: iriTerm(`${namespaces.aat}headline`),
		object: stringLiteral(headline),
	});
	return triple?.subject.value ?? "";
}
