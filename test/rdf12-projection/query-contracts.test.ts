import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli";
import { parseAbundantTree, rdf12 } from "../../src/index";
import type { Rdf12Graph } from "../../src/rdf12-projection/graph";
import { assertRdf12GraphsEquivalent } from "../../src/rdf12-projection/graph-canonicalization";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { parseTurtleToRdf12Graph } from "../../src/rdf12-projection/n3-adapter";
import {
	type Rdf12IriTerm,
	rdf12Triple,
	rdf12TripleTerm,
} from "../../src/rdf12-projection/terms";
import {
	aatTerm,
	expectResourceTypeCount,
	expectTriple,
	rdfTerm,
	relTerm,
	termIri,
} from "./helpers/graph-matchers";

const projectRoot = process.cwd();
const structuralPayloadPath = join(
	projectRoot,
	"samples/structural-payload.adoc",
);

describe("rdf12 query contract end-to-end acceptance", () => {
	it("roundtrips the public rdf12 result and exposes direct heading children", () => {
		const result = rdf12(
			parseAbundantTree({ sourcePath: structuralPayloadPath }),
			{
				documentRoot: projectRoot,
			},
		);
		const parsed = parseTurtleToRdf12Graph(result.ttl);
		const heading = headingLookup(result.documentIri);

		expect(() =>
			assertRdf12GraphsEquivalent(result.graph, parsed),
		).not.toThrow();
		expectResourceTypeCount(parsed, aatTerm("Heading"), 4);
		expectDirectChildren(parsed, heading("heading-l1-o0"), [
			heading("heading-l5-o0"),
			heading("heading-l41-o0"),
		]);
	});

	it("parses CLI rdf12 stdout and supports recursive heading subtree queries", () => {
		const result = runCli([
			"samples/structural-payload.adoc",
			"--format",
			"rdf12",
		]);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");

		const graph = parseTurtleToRdf12Graph(result.stdout);
		const heading = headingLookupFromGraph(graph);
		const root = heading("root");
		const capacityRule = heading("运力规则");
		const nestedHeading = heading("我是3级标题");

		expect(transitiveHeadingChildren(graph, root)).toEqual(
			new Set([
				heading("配送策略").value,
				capacityRule.value,
				nestedHeading.value,
			]),
		);
		expectDirectChildren(graph, capacityRule, [nestedHeading]);
		expectTriple(
			graph,
			capacityRule,
			aatTerm("previousSibling"),
			heading("配送策略"),
		);
	});

	it("exposes xref edge evidence for outgoing heading relations", () => {
		const result = rdf12(
			parseAbundantTree({ sourcePath: structuralPayloadPath }),
			{
				documentRoot: projectRoot,
			},
		);
		const graph = parseTurtleToRdf12Graph(result.ttl);
		const heading = headingLookupFromGraph(graph);
		const source = heading("配送策略");
		const target = heading("运力规则");
		const relation = rdf12Triple(source, relTerm("depends-on"), target);
		const edges = graph
			.match({
				predicate: aatTerm("sourceHeading"),
				object: source,
			})
			.map((triple) => triple.subject);

		expect(edges).toHaveLength(1);
		const edge = edges[0] ?? termIri("");
		expectTriple(graph, source, relTerm("depends-on"), target);
		expectTriple(graph, edge, aatTerm("targetHeading"), target);
		expectTriple(graph, edge, rdfTerm("reifies"), rdf12TripleTerm(relation));
		expectTriple(graph, edge, aatTerm("weight"), stringLiteral("0.8"));
	});
});

function headingLookup(documentIri: string): (localId: string) => Rdf12IriTerm {
	const base = documentIri.slice(0, documentIri.indexOf("#"));
	return (localId) => termIri(`${base}#${localId}`);
}

function headingLookupFromGraph(
	graph: Rdf12Graph,
): (headline: string) => Rdf12IriTerm {
	return (headline) => {
		const [match] = graph.match({
			predicate: aatTerm("headline"),
			object: stringLiteral(headline),
		});
		if (match?.subject.termType !== "iri") {
			throw new Error(`expected heading with headline ${headline}`);
		}
		return match.subject;
	};
}

function expectDirectChildren(
	graph: Rdf12Graph,
	parent: Rdf12IriTerm,
	children: readonly Rdf12IriTerm[],
): void {
	expect(
		graph
			.match({
				subject: parent,
				predicate: aatTerm("containsDirectly"),
			})
			.map((triple) => triple.object.value)
			.sort(),
	).toEqual(children.map((child) => child.value).sort());
}

function transitiveHeadingChildren(
	graph: Rdf12Graph,
	root: Rdf12IriTerm,
): Set<string> {
	const result = new Set<string>();
	const pending = [root];

	for (const current of pending) {
		for (const edge of graph.match({
			subject: current,
			predicate: aatTerm("containsDirectly"),
		})) {
			if (edge.object.termType !== "iri" || result.has(edge.object.value)) {
				continue;
			}
			result.add(edge.object.value);
			pending.push(edge.object);
		}
	}

	return result;
}
