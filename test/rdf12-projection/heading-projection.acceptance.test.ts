import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import {
	type Rdf12IriTerm,
	rdf12TripleTerm,
} from "../../src/rdf12-projection/terms";
import {
	aatTerm,
	expectLiteralValue,
	expectResourceTypeCount,
	expectTriple,
	literalValues,
	rdfTerm,
	relTerm,
	resourcesOfType,
	termIri,
} from "./helpers/graph-matchers";

const migrationAllowedFailureCases = new Set([
	"projects the four heading nodes from the structural payload sample",
	"projects heading labels, direct attributes, raw slices, containment, and sibling order",
	"projects xref relation edge evidence and binds edge payload",
	"binds node payload as a heading complex property",
	"removes old structural resource types from the heading projection public graph",
]);

// Batch 00 records target assertions before runtime migration. Remove this
// expected-failure registry in Batch 07 after Batch 01-06 unlock these facts.
function migrationIt(name: string, fn: () => void): void {
	const runner = migrationAllowedFailureCases.has(name) ? it.fails : it;
	runner(name, fn);
}

const projectRoot = process.cwd();
const structuralPayloadPath = join(
	projectRoot,
	"samples/structural-payload.adoc",
);

describe("rdf12 heading projection target acceptance", () => {
	migrationIt(
		"projects the four heading nodes from the structural payload sample",
		() => {
			const { graph, heading } = structuralPayloadProjection();

			expectResourceTypeCount(graph, aatTerm("Heading"), 4);
			expectTriple(
				graph,
				heading("heading-l1-o0"),
				rdfTerm("type"),
				aatTerm("Heading"),
			);
			expectTriple(
				graph,
				heading("heading-l5-o0"),
				rdfTerm("type"),
				aatTerm("Heading"),
			);
			expectTriple(
				graph,
				heading("heading-l41-o0"),
				rdfTerm("type"),
				aatTerm("Heading"),
			);
			expectTriple(
				graph,
				heading("heading-l46-o0"),
				rdfTerm("type"),
				aatTerm("Heading"),
			);
		},
	);

	migrationIt(
		"projects heading labels, direct attributes, raw slices, containment, and sibling order",
		() => {
			const { graph, heading } = structuralPayloadProjection();
			const root = heading("heading-l1-o0");
			const deliveryPolicy = heading("heading-l5-o0");
			const capacityRule = heading("heading-l41-o0");
			const nestedHeading = heading("heading-l46-o0");

			expectLiteralValue(
				graph,
				deliveryPolicy,
				aatTerm("addressLabel"),
				"delivery-policy",
			);
			expectLiteralValue(graph, deliveryPolicy, aatTerm("kind"), "policy");
			expectLiteralValue(graph, deliveryPolicy, aatTerm("status"), "active");
			expectLiteralValue(graph, deliveryPolicy, aatTerm("owner"), "ops");
			for (const raw of literalValues(graph, capacityRule, aatTerm("raw"))) {
				expect(raw).not.toContain("=== 我是3级标题");
			}
			expectTriple(graph, root, aatTerm("containsDirectly"), deliveryPolicy);
			expectTriple(graph, root, aatTerm("containsDirectly"), capacityRule);
			expectTriple(
				graph,
				capacityRule,
				aatTerm("containsDirectly"),
				nestedHeading,
			);
			expectTriple(
				graph,
				capacityRule,
				aatTerm("previousSibling"),
				deliveryPolicy,
			);
		},
	);

	migrationIt(
		"projects xref relation edge evidence and binds edge payload",
		() => {
			const { graph, heading } = structuralPayloadProjection();
			const deliveryPolicy = heading("heading-l5-o0");
			const capacityRule = heading("heading-l41-o0");
			const relation = rdf12Triple(
				deliveryPolicy,
				relTerm("depends-on"),
				capacityRule,
			);
			const xrefEdge = onlyResourceOfType(graph, aatTerm("XrefEdge"));
			const edgePayload = onlyPayloadById(graph, "rel-delivery-capacity");

			expectTriple(graph, deliveryPolicy, relTerm("depends-on"), capacityRule);
			expectTriple(
				graph,
				xrefEdge,
				rdfTerm("reifies"),
				rdf12TripleTerm(relation),
			);
			expectLiteralValue(graph, xrefEdge, aatTerm("weight"), "0.8");
			expectLiteralValue(
				graph,
				xrefEdge,
				aatTerm("payloadSelector"),
				"rel-delivery-capacity",
			);
			expectTriple(graph, xrefEdge, aatTerm("payload"), edgePayload);
			expectLiteralValue(graph, edgePayload, aatTerm("payloadKind"), "edge");
			expectLiteralValue(
				graph,
				edgePayload,
				aatTerm("payloadId"),
				"rel-delivery-capacity",
			);
		},
	);

	migrationIt("binds node payload as a heading complex property", () => {
		const { graph, heading } = structuralPayloadProjection();
		const deliveryPolicy = heading("heading-l5-o0");
		const nodePayload = onlyPayloadById(graph, "delivery-policy-payload");

		expectTriple(graph, deliveryPolicy, aatTerm("payload"), nodePayload);
		expectLiteralValue(graph, nodePayload, aatTerm("payloadKind"), "node");
		expectLiteralValue(
			graph,
			nodePayload,
			aatTerm("forSelector"),
			"delivery-policy",
		);
		expectLiteralValue(graph, nodePayload, aatTerm("format"), "json");
		expectLiteralValue(
			graph,
			nodePayload,
			aatTerm("raw"),
			`{
  "owner": {
    "team": "ops",
    "fallback": "manual-review"
  },
  "risk": {
    "level": "high",
    "signals": ["weather", "capacity"]
  }
}`,
		);
	});

	it("keeps payload raw opaque instead of expanding it into business graph facts", () => {
		const { graph } = structuralPayloadProjection();

		for (const triple of graph.toArray()) {
			expectNoBusinessPayloadExpansion(triple.predicate);
			expectNoBusinessPayloadExpansion(triple.object);
		}
	});

	migrationIt(
		"removes old structural resource types from the heading projection public graph",
		() => {
			const { graph } = structuralPayloadProjection();

			for (const oldType of [
				"Paragraph",
				"ListingBlock",
				"TableBlock",
				"AnchorTarget",
				"SurfaceAttribute",
				"PayloadBlock",
			]) {
				expectResourceTypeCount(graph, aatTerm(oldType), 0);
			}
		},
	);
});

function structuralPayloadProjection(): {
	readonly graph: Rdf12Graph;
	readonly heading: (localId: string) => Rdf12IriTerm;
} {
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

function onlyResourceOfType(
	graph: Rdf12Graph,
	type: Rdf12IriTerm,
): Rdf12IriTerm {
	const resources = resourcesOfType(graph, type);
	expect(resources).toHaveLength(1);
	return resources[0] ?? termIri("");
}

function onlyPayloadById(graph: Rdf12Graph, payloadId: string): Rdf12IriTerm {
	const payloads = graph
		.match({
			predicate: aatTerm("payloadId"),
			object: stringLiteral(payloadId),
		})
		.map((triple) => triple.subject);

	expect(payloads).toHaveLength(1);
	return payloads[0] ?? termIri("");
}

function expectNoBusinessPayloadExpansion(
	term: Rdf12IriTerm | { value: unknown },
): void {
	const value = typeof term.value === "string" ? term.value : "";

	expect(value).not.toContain(`${namespaces.aat}owner`);
	expect(value).not.toContain(`${namespaces.aat}risk`);
	expect(value).not.toContain(`${namespaces.aat}reason`);
	expect(value).not.toContain(`${namespaces.aat}edge`);
}
