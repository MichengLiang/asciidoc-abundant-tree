import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument, AbundantNode } from "../../src/model";
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
