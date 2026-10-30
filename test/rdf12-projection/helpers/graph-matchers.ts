import { expect } from "vitest";
import { fieldPredicate } from "../../../src/rdf12-projection/field-predicate";
import {
	type Rdf12Graph,
	type Rdf12IriTerm,
	type Rdf12Term,
	rdf12Triple,
} from "../../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../../src/rdf12-projection/literals";
import { namespaces } from "../../../src/rdf12-projection/namespaces";
import { iriTerm } from "../../../src/rdf12-projection/terms";

export function termIri(value: string): Rdf12IriTerm {
	return iriTerm(value);
}

export function aatTerm(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.aat}${localName}`);
}

export function fieldTerm(fieldName: string): Rdf12IriTerm {
	return fieldPredicate(fieldName);
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

export function expectIntegerValue(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
	value: number,
): void {
	expectTriple(graph, subject, predicate, integerLiteral(value));
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

// 标题节点以地址命名（06 号书第 2 章「身份」）。按位置认标题的测试用切片起始行找它：同一行有几个标题时按文档顺序取第
// ordinal 个，与原来 heading-l<startLine>-o<ordinal> 的取法相同。
export function headingStartingAt(
	graph: Rdf12Graph,
	startLine: number,
	ordinal = 0,
): Rdf12IriTerm {
	const headings = resourcesOfType(graph, aatTerm("Heading"))
		.filter((heading) =>
			graph.has(
				rdf12Triple(heading, aatTerm("startLine"), integerLiteral(startLine)),
			),
		)
		.toSorted(
			(left, right) =>
				documentOrderOf(graph, left) - documentOrderOf(graph, right),
		);
	const heading = headings[ordinal];
	if (heading === undefined) {
		throw new Error(`no heading #${ordinal} starts at line ${startLine}`);
	}
	return heading;
}

function documentOrderOf(graph: Rdf12Graph, heading: Rdf12IriTerm): number {
	const [triple] = graph.match({
		subject: heading,
		predicate: aatTerm("documentOrder"),
	});
	return triple?.object.termType === "literal"
		? Number(triple.object.value)
		: 0;
}

// 投影器自己起名的资源在 <文档 IRI>/projection# 下。
export function projectionResource(
	documentIri: string,
	localId: string,
): Rdf12IriTerm {
	return iriTerm(`${documentIri}/projection#${localId}`);
}
