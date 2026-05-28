import { expect } from "vitest";
import {
	type Rdf12Graph,
	type Rdf12IriTerm,
	type Rdf12Term,
	rdf12Triple,
} from "../../../src/rdf12-projection/graph";
import { stringLiteral } from "../../../src/rdf12-projection/literals";
import { namespaces } from "../../../src/rdf12-projection/namespaces";
import { iriTerm } from "../../../src/rdf12-projection/terms";

export function termIri(value: string): Rdf12IriTerm {
	return iriTerm(value);
}

export function aatTerm(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.aat}${localName}`);
}

export function rdfTerm(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.rdf}${localName}`);
}

export function relTerm(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.rel}${localName}`);
}

export function expectTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
	object: Rdf12Term,
): void {
	expect(graph.has(rdf12Triple(subject, predicate, object))).toBe(true);
}

export function expectNoTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
	object: Rdf12Term,
): void {
	expect(graph.has(rdf12Triple(subject, predicate, object))).toBe(false);
}

export function expectResourceTypeCount(
	graph: Rdf12Graph,
	type: Rdf12IriTerm,
	count: number,
): void {
	expect(resourcesOfType(graph, type)).toHaveLength(count);
}

export function resourcesOfType(
	graph: Rdf12Graph,
	type: Rdf12IriTerm,
): Rdf12IriTerm[] {
	return graph
		.match({
			predicate: rdfTerm("type"),
			object: type,
		})
		.map((triple) => triple.subject);
}

export function expectLiteralValue(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
	value: string,
): void {
	expectTriple(graph, subject, predicate, stringLiteral(value));
}

export function literalValues(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
): string[] {
	return graph
		.match({ subject, predicate })
		.flatMap((triple) =>
			triple.object.termType === "literal" ? [triple.object.value] : [],
		);
}
