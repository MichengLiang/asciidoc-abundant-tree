import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import {
	type Rdf12IriTerm,
	rdf12TripleTerm,
} from "../../src/rdf12-projection/terms";
import {
	aatTerm,
	expectIntegerValue,
	expectLiteralValue,
	expectNoTriple,
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

describe("rdf12 heading projection target acceptance", () => {
	it("Batch 01 projects the four heading nodes from the structural payload sample", () => {
		const { graph, heading } = structuralPayloadProjection();

		expectResourceTypeCount(graph, aatTerm("Heading"), 4);
		expectTriple(
			graph,
			heading("heading-l1-o0"),
			rdfTerm("type"),
			aatTerm("Heading"),
		);
		expectTriple(
			graph,
			heading("heading-l5-o0"),
			rdfTerm("type"),
			aatTerm("Heading"),
		);
		expectTriple(
			graph,
			heading("heading-l41-o0"),
			rdfTerm("type"),
			aatTerm("Heading"),
		);
		expectTriple(
			graph,
			heading("heading-l46-o0"),
			rdfTerm("type"),
			aatTerm("Heading"),
		);
	});

	it("Batch 01 projects heading labels, headlines, levels, and raw slices", () => {
		const { graph, heading } = structuralPayloadProjection();
		const root = heading("heading-l1-o0");
		const deliveryPolicy = heading("heading-l5-o0");
		const capacityRule = heading("heading-l41-o0");
		const nestedHeading = heading("heading-l46-o0");

		expectLiteralValue(graph, root, aatTerm("headline"), "root");
		expectLiteralValue(graph, deliveryPolicy, aatTerm("headline"), "配送策略");
		expectLiteralValue(graph, capacityRule, aatTerm("headline"), "运力规则");
		expectLiteralValue(
			graph,
			nestedHeading,
			aatTerm("headline"),
			"我是3级标题",
		);
		expectLiteralValue(
			graph,
			deliveryPolicy,
			aatTerm("addressLabel"),
			"delivery-policy",
		);
		expectLiteralValue(
			graph,
			capacityRule,
			aatTerm("addressLabel"),
			"capacity-rule",
		);
		expectIntegerValue(graph, root, aatTerm("headingLevel"), 0);
		expectIntegerValue(graph, deliveryPolicy, aatTerm("headingLevel"), 1);
		expectIntegerValue(graph, capacityRule, aatTerm("headingLevel"), 1);
		expectIntegerValue(graph, nestedHeading, aatTerm("headingLevel"), 2);
		expectLiteralValue(
			graph,
			root,
			aatTerm("raw"),
			`= root

一段摘要

`,
		);
		expect(literalValues(graph, deliveryPolicy, aatTerm("raw"))).toHaveLength(
			1,
		);
		const capacityRuleRaw = literalValues(graph, capacityRule, aatTerm("raw"));
		expect(capacityRuleRaw.length).toBeGreaterThan(0);
		for (const raw of capacityRuleRaw) {
			expect(raw).not.toContain("=== 我是3级标题");
		}
		expect(literalValues(graph, nestedHeading, aatTerm("raw"))).toHaveLength(1);
	});

	it("Batch 02 projects heading containment and sibling order", () => {
		const { graph, heading } = structuralPayloadProjection();
		const root = heading("heading-l1-o0");
		const deliveryPolicy = heading("heading-l5-o0");
		const capacityRule = heading("heading-l41-o0");
		const nestedHeading = heading("heading-l46-o0");

		expectTriple(graph, root, aatTerm("containsDirectly"), deliveryPolicy);
		expectTriple(graph, root, aatTerm("containsDirectly"), capacityRule);
		expectTriple(
			graph,
			capacityRule,
			aatTerm("containsDirectly"),
			nestedHeading,
		);
		expectTriple(
			graph,
			capacityRule,
			aatTerm("previousSibling"),
			deliveryPolicy,
		);
	});

	it("Batch 03 binds selectors only to heading label fields", () => {
		const { graph, labelCatalog, heading } = structuralPayloadProjection();
		const root = heading("heading-l1-o0");
		const deliveryPolicy = heading("heading-l5-o0");
		const capacityRule = heading("heading-l41-o0");
		const nestedHeading = heading("heading-l46-o0");

		expect(labelCatalog.owners("root")).toEqual([root]);
		expect(labelCatalog.owners("delivery-policy")).toEqual([deliveryPolicy]);
		expect(labelCatalog.owners("配送策略")).toEqual([deliveryPolicy]);
		expect(labelCatalog.owners("capacity-rule")).toEqual([capacityRule]);
		expect(labelCatalog.owners("运力规则")).toEqual([capacityRule]);
		expect(labelCatalog.owners("_我是3级标题")).toEqual([nestedHeading]);
		expect(labelCatalog.owners("我是3级标题")).toEqual([nestedHeading]);

		for (const selector of [
			"section",
			"policy",
			"active",
			"ops",
			"payload",
			"xref-payload",
			"delivery-policy-payload",
			"rel-delivery-capacity",
			deliveryPolicy.value,
			`配送策略依赖 xref:capacity-rule[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery-capacity]。`,
		]) {
			expect(labelCatalog.owners(selector)).toEqual([]);
		}

		for (const labelType of [
			"TitleLabel",
			"AddressLabel",
			"GeneratedAddressLabel",
			"BlockTitleLabel",
			"AnchorLabel",
			"ReftextLabel",
			"XrefDisplayLabel",
			"RoleLabel",
		]) {
			expectResourceTypeCount(graph, aatTerm(labelType), 0);
		}
		expect(graph.match({ predicate: aatTerm("hasLabel") })).toHaveLength(0);
	});

	it("Batch 04 projects xref relation edge evidence and RDF 1.2 reifier", () => {
		const { graph, heading } = structuralPayloadProjection();
		const deliveryPolicy = heading("heading-l5-o0");
		const capacityRule = heading("heading-l41-o0");
		const relation = rdf12Triple(
			deliveryPolicy,
			relTerm("depends-on"),
			capacityRule,
		);
		const xrefEdge = onlyResourceOfType(graph, aatTerm("XrefEdge"));

		expectResourceTypeCount(graph, aatTerm("XrefOccurrence"), 0);
		expectTriple(graph, deliveryPolicy, relTerm("depends-on"), capacityRule);
		expectTriple(
			graph,
			xrefEdge,
			rdfTerm("reifies"),
			rdf12TripleTerm(relation),
		);
		expectTriple(graph, xrefEdge, aatTerm("sourceHeading"), deliveryPolicy);
		expectTriple(graph, xrefEdge, aatTerm("targetHeading"), capacityRule);
		expectLiteralValue(
			graph,
			xrefEdge,
			aatTerm("targetSelector"),
			"capacity-rule",
		);
		expectLiteralValue(graph, xrefEdge, aatTerm("displayLabel"), "运力规则");
		expectLiteralValue(graph, xrefEdge, aatTerm("rel"), "depends-on");
		expectLiteralValue(
			graph,
			xrefEdge,
			aatTerm("payloadSelector"),
			"rel-delivery-capacity",
		);
		expectLiteralValue(
			graph,
			xrefEdge,
			aatTerm("raw"),
			"xref:capacity-rule[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery-capacity]",
		);
	});

	it("Batch 05 projects heading and xref direct field predicates", () => {
		const { graph, heading } = structuralPayloadProjection();
		const deliveryPolicy = heading("heading-l5-o0");
		const xrefEdge = onlyResourceOfType(graph, aatTerm("XrefEdge"));

		expectLiteralValue(graph, deliveryPolicy, aatTerm("kind"), "policy");
		expectLiteralValue(graph, deliveryPolicy, aatTerm("status"), "active");
		expectLiteralValue(graph, deliveryPolicy, aatTerm("owner"), "ops");
		expectLiteralValue(graph, xrefEdge, aatTerm("weight"), "0.8");
	});

	it("Batch 06 binds node and edge payload complex properties", () => {
		const { graph, heading } = structuralPayloadProjection();
		const deliveryPolicy = heading("heading-l5-o0");
		const xrefEdge = onlyResourceOfType(graph, aatTerm("XrefEdge"));
		const nodePayload = onlyPayloadById(graph, "delivery-policy-payload");
		const edgePayload = onlyPayloadById(graph, "rel-delivery-capacity");

		expectTriple(graph, deliveryPolicy, aatTerm("payload"), nodePayload);
		expectLiteralValue(graph, nodePayload, aatTerm("payloadKind"), "node");
		expectLiteralValue(
			graph,
			nodePayload,
			aatTerm("forSelector"),
			"delivery-policy",
		);
		expectLiteralValue(graph, nodePayload, aatTerm("format"), "json");
		expectLiteralValue(
			graph,
			nodePayload,
			aatTerm("raw"),
			`{
  "owner": {
    "team": "ops",
    "fallback": "manual-review"
  },
  "risk": {
    "level": "high",
    "signals": ["weather", "capacity"]
  }
}`,
		);
		expectTriple(graph, xrefEdge, aatTerm("payload"), edgePayload);
		expectLiteralValue(graph, edgePayload, aatTerm("payloadKind"), "edge");
		expectLiteralValue(
			graph,
			edgePayload,
			aatTerm("payloadId"),
			"rel-delivery-capacity",
		);
	});

	it("keeps payload raw opaque instead of expanding it into business graph facts", () => {
		const { graph } = structuralPayloadProjection();
		const payloadSubjects = payloadRawScopeSubjects(graph);

		expect(payloadSubjects.length).toBeGreaterThan(0);
		for (const subject of payloadSubjects) {
			for (const predicate of payloadInternalFieldPredicates) {
				expect(graph.match({ subject, predicate })).toHaveLength(0);
				for (const value of payloadInternalLiteralValues) {
					expectNoTriple(graph, subject, predicate, stringLiteral(value));
				}
			}
		}
	});

	it("Batch 07 removes old structural resource types from the heading projection public graph", () => {
		const { graph } = structuralPayloadProjection();

		for (const oldType of [
			"Paragraph",
			"ListingBlock",
			"TableBlock",
			"AnchorTarget",
			"SurfaceAttribute",
			"PayloadBlock",
		]) {
			expectResourceTypeCount(graph, aatTerm(oldType), 0);
		}
	});
});

function structuralPayloadProjection(): {
	readonly graph: Rdf12Graph;
	readonly labelCatalog: ReturnType<
		typeof projectAbundantDocumentToRdf12
	>["labelCatalog"];
	readonly heading: (localId: string) => Rdf12IriTerm;
} {
	const projection = projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: structuralPayloadPath }),
		{ documentRoot: projectRoot },
	);

	return {
		graph: projection.graph,
		labelCatalog: projection.labelCatalog,
		heading(localId: string) {
			return termIri(resourceIri(projection.documentIri, localId));
		},
	};
}

