import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument, AbundantNode } from "../../src/model";
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
const sourcePath = join(projectRoot, "samples/reference-links.adoc");
const structuralPayloadPath = join(
	projectRoot,
	"samples/structural-payload.adoc",
);

describe("rdf12 payload query contract acceptance", () => {
	it("answers payload block queries with opaque source text and complete spans", () => {
		const projection = projectAbundantDocumentToRdf12(payloadDocument(), {
			documentRoot: projectRoot,
		});
		const payload = payloadBySourceText(
			projection.graph,
			'{"reason":"risk-control"}',
		);

		expect(payload).toBeDefined();
		expectStringTriple(projection.graph, payload ?? "", "payloadKind", "xref");
		expectStringTriple(projection.graph, payload ?? "", "dataFormat", "json");
		expectStringTriple(
			projection.graph,
			payload ?? "",
			"sourceText",
			'{"reason":"risk-control"}',
		);
		expectLineSpan(projection.graph, payload ?? "", 8, 12);
		expectIntegerTriple(
			projection.graph,
			payload ?? "",
			"contentStartLine",
			11,
		);
		expectIntegerTriple(projection.graph, payload ?? "", "contentEndLine", 11);
		expect(
			projection.graph.toArray().some((triple) => {
				return (
					triple.predicate.value.includes("reason") ||
					triple.object.value === "risk-control"
				);
			}),
		).toBe(false);
	});

	it("binds node and xref payloads without creating fake bindings", () => {
		const projection = projectAbundantDocumentToRdf12(payloadDocument(), {
			documentRoot: projectRoot,
		});
		const nodePayload = payloadBySourceText(
			projection.graph,
			'{"policy":"active"}',
		);
		const xrefPayload = payloadBySourceText(
			projection.graph,
			'{"reason":"risk-control"}',
		);
		const sourceSection = resourceIri(projection.documentIri, "section-l1-o0");
		const targetSection = resourceIri(projection.documentIri, "section-l5-o0");
		const xref = resourceOfType(
			projection.graph,
			`${namespaces.aat}XrefOccurrence`,
		);

		expectHasPayload(projection.graph, sourceSection, nodePayload ?? "");
		expectPayloadOf(projection.graph, nodePayload ?? "", sourceSection);
		expectHasPayload(projection.graph, xref, xrefPayload ?? "");
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(sourceSection),
					iriTerm(`${namespaces.aat}hasPayload`),
					iriTerm(xrefPayload ?? ""),
				),
			),
		).toBe(false);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(targetSection),
					iriTerm(`${namespaces.aat}hasPayload`),
					iriTerm(xrefPayload ?? ""),
				),
			),
		).toBe(false);
	});

	it("leaves unbound payload selectors available without synthetic relations", () => {
		const projection = projectAbundantDocumentToRdf12(
			unboundPayloadDocument(),
			{
				documentRoot: projectRoot,
			},
		);
		const payload = resourceOfType(
			projection.graph,
			`${namespaces.aat}PayloadBlock`,
		);

		expectStringTriple(
			projection.graph,
			payload,
			"forSelector",
			"missing-node",
		);
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.aat}hasPayload`),
				object: iriTerm(payload),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				subject: iriTerm(payload),
				predicate: iriTerm(`${namespaces.aat}payloadOf`),
			}),
		).toHaveLength(0);
	});

	it("projects the structural payload sample according to the line projection contract", () => {
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({ sourcePath: structuralPayloadPath }),
			{ documentRoot: projectRoot },
		);
		const deliveryPolicy = ownerForAddressLabel(
			projection.graph,
			"delivery-policy",
		);
		const capacityRule = ownerForAddressLabel(
			projection.graph,
			"capacity-rule",
		);
		const nodePayload = payloadBySourceText(
			projection.graph,
			'{\n  "owner": {\n    "team": "ops",\n    "fallback": "manual-review"\n  },\n  "risk": {\n    "level": "high",\n    "signals": ["weather", "capacity"]\n  }\n}',
		);
		const xrefPayload = payloadBySourceText(
			projection.graph,
			'{\n  "reason": {\n    "type": "risk-control",\n    "signals": ["weather", "capacity"],\n    "description": "配送策略需要读取运力规则来决定是否降级。"\n  },\n  "edge": {\n    "direction": "outbound",\n    "required": true\n  }\n}',
		);
		const xref = resourceOfType(
			projection.graph,
			`${namespaces.aat}XrefOccurrence`,
		);

		expect(deliveryPolicy).toBeDefined();
		expect(capacityRule).toBeDefined();
		expect(nodePayload).toBeDefined();
		expect(xrefPayload).toBeDefined();
		expectHasAddressLabel(
			projection.graph,
			deliveryPolicy ?? "",
			"delivery-policy",
		);
		expectHasAddressLabel(
			projection.graph,
			capacityRule ?? "",
			"capacity-rule",
		);
		expectAttribute(projection.graph, deliveryPolicy ?? "", "kind", "policy");
		expectAttribute(projection.graph, deliveryPolicy ?? "", "status", "active");
		expectAttribute(projection.graph, deliveryPolicy ?? "", "owner", "ops");
		expectAttribute(projection.graph, capacityRule ?? "", "kind", "rule");
		expectAttribute(projection.graph, xref, "weight", "0.8");
		expectStringTriple(projection.graph, xref, "rawRel", "depends-on");
		expectStringTriple(
			projection.graph,
			xref,
			"payloadSelector",
			"rel-delivery-capacity",
		);
		expectHasPayload(projection.graph, deliveryPolicy ?? "", nodePayload ?? "");
		expectPayloadOf(projection.graph, nodePayload ?? "", deliveryPolicy ?? "");
		expectHasPayload(projection.graph, xref, xrefPayload ?? "");
		expectNoPayload(projection.graph, deliveryPolicy ?? "", xrefPayload ?? "");
		expectNoPayload(projection.graph, capacityRule ?? "", xrefPayload ?? "");
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(deliveryPolicy ?? ""),
					iriTerm(`${namespaces.rel}depends-on`),
					iriTerm(capacityRule ?? ""),
				),
			),
		).toBe(true);
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.aat}name`),
				object: stringLiteral("rel"),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.aat}name`),
				object: stringLiteral("payload"),
			}),
		).toHaveLength(0);
	});
});

function payloadDocument(): AbundantDocument {
	const xref = {
		kind: "xref" as const,
		syntax: "macro" as const,
		raw: "xref:delivery-capacity[Delivery, payload=rel-delivery-capacity]",
		target: "delivery-capacity",
		label: "Delivery",
		attributes: {
			payload: "rel-delivery-capacity",
		},
		containingSectionId: "delivery-policy",
		sourceSpan: {
			start: { line: 4, column: 1 },
			end: { line: 4, column: 64 },
		},
	};

	return {
		kind: "document",
		sourcePath,
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			sectionNode(1, "delivery-policy", "Delivery Policy", [
				{
					kind: "paragraph",
					text: "See delivery capacity.",
					source: { span: { startLine: 4, endLine: 4 } },
					children: [xref],
				},
			]),
			sectionNode(5, "delivery-capacity", "Delivery Capacity"),
			payloadListing({
				id: "policy-payload",
				role: "payload",
				startLine: 14,
				contentLine: 17,
				sourceText: '{"policy":"active"}',
				attributes: {
					forSelector: "delivery-policy",
					data: "json",
				},
			}),
			payloadListing({
				id: "rel-delivery-capacity",
				role: "xref-payload",
				startLine: 8,
				contentLine: 11,
				sourceText: '{"reason":"risk-control"}',
				attributes: {
					data: "json",
				},
			}),
		],
		targets: [],
		xrefOccurrences: [xref],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
}

function unboundPayloadDocument(): AbundantDocument {
	return {
		...payloadDocument(),
		children: [
			payloadListing({
				id: "orphan-payload",
				role: "payload",
				startLine: 20,
				contentLine: 23,
				sourceText: '{"orphan":true}',
				attributes: {
					forSelector: "missing-node",
				},
			}),
		],
		xrefOccurrences: [],
	};
}

function sectionNode(
	startLine: number,
	id: string,
	title: string,
	children: AbundantNode[] = [],
): AbundantNode {
	return {
		kind: "section",
		level: 1,
		ids: [id],
		title,
		idOrigin: "source",
		span: { startLine, endLine: startLine + 1 },
		titleSpan: {
			start: { line: startLine, column: 4 },
			end: { line: startLine, column: 4 + title.length },
		},
		metadata: [
			{
				kind: "metadata",
				metadataKind: "id",
				raw: `[#${id}]`,
				line: startLine,
				ids: [id],
			},
		],
		children,
	};
}

