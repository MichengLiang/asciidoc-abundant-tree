import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";

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
			"heading-l41-o0",
			"heading-l46-o0",
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

	it("projects heading identity, headline, level, labels, and line coordinates", () => {
		const projection = structuralPayloadProjection();
		const root = resourceIri(projection.documentIri, "heading-l1-o0");
		const deliveryPolicy = resourceIri(projection.documentIri, "heading-l5-o0");
		const capacityRule = resourceIri(projection.documentIri, "heading-l41-o0");
		const nestedHeading = resourceIri(projection.documentIri, "heading-l46-o0");

		expectStringTriple(projection.graph, root, "headline", "root");
		expectNumberTriple(projection.graph, root, "headingLevel", 0);
		expectNumberTriple(projection.graph, root, "startLine", 1);
		expectNumberTriple(projection.graph, root, "endLine", 4);
		expectNumberTriple(projection.graph, root, "headingLine", 1);

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
			"delivery-policy",
		);
		expectNumberTriple(projection.graph, deliveryPolicy, "headingLevel", 1);
		expectNumberTriple(projection.graph, deliveryPolicy, "startLine", 5);
		expectNumberTriple(projection.graph, deliveryPolicy, "endLine", 40);
		expectNumberTriple(projection.graph, deliveryPolicy, "headingLine", 6);
		expectNumberTriple(
			projection.graph,
			deliveryPolicy,
			"metadataStartLine",
			5,
		);
		expectNumberTriple(projection.graph, deliveryPolicy, "metadataEndLine", 5);
		expectNumberTriple(projection.graph, deliveryPolicy, "contentStartLine", 8);
		expectNumberTriple(projection.graph, deliveryPolicy, "contentEndLine", 39);

		expectStringTriple(projection.graph, capacityRule, "headline", "运力规则");
		expectStringTriple(
			projection.graph,
			capacityRule,
			"addressLabel",
			"capacity-rule",
		);
		expectNumberTriple(projection.graph, capacityRule, "headingLevel", 1);
		expectNumberTriple(projection.graph, capacityRule, "startLine", 41);
		expectNumberTriple(projection.graph, capacityRule, "endLine", 45);
		expectNumberTriple(projection.graph, capacityRule, "headingLine", 42);
		expectNumberTriple(projection.graph, capacityRule, "metadataStartLine", 41);
		expectNumberTriple(projection.graph, capacityRule, "metadataEndLine", 41);
		expectNumberTriple(projection.graph, capacityRule, "contentStartLine", 44);
		expectNumberTriple(projection.graph, capacityRule, "contentEndLine", 44);

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
});

function structuralPayloadProjection() {
	return projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: structuralPayloadPath }),
		{ documentRoot: projectRoot },
	);
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
