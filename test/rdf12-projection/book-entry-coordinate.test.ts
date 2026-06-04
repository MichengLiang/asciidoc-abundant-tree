import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree, rdf12 } from "../../src/index";
import type { AbundantDocument } from "../../src/model";
import type { Rdf12Graph } from "../../src/rdf12-projection/graph";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import type { Rdf12IriTerm } from "../../src/rdf12-projection/terms";
import { serializeRdf12ProjectionToTurtle } from "../../src/rdf12-projection/turtle-serializer";
import {
	aatTerm,
	expectLiteralValue,
	literalValues,
	rdfTerm,
	termIri,
} from "./helpers/graph-matchers";

const projectRoot = process.cwd();
const fixtureRoot = join(projectRoot, "test/book-entry/fixtures");
const entryPath = join(fixtureRoot, "simple-book/book.adoc");

describe("rdf12 book-entry origin source coordinates", () => {
	it("projects heading resource relativePath values from each heading origin file", () => {
		const projection = projectBookEntryFixture();

		expectLiteralValue(
			projection.graph,
			headingByHeadline(projection.graph, "Simple Source-Mapped Book"),
			aatTerm("relativePath"),
			"simple-book/book.adoc",
		);
		expectLiteralValue(
			projection.graph,
			headingByHeadline(projection.graph, "Xref Origin"),
			aatTerm("relativePath"),
			"simple-book/chapters/01-entry-origin.adoc",
		);
		expectLiteralValue(
			projection.graph,
			headingByHeadline(projection.graph, "Nested Origin"),
			aatTerm("relativePath"),
			"simple-book/chapters/nested/section.adoc",
		);
	});

	it("does not project book-entry document-title raw from expanded logical text", () => {
		const projection = projectBookEntryFixture();
		const titleHeading = headingByHeadline(
			projection.graph,
			"Simple Source-Mapped Book",
		);
		const raw = onlyLiteralValue(
			projection.graph,
			titleHeading,
			aatTerm("raw"),
		);

		expectLiteralValue(
			projection.graph,
			titleHeading,
			aatTerm("relativePath"),
			"simple-book/book.adoc",
		);
		expect(raw).toBe("= Simple Source-Mapped Book\n");
		expect(raw).not.toContain(
			":book-entry-shared-attribute: shared attribute value from include",
		);
		expect(raw).not.toContain("include::shared/attributes.adoc[]");
	});

	it("projects xref edge evidence relativePath from the occurrence origin file", () => {
		const projection = projectBookEntryFixture();
		const edge = xrefEdgeByRaw(
			projection.graph,
			"xref:target-origin[Target Origin]",
		);

		expectLiteralValue(
			projection.graph,
			edge,
			aatTerm("relativePath"),
			"simple-book/chapters/01-entry-origin.adoc",
		);
		expectLiteralValue(
			projection.graph,
			edge,
			aatTerm("sourceSelector"),
			"xref-origin",
		);
	});

	it("binds xref sourceHeading by origin relativePath and line containment", () => {
		const projection = projectBookEntryFixture();
		const edge = xrefEdgeByRaw(
			projection.graph,
			"xref:target-origin[Target Origin]",
		);
		const sourceHeading = objectIri(
			projection.graph,
			edge,
			aatTerm("sourceHeading"),
		);

		expect(sourceHeading).toBe(
			headingByHeadline(projection.graph, "Xref Origin"),
		);
		expect(sourceHeading).not.toBe(
			headingByHeadline(projection.graph, "Simple Source-Mapped Book"),
		);
	});

	it("does not fallback book-entry xref sourceHeading binding to the entry file when occurrence origin is absent", () => {
		const projection = rdf12(bookEntryXrefWithoutOriginDocument(), {
			documentRoot: fixtureRoot,
		});
		const edge = xrefEdgeByRaw(projection.graph, "xref:target[Target]");

		expect(
			projection.graph.match({
				subject: edge,
				predicate: aatTerm("sourceHeading"),
			}),
		).toHaveLength(0);
	});

	it("keeps source document provenance on the entry file", () => {
		const projection = projectBookEntryFixture();

		expectLiteralValue(
			projection.graph,
			termIri(projection.sourceDocumentIri),
			aatTerm("relativePath"),
			"simple-book/book.adoc",
		);
	});

	it("projects payload resource relativePath from the payload owner origin file", () => {
		const projection = rdf12(bookEntryPayloadDocument(), {
			documentRoot: fixtureRoot,
		});
		const payload = resourceByLiteral(
			projection.graph,
			aatTerm("payloadId"),
			"chapter-payload",
		);

		expectLiteralValue(
			projection.graph,
			payload,
			aatTerm("relativePath"),
			"simple-book/chapters/01-entry-origin.adoc",
		);
	});

	it("does not emit build/adoc aggregate source paths", () => {
		const projection = projectBookEntryFixture();
		const turtle = serializeRdf12ProjectionToTurtle(projection);
		const literalValues = projection.graph
			.toArray()
			.flatMap((triple) =>
				triple.object.termType === "literal" ? [triple.object.value] : [],
			);

		expect(turtle).not.toContain("build/adoc");
		expect(literalValues).not.toContain("build/adoc");
	});

	it("projects RDF12 from the public document without a line origin table parameter", () => {
		const document = parseAbundantTree({
			sourcePath: entryPath,
			mode: "book-entry",
			documentRoot: fixtureRoot,
		});
		const projection = rdf12(document, { documentRoot: fixtureRoot });

		expect(projection.relativePath).toBe("simple-book/book.adoc");
		expect(Reflect.has(document, "lineOrigins")).toBe(false);
		expect(
			projection.graph.match({
				predicate: rdfTerm("type"),
				object: aatTerm("Heading"),
			}),
		).not.toHaveLength(0);
	});
});