function resourceIri(documentIri: string, localId: string): string {
	return `${documentIri.slice(0, documentIri.indexOf("#"))}#${localId}`;
}

function onlyResourceOfType(
	graph: Rdf12Graph,
	type: Rdf12IriTerm,
): Rdf12IriTerm {
	const resources = resourcesOfType(graph, type);
	expect(resources).toHaveLength(1);
	return resources[0] ?? termIri("");
}

function onlyPayloadById(graph: Rdf12Graph, payloadId: string): Rdf12IriTerm {
	const payloads = graph
		.match({
			predicate: aatTerm("payloadId"),
			object: stringLiteral(payloadId),
		})
		.map((triple) => triple.subject);

	expect(payloads).toHaveLength(1);
	return payloads[0] ?? termIri("");
}

const payloadInternalFieldPredicates = [
	"owner",
	"team",
	"fallback",
	"risk",
	"level",
	"signals",
	"reason",
	"type",
	"description",
	"edge",
	"direction",
	"required",
].map(aatTerm);

const payloadInternalLiteralValues = [
	"ops",
	"manual-review",
	"high",
	"weather",
	"capacity",
	"risk-control",
	"配送策略需要读取运力规则来决定是否降级。",
	"outbound",
	"true",
];

function payloadRawScopeSubjects(graph: Rdf12Graph): Rdf12IriTerm[] {
	const subjects = new Map<string, Rdf12IriTerm>();

	for (const payload of resourcesOfType(graph, aatTerm("PayloadBlock"))) {
		subjects.set(payload.value, payload);
	}
	for (const triple of graph.match({ predicate: aatTerm("payloadId") })) {
		subjects.set(triple.subject.value, triple.subject);
	}
	for (const triple of graph.match({
		predicate: aatTerm("relativePath"),
		object: stringLiteral("samples/structural-payload.adoc"),
	})) {
		if (isInsidePayloadSourceRange(graph, triple.subject)) {
			subjects.set(triple.subject.value, triple.subject);
		}
	}

	return [...subjects.values()];
}

function isInsidePayloadSourceRange(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
): boolean {
	const [startLine] = literalValues(graph, subject, aatTerm("startLine"));

	if (startLine === undefined) {
		return false;
	}

	return [
		{ start: 10, end: 23 },
		{ start: 25, end: 39 },
	].some(
		(range) =>
			Number(startLine) >= range.start && Number(startLine) <= range.end,
	);
}
