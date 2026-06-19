import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";
import { writeFixture } from "../helpers";

const projectRoot = process.cwd();
const structuralPayloadPath = join(
	projectRoot,
	"samples/structural-payload.adoc",
);

describe("rdf12 structure projection", () => {
	it("projects the structural payload sample as four heading resources", () => {
		const projection = structuralPayloadProjection();
		const headings = resourcesOfType(
			projection.graph,
			`${namespaces.aat}Heading`,
		);

		expect(headings).toHaveLength(4);
		for (const localId of [
			"heading-l1-o0",
			"heading-l5-o0",
			"heading-l39-o0",
			"heading-l44-o0",
		]) {
			const heading = resourceIri(projection.documentIri, localId);
			expect(headings).toContain(heading);
			expectStringTriple(
				projection.graph,
				heading,
				"relativePath",
				"samples/structural-payload.adoc",
			);
		}
	});

	it("does not project paragraph, listing, table, or anchor structure resources", () => {
		const projection = structuralPayloadProjection();

		for (const oldType of [
			"Paragraph",
			"ListingBlock",
			"TableBlock",
			"AnchorTarget",
		]) {
			expect(
				resourcesOfType(projection.graph, `${namespaces.aat}${oldType}`),
			).toHaveLength(0);
		}
	});

	it("does not project description lists as heading structure resources", () => {
		const path = writeFixture(
			"rdf-description-list-structure.adoc",
			`= Probe

== Section

Host:: 127.0.0.1
Port:: 8080
`,
		);
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({ sourcePath: path }),
			{ documentRoot: projectRoot },
		);

		expect(
			resourcesOfType(projection.graph, `${namespaces.aat}Heading`),
		).toHaveLength(2);
		expect(
			resourcesOfType(projection.graph, `${namespaces.aat}DescriptionList`),
		).toHaveLength(0);
		expect(
			resourcesOfType(projection.graph, `${namespaces.aat}DescriptionListItem`),
		).toHaveLength(0);
	});

	it("projects heading identity, headline, level, labels, and line coordinates", () => {
		const projection = structuralPayloadProjection();
		const root = resourceIri(projection.documentIri, "heading-l1-o0");
		const deliveryPolicy = resourceIri(projection.documentIri, "heading-l5-o0");
		const capacityRule = resourceIri(projection.documentIri, "heading-l39-o0");
		const nestedHeading = resourceIri(projection.documentIri, "heading-l44-o0");

		expectStringTriple(projection.graph, root, "headline", "root");
		expectNumberTriple(projection.graph, root, "headingLevel", 0);
		expectNumberTriple(projection.graph, root, "startLine", 1);
		expectNumberTriple(projection.graph, root, "endLine", 4);
		expectNumberTriple(projection.graph, root, "headingLine", 1);
		expectStringTriple(
			projection.graph,
			root,
			"raw",
			`= root

一段摘要

`,
		);
		expectNumberTriple(projection.graph, root, "contentStartLine", 3);
		expectNumberTriple(projection.graph, root, "contentEndLine", 3);
		expectNoTriple(projection.graph, root, "metadataStartLine");
		expectNoTriple(projection.graph, root, "metadataEndLine");

		expectStringTriple(
			projection.graph,
			deliveryPolicy,
			"headline",
			"配送策略",
		);
		expectStringTriple(
			projection.graph,
			deliveryPolicy,
			"addressLabel",
			"delivery",
		);
		expectStringTriple(
			projection.graph,
			deliveryPolicy,
			"addressLabel",
			"rel-delivery-capacity",
		);
		expectNumberTriple(projection.graph, deliveryPolicy, "headingLevel", 1);
		expectNumberTriple(projection.graph, deliveryPolicy, "startLine", 5);
		expectNumberTriple(projection.graph, deliveryPolicy, "endLine", 38);
		expectNumberTriple(projection.graph, deliveryPolicy, "headingLine", 6);
		expectNumberTriple(
			projection.graph,
			deliveryPolicy,
			"metadataStartLine",
			5,
		);
		expectNumberTriple(projection.graph, deliveryPolicy, "metadataEndLine", 5);
		expectNumberTriple(projection.graph, deliveryPolicy, "contentStartLine", 8);
		expectNumberTriple(projection.graph, deliveryPolicy, "contentEndLine", 37);

		expectStringTriple(projection.graph, capacityRule, "headline", "运力规则");
		expectStringTriple(
			projection.graph,
			capacityRule,
			"addressLabel",
			"capacity",
		);
		expectNumberTriple(projection.graph, capacityRule, "headingLevel", 1);
		expectNumberTriple(projection.graph, capacityRule, "startLine", 39);
		expectNumberTriple(projection.graph, capacityRule, "endLine", 43);
		expectNumberTriple(projection.graph, capacityRule, "headingLine", 40);
		expectNumberTriple(projection.graph, capacityRule, "metadataStartLine", 39);
		expectNumberTriple(projection.graph, capacityRule, "metadataEndLine", 39);
		expectNumberTriple(projection.graph, capacityRule, "contentStartLine", 42);
		expectNumberTriple(projection.graph, capacityRule, "contentEndLine", 42);

		expectStringTriple(
			projection.graph,
			nestedHeading,
			"headline",
			"我是3级标题",
		);
		expectStringTriple(
			projection.graph,
			nestedHeading,
			"generatedAddressLabel",
			"_我是3级标题",
		);
		expectNumberTriple(projection.graph, nestedHeading, "headingLevel", 2);
	});

	it("indexes the document title heading through the shared heading index", () => {
		const projection = structuralPayloadProjection();
		const rootEntry = projection.nodeIndex
			.entries()
			.find((entry) => entry.localId === "heading-l1-o0");

		expect(rootEntry).toMatchObject({
			kind: "document-title",
			startLine: 1,
			endLine: 4,
			targetType: "section",
		});
	});

	it("looks up projected heading targets by target type and line span", () => {
		const projection = structuralPayloadProjection();
		const rootEntry = projection.nodeIndex
			.entries()
			.find((entry) => entry.localId === "heading-l1-o0");
		const root = resourceIri(projection.documentIri, "heading-l1-o0");

		if (rootEntry === undefined) {
			throw new Error("expected root heading index entry");
		}

		expect(projection.nodeIndex.get(rootEntry.node)?.value).toBe(root);
		expect(
			projection.nodeIndex.findByTarget({
				targetType: "section",
				startLine: 1,
				endLine: 4,
			})?.value,
		).toBe(root);
		expect(
			projection.nodeIndex.findByTarget({
				targetType: "section",
				startLine: 1,
			})?.value,
		).toBe(root);
		expect(
			projection.nodeIndex.findByTarget({
				targetType: "listing",
				startLine: 1,
			}),
		).toBeUndefined();
		expect(
			projection.nodeIndex.findByTarget({
				targetType: "section",
				startLine: 1,
				endLine: 99,
			}),
		).toBeUndefined();
	});

	it("does not read a virtual sourcePath when document title raw must degrade without sourceText", () => {
		const projection = projectAbundantDocumentToRdf12(
			virtualDocumentWithTitle(),
			{ documentRoot: "/virtual" },
		);
		const root = resourceIri(projection.documentIri, "heading-l1-o0");

		expectStringTriple(projection.graph, root, "raw", "= root\n");
		expectNumberTriple(projection.graph, root, "startLine", 1);
		expectNumberTriple(projection.graph, root, "endLine", 1);
		expectNumberTriple(projection.graph, root, "headingLine", 1);
		expectNoTriple(projection.graph, root, "contentStartLine");
		expectNoTriple(projection.graph, root, "contentEndLine");
	});
});

function structuralPayloadProjection() {
	return projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: structuralPayloadPath }),
		{ documentRoot: projectRoot },
	);
}

function virtualDocumentWithTitle(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: "/virtual/missing.adoc",
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		title: { kind: "title", text: "root", source: { line: 1 } },
		children: [],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		headingInlineMetadataOccurrences: [],
		toolDiagnostics: [],
	};
}

function resourcesOfType(graph: Rdf12Graph, typeIri: string): string[] {
	return graph
		.match({
			predicate: iriTerm(`${namespaces.rdf}type`),
			object: iriTerm(typeIri),
		})
		.map((triple) => triple.subject.value);
}

function resourceIri(documentIri: string, localId: string): string {
	return `${documentIri.slice(0, documentIri.indexOf("#"))}#${localId}`;
}

function expectStringTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				stringLiteral(value),
			),
		),
	).toBe(true);
}

function expectNumberTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
	value: number,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				integerLiteral(value),
			),
		),
	).toBe(true);
}

function expectNoTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
): void {
	expect(
		graph.match({
			subject: iriTerm(subject),
			predicate: iriTerm(`${namespaces.aat}${predicateLocalName}`),
		}),
	).toHaveLength(0);
}
