import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const structuralPayloadPath = join(
	projectRoot,
	"samples/structural-payload.adoc",
);

describe("rdf12 heading slices", () => {
	it("projects delivery policy raw as lines 5 through 40", () => {
		const projection = structuralPayloadProjection();
		const deliveryPolicy = resourceIri(projection.documentIri, "heading-l5-o0");

		expectStringTriple(
			projection.graph,
			deliveryPolicy,
			"raw",
			`[#delivery-policy.section, kind=policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity-rule[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery-capacity]。

[#delivery-policy-payload.payload, for=delivery-policy, data=json]
[source,json]
----
{
  "owner": {
    "team": "ops",
    "fallback": "manual-review"
  },
  "risk": {
    "level": "high",
    "signals": ["weather", "capacity"]
  }
}
----

[#rel-delivery-capacity.xref-payload, data=json]
[source,json]
----
{
  "reason": {
    "type": "risk-control",
    "signals": ["weather", "capacity"],
    "description": "配送策略需要读取运力规则来决定是否降级。"
  },
  "edge": {
    "direction": "outbound",
    "required": true
  }
}
----

`,
		);
		expectNumberTriple(projection.graph, deliveryPolicy, "startLine", 5);
		expectNumberTriple(projection.graph, deliveryPolicy, "endLine", 40);
	});

	it("projects capacity rule raw as lines 41 through 45 without nested heading text", () => {
		const projection = structuralPayloadProjection();
		const capacityRule = resourceIri(projection.documentIri, "heading-l41-o0");
		const raw = onlyLiteralValue(projection.graph, capacityRule, "raw");

		expect(raw).toBe(`[#capacity-rule.section, kind=rule, status=active]
== 运力规则

运力规则描述系统在不同运力条件下如何判断配送策略是否需要降级。

`);
		expect(raw).not.toContain("=== 我是3级标题");
		expect(raw).not.toContain("123");
		expectNumberTriple(projection.graph, capacityRule, "startLine", 41);
		expectNumberTriple(projection.graph, capacityRule, "endLine", 45);
	});

	it("projects the nested heading level as 2", () => {
		const projection = structuralPayloadProjection();
		const nestedHeading = resourceIri(projection.documentIri, "heading-l46-o0");

		expectNumberTriple(projection.graph, nestedHeading, "headingLevel", 2);
	});
});

function structuralPayloadProjection() {
	return projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: structuralPayloadPath }),
		{ documentRoot: projectRoot },
	);
}

function resourceIri(documentIri: string, localId: string): string {
	return `${documentIri.slice(0, documentIri.indexOf("#"))}#${localId}`;
}

function onlyLiteralValue(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
): string {
	const values = graph
		.match({
			subject: iriTerm(subject),
			predicate: iriTerm(`${namespaces.aat}${predicateLocalName}`),
		})
		.flatMap((triple) =>
			triple.object.termType === "literal" ? [triple.object.value] : [],
		);

	expect(values).toHaveLength(1);
	return values[0] ?? "";
}

function expectStringTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				stringLiteral(value),
			),
		),
	).toBe(true);
}

function expectNumberTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
	value: number,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				integerLiteral(value),
			),
		),
	).toBe(true);
}
