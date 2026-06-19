import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import type { Rdf12Graph } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import type { Rdf12IriTerm } from "../../src/rdf12-projection/terms";
import {
	aatTerm,
	expectNoTriple,
	expectTriple,
	literalValues,
	resourcesOfType,
	termIri,
} from "./helpers/graph-matchers";

const projectRoot = process.cwd();
const structuralPayloadPath = join(
	projectRoot,
	"samples/structural-payload.adoc",
);
const orderedBookFixtureRoot = join(projectRoot, "test/book-entry/fixtures");
const orderedBookPath = join(orderedBookFixtureRoot, "ordered-book/book.adoc");

describe("rdf12 heading structure edges", () => {
	it("projects only direct heading containment edges", () => {
		const { graph } = structuralPayloadProjection();
		const root = headingByHeadline(graph, "root");
		const deliveryPolicy = headingByHeadline(graph, "配送策略");
		const capacityRule = headingByHeadline(graph, "运力规则");
		const nestedHeading = headingByHeadline(graph, "我是3级标题");

		expectTriple(graph, root, aatTerm("containsDirectly"), deliveryPolicy);
		expectTriple(graph, root, aatTerm("containsDirectly"), capacityRule);
		expectTriple(
			graph,
			capacityRule,
			aatTerm("containsDirectly"),
			nestedHeading,
		);
		expectNoTriple(graph, root, aatTerm("containsDirectly"), nestedHeading);
	});

	it("does not contain paragraphs, listings, tables, or anchors from headings", () => {
		const { graph } = structuralPayloadProjection();
		const containsEdges = graph.match({
			predicate: aatTerm("containsDirectly"),
		});
		const headingValues = new Set(
			resourcesOfType(graph, aatTerm("Heading")).map((term) => term.value),
		);

		expect(containsEdges.length).toBeGreaterThan(0);
		for (const edge of containsEdges) {
			expect(headingValues.has(edge.subject.value)).toBe(true);
			expect(edge.object.termType).toBe("iri");
			if (edge.object.termType !== "iri") {
				throw new Error("expected heading containment object to be an IRI");
			}
			expect(headingValues.has(edge.object.value)).toBe(true);
		}
		for (const oldType of [
			"Paragraph",
			"ListingBlock",
			"TableBlock",
			"AnchorTarget",
		]) {
			expect(resourcesOfType(graph, aatTerm(oldType))).toHaveLength(0);
		}
	});

	it("projects childOrder for headings with parent headings", () => {
		const { graph } = structuralPayloadProjection();
		const root = headingByHeadline(graph, "root");
		const deliveryPolicy = headingByHeadline(graph, "配送策略");
		const capacityRule = headingByHeadline(graph, "运力规则");
		const nestedHeading = headingByHeadline(graph, "我是3级标题");

		expect(directChildrenInOrder(graph, root)).toEqual([
			deliveryPolicy,
			capacityRule,
		]);
		expect(directChildrenInOrder(graph, capacityRule)).toEqual([nestedHeading]);
		expectIntegerTriple(graph, deliveryPolicy, "childOrder", 1);
		expectIntegerTriple(graph, capacityRule, "childOrder", 2);
		expectIntegerTriple(graph, nestedHeading, "childOrder", 1);
		expect(
			graph.match({ subject: root, predicate: aatTerm("childOrder") }),
		).toHaveLength(0);
	});

	it("projects documentOrder as heading tree preorder", () => {
		const { graph } = structuralPayloadProjection();

		expect(headlinesByDocumentOrder(graph)).toEqual([
			"root",
			"配送策略",
			"运力规则",
			"我是3级标题",
		]);
	});

	it("does not output previousSibling", () => {
		const { graph } = structuralPayloadProjection();

		expect(graph.match({ predicate: aatTerm("previousSibling") })).toHaveLength(
			0,
		);
	});

	it("orders rootless top-level headings by documentOrder without childOrder", () => {
		const projection = projectAbundantDocumentToRdf12(
			documentWithoutTitleHeading(),
			{ documentRoot: projectRoot },
		);
		const graph = graphOf(projection);
		const first = headingByHeadline(graph, "First");
		const second = headingByHeadline(graph, "Second");

		expect(headlinesByDocumentOrder(graph)).toEqual(["First", "Second"]);
		expect(
			graph.match({ subject: first, predicate: aatTerm("childOrder") }),
		).toHaveLength(0);
		expect(
			graph.match({ subject: second, predicate: aatTerm("childOrder") }),
		).toHaveLength(0);
		expect(
			graph.match({ predicate: aatTerm("containsDirectly") }),
		).toHaveLength(0);
		expect(graph.match({ predicate: aatTerm("previousSibling") })).toHaveLength(
			0,
		);
	});

	it("projects ordered book-entry headings without using origin line order", () => {
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({
				sourcePath: orderedBookPath,
				mode: "book-entry",
				documentRoot: orderedBookFixtureRoot,
			}),
			{ documentRoot: orderedBookFixtureRoot },
		);
		const graph = projection.graph;
		const orderedBook = headingByHeadline(graph, "Ordered Book");
		const preface = headingByHeadline(graph, "Preface");
		const partOne = headingByHeadline(graph, "Part One");
		const first = headingByHeadline(graph, "First");
		const second = headingByHeadline(graph, "Second");
		const partTwo = headingByHeadline(graph, "Part Two");
		const third = headingByHeadline(graph, "Third");
		const index = headingByHeadline(graph, "Index");

		expect(headlinesByDocumentOrder(graph)).toEqual([
			"Ordered Book",
			"Preface",
			"Part One",
			"First",
			"Second",
			"Part Two",
			"Third",
			"Index",
		]);
		expect(directChildrenInOrder(graph, orderedBook)).toEqual([
			preface,
			partOne,
			partTwo,
			index,
		]);
		expect(directChildrenInOrder(graph, partOne)).toEqual([first, second]);
		expect(directChildrenInOrder(graph, partTwo)).toEqual([third]);
		expectIntegerTriple(graph, preface, "childOrder", 1);
		expectIntegerTriple(graph, partOne, "childOrder", 2);
		expectIntegerTriple(graph, partTwo, "childOrder", 3);
		expectIntegerTriple(graph, index, "childOrder", 4);

		const startLines = [preface, first, second, third, index].map((heading) =>
			integerValue(graph, heading, "startLine"),
		);
		expect(new Set(startLines).size).toBeLessThan(startLines.length);
		expect(graph.match({ predicate: aatTerm("previousSibling") })).toHaveLength(
			0,
		);
	});
});

