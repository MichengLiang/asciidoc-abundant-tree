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

// 按位置认标题：用切片起始行找它，同一行有几个标题时按文档顺序取第 ordinal 个（book-entry 下不同文件的行号会相撞）。
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

// 图里的资源都是 <文档 IRI>#<局部名>（06 号书第 2 章「身份」）。
export function documentResource(
	documentIri: string,
	localId: string,
): Rdf12IriTerm {
	return iriTerm(`${documentIri}#${localId}`);
}

// 按 label 空间反查：标题节点上 aat:headline、aat:addressPath、aat:addressLabel、aat:generatedAddressLabel 的值与
// selector 整串相等的标题（06 号书第 2 章「地址与 Label 空间」），按 IRI 排序。
export function labelOwners(
	graph: Rdf12Graph,
	selector: string,
): Rdf12IriTerm[] {
	const owners = new Map<string, Rdf12IriTerm>();
	for (const name of [
		"headline",
		"addressPath",
		"addressLabel",
		"generatedAddressLabel",
	]) {
		for (const triple of graph.match({ predicate: aatTerm(name) })) {
			if (
				triple.object.termType === "literal" &&
				triple.object.value === selector
			) {
				owners.set(triple.subject.value, triple.subject);
			}
		}
	}
	return [...owners.values()].toSorted((left, right) =>
		left.value.localeCompare(right.value),
	);
}