function payloadListing(input: {
	readonly id: string;
	readonly role: "payload" | "xref-payload";
	readonly startLine: number;
	readonly contentLine: number;
	readonly sourceText: string;
	readonly attributes: Record<string, string>;
}): AbundantNode {
	return {
		kind: "listing",
		ids: [input.id],
		style: "source",
		language: "json",
		span: { startLine: input.startLine, endLine: input.startLine + 4 },
		metadataSpan: { startLine: input.startLine, endLine: input.startLine + 2 },
		contentSpan: {
			startLine: input.contentLine,
			endLine: input.contentLine,
		},
		content: input.sourceText,
		metadata: [
			{
				kind: "metadata",
				metadataKind: "id",
				raw: `[#${input.id}]`,
				line: input.startLine,
				ids: [input.id],
			},
			{
				kind: "metadata",
				metadataKind: "attrlist",
				raw: `[source.${input.role}]`,
				line: input.startLine + 1,
				roles: [input.role],
				attributes: input.attributes,
			},
		],
	};
}

function payloadBySourceText(
	graph: Rdf12Graph,
	sourceText: string,
): string | undefined {
	return graph
		.match({
			predicate: iriTerm(`${namespaces.aat}sourceText`),
			object: stringLiteral(sourceText),
		})
		.find((triple) =>
			graph.has(
				rdf12Triple(
					triple.subject,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}PayloadBlock`),
				),
			),
		)?.subject.value;
}

function resourceOfType(graph: Rdf12Graph, typeIri: string): string {
	const [resource] = graph
		.match({
			predicate: iriTerm(`${namespaces.rdf}type`),
			object: iriTerm(typeIri),
		})
		.map((triple) => triple.subject.value);
	if (resource === undefined) {
		throw new Error(`expected resource of type ${typeIri}`);
	}
	return resource;
}

function resourceIri(documentIri: string, localId: string): string {
	return `${documentIri.slice(0, documentIri.indexOf("#"))}#${localId}`;
}

function ownerForAddressLabel(
	graph: Rdf12Graph,
	value: string,
): string | undefined {
	const label = graph
		.match({
			predicate: iriTerm(`${namespaces.rdf}value`),
			object: stringLiteral(value),
		})
		.find((triple) =>
			graph.has(
				rdf12Triple(
					triple.subject,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}AddressLabel`),
				),
			),
		)?.subject;
	if (label === undefined) {
		return undefined;
	}
	return graph
		.match({
			predicate: iriTerm(`${namespaces.aat}hasLabel`),
			object: label,
		})
		.map((triple) => triple.subject.value)[0];
}

function expectHasAddressLabel(
	graph: Rdf12Graph,
	owner: string,
	value: string,
): void {
	expect(ownerForAddressLabel(graph, value)).toBe(owner);
}

function expectAttribute(
	graph: Rdf12Graph,
	owner: string,
	name: string,
	value: string,
): void {
	const attribute = graph
		.match({
			predicate: iriTerm(`${namespaces.aat}name`),
			object: stringLiteral(name),
		})
		.find((triple) =>
			graph.has(
				rdf12Triple(
					ownerTerm(owner),
					iriTerm(`${namespaces.aat}hasAttribute`),
					triple.subject,
				),
			),
		)?.subject.value;

	expect(attribute).toBeDefined();
	expectStringTriple(graph, attribute ?? "", "name", name);
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(attribute ?? ""),
				iriTerm(`${namespaces.rdf}value`),
				stringLiteral(value),
			),
		),
	).toBe(true);
}

function ownerTerm(owner: string) {
	return iriTerm(owner);
}

function expectLineSpan(
	graph: Rdf12Graph,
	subject: string,
	startLine: number,
	endLine: number,
): void {
	expectIntegerTriple(graph, subject, "startLine", startLine);
	expectIntegerTriple(graph, subject, "endLine", endLine);
	expectStringTriple(
		graph,
		subject,
		"relativePath",
		"samples/reference-links.adoc",
	);
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

function expectIntegerTriple(
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

function expectHasPayload(
	graph: Rdf12Graph,
	owner: string,
	payload: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(owner),
				iriTerm(`${namespaces.aat}hasPayload`),
				iriTerm(payload),
			),
		),
	).toBe(true);
}

function expectNoPayload(
	graph: Rdf12Graph,
	owner: string,
	payload: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(owner),
				iriTerm(`${namespaces.aat}hasPayload`),
				iriTerm(payload),
			),
		),
	).toBe(false);
}

function expectPayloadOf(
	graph: Rdf12Graph,
	payload: string,
	owner: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(payload),
				iriTerm(`${namespaces.aat}payloadOf`),
				iriTerm(owner),
			),
		),
	).toBe(true);
}
