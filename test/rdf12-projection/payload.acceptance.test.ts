import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { fieldPredicate } from "../../src/rdf12-projection/field-predicate";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm, type Rdf12IriTerm } from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const structuralPayloadPath = join(
	projectRoot,
	"samples/structural-payload.adoc",
);

describe("rdf12 raw value query contract acceptance", () => {
	it("binds heading and xref raw values as named complex properties", async () => {
		const projection = await structuralPayloadProjection();
		const deliveryPolicy = onlyHeadingForAddressLabel(
			projection.graph,
			"delivery",
		);
		const capacityRule = onlyHeadingForAddressLabel(
			projection.graph,
			"capacity",
		);
		const xrefEdge = onlyXrefEdge(projection.graph);
		const policyRiskProfile = onlyObjectIri(
			projection.graph,
			deliveryPolicy,
			fieldPredicate("policy-risk-profile"),
		);
		const relationEvidence = onlyObjectIri(
			projection.graph,
			xrefEdge,
			fieldPredicate("relation-evidence"),
		);

		expectTriple(
			projection.graph,
			deliveryPolicy,
			fieldPredicate("policy-risk-profile"),
			policyRiskProfile,
		);
		expectTriple(
			projection.graph,
			xrefEdge,
			fieldPredicate("relation-evidence"),
			relationEvidence,
		);
		expectNoTriple(
			projection.graph,
			deliveryPolicy,
			fieldPredicate("relation-evidence"),
			relationEvidence,
		);
		expectNoTriple(
			projection.graph,
			capacityRule,
			fieldPredicate("relation-evidence"),
			relationEvidence,
		);
		expectLiteral(
			projection.graph,
			deliveryPolicy,
			"addressLabel",
			"rel-delivery-capacity",
		);
		expectNoLegacyPayloadContract(projection.graph);
	});

	it("projects raw value object facts and keeps raw opaque", async () => {
		const projection = await structuralPayloadProjection();
		const deliveryPolicy = onlyHeadingForAddressLabel(
			projection.graph,
			"delivery",
		);
		const xrefEdge = onlyXrefEdge(projection.graph);
		const policyRiskProfile = onlyObjectIri(
			projection.graph,
			deliveryPolicy,
			fieldPredicate("policy-risk-profile"),
		);
		const relationEvidence = onlyObjectIri(
			projection.graph,
			xrefEdge,
			fieldPredicate("relation-evidence"),
		);

		expectForbiddenRawValueFields(projection.graph, policyRiskProfile);
		expectLiteral(
			projection.graph,
			policyRiskProfile,
			"forSelector",
			"delivery",
		);
		expectLiteral(projection.graph, policyRiskProfile, "format", "json");
		expectLineSpan(projection.graph, policyRiskProfile, 10, 23);
		expectInteger(projection.graph, policyRiskProfile, "contentStartLine", 13);
		expectInteger(projection.graph, policyRiskProfile, "contentEndLine", 22);
		expectLiteral(
			projection.graph,
			policyRiskProfile,
			"raw",
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
		expectForbiddenRawValueFields(projection.graph, relationEvidence);
		expectLiteral(
			projection.graph,
			relationEvidence,
			"sourceValueId",
			"rel-delivery-capacity",
		);
		expectLiteral(projection.graph, relationEvidence, "format", "yaml");
		expectLineSpan(projection.graph, relationEvidence, 25, 37);
		expectInteger(projection.graph, relationEvidence, "contentStartLine", 28);
		expectInteger(projection.graph, relationEvidence, "contentEndLine", 36);
		expectLiteral(
			projection.graph,
			relationEvidence,
			"raw",
			`reason:
  type: risk-control
  signals:
    - weather
    - capacity
  description: 配送策略需要读取运力规则来决定是否降级。
edge:
  direction: outbound
  required: true`,
		);

		for (const predicate of ["owner", "risk", "reason", "edge"].map(aat)) {
			expect(
				projection.graph.match({ subject: policyRiskProfile, predicate }),
			).toHaveLength(0);
			expect(
				projection.graph.match({ subject: relationEvidence, predicate }),
			).toHaveLength(0);
		}
	});

	it("does not make raw value objects into structure or xref target nodes", async () => {
		const projection = await structuralPayloadProjection();
		const deliveryPolicy = onlyHeadingForAddressLabel(
			projection.graph,
			"delivery",
		);
		const xrefEdge = onlyXrefEdge(projection.graph);
		const policyRiskProfile = onlyObjectIri(
			projection.graph,
			deliveryPolicy,
			fieldPredicate("policy-risk-profile"),
		);
		const relationEvidence = onlyObjectIri(
			projection.graph,
			xrefEdge,
			fieldPredicate("relation-evidence"),
		);

		for (const payload of [policyRiskProfile, relationEvidence]) {
			expect(
				projection.graph.has(rdf12Triple(payload, rdf("type"), aat("Heading"))),
			).toBe(false);
			expect(
				projection.graph.match({
					predicate: aat("containsDirectly"),
					object: payload,
				}),
			).toHaveLength(0);
			expect(
				projection.graph.match({
					subject: payload,
					predicate: aat("childOrder"),
				}),
			).toHaveLength(0);
			expect(
				projection.graph.match({
					subject: payload,
					predicate: aat("documentOrder"),
				}),
			).toHaveLength(0);
			expect(
				projection.graph.match({
					predicate: aat("targetHeading"),
					object: payload,
				}),
			).toHaveLength(0);
		}
	});
});

async function structuralPayloadProjection() {
	return projectAbundantDocumentToRdf12(
		await parseAbundantTree({ sourcePath: structuralPayloadPath }),
		{ documentRoot: projectRoot },
	);
}

function onlyHeadingForAddressLabel(
	graph: Rdf12Graph,
	value: string,
): Rdf12IriTerm {
	const headings = graph
		.match({
			predicate: aat("addressLabel"),
			object: stringLiteral(value),
		})
		.map((triple) => triple.subject);

	expect(headings).toHaveLength(1);
	return headings[0] ?? iriTerm("urn:missing-heading");
}

function onlyXrefEdge(graph: Rdf12Graph): Rdf12IriTerm {
	const edges = graph
		.match({
			predicate: rdf("type"),
			object: aat("XrefEdge"),
		})
		.map((triple) => triple.subject);

	expect(edges).toHaveLength(1);
	return edges[0] ?? iriTerm("urn:missing-xref-edge");
}

function onlyObjectIri(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: string | Rdf12IriTerm,
): Rdf12IriTerm {
	const objects = graph
		.match({
			subject,
			predicate: predicateTerm(predicate),
		})
		.map((triple) => triple.object)
		.filter((object): object is Rdf12IriTerm => object.termType === "iri");

	expect(objects).toHaveLength(1);
	return objects[0] ?? iriTerm("urn:missing-object");
}

function expectNoLegacyPayloadContract(graph: Rdf12Graph): void {
	expect(
		graph.match({
			predicate: rdf("type"),
			object: aat("PayloadBlock"),
		}),
	).toHaveLength(0);
	expect(graph.match({ predicate: aat("hasPayload") })).toHaveLength(0);
	expect(graph.match({ predicate: aat("payloadOf") })).toHaveLength(0);
	expect(graph.match({ predicate: fieldPredicate("payload") })).toHaveLength(0);
	expect(graph.match({ predicate: aat("payloadSelector") })).toHaveLength(0);
}

function expectTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: string | Rdf12IriTerm,
	object: Rdf12IriTerm,
): void {
	expect(
		graph.has(rdf12Triple(subject, predicateTerm(predicate), object)),
	).toBe(true);
}

function expectNoTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: string | Rdf12IriTerm,
	object: Rdf12IriTerm,
): void {
	expect(
		graph.has(rdf12Triple(subject, predicateTerm(predicate), object)),
	).toBe(false);
}

function expectLiteral(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: string | Rdf12IriTerm,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(subject, predicateTerm(predicate), stringLiteral(value)),
		),
	).toBe(true);
}

function expectForbiddenRawValueFields(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
): void {
	for (const predicate of ["payloadKind", "role", "payloadId"].map(aat)) {
		expect(graph.match({ subject, predicate })).toHaveLength(0);
	}
	expect(
		graph.has(rdf12Triple(subject, rdf("type"), aat("PayloadBlock"))),
	).toBe(false);
}

function expectLineSpan(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	startLine: number,
	endLine: number,
): void {
	expectInteger(graph, subject, "startLine", startLine);
	expectInteger(graph, subject, "endLine", endLine);
	expectLiteral(
		graph,
		subject,
		"relativePath",
		"samples/structural-payload.adoc",
	);
}

function expectInteger(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: string | Rdf12IriTerm,
	value: number,
): void {
	expect(
		graph.has(
			rdf12Triple(subject, predicateTerm(predicate), integerLiteral(value)),
		),
	).toBe(true);
}

function aat(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.aat}${localName}`);
}

function rdf(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.rdf}${localName}`);
}

// 字符串是投影器词表（aat:）里的名字；书的字段由调用处用 fieldPredicate 给出完整的谓词。
function predicateTerm(predicate: string | Rdf12IriTerm): Rdf12IriTerm {
	return typeof predicate === "string"
		? iriTerm(`${namespaces.aat}${predicate}`)
		: predicate;
}
