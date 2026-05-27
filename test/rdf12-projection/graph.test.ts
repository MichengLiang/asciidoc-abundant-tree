import { describe, expect, it } from "vitest";
import {
	createRdf12Graph,
	rdf12Triple,
	rdf12TripleKey,
	rdf12TripleTerm,
} from "../../src/rdf12-projection/graph";
import {
	booleanLiteral,
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { iriTerm, rdf12TermKey } from "../../src/rdf12-projection/terms";

describe("rdf12 graph primitives", () => {
	const subject = iriTerm("urn:aat:test#source");
	const predicate = iriTerm(`${namespaces.aat}references`);
	const target = iriTerm("urn:aat:test#target");

	it("adds and queries ordinary triples", () => {
		const graph = createRdf12Graph();
		const triple = rdf12Triple(subject, predicate, target);

		graph.add(triple);

		expect(graph.has(triple)).toBe(true);
		expect(graph.match({ subject, predicate, object: target })).toEqual([
			triple,
		]);
	});

	it("adds and queries literal triples", () => {
		const graph = createRdf12Graph();
		const label = stringLiteral("3. 核心引擎设计");
		const count = integerLiteral(10);
		const enabled = booleanLiteral(true);

		graph.add(rdf12Triple(subject, iriTerm(`${namespaces.rdf}value`), label));
		graph.add(
			rdf12Triple(subject, iriTerm(`${namespaces.aat}startLine`), count),
		);
		graph.add(
			rdf12Triple(subject, iriTerm(`${namespaces.aat}resolved`), enabled),
		);

		expect(
			graph.match({ subject, predicate: iriTerm(`${namespaces.rdf}value`) }),
		).toHaveLength(1);
		expect(
			graph.match({
				predicate: iriTerm(`${namespaces.aat}startLine`),
				object: integerLiteral(10),
			}),
		).toHaveLength(1);
		expect(
			graph.has(
				rdf12Triple(
					subject,
					iriTerm(`${namespaces.aat}resolved`),
					booleanLiteral(true),
				),
			),
		).toBe(true);
	});

	it("adds and queries triple terms as objects", () => {
		const graph = createRdf12Graph();
		const relation = rdf12Triple(subject, predicate, target);
		const reifier = iriTerm("urn:aat:test#xref-l1-c1-o0");
		const reifies = iriTerm(`${namespaces.rdf}reifies`);
		const reifierTriple = rdf12Triple(
			reifier,
			reifies,
			rdf12TripleTerm(relation),
		);

		graph.add(reifierTriple);

		expect(graph.has(reifierTriple)).toBe(true);
		expect(
			graph.match({ predicate: reifies, object: rdf12TripleTerm(relation) }),
		).toEqual([reifierTriple]);
	});

	it("deduplicates repeated triples by value rather than object identity", () => {
		const graph = createRdf12Graph();

		graph.add(rdf12Triple(subject, predicate, target));
		graph.add(
			rdf12Triple(
				iriTerm(subject.value),
				iriTerm(predicate.value),
				iriTerm(target.value),
			),
		);

		expect(graph.size).toBe(1);
	});

	it("returns stable ordering independent of insertion order", () => {
		const first = rdf12Triple(iriTerm("urn:aat:test#b"), predicate, target);
		const second = rdf12Triple(iriTerm("urn:aat:test#a"), predicate, target);
		const third = rdf12Triple(
			subject,
			iriTerm(`${namespaces.aat}label`),
			stringLiteral("label"),
		);

		const graphA = createRdf12Graph([first, second, third]);
		const graphB = createRdf12Graph([third, first, second]);

		expect(graphA.toArray().map(rdf12TripleKey)).toEqual(
			graphB.toArray().map(rdf12TripleKey),
		);
		expect(graphA.toArray().map(rdf12TripleKey)).toEqual(
			[second, first, third].map(rdf12TripleKey).sort(),
		);
	});

	it("orders keys by explicit code-unit comparison rather than locale collation", () => {
		const upper = rdf12Triple(iriTerm("urn:aat:test#Z"), predicate, target);
		const lower = rdf12Triple(iriTerm("urn:aat:test#a"), predicate, target);
		const underscore = rdf12Triple(
			iriTerm("urn:aat:test#_"),
			predicate,
			target,
		);

		const graph = createRdf12Graph([lower, underscore, upper]);

		expect(graph.toArray().map((triple) => triple.subject.value)).toEqual([
			"urn:aat:test#Z",
			"urn:aat:test#_",
			"urn:aat:test#a",
		]);
	});

	it("keeps string literals that look like triple terms distinct from triple terms", () => {
		const relation = rdf12Triple(subject, predicate, target);
		const tripleTerm = rdf12TripleTerm(relation);
		const stringLooksLikeTripleTerm = stringLiteral("<<(s p o)>>");

		expect(rdf12TermKey(tripleTerm)).not.toBe(
			rdf12TermKey(stringLooksLikeTripleTerm),
		);
	});
});
