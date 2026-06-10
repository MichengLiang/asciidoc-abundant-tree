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
import { iriTerm, type Rdf12IriTerm } from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const structuralPayloadPath = join(
	projectRoot,
	"samples/structural-payload.adoc",
);

describe("rdf12 payload query contract acceptance", () => {
	it("binds node and xref payloads as complex properties", () => {
		const projection = structuralPayloadProjection();
		const deliveryPolicy = onlyHeadingForAddressLabel(
			projection.graph,
			"delivery-policy",
		);
		const capacityRule = onlyHeadingForAddressLabel(
			projection.graph,
			"capacity-rule",
		);
		const xrefEdge = onlyXrefEdge(projection.graph);
		const nodePayload = onlyPayloadById(
			projection.graph,
			"delivery-policy-payload",
		);
		const edgePayload = onlyPayloadById(
			projection.graph,
			"rel-delivery-capacity",
		);

		expectTriple(projection.graph, deliveryPolicy, "payload", nodePayload);
		expectTriple(projection.graph, xrefEdge, "payload", edgePayload);
		expectNoTriple(projection.graph, deliveryPolicy, "payload", edgePayload);
		expectNoTriple(projection.graph, capacityRule, "payload", edgePayload);
		expectNoLegacyPayloadContract(projection.graph);
	});

	it("projects payload object facts and keeps payload raw opaque", () => {
		const projection = structuralPayloadProjection();
		const nodePayload = onlyPayloadById(
			projection.graph,
			"delivery-policy-payload",
		);
		const edgePayload = onlyPayloadById(
			projection.graph,
			"rel-delivery-capacity",
		);

		expectLiteral(projection.graph, nodePayload, "payloadKind", "node");
		expectLiteral(
			projection.graph,
			nodePayload,
			"forSelector",
			"delivery-policy",
		);
		expectLiteral(projection.graph, nodePayload, "format", "json");
		expectLineSpan(projection.graph, nodePayload, 10, 23);
		expectInteger(projection.graph, nodePayload, "contentStartLine", 13);
		expectInteger(projection.graph, nodePayload, "contentEndLine", 22);
		expectLiteral(
			projection.graph,
			nodePayload,
			"raw",
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
		expectLiteral(projection.graph, edgePayload, "payloadKind", "edge");
		expectLiteral(projection.graph, edgePayload, "format", "json");
		expectLineSpan(projection.graph, edgePayload, 25, 39);
		expectInteger(projection.graph, edgePayload, "contentStartLine", 28);
		expectInteger(projection.graph, edgePayload, "contentEndLine", 38);

		for (const predicate of ["owner", "risk", "reason", "edge"].map(aat)) {
			expect(
				projection.graph.match({ subject: nodePayload, predicate }),
			).toHaveLength(0);
			expect(
				projection.graph.match({ subject: edgePayload, predicate }),
			).toHaveLength(0);
		}
	});

	it("does not make payload objects into structure or xref target nodes", () => {
		const projection = structuralPayloadProjection();
		const nodePayload = onlyPayloadById(
			projection.graph,
			"delivery-policy-payload",
		);
		const edgePayload = onlyPayloadById(
			projection.graph,
			"rel-delivery-capacity",
		);

		for (const payload of [nodePayload, edgePayload]) {
			expect(
				projection.graph.has(rdf12Triple(payload, rdf("type"), aat("Heading"))),
			).toBe(false);
			expect(
				projection.graph.match({
					predicate: aat("containsDirectly"),
					object: payload,
				}),
			).toHaveLength(0);
			expect(
				projection.graph.match({
					subject: payload,
					predicate: aat("childOrder"),
				}),
			).toHaveLength(0);
			expect(
				projection.graph.match({
					subject: payload,
					predicate: aat("documentOrder"),
				}),
			).toHaveLength(0);
			expect(
				projection.graph.match({
					predicate: aat("targetHeading"),
					object: payload,
				}),
			).toHaveLength(0);
		}
	});
});

function structuralPayloadProjection() {
	return projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: structuralPayloadPath }),
		{ documentRoot: projectRoot },
	);
}

function onlyHeadingForAddressLabel(
	graph: Rdf12Graph,
	value: string,
): Rdf12IriTerm {
	const headings = graph
		.match({
			predicate: aat("addressLabel"),
			object: stringLiteral(value),
		})
		.map((triple) => triple.subject);

	expect(headings).toHaveLength(1);
	return headings[0] ?? iriTerm("urn:missing-heading");
}

function onlyXrefEdge(graph: Rdf12Graph): Rdf12IriTerm {
	const edges = graph
		.match({
			predicate: rdf("type"),
			object: aat("XrefEdge"),
		})
		.map((triple) => triple.subject);

	expect(edges).toHaveLength(1);
	return edges[0] ?? iriTerm("urn:missing-xref-edge");
}

function onlyPayloadById(graph: Rdf12Graph, payloadId: string): Rdf12IriTerm {
	const payloads = graph
		.match({
			predicate: aat("payloadId"),
			object: stringLiteral(payloadId),
		})
		.map((triple) => triple.subject);

	expect(payloads).toHaveLength(1);
	return payloads[0] ?? iriTerm("urn:missing-payload");
}

function expectNoLegacyPayloadContract(graph: Rdf12Graph): void {
	expect(
		graph.match({
			predicate: rdf("type"),
			object: aat("PayloadBlock"),
		}),
	).toHaveLength(0);
	expect(graph.match({ predicate: aat("hasPayload") })).toHaveLength(0);
	expect(graph.match({ predicate: aat("payloadOf") })).toHaveLength(0);
}

function expectTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	object: Rdf12IriTerm,
): void {
	expect(graph.has(rdf12Triple(subject, aat(predicateLocalName), object))).toBe(
		true,
	);
}

function expectNoTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	object: Rdf12IriTerm,
): void {
	expect(graph.has(rdf12Triple(subject, aat(predicateLocalName), object))).toBe(
		false,
	);
}

function expectLiteral(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(subject, aat(predicateLocalName), stringLiteral(value)),
		),
	).toBe(true);
}

function expectLineSpan(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	startLine: number,
	endLine: number,
): void {
	expectInteger(graph, subject, "startLine", startLine);
	expectInteger(graph, subject, "endLine", endLine);
	expectLiteral(
		graph,
		subject,
		"relativePath",
		"samples/structural-payload.adoc",
	);
}

function expectInteger(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: number,
): void {
	expect(
		graph.has(
			rdf12Triple(subject, aat(predicateLocalName), integerLiteral(value)),
		),
	).toBe(true);
}

function aat(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.aat}${localName}`);
}

function rdf(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.rdf}${localName}`);
}