function structuralPayloadProjection() {
	const projection = projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: structuralPayloadPath }),
		{ documentRoot: projectRoot },
	);

	return {
		graph: projection.graph,
	};
}

function documentWithoutTitleHeading(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: join(projectRoot, "virtual/no-title.adoc"),
		sourceText: `== First

== Second
`,
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "section",
				level: 1,
				ids: ["first"],
				title: "First",
				line: 1,
				span: { startLine: 1, endLine: 2 },
				titleSpan: {
					start: { line: 1, column: 4 },
					end: { line: 1, column: 9 },
				},
				idOrigin: "source",
				metadata: [],
				children: [],
			},
			{
				kind: "section",
				level: 1,
				ids: ["second"],
				title: "Second",
				line: 3,
				span: { startLine: 3, endLine: 3 },
				titleSpan: {
					start: { line: 3, column: 4 },
					end: { line: 3, column: 10 },
				},
				idOrigin: "source",
				metadata: [],
				children: [],
			},
		],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		headingInlineMetadataOccurrences: [],
		toolDiagnostics: [],
	};
}

function graphOf(
	projection: ReturnType<typeof projectAbundantDocumentToRdf12>,
) {
	return projection.graph;
}

function headingByHeadline(graph: Rdf12Graph, headline: string) {
	const headings = graph
		.match({
			predicate: aatTerm("headline"),
			object: stringLiteral(headline),
		})
		.map((triple) => triple.subject);

	expect(headings).toHaveLength(1);
	return headings[0] ?? termIri("urn:missing-heading");
}

function directChildrenInOrder(graph: Rdf12Graph, parent: Rdf12IriTerm) {
	return graph
		.match({
			subject: parent,
			predicate: aatTerm("containsDirectly"),
		})
		.map((triple) => triple.object)
		.filter((term): term is Rdf12IriTerm => term.termType === "iri")
		.toSorted(
			(left, right) =>
				integerValue(graph, left, "childOrder") -
				integerValue(graph, right, "childOrder"),
		);
}

function headlinesByDocumentOrder(graph: Rdf12Graph) {
	return resourcesOfType(graph, aatTerm("Heading"))
		.toSorted(
			(left, right) =>
				integerValue(graph, left, "documentOrder") -
				integerValue(graph, right, "documentOrder"),
		)
		.map((heading) => onlyLiteralValue(graph, heading, "headline"));
}

function expectIntegerTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: number,
): void {
	expect(
		graph.has({
			subject,
			predicate: aatTerm(predicateLocalName),
			object: integerLiteral(value),
		}),
	).toBe(true);
}

function integerValue(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
): number {
	const values = literalValues(graph, subject, aatTerm(predicateLocalName));

	expect(values).toHaveLength(1);
	return Number(values[0]);
}

function onlyLiteralValue(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
): string {
	const values = literalValues(graph, subject, aatTerm(predicateLocalName));

	expect(values).toHaveLength(1);
	return values[0] ?? "";
}
