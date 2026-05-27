import {
	type BaseQuad,
	DataFactory,
	Parser,
	type Quad,
	type Quad_Object,
	type Term,
} from "n3";
import {
	createRdf12Graph,
	type Rdf12Graph,
	rdf12Triple,
	rdf12TripleTerm,
} from "./graph";
import { iriTerm, literalTerm, type Rdf12Term } from "./terms";

const { literal, namedNode, quad, triple } = DataFactory;

type Rdf12N3Object = Quad_Object | BaseQuad;
type ParsedRdf12Object = Term | BaseQuad;

export function rdf12GraphToN3Quads(graph: Rdf12Graph): Quad[] {
	return graph
		.toArray()
		.map((item) =>
			quad(
				namedNode(item.subject.value),
				namedNode(item.predicate.value),
				rdf12TermToN3Term(item.object) as Quad_Object,
			),
		);
}

export function parseTurtleToN3Quads(turtle: string): Quad[] {
	return new Parser<Quad>({ format: "text/turtle" }).parse(turtle);
}

export function parseTurtleToRdf12Graph(turtle: string): Rdf12Graph {
	return n3QuadsToRdf12Graph(parseTurtleToN3Quads(turtle));
}

export function n3QuadsToRdf12Graph(quads: readonly Quad[]): Rdf12Graph {
	const graph = createRdf12Graph();

	for (const item of quads) {
		if (item.subject.termType !== "NamedNode") {
			throw new Error(`Unsupported RDF subject term: ${item.subject.termType}`);
		}
		if (item.predicate.termType !== "NamedNode") {
			throw new Error(
				`Unsupported RDF predicate term: ${item.predicate.termType}`,
			);
		}
		graph.add(
			rdf12Triple(
				iriTerm(item.subject.value),
				iriTerm(item.predicate.value),
				n3TermToRdf12Term(item.object as ParsedRdf12Object),
			),
		);
	}

	return graph;
}

function rdf12TermToN3Term(term: Rdf12Term): Rdf12N3Object {
	switch (term.termType) {
		case "iri":
			return namedNode(term.value);
		case "literal":
			return literal(
				term.value,
				term.language ?? namedNode(term.datatype.value),
			);
		case "triple":
			return triple(
				namedNode(term.value.subject.value),
				namedNode(term.value.predicate.value),
				rdf12TermToN3Term(term.value.object) as Quad_Object,
			) as BaseQuad;
	}
}

function n3TermToRdf12Term(term: ParsedRdf12Object): Rdf12Term {
	switch (term.termType) {
		case "NamedNode":
			return iriTerm(term.value);
		case "Literal":
			return literalTerm({
				value: term.value,
				datatype: iriTerm(term.datatype.value),
				...(term.language ? { language: term.language } : {}),
			});
		case "Quad": {
			if (term.subject.termType !== "NamedNode") {
				throw new Error(
					`Unsupported embedded subject term: ${term.subject.termType}`,
				);
			}
			if (term.predicate.termType !== "NamedNode") {
				throw new Error(
					`Unsupported embedded predicate term: ${term.predicate.termType}`,
				);
			}
			return rdf12TripleTerm(
				rdf12Triple(
					iriTerm(term.subject.value),
					iriTerm(term.predicate.value),
					n3TermToRdf12Term(term.object),
				),
			);
		}
		default:
			throw new Error(`Unsupported RDF object term: ${term.termType}`);
	}
}
