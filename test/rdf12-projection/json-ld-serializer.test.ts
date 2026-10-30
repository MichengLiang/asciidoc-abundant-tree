import { describe, expect, it } from "vitest";
import {
	createRdf12Graph,
	rdf12Triple,
	rdf12TripleTerm,
} from "../../src/rdf12-projection/graph";
import { serializeRdf12ProjectionToJsonLd } from "../../src/rdf12-projection/json-ld-serializer";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import type { Rdf12Projection } from "../../src/rdf12-projection/projector";
import { iriTerm, literalTerm } from "../../src/rdf12-projection/terms";

describe("rdf12 JSON-LD serialization", () => {
	it("serializes graph triples into a frontend-friendly JSON-LD document", () => {
		const jsonLd = JSON.parse(
			serializeRdf12ProjectionToJsonLd(testProjection()),
		);

		expect(jsonLd["@context"]["@base"]).toBeUndefined();
		expect(jsonLd["@context"]).toMatchObject({
			aat: namespaces.aat,
			rdf: namespaces.rdf,
			rdf12: "https://micheng.dev/ns/asciidoc-abundant-tree/rdf12-json-ld#",
		});
		expect(jsonLd["@graph"]).toHaveLength(5);
		expect(jsonLd["@graph"]).toContainEqual({
			"@id": "urn:aat:doc:test.adoc#statement-0",
			"@type": "rdf12:Triple",
			subject: {
				"@id": "urn:aat:doc:test.adoc#heading-3",
				"@type": "rdf12:IriTerm",
			},
			predicate: {
				"@id": `${namespaces.aat}references`,
				"@type": "rdf12:IriTerm",
			},
			object: {
				"@id": "urn:aat:doc:test.adoc#heading-5",
				"@type": "rdf12:IriTerm",
			},
		});
		expect(jsonLd["@graph"]).toContainEqual({
			"@id": "urn:aat:doc:test.adoc#statement-1",
			"@type": "rdf12:Triple",
			subject: {
				"@id": "urn:aat:doc:test.adoc#xref-edge-l10-c60-o0",
				"@type": "rdf12:IriTerm",
			},
			predicate: {
				"@id": `${namespaces.rdf}reifies`,
				"@type": "rdf12:IriTerm",
			},
			object: {
				"@type": "rdf12:TripleTerm",
				triple: {
					subject: {
						"@id": "urn:aat:doc:test.adoc#heading-3",
						"@type": "rdf12:IriTerm",
					},
					predicate: {
						"@id": `${namespaces.aat}references`,
						"@type": "rdf12:IriTerm",
					},
					object: {
						"@id": "urn:aat:doc:test.adoc#heading-5",
						"@type": "rdf12:IriTerm",
					},
				},
			},
		});
	});

	it("preserves datatype and language details for literal terms", () => {
		const jsonLd = JSON.parse(
			serializeRdf12ProjectionToJsonLd(testProjection()),
		);

		expect(jsonLd["@graph"]).toContainEqual(
			expect.objectContaining({
				object: {
					"@type": "rdf12:LiteralTerm",
					"@value": "bonjour",
					"@language": "fr",
					datatype: {
						"@id": `${namespaces.rdf}langString`,
						"@type": "rdf12:IriTerm",
					},
				},
			}),
		);
	});
});

function testProjection(): Rdf12Projection {
	const graph = createRdf12Graph();
	// JSON-LD 照写完整 IRI；图里的资源都是 <文档 IRI>#<局部名>（06 号书第 2 章「身份」）。
	const source = iriTerm("urn:aat:doc:test.adoc#heading-3");
	const target = iriTerm("urn:aat:doc:test.adoc#heading-5");
	const references = iriTerm(`${namespaces.aat}references`);
	const xref = iriTerm("urn:aat:doc:test.adoc#xref-edge-l10-c60-o0");
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
			xref,
			iriTerm(`${namespaces.aat}displayLabel`),
			literalTerm({
				value: "bonjour",
				datatype: iriTerm(`${namespaces.rdf}langString`),
				language: "fr",
			}),
		),
	);
	graph.add(
		rdf12Triple(
			xref,
			iriTerm(`${namespaces.aat}targetSelector`),
			stringLiteral("3. 核心引擎设计"),
		),
	);

	return {
		graph,
		prefixes: namespaces,
		relativePath: "samples/reference-links.adoc",
		documentIri: "urn:aat:doc:test.adoc",
		sourceDocumentIri: "urn:aat:doc:test.adoc#source",
		projectionIri: "urn:aat:doc:test.adoc#projection",
		projectionActivityIri: "urn:aat:doc:test.adoc#activity",
		abundantDocumentIri: "urn:aat:doc:test.adoc#abundant-document",
		nodeIndex: {
			get: () => undefined,
			findByTarget: () => undefined,
			entries: () => [],
		},
	};
}
