import { DataFactory, type Quad } from "n3";
import { describe, expect, it } from "vitest";
import {
	createRdf12Graph,
	rdf12Triple,
	rdf12TripleTerm,
} from "../../src/rdf12-projection/graph";
import { assertRdf12GraphsEquivalent } from "../../src/rdf12-projection/graph-canonicalization";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import {
	n3QuadsToRdf12Graph,
	parseTurtleToN3Quads,
	parseTurtleToRdf12Graph,
} from "../../src/rdf12-projection/n3-adapter";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import type { Rdf12Projection } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";
import { serializeRdf12ProjectionToTurtle } from "../../src/rdf12-projection/turtle-serializer";

describe("rdf12 Turtle roundtrip", () => {
	it("parses serialized Turtle back to an equivalent project graph", () => {
		const projection = testProjection();
		const parsed = parseTurtleToRdf12Graph(
			serializeRdf12ProjectionToTurtle(projection),
		);

		expect(() =>
			assertRdf12GraphsEquivalent(projection.graph, parsed),
		).not.toThrow();
	});

	it("parses rdf:reifies objects back as triple terms at the adapter boundary", () => {
		const [reifier] = parseTurtleToN3Quads(
			serializeRdf12ProjectionToTurtle(testProjection()),
		).filter((quad) => quad.predicate.value === `${namespaces.rdf}reifies`);

		expect(reifier?.object.termType).toBe("Quad");
	});

	it("does not treat string literals that look like triple terms as reifier triple terms", () => {
		const fake = `
@prefix rdf: <${namespaces.rdf}> .
<urn:aat:doc:test#xref-edge-l1-c1-o0> rdf:reifies "<<(<urn:aat:doc:test#s> <${namespaces.aat}references> <urn:aat:doc:test#t>)>>" .
`;
		const [reifier] = parseTurtleToN3Quads(fake);

		expect(reifier?.object.termType).toBe("Literal");
	});

	it("roundtrips xsd integer, Chinese, multiline, quote, and backslash literals", () => {
		const projection = testProjection();
		const parsed = parseTurtleToRdf12Graph(
			serializeRdf12ProjectionToTurtle(projection),
		);

		expect(
			parsed.has(
				rdf12Triple(
					iriTerm("urn:aat:doc:test#xref-edge-l10-c60-o0"),
					iriTerm(`${namespaces.aat}startLine`),
					integerLiteral(10),
				),
			),
		).toBe(true);
		expect(
			parsed.has(
				rdf12Triple(
					iriTerm("urn:aat:doc:test#heading-l10-o0"),
					iriTerm(`${namespaces.aat}headline`),
					stringLiteral("3. 核心引擎设计"),
				),
			),
		).toBe(true);
		expect(
			parsed.has(
				rdf12Triple(
					iriTerm("urn:aat:doc:test#payload-l20-o0"),
					iriTerm(`${namespaces.aat}raw`),
					stringLiteral('first line\nsecond "quoted" line \\ path'),
				),
			),
		).toBe(true);
	});

	it("roundtrips language-tagged literals through the adapter boundary", () => {
		const turtle = `
@prefix rdf: <${namespaces.rdf}> .
<urn:aat:doc:test#heading-l1-o0> <${namespaces.aat}headline> "bonjour"@fr .
`;

		const parsed = parseTurtleToRdf12Graph(turtle);

		expect(
			parsed.has(
				rdf12Triple(
					iriTerm("urn:aat:doc:test#heading-l1-o0"),
					iriTerm(`${namespaces.aat}headline`),
					{
						termType: "literal",
						value: "bonjour",
						datatype: iriTerm(`${namespaces.rdf}langString`),
						language: "fr",
					},
				),
			),
		).toBe(true);
	});

	it("rejects unsupported subject and predicate terms at the adapter boundary", () => {
		const blankSubject = DataFactory.quad(
			DataFactory.blankNode("subject"),
			DataFactory.namedNode(`${namespaces.rdf}value`),
			DataFactory.literal("value"),
		);
		const blankPredicate = DataFactory.quad(
			DataFactory.namedNode("urn:aat:doc:test#subject"),
			DataFactory.blankNode("predicate") as unknown as Quad["predicate"],
			DataFactory.literal("value"),
		);

		expect(() => n3QuadsToRdf12Graph([blankSubject])).toThrow(
			/Unsupported RDF subject term: BlankNode/u,
		);
		expect(() => n3QuadsToRdf12Graph([blankPredicate])).toThrow(
			/Unsupported RDF predicate term: BlankNode/u,
		);
	});

	it("rejects unsupported embedded triple subject and predicate terms", () => {
		const embeddedBlankSubject = DataFactory.quad(
			DataFactory.namedNode("urn:aat:doc:test#xref-edge-l1-c1-o0"),
			DataFactory.namedNode(`${namespaces.rdf}reifies`),
			DataFactory.triple(
				DataFactory.blankNode("embedded-subject"),
				DataFactory.namedNode(`${namespaces.aat}references`),
				DataFactory.namedNode("urn:aat:doc:test#target"),
			) as unknown as Quad["object"],
		);
		const embeddedBlankPredicate = DataFactory.quad(
			DataFactory.namedNode("urn:aat:doc:test#xref-edge-l1-c1-o0"),
			DataFactory.namedNode(`${namespaces.rdf}reifies`),
			DataFactory.triple(
				DataFactory.namedNode("urn:aat:doc:test#source"),
				DataFactory.blankNode(
					"embedded-predicate",
				) as unknown as Quad["predicate"],
				DataFactory.namedNode("urn:aat:doc:test#target"),
			) as unknown as Quad["object"],
		);

		expect(() => n3QuadsToRdf12Graph([embeddedBlankSubject])).toThrow(
			/Unsupported embedded subject term: BlankNode/u,
		);
		expect(() => n3QuadsToRdf12Graph([embeddedBlankPredicate])).toThrow(
			/Unsupported embedded predicate term: BlankNode/u,
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
			iriTerm(`${namespaces.aat}startLine`),
			integerLiteral(10),
		),
	);
	graph.add(
		rdf12Triple(
			iriTerm("urn:aat:doc:test#heading-l10-o0"),
			iriTerm(`${namespaces.aat}headline`),
			stringLiteral("3. 核心引擎设计"),
		),
	);
	graph.add(
		rdf12Triple(
			iriTerm("urn:aat:doc:test#payload-l20-o0"),
			iriTerm(`${namespaces.aat}raw`),
			stringLiteral('first line\nsecond "quoted" line \\ path'),
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
