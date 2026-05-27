import { describe, expect, it } from "vitest";
import {
	createRdf12Graph,
	rdf12Triple,
} from "../../src/rdf12-projection/graph";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { addReifierTriple } from "../../src/rdf12-projection/reifier";
import { iriTerm, rdf12TripleTerm } from "../../src/rdf12-projection/terms";

describe("rdf12 relation reifier", () => {
	it("uses an RDF 1.2 triple term object, not a string literal", () => {
		const graph = createRdf12Graph();
		const source = iriTerm("urn:aat:doc:test#section-l1-o0");
		const predicate = iriTerm(`${namespaces.aat}references`);
		const target = iriTerm("urn:aat:doc:test#section-l5-o0");
		const xref = iriTerm("urn:aat:doc:test#xref-l2-c3-o0");
		const relation = rdf12Triple(source, predicate, target);

		addReifierTriple(graph, xref, relation);

		expect(
			graph.has(
				rdf12Triple(
					xref,
					iriTerm(`${namespaces.rdf}reifies`),
					rdf12TripleTerm(relation),
				),
			),
		).toBe(true);
		const [reifier] = graph.match({
			subject: xref,
			predicate: iriTerm(`${namespaces.rdf}reifies`),
		});
		expect(reifier?.object.termType).toBe("triple");
	});

	it("stores duplicate asserted relation triples once while allowing multiple reifiers", () => {
		const graph = createRdf12Graph();
		const source = iriTerm("urn:aat:doc:test#section-l1-o0");
		const predicate = iriTerm(`${namespaces.aat}references`);
		const target = iriTerm("urn:aat:doc:test#section-l5-o0");
		const relation = rdf12Triple(source, predicate, target);

		graph.add(relation);
		graph.add(relation);
		addReifierTriple(
			graph,
			iriTerm("urn:aat:doc:test#xref-l2-c3-o0"),
			relation,
		);
		addReifierTriple(
			graph,
			iriTerm("urn:aat:doc:test#xref-l3-c3-o0"),
			relation,
		);

		expect(
			graph.match({
				subject: source,
				predicate,
				object: target,
			}),
		).toHaveLength(1);
		expect(
			graph.match({
				predicate: iriTerm(`${namespaces.rdf}reifies`),
				object: rdf12TripleTerm(relation),
			}),
		).toHaveLength(2);
	});
});