function projectBookEntryFixture() {
	const document = parseAbundantTree({
		sourcePath: entryPath,
		mode: "book-entry",
		documentRoot: fixtureRoot,
	});

	return rdf12(document, { documentRoot: fixtureRoot });
}

function bookEntryPayloadDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: entryPath,
		sourceText:
			"= Synthetic Book\n\n== Chapter\n\n[source]\n----\npayload\n----\n",
		mode: "book-entry",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "section",
				level: 1,
				ids: ["chapter"],
				title: "Chapter",
				line: 3,
				span: { startLine: 3, endLine: 8 },
				idOrigin: "source",
				source: {
					relativePath: "simple-book/chapters/01-entry-origin.adoc",
					span: { startLine: 3, endLine: 8 },
				},
				children: [
					{
						kind: "listing",
						ids: ["chapter-payload"],
						metadata: [
							{
								kind: "metadata",
								metadataKind: "attrlist",
								raw: "[role=payload]",
								line: 5,
								roles: ["payload"],
								attributes: { role: "payload" },
							},
						],
						content: "payload",
						span: { startLine: 5, endLine: 8 },
						contentSpan: { startLine: 7, endLine: 7 },
						source: {
							relativePath: "simple-book/chapters/01-entry-origin.adoc",
							span: { startLine: 5, endLine: 8 },
						},
					},
				],
			},
		],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
}

function bookEntryXrefWithoutOriginDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: entryPath,
		sourceText: "= Synthetic Book\n\n== Entry\n\nxref:target[Target]\n",
		mode: "book-entry",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "section",
				level: 1,
				ids: ["entry"],
				title: "Entry",
				line: 3,
				span: { startLine: 3, endLine: 5 },
				idOrigin: "source",
				source: {
					relativePath: "simple-book/book.adoc",
					span: { startLine: 3, endLine: 5 },
				},
				children: [
					{
						kind: "xref",
						syntax: "macro",
						raw: "xref:target[Target]",
						target: "target",
						label: "Target",
						sourceSpan: {
							start: { line: 5, column: 1 },
							end: { line: 5, column: 20 },
						},
						containingSectionId: "entry",
					},
				],
			},
		],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
}

function headingByHeadline(graph: Rdf12Graph, headline: string): Rdf12IriTerm {
	const headings = graph
		.match({ predicate: aatTerm("headline") })
		.filter(
			(triple) =>
				triple.object.termType === "literal" &&
				triple.object.value === headline,
		)
		.map((triple) => triple.subject);

	expect(headings).toHaveLength(1);
	return headings[0] ?? termIri("");
}

function xrefEdgeByRaw(graph: Rdf12Graph, raw: string): Rdf12IriTerm {
	const edges = graph
		.match({ predicate: aatTerm("raw") })
		.filter(
			(triple) =>
				triple.object.termType === "literal" &&
				triple.object.value === raw &&
				graph.has({
					subject: triple.subject,
					predicate: rdfTerm("type"),
					object: termIri(`${namespaces.aat}XrefEdge`),
				}),
		)
		.map((triple) => triple.subject);

	expect(edges).toHaveLength(1);
	return edges[0] ?? termIri("");
}

function resourceByLiteral(
	graph: Rdf12Graph,
	predicate: Rdf12IriTerm,
	value: string,
): Rdf12IriTerm {
	const resources = graph
		.match({ predicate })
		.filter(
			(triple) =>
				triple.object.termType === "literal" && triple.object.value === value,
		)
		.map((triple) => triple.subject);

	expect(resources).toHaveLength(1);
	return resources[0] ?? termIri("");
}

function objectIri(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
): Rdf12IriTerm {
	const objects = graph
		.match({ subject, predicate })
		.map((triple) => triple.object)
		.filter((object): object is Rdf12IriTerm => object.termType === "iri");

	expect(objects).toHaveLength(1);
	return objects[0] ?? termIri("");
}

function onlyLiteralValue(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
): string {
	const values = literalValues(graph, subject, predicate);

	expect(values).toHaveLength(1);
	return values[0] ?? "";
}
