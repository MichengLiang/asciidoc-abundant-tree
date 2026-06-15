import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli";
import { parseAbundantTree, rdf12 } from "../../src/index";
import type { Rdf12Graph } from "../../src/rdf12-projection/graph";
import { assertRdf12GraphsEquivalent } from "../../src/rdf12-projection/graph-canonicalization";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { parseTurtleToRdf12Graph } from "../../src/rdf12-projection/n3-adapter";
import {
	type Rdf12IriTerm,
	rdf12Triple,
	rdf12TripleTerm,
} from "../../src/rdf12-projection/terms";
import {
	aatTerm,
	expectLiteralValue,
	expectResourceTypeCount,
	expectTriple,
	literalValues,
	rdfTerm,
	relTerm,
	resourcesOfType,
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
		expectHeadingByAddressLabel(parsed, "delivery", "配送策略", 5, 38);
		expectHeadingByAddressLabel(parsed, "rel-delivery", "配送策略", 5, 38);
		expectHeadingByHeadline(parsed, "运力规则", 39, 43);
		expectHeadingRaw(
			parsed,
			"capacity",
			`[#capacity.rule, status=active]
== 运力规则

运力规则描述系统在不同运力条件下如何判断配送策略是否需要降级。

`,
		);
		expectDirectChildren(parsed, heading("heading-l1-o0"), [
			heading("heading-l5-o0"),
			heading("heading-l39-o0"),
		]);
		expectHeadlinesByDocumentOrder(parsed, [
			"root",
			"配送策略",
			"运力规则",
			"我是3级标题",
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
			nestedHeading,
			aatTerm("childOrder"),
			integerLiteral(1),
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

	it("exposes node and edge payload complex properties", () => {
		const result = rdf12(
			parseAbundantTree({ sourcePath: structuralPayloadPath }),
			{
				documentRoot: projectRoot,
			},
		);
		const graph = parseTurtleToRdf12Graph(result.ttl);
		const heading = headingLookupFromGraph(graph);
		const deliveryPolicy = heading("配送策略");
		const capacityRule = heading("运力规则");
		const edge = graph.match({
			predicate: aatTerm("sourceHeading"),
			object: deliveryPolicy,
		})[0]?.subject;
		if (edge === undefined) {
			throw new Error("expected delivery policy xref edge");
		}
		const nodePayload = onlyObjectIri(
			graph,
			deliveryPolicy,
			aatTerm("payload"),
		);
		const edgePayload = onlyObjectIri(graph, edge, aatTerm("payload"));

		expectTriple(graph, deliveryPolicy, aatTerm("payload"), nodePayload);
		expectTriple(graph, edge, aatTerm("payload"), edgePayload);
		expect(
			graph.has(rdf12Triple(capacityRule, aatTerm("payload"), edgePayload)),
		).toBe(false);
		expectTriple(
			graph,
			nodePayload,
			aatTerm("payloadKind"),
			stringLiteral("node"),
		);
		expectTriple(graph, nodePayload, aatTerm("role"), stringLiteral("banana"));
		expectTriple(
			graph,
			nodePayload,
			aatTerm("forSelector"),
			stringLiteral("delivery"),
		);
		expect(
			graph.match({ subject: nodePayload, predicate: aatTerm("payloadId") }),
		).toHaveLength(0);
		expectTriple(
			graph,
			edgePayload,
			aatTerm("payloadKind"),
			stringLiteral("edge"),
		);
		expectTriple(graph, edgePayload, aatTerm("role"), stringLiteral("pear"));
		expectTriple(graph, edgePayload, aatTerm("format"), stringLiteral("yaml"));
		expectTriple(
			graph,
			edgePayload,
			aatTerm("payloadId"),
			stringLiteral("rel-delivery"),
		);
	});

	it("supports direct field predicate queries on headings", () => {
		const result = rdf12(
			parseAbundantTree({ sourcePath: structuralPayloadPath }),
			{
				documentRoot: projectRoot,
			},
		);
		const graph = parseTurtleToRdf12Graph(result.ttl);
		const heading = headingLookupFromGraph(graph);
		const deliveryPolicy = heading("配送策略");

		expectTriple(
			graph,
			deliveryPolicy,
			aatTerm("role"),
			stringLiteral("policy"),
		);
		expectTriple(
			graph,
			deliveryPolicy,
			aatTerm("status"),
			stringLiteral("active"),
		);
		expectTriple(graph, deliveryPolicy, aatTerm("owner"), stringLiteral("ops"));
	});

	it("does not expose old RDF12 public contract types or predicates", () => {
		const result = rdf12(
			parseAbundantTree({ sourcePath: structuralPayloadPath }),
			{
				documentRoot: projectRoot,
			},
		);
		const graph = parseTurtleToRdf12Graph(result.ttl);

		for (const oldType of [
			"Paragraph",
			"ListingBlock",
			"TableBlock",
			"AnchorTarget",
			"PayloadBlock",
			"SurfaceAttribute",
			"TitleLabel",
			"AddressLabel",
			"GeneratedAddressLabel",
			"BlockTitleLabel",
			"AnchorLabel",
			"ReftextLabel",
			"XrefDisplayLabel",
			"RoleLabel",
			"XrefOccurrence",
			"AsciiDocDocument",
			"AbundantDocument",
			"RdfProjection",
		]) {
			expectResourceTypeCount(graph, aatTerm(oldType), 0);
		}
		expectResourceTypeCount(graph, aatTerm("HeadingProjection"), 1);
		for (const oldPredicate of [
			"hasAttribute",
			"hasLabel",
			"hasPayload",
			"payloadOf",
			"sourceNode",
			"targetNode",
			"rawRel",
			"previousSibling",
		]) {
			expect(graph.match({ predicate: aatTerm(oldPredicate) })).toHaveLength(0);
		}
		expect(
			graph.match({
				predicate: rdfTerm("type"),
				object: aatTerm("PayloadBlock"),
			}),
		).toHaveLength(0);
	});
});

function expectHeadingByAddressLabel(
	graph: Rdf12Graph,
	addressLabel: string,
	headline: string,
	startLine: number,
	endLine: number,
): void {
	const heading = onlySubjectWithLiteral(
		graph,
		aatTerm("addressLabel"),
		addressLabel,
	);

	expectTriple(graph, heading, rdfTerm("type"), aatTerm("Heading"));
	expectLiteralValue(graph, heading, aatTerm("headline"), headline);
	expectLiteralValue(
		graph,
		heading,
		aatTerm("relativePath"),
		"samples/structural-payload.adoc",
	);
	expectTriple(graph, heading, aatTerm("startLine"), integerLiteral(startLine));
	expectTriple(graph, heading, aatTerm("endLine"), integerLiteral(endLine));
}

function expectHeadingByHeadline(
	graph: Rdf12Graph,
	headline: string,
	startLine: number,
	endLine: number,
): void {
	const heading = headingLookupFromGraph(graph)(headline);

	expectTriple(graph, heading, rdfTerm("type"), aatTerm("Heading"));
	expectTriple(graph, heading, aatTerm("startLine"), integerLiteral(startLine));
	expectTriple(graph, heading, aatTerm("endLine"), integerLiteral(endLine));
}

function expectHeadingRaw(
	graph: Rdf12Graph,
	addressLabel: string,
	raw: string,
): void {
	const heading = onlySubjectWithLiteral(
		graph,
		aatTerm("addressLabel"),
		addressLabel,
	);

	expectTriple(graph, heading, aatTerm("raw"), stringLiteral(raw));
}

function onlySubjectWithLiteral(
	graph: Rdf12Graph,
	predicate: Rdf12IriTerm,
	value: string,
): Rdf12IriTerm {
	const subjects = graph
		.match({ predicate, object: stringLiteral(value) })
		.map((triple) => triple.subject);

	expect(subjects).toHaveLength(1);
	return subjects[0] ?? termIri("");
}

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
			.map((triple) => triple.object)
			.filter((term): term is Rdf12IriTerm => term.termType === "iri")
			.toSorted(
				(left, right) =>
					integerValue(graph, left, "childOrder") -
					integerValue(graph, right, "childOrder"),
			)
			.map((term) => term.value),
	).toEqual(children.map((child) => child.value));
}

function expectHeadlinesByDocumentOrder(
	graph: Rdf12Graph,
	headlines: readonly string[],
): void {
	expect(
		resourcesOfType(graph, aatTerm("Heading"))
			.toSorted(
				(left, right) =>
					integerValue(graph, left, "documentOrder") -
					integerValue(graph, right, "documentOrder"),
			)
			.map((heading) => {
				const [headline] = literalValues(graph, heading, aatTerm("headline"));
				if (headline === undefined) {
					throw new Error("expected heading headline");
				}
				return headline;
			}),
	).toEqual(headlines);
}

function integerValue(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
): number {
	const [value] = literalValues(graph, subject, aatTerm(predicateLocalName));
	if (value === undefined) {
		throw new Error(`expected ${predicateLocalName} integer`);
	}
	return Number(value);
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

function onlyObjectIri(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
): Rdf12IriTerm {
	const objects = graph
		.match({ subject, predicate })
		.map((triple) => triple.object)
		.filter((object): object is Rdf12IriTerm => object.termType === "iri");

	expect(objects).toHaveLength(1);
	return objects[0] ?? termIri("");
}
