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
			heading("heading-l39-o0"),
			rdfTerm("type"),
			aatTerm("Heading"),
		);
		expectTriple(
			graph,
			heading("heading-l44-o0"),
			rdfTerm("type"),
			aatTerm("Heading"),
		);
	});

	it("Batch 01 projects heading labels, headlines, levels, and raw slices", () => {
		const { graph, heading } = structuralPayloadProjection();
		const root = heading("heading-l1-o0");
		const deliveryPolicy = heading("heading-l5-o0");
		const capacityRule = heading("heading-l39-o0");
		const nestedHeading = heading("heading-l44-o0");

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
			"delivery",
		);
		expectLiteralValue(
			graph,
			deliveryPolicy,
			aatTerm("addressLabel"),
			"rel-delivery-capacity",
		);
		expectLiteralValue(
			graph,
			capacityRule,
			aatTerm("addressLabel"),
			"capacity",
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

	it("Batch 02 projects ordered heading tree facts", () => {
		const { graph } = structuralPayloadProjection();
		const root = headingByHeadline(graph, "root");
		const deliveryPolicy = headingByHeadline(graph, "配送策略");
		const capacityRule = headingByHeadline(graph, "运力规则");
		const nestedHeading = headingByHeadline(graph, "我是3级标题");

		expectTriple(graph, root, aatTerm("containsDirectly"), deliveryPolicy);
		expectTriple(graph, root, aatTerm("containsDirectly"), capacityRule);
		expectTriple(
			graph,
			capacityRule,
			aatTerm("containsDirectly"),
			nestedHeading,
		);
		expect(directChildrenInOrder(graph, root)).toEqual([
			deliveryPolicy,
			capacityRule,
		]);
		expect(directChildrenInOrder(graph, capacityRule)).toEqual([nestedHeading]);
		expectIntegerValue(graph, deliveryPolicy, aatTerm("childOrder"), 1);
		expectIntegerValue(graph, capacityRule, aatTerm("childOrder"), 2);
		expectIntegerValue(graph, nestedHeading, aatTerm("childOrder"), 1);
		expect(headlinesByDocumentOrder(graph)).toEqual([
			"root",
			"配送策略",
			"运力规则",
			"我是3级标题",
		]);
		expect(graph.match({ predicate: aatTerm("previousSibling") })).toHaveLength(
			0,
		);
	});

	it("Batch 03 binds selectors only to heading label fields", () => {
		const { graph, labelCatalog, heading } = structuralPayloadProjection();
		const root = heading("heading-l1-o0");
		const deliveryPolicy = heading("heading-l5-o0");
		const capacityRule = heading("heading-l39-o0");
		const nestedHeading = heading("heading-l44-o0");

		expect(labelCatalog.owners("root")).toEqual([root]);
		expect(labelCatalog.owners("delivery")).toEqual([deliveryPolicy]);
		expect(labelCatalog.owners("配送策略")).toEqual([deliveryPolicy]);
		expect(labelCatalog.owners("rel-delivery-capacity")).toEqual([
			deliveryPolicy,
		]);
		expect(labelCatalog.owners("capacity")).toEqual([capacityRule]);
		expect(labelCatalog.owners("运力规则")).toEqual([capacityRule]);
		expect(labelCatalog.owners("_我是3级标题")).toEqual([nestedHeading]);
		expect(labelCatalog.owners("我是3级标题")).toEqual([nestedHeading]);

		for (const selector of [
			"section",
			"policy",
			"active",
			"ops",
			"policy-risk-profile",
			"relation-evidence",
			deliveryPolicy.value,
			`配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, relation-evidence=rel-delivery-capacity]。`,
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
		const capacityRule = heading("heading-l39-o0");
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
		expectLiteralValue(graph, xrefEdge, aatTerm("targetSelector"), "capacity");
		expectLiteralValue(graph, xrefEdge, aatTerm("displayLabel"), "运力规则");
		expectLiteralValue(graph, xrefEdge, aatTerm("rel"), "depends-on");
		expect(
			graph.match({ subject: xrefEdge, predicate: aatTerm("payloadSelector") }),
		).toHaveLength(0);
		expectLiteralValue(
			graph,
			xrefEdge,
			aatTerm("raw"),
			"xref:capacity[运力规则, rel=depends-on, weight=0.8, relation-evidence=rel-delivery-capacity]",
		);
	});

	it("Batch 05 projects heading and xref direct field predicates", () => {
		const { graph, heading } = structuralPayloadProjection();
		const deliveryPolicy = heading("heading-l5-o0");
		const xrefEdge = onlyResourceOfType(graph, aatTerm("XrefEdge"));

		expectLiteralValue(graph, deliveryPolicy, aatTerm("role"), "policy");
		expectLiteralValue(graph, deliveryPolicy, aatTerm("status"), "active");
		expectLiteralValue(graph, deliveryPolicy, aatTerm("owner"), "ops");
		expectLiteralValue(graph, xrefEdge, aatTerm("weight"), "0.8");
	});

	it("Batch 06 binds heading and edge raw value complex properties", () => {
		const { graph, heading } = structuralPayloadProjection();
		const deliveryPolicy = heading("heading-l5-o0");
		const xrefEdge = onlyResourceOfType(graph, aatTerm("XrefEdge"));
		const policyRiskProfile = onlyObjectIri(
			graph,
			deliveryPolicy,
			aatTerm("policy-risk-profile"),
		);
		const relationEvidence = onlyObjectIri(
			graph,
			xrefEdge,
			aatTerm("relation-evidence"),
		);

		expectTriple(
			graph,
			deliveryPolicy,
			aatTerm("policy-risk-profile"),
			policyRiskProfile,
		);
		expectLiteralValue(
			graph,
			policyRiskProfile,
			aatTerm("forSelector"),
			"delivery",
		);
		expectLiteralValue(graph, policyRiskProfile, aatTerm("format"), "json");
		expect(
			graph.match({ subject: policyRiskProfile, predicate: aatTerm("role") }),
		).toHaveLength(0);
		expectLiteralValue(
			graph,
			policyRiskProfile,
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
		expectTriple(
			graph,
			xrefEdge,
			aatTerm("relation-evidence"),
			relationEvidence,
		);
		expectLiteralValue(graph, relationEvidence, aatTerm("format"), "yaml");
		expectLiteralValue(
			graph,
			relationEvidence,
			aatTerm("sourceValueId"),
			"rel-delivery-capacity",
		);
		for (const subject of [policyRiskProfile, relationEvidence]) {
			for (const predicate of ["payloadKind", "role", "payloadId"].map(
				aatTerm,
			)) {
				expect(graph.match({ subject, predicate })).toHaveLength(0);
			}
		}
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

function headingByHeadline(graph: Rdf12Graph, headline: string): Rdf12IriTerm {
	return onlySubjectWithLiteral(graph, aatTerm("headline"), headline);
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

function directChildrenInOrder(
	graph: Rdf12Graph,
	parent: Rdf12IriTerm,
): Rdf12IriTerm[] {
	return graph
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
		);
}

function headlinesByDocumentOrder(graph: Rdf12Graph): string[] {
	return resourcesOfType(graph, aatTerm("Heading"))
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
		});
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

function onlyResourceOfType(
	graph: Rdf12Graph,
	type: Rdf12IriTerm,
): Rdf12IriTerm {
	const resources = resourcesOfType(graph, type);
	expect(resources).toHaveLength(1);
	return resources[0] ?? termIri("");
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

	for (const triple of graph.match({ predicate: aatTerm("forSelector") })) {
		subjects.set(triple.subject.value, triple.subject);
	}
	for (const triple of graph.match({ predicate: aatTerm("sourceValueId") })) {
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
		{ start: 25, end: 37 },
	].some(
		(range) =>
			Number(startLine) >= range.start && Number(startLine) <= range.end,
	);
}
