import { describe, expect, it } from "vitest";
import {
	createRdf12Graph,
	rdf12Triple,
	rdf12TripleTerm,
} from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import type { Rdf12Projection } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";
import { serializeRdf12ProjectionToTurtle } from "../../src/rdf12-projection/turtle-serializer";

describe("rdf12 Turtle serialization", () => {
	it("serializes a basic project graph as Turtle with prefixes and triple terms", () => {
		const projection = testProjection();
		const turtle = serializeRdf12ProjectionToTurtle(projection);

		expect(turtle).toContain("@prefix aat:");
		expect(turtle).toContain("@prefix rdf:");
		expect(turtle).toContain("@prefix xsd:");
		expect(turtle).toContain("aat:references");
		expect(turtle).toContain("rdf:reifies <<(");
		expect(turtle).toContain('"3. 核心引擎设计"');
		expect(turtle).toContain("aat:startLine 10");
	});

	it("serializes the same graph to identical text across repeated calls", () => {
		const projection = testProjection();

		expect(serializeRdf12ProjectionToTurtle(projection)).toBe(
			serializeRdf12ProjectionToTurtle(projection),
		);
	});
});

function testProjection(): Rdf12Projection {
	const graph = createRdf12Graph();
	const source = iriTerm("urn:aat:doc:test#heading-l1-o0");
	const target = iriTerm("urn:aat:doc:test#heading-l3-o0");
	const references = iriTerm(`${namespaces.aat}references`);
	const xref = iriTerm("urn:aat:doc:test#xref-edge-l10-c60-o0");
	const relation = rdf12Triple(source, references, target);

	graph.add(relation);
	graph.add(
		rdf12Triple(
			xref,
			iriTerm(`${namespaces.rdf}reifies`),
			rdf12TripleTerm(relation),
		),
	);
	graph.add(
		rdf12Triple(
			xref,
			iriTerm(`${namespaces.aat}targetSelector`),
			stringLiteral("3. 核心引擎设计"),
		),
	);
	graph.add(
		rdf12Triple(
			xref,
			iriTerm(`${namespaces.aat}startLine`),
			integerLiteral(10),
		),
	);

	return {
		graph,
		prefixes: namespaces,
		relativePath: "samples/reference-links.adoc",
		documentIri: "urn:aat:doc:test#document",
		sourceDocumentIri: "urn:aat:doc:test#source",
		projectionIri: "urn:aat:doc:test#projection",
		projectionActivityIri: "urn:aat:doc:test#activity",
		abundantDocumentIri: "urn:aat:doc:test#abundant-document",
		nodeIndex: {
			get: () => undefined,
			findByTarget: () => undefined,
			entries: () => [],
		},
		labelCatalog: {
			add: () => undefined,
			find: () => [],
			owners: () => [],
			entries: () => [],
		},
	};
}
