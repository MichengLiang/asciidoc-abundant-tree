import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import {
	aatTerm,
	expectNoTriple,
	expectTriple,
	resourcesOfType,
	termIri,
} from "./helpers/graph-matchers";

const projectRoot = process.cwd();
const structuralPayloadPath = join(
	projectRoot,
	"samples/structural-payload.adoc",
);

describe("rdf12 heading structure edges", () => {
	it("projects only direct heading containment edges", () => {
		const { graph, heading } = structuralPayloadProjection();
		const root = heading("heading-l1-o0");
		const deliveryPolicy = heading("heading-l5-o0");
		const capacityRule = heading("heading-l41-o0");
		const nestedHeading = heading("heading-l46-o0");

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

	it("projects previousSibling only between same-parent sibling headings", () => {
		const { graph, heading } = structuralPayloadProjection();
		const root = heading("heading-l1-o0");
		const deliveryPolicy = heading("heading-l5-o0");
		const capacityRule = heading("heading-l41-o0");
		const nestedHeading = heading("heading-l46-o0");

		expectTriple(
			graph,
			capacityRule,
			aatTerm("previousSibling"),
			deliveryPolicy,
		);
		expectNoTriple(graph, deliveryPolicy, aatTerm("previousSibling"), root);
		expectNoTriple(
			graph,
			nestedHeading,
			aatTerm("previousSibling"),
			capacityRule,
		);
		expect(
			graph.match({ subject: root, predicate: aatTerm("previousSibling") }),
		).toHaveLength(0);
	});
});

function structuralPayloadProjection() {
	const projection = projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: structuralPayloadPath }),
		{ documentRoot: projectRoot },
	);

	return {
		graph: projection.graph,
		heading(localId: string) {
			return termIri(resourceIri(projection.documentIri, localId));
		},
	};
}

function resourceIri(documentIri: string, localId: string): string {
	return `${documentIri.slice(0, documentIri.indexOf("#"))}#${localId}`;
}
