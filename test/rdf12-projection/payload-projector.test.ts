import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument, ListingNode } from "../../src/model";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm, type Rdf12IriTerm } from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const sourcePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 payload projection", () => {
	it("projects payload blocks as opaque complex property objects", () => {
		const projection = projectAbundantDocumentToRdf12(payloadDocument(), {
			documentRoot: projectRoot,
		});
		const payload = onlyPayloadById(projection.graph, "rel-delivery-capacity");

		expectLiteral(projection.graph, payload, "payloadKind", "edge");
		expectLiteral(projection.graph, payload, "format", "json");
		expectLiteral(
			projection.graph,
			payload,
			"raw",
			'{"reason":"risk-control"}',
		);
		expectLineSpan(projection.graph, payload, 8, 12);
		expectInteger(projection.graph, payload, "contentStartLine", 11);
		expectInteger(projection.graph, payload, "contentEndLine", 11);
		expect(payload.value).not.toContain("rel-delivery-capacity");
		expectNoLegacyPayloadContract(projection.graph);
	});

	it("does not parse payload raw fields into RDF triples", () => {
		const projection = projectAbundantDocumentToRdf12(payloadDocument(), {
			documentRoot: projectRoot,
		});
		const payload = onlyPayloadById(projection.graph, "rel-delivery-capacity");

		expect(projection.graph.match({ predicate: aat("reason") })).toHaveLength(
			0,
		);
		expect(
			projection.graph.has(
				rdf12Triple(payload, aat("reason"), stringLiteral("risk-control")),
			),
		).toBe(false);
	});

	it("binds node payloads only when forSelector resolves uniquely", () => {
		const projection = projectAbundantDocumentToRdf12(payloadDocument(), {
			documentRoot: projectRoot,
		});
		const payload = onlyPayloadById(projection.graph, "policy-payload");
		const sourceHeading = heading(projection.documentIri, "heading-l1-o0");

		expectLiteral(projection.graph, payload, "payloadKind", "node");
		expectLiteral(projection.graph, payload, "forSelector", "delivery-policy");
		expectTriple(projection.graph, sourceHeading, "payload", payload);
		expectNoLegacyPayloadContract(projection.graph);
	});

	it("binds xref payload selectors only to xref edge evidence", () => {
		const projection = projectAbundantDocumentToRdf12(payloadDocument(), {
			documentRoot: projectRoot,
		});
		const edge = onlyResourceOfType(projection.graph, "XrefEdge");
		const payload = onlyPayloadById(projection.graph, "rel-delivery-capacity");
		const sourceHeading = heading(projection.documentIri, "heading-l1-o0");
		const targetHeading = heading(projection.documentIri, "heading-l5-o0");

		expectTriple(projection.graph, edge, "payload", payload);
		expectNoTriple(projection.graph, sourceHeading, "payload", payload);
		expectNoTriple(projection.graph, targetHeading, "payload", payload);
	});

	it("does not create fake bindings for unbound payload selectors", () => {
		const projection = projectAbundantDocumentToRdf12(
			unboundPayloadDocument(),
			{ documentRoot: projectRoot },
		);
		const payload = onlyPayloadById(projection.graph, "orphan-payload");

		expectLiteral(projection.graph, payload, "forSelector", "missing-node");
		expect(
			projection.graph.match({
				predicate: aat("payload"),
				object: payload,
			}),
		).toHaveLength(0);
		expectNoLegacyPayloadContract(projection.graph);
	});

	it("does not create fake bindings for ambiguous node payload selectors", () => {
		const projection = projectAbundantDocumentToRdf12(
			ambiguousNodePayloadDocument(),
			{ documentRoot: projectRoot },
		);
		const payload = onlyPayloadById(projection.graph, "ambiguous-payload");

		expectLiteral(projection.graph, payload, "forSelector", "duplicate");
		expect(
			projection.graph.match({
				predicate: aat("payload"),
				object: payload,
			}),
		).toHaveLength(0);
	});

	it("ignores payload-role listings without a source span", () => {
		const projection = projectAbundantDocumentToRdf12(
			payloadListingWithoutSpanDocument(),
			{ documentRoot: projectRoot },
		);

		expect(
			projection.graph.match({ predicate: aat("payloadId") }),
		).toHaveLength(0);
		expectNoLegacyPayloadContract(projection.graph);
	});

	it("requires a payload id before projecting node payload objects", () => {
		const projection = projectAbundantDocumentToRdf12(
			noIdNodePayloadDocument(),
			{ documentRoot: projectRoot },
		);
		const sourceHeading = heading(projection.documentIri, "heading-l1-o0");

		expect(
			projection.graph.match({ predicate: aat("payloadId") }),
		).toHaveLength(0);
		expect(
			projection.graph.match({ predicate: aat("payloadKind") }),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				subject: sourceHeading,
				predicate: aat("payload"),
			}),
		).toHaveLength(0);
		expectNoLegacyPayloadContract(projection.graph);
	});

	it("requires a payload id before projecting xref payload objects", () => {
		const projection = projectAbundantDocumentToRdf12(
			noIdXrefPayloadDocument(),
			{ documentRoot: projectRoot },
		);
		const edge = onlyResourceOfType(projection.graph, "XrefEdge");

		expect(
			projection.graph.match({ predicate: aat("payloadId") }),
		).toHaveLength(0);
		expect(
			projection.graph.match({ predicate: aat("payloadKind") }),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				subject: edge,
				predicate: aat("payload"),
			}),
		).toHaveLength(0);
		expectNoLegacyPayloadContract(projection.graph);
	});

	it("does not create fake xref payload bindings for ambiguous payload selectors", () => {
		const projection = projectAbundantDocumentToRdf12(
			ambiguousXrefPayloadDocument(),
			{ documentRoot: projectRoot },
		);
		const edge = onlyResourceOfType(projection.graph, "XrefEdge");

		expect(
			projection.graph.match({
				subject: edge,
				predicate: aat("payload"),
			}),
		).toHaveLength(0);
	});

	it("uses listing language as payload format when no data attribute exists", () => {
		const projection = projectAbundantDocumentToRdf12(
			languageFallbackPayloadDocument(),
			{ documentRoot: projectRoot },
		);
		const payload = onlyPayloadById(projection.graph, "language-payload");

		expectLiteral(projection.graph, payload, "format", "yaml");
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

function ambiguousNodePayloadDocument(): AbundantDocument {
	return {
		...payloadDocument(),
		children: [
			sectionNode(1, "duplicate", "First"),
			sectionNode(4, "duplicate", "Second"),
			payloadListing({
				id: "ambiguous-payload",
				role: "payload",
				startLine: 8,
				contentLine: 11,
				sourceText: '{"ambiguous":true}',
				attributes: {
					forSelector: "duplicate",
				},
			}),
		],
		xrefOccurrences: [],
	};
}

function payloadListingWithoutSpanDocument(): AbundantDocument {
	const { span: _span, ...listingWithoutSpan } = payloadListing({
		id: "spanless-payload",
		role: "payload",
		startLine: 30,
		contentLine: 33,
		sourceText: '{"span":false}',
		attributes: {
			forSelector: "delivery-policy",
		},
	});

	return {
		...payloadDocument(),
		children: [listingWithoutSpan],
		xrefOccurrences: [],
	};
}

function noIdNodePayloadDocument(): AbundantDocument {
	return {
		...payloadDocument(),
		children: [
			sectionNode(1, "delivery-policy", "Delivery Policy"),
			payloadListing({
				role: "payload",
				startLine: 20,
				contentLine: 23,
				sourceText: '{"node":true}',
				attributes: {
					forSelector: "delivery-policy",
				},
			}),
		],
		xrefOccurrences: [],
	};
}

function noIdXrefPayloadDocument(): AbundantDocument {
	const base = payloadDocument();
	return {
		...base,
		children: [
			sectionNode(1, "delivery-policy", "Delivery Policy", [
				{
					kind: "paragraph",
					text: "See delivery capacity.",
					source: { span: { startLine: 4, endLine: 4 } },
					children: base.xrefOccurrences,
				},
			]),
			sectionNode(5, "delivery-capacity", "Delivery Capacity"),
			payloadListing({
				role: "xref-payload",
				startLine: 30,
				contentLine: 33,
				sourceText: '{"edge":true}',
				attributes: {
					data: "json",
				},
			}),
		],
	};
}

function ambiguousXrefPayloadDocument(): AbundantDocument {
	const base = payloadDocument();
	return {
		...base,
		children: [
			...base.children,
			payloadListing({
				id: "rel-delivery-capacity",
				role: "xref-payload",
				startLine: 30,
				contentLine: 33,
				sourceText: '{"duplicate":true}',
				attributes: {
					data: "json",
				},
			}),
		],
	};
}

function languageFallbackPayloadDocument(): AbundantDocument {
	return {
		...payloadDocument(),
		children: [
			{
				...payloadListing({
					id: "language-payload",
					role: "payload",
					startLine: 40,
					contentLine: 43,
					sourceText: "enabled: true",
					attributes: {},
				}),
				language: "yaml",
			},
		],
		xrefOccurrences: [],
	};
}

function sectionNode(
	startLine: number,
	id: string,
	title: string,
	children: NonNullable<AbundantDocument["children"][number]["children"]> = [],
): AbundantDocument["children"][number] {
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
	readonly id?: string;
	readonly role: "payload" | "xref-payload";
	readonly startLine: number;
	readonly contentLine: number;
	readonly sourceText: string;
	readonly attributes: Record<string, string>;
}): ListingNode {
	return {
		kind: "listing",
		ids: input.id === undefined ? [] : [input.id],
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
			...(input.id === undefined
				? []
				: [
						{
							kind: "metadata" as const,
							metadataKind: "id" as const,
							raw: `[#${input.id}]`,
							line: input.startLine,
							ids: [input.id],
						},
					]),
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

function heading(documentIri: string, localId: string): Rdf12IriTerm {
	return iriTerm(
		`${documentIri.slice(0, documentIri.indexOf("#"))}#${localId}`,
	);
}

function onlyResourceOfType(
	graph: Rdf12Graph,
	typeLocalName: string,
): Rdf12IriTerm {
	const [resource] = graph
		.match({
			predicate: rdf("type"),
			object: aat(typeLocalName),
		})
		.map((triple) => triple.subject);
	if (resource === undefined) {
		throw new Error(`expected resource of type ${typeLocalName}`);
	}
	return resource;
}

function onlyPayloadById(graph: Rdf12Graph, payloadId: string): Rdf12IriTerm {
	const payloads = graph
		.match({
			predicate: aat("payloadId"),
			object: stringLiteral(payloadId),
		})
		.map((triple) => triple.subject);

	expect(payloads).toHaveLength(1);
	return payloads[0] ?? iriTerm("urn:missing-payload");
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
}

function expectTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	object: Rdf12IriTerm,
): void {
	expect(graph.has(rdf12Triple(subject, aat(predicateLocalName), object))).toBe(
		true,
	);
}

function expectNoTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	object: Rdf12IriTerm,
): void {
	expect(graph.has(rdf12Triple(subject, aat(predicateLocalName), object))).toBe(
		false,
	);
}

function expectLiteral(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(subject, aat(predicateLocalName), stringLiteral(value)),
		),
	).toBe(true);
}

function expectLineSpan(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	startLine: number,
	endLine: number,
): void {
	expectInteger(graph, subject, "startLine", startLine);
	expectInteger(graph, subject, "endLine", endLine);
	expectLiteral(graph, subject, "relativePath", "samples/reference-links.adoc");
}

function expectInteger(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: number,
): void {
	expect(
		graph.has(
			rdf12Triple(subject, aat(predicateLocalName), integerLiteral(value)),
		),
	).toBe(true);
}

function aat(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.aat}${localName}`);
}

function rdf(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.rdf}${localName}`);
}
