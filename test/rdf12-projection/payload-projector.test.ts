import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	AbundantDocument,
	ListingNode,
	XrefOccurrenceNode,
} from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm, type Rdf12IriTerm } from "../../src/rdf12-projection/terms";
import { writeFixture } from "../helpers";

const projectRoot = process.cwd();
const sourcePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 payload projection", () => {
	it("projects no-id node payloads from for selectors and connects the heading", () => {
		const projection = projectAbundantDocumentToRdf12(
			nodePayloadDocument({
				attributes: { for: "delivery" },
				role: "banana",
				language: "json",
			}),
			{ documentRoot: projectRoot },
		);
		const headingIri = heading(projection.documentIri, "heading-l1-o0");
		const payload = onlyPayloadForOwner(projection.graph, headingIri);

		expectLiteral(projection.graph, payload, "payloadKind", "node");
		expectLiteral(projection.graph, payload, "role", "banana");
		expectLiteral(projection.graph, payload, "forSelector", "delivery");
		expectLiteral(projection.graph, payload, "format", "json");
		expectLiteral(projection.graph, payload, "raw", '{"owner":"ops"}');
		expectLineSpan(projection.graph, payload, 4, 8);
		expectInteger(projection.graph, payload, "contentStartLine", 7);
		expectInteger(projection.graph, payload, "contentEndLine", 7);
		expectNoLiteralPredicate(projection.graph, payload, "payloadId");
		expectNoLegacyPayloadContract(projection.graph);
	});

	it("binds no-value for markers by source owner without writing an empty selector", () => {
		const path = writeFixture(
			"rdf12-no-value-for-payload.adoc",
			`= Probe

[#delivery]
== Delivery

[.banana, for]
[source,json]
----
{"owner":"ops"}
----
`,
		);
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({ sourcePath: path }),
			{ documentRoot: projectRoot },
		);
		const [headingIri] = projection.labelCatalog.owners("delivery");
		const payload = onlyPayloadForOwner(
			projection.graph,
			headingIri ?? iriTerm("urn:missing-heading"),
		);

		expectLiteral(projection.graph, payload, "payloadKind", "node");
		expectLiteral(projection.graph, payload, "role", "banana");
		expectLiteral(projection.graph, payload, "format", "json");
		expect(
			projection.graph.match({
				subject: payload,
				predicate: aat("forSelector"),
			}),
		).toHaveLength(0);
		expectNoLiteralPredicate(projection.graph, payload, "payloadId");
	});

	it("keeps unresolved and ambiguous node payload selectors unconnected", () => {
		const unresolved = projectAbundantDocumentToRdf12(
			nodePayloadDocument({
				attributes: { forSelector: "missing" },
				role: "banana",
			}),
			{ documentRoot: projectRoot },
		);
		const unresolvedPayload = onlyPayloadByKind(unresolved.graph, "node");
		expectLiteral(
			unresolved.graph,
			unresolvedPayload,
			"forSelector",
			"missing",
		);
		expectNoPayloadOwner(unresolved.graph, unresolvedPayload);

		const ambiguous = projectAbundantDocumentToRdf12(
			ambiguousNodePayloadDocument(),
			{ documentRoot: projectRoot },
		);
		const ambiguousPayload = onlyPayloadByKind(ambiguous.graph, "node");
		expectLiteral(
			ambiguous.graph,
			ambiguousPayload,
			"forSelector",
			"duplicate",
		);
		expectNoPayloadOwner(ambiguous.graph, ambiguousPayload);
	});

	it("does not treat role-only or source-only listings as node payloads", () => {
		for (const document of [
			roleOnlyListingDocument(),
			sourceOnlyListingDocument(),
		]) {
			const projection = projectAbundantDocumentToRdf12(document, {
				documentRoot: projectRoot,
			});

			expect(
				projection.graph.match({ predicate: aat("payloadKind") }),
			).toHaveLength(0);
			expect(
				projection.graph.match({ predicate: aat("payload") }),
			).toHaveLength(0);
		}
	});

	it("projects edge payloads from xref payload selectors and source payload ids", () => {
		const projection = projectAbundantDocumentToRdf12(edgePayloadDocument(), {
			documentRoot: projectRoot,
		});
		const edge = onlyResourceOfType(projection.graph, "XrefEdge");
		const payload = onlyPayloadForOwner(projection.graph, edge);

		expectLiteral(projection.graph, payload, "payloadKind", "edge");
		expectLiteral(projection.graph, payload, "payloadId", "rel-delivery");
		expectLiteral(projection.graph, payload, "role", "pear");
		expectLiteral(projection.graph, payload, "format", "yaml");
		expectLiteral(projection.graph, payload, "raw", "reason: risk-control");
		expectLineSpan(projection.graph, payload, 8, 12);
		expectNoTriple(
			projection.graph,
			heading(projection.documentIri, "heading-l1-o0"),
			"payload",
			payload,
		);
		expectNoTriple(
			projection.graph,
			heading(projection.documentIri, "heading-l5-o0"),
			"payload",
			payload,
		);
	});

	it("emits all source payload ids when an edge selector matches one alias", () => {
		const projection = projectAbundantDocumentToRdf12(
			edgePayloadDocument({
				payloadIds: ["primary", "alias"],
				payloadSelector: "alias",
			}),
			{ documentRoot: projectRoot },
		);
		const payload = onlyPayloadByKind(projection.graph, "edge");

		expectLiteral(projection.graph, payload, "payloadId", "primary");
		expectLiteral(projection.graph, payload, "payloadId", "alias");
		expectTriple(
			projection.graph,
			onlyResourceOfType(projection.graph, "XrefEdge"),
			"payload",
			payload,
		);
	});

	it("deduplicates repeated source payload ids on the same edge payload object", () => {
		const projection = projectAbundantDocumentToRdf12(
			edgePayloadDocument({
				payloadIds: ["rel-delivery", "rel-delivery"],
				payloadSelector: "rel-delivery",
			}),
			{ documentRoot: projectRoot },
		);
		const payload = onlyPayloadByKind(projection.graph, "edge");

		expectTriple(
			projection.graph,
			onlyResourceOfType(projection.graph, "XrefEdge"),
			"payload",
			payload,
		);
	});

	it("does not connect unmatched or ambiguous edge payload selectors", () => {
		const unmatched = projectAbundantDocumentToRdf12(
			edgePayloadDocument({
				payloadIds: ["other"],
				payloadSelector: "missing",
			}),
			{ documentRoot: projectRoot },
		);
		const unmatchedEdge = onlyResourceOfType(unmatched.graph, "XrefEdge");
		expect(
			unmatched.graph.match({
				subject: unmatchedEdge,
				predicate: aat("payload"),
			}),
		).toHaveLength(0);

		const ambiguous = projectAbundantDocumentToRdf12(
			ambiguousEdgePayloadDocument(),
			{
				documentRoot: projectRoot,
			},
		);
		const ambiguousEdge = onlyResourceOfType(ambiguous.graph, "XrefEdge");
		expect(
			ambiguous.graph.match({
				subject: ambiguousEdge,
				predicate: aat("payload"),
			}),
		).toHaveLength(0);
	});

	it("derives payload format only from listing language", () => {
		const projection = projectAbundantDocumentToRdf12(
			nodePayloadDocument({
				attributes: { for: "delivery", data: "toml" },
				role: "banana",
				language: "yaml",
				content: "enabled: true",
			}),
			{ documentRoot: projectRoot },
		);
		const payload = onlyPayloadByKind(projection.graph, "node");

		expectLiteral(projection.graph, payload, "format", "yaml");
		expect(
			projection.graph.has(
				rdf12Triple(payload, aat("format"), stringLiteral("toml")),
			),
		).toBe(false);
	});
});

function nodePayloadDocument(input: {
	readonly attributes: Record<string, string | boolean>;
	readonly role?: string;
	readonly language?: string;
	readonly content?: string;
}): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			sectionNode(1, "delivery", "Delivery", [
				payloadListing({
					startLine: 4,
					contentLine: 7,
					content: input.content ?? '{"owner":"ops"}',
					attributes: input.attributes,
					...(input.role !== undefined ? { role: input.role } : {}),
					...(input.language !== undefined ? { language: input.language } : {}),
				}),
			]),
		],
	};
}

function ambiguousNodePayloadDocument(): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			sectionNode(1, "duplicate", "First"),
			sectionNode(4, "duplicate", "Second"),
			payloadListing({
				startLine: 8,
				contentLine: 11,
				content: '{"ambiguous":true}',
				attributes: { for: "duplicate" },
				role: "banana",
			}),
		],
	};
}

function roleOnlyListingDocument(): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			sectionNode(1, "delivery", "Delivery", [
				payloadListing({
					startLine: 4,
					contentLine: 7,
					content: '{"roleOnly":true}',
					attributes: {},
					role: "banana",
				}),
			]),
		],
	};
}

function sourceOnlyListingDocument(): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			sectionNode(1, "delivery", "Delivery", [
				payloadListing({
					startLine: 4,
					contentLine: 7,
					content: '{"sourceOnly":true}',
					attributes: {},
					language: "json",
				}),
			]),
		],
	};
}

function edgePayloadDocument(
	input: {
		readonly payloadSelector?: string;
		readonly payloadIds?: readonly string[];
	} = {},
): AbundantDocument {
	const payloadSelector = input.payloadSelector ?? "rel-delivery";
	const payloadIds = input.payloadIds ?? ["rel-delivery"];
	const xref = xrefNode(payloadSelector);

	return {
		...baseDocument(),
		children: [
			sectionNode(1, "delivery", "Delivery", [
				{
					kind: "paragraph",
					text: "See capacity.",
					source: { span: { startLine: 4, endLine: 4 } },
					children: [xref],
				},
				payloadListing({
					id: payloadIds,
					startLine: 8,
					contentLine: 11,
					content: "reason: risk-control",
					attributes: {},
					role: "pear",
					language: "yaml",
				}),
			]),
			sectionNode(5, "capacity", "Capacity"),
		],
		xrefOccurrences: [xref],
	};
}

function ambiguousEdgePayloadDocument(): AbundantDocument {
	const xref = xrefNode("rel-delivery");

	return {
		...baseDocument(),
		children: [
			sectionNode(1, "delivery", "Delivery", [
				{
					kind: "paragraph",
					text: "See capacity.",
					source: { span: { startLine: 4, endLine: 4 } },
					children: [xref],
				},
				payloadListing({
					id: "rel-delivery",
					startLine: 8,
					contentLine: 11,
					content: "first: true",
					attributes: {},
					role: "pear",
					language: "yaml",
				}),
				payloadListing({
					id: "rel-delivery",
					startLine: 14,
					contentLine: 17,
					content: "second: true",
					attributes: {},
					role: "pear",
					language: "yaml",
				}),
			]),
			sectionNode(5, "capacity", "Capacity"),
		],
		xrefOccurrences: [xref],
	};
}

function baseDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath,
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
}

function sectionNode(
	startLine: number,
	id: string,
	title: string,
	children: AbundantDocument["children"] = [],
): AbundantDocument["children"][number] {
	return {
		kind: "section",
		level: 1,
		ids: [id],
		title,
		idOrigin: "source",
		span: { startLine, endLine: startLine + 1 },
		metadata: [
			{
				kind: "metadata",
				metadataKind: "id",
				raw: `[#${id}]`,
				line: startLine,
				ids: [id],
			},
		],
		titleSpan: {
			start: { line: startLine, column: 4 },
			end: { line: startLine, column: 4 + title.length },
		},
		children,
	};
}

function payloadListing(input: {
	readonly id?: string | readonly string[];
	readonly startLine: number;
	readonly contentLine: number;
	readonly content: string;
	readonly attributes: Record<string, string | boolean>;
	readonly role?: string;
	readonly language?: string;
}): ListingNode {
	const ids =
		input.id === undefined
			? []
			: typeof input.id === "string"
				? [input.id]
				: [...input.id];
	const rolePart = input.role === undefined ? "" : `.${input.role}`;

	return {
		kind: "listing",
		ids,
		style: "source",
		language: input.language ?? "json",
		span: { startLine: input.startLine, endLine: input.startLine + 4 },
		metadataSpan: { startLine: input.startLine, endLine: input.startLine + 2 },
		contentSpan: {
			startLine: input.contentLine,
			endLine: input.contentLine,
		},
		content: input.content,
		metadata: [
			...(ids.length === 0
				? []
				: [
						{
							kind: "metadata" as const,
							metadataKind: "id" as const,
							raw: `[#${ids.join(".")}]`,
							line: input.startLine,
							ids,
						},
					]),
			{
				kind: "metadata",
				metadataKind: "attrlist",
				raw: `[source${rolePart}]`,
				line: input.startLine + 1,
				roles: input.role === undefined ? [] : [input.role],
				attributes: input.attributes,
			},
		],
	};
}

function xrefNode(payloadSelector: string): XrefOccurrenceNode {
	return {
		kind: "xref",
		syntax: "macro",
		raw: `xref:capacity[Capacity, rel=depends-on, payload=${payloadSelector}]`,
		target: "capacity",
		label: "Capacity",
		attributes: {
			rel: "depends-on",
			payload: payloadSelector,
		},
		containingSectionId: "delivery",
		sourceSpan: {
			start: { line: 4, column: 1 },
			end: { line: 4, column: 60 },
		},
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
	const resources = graph
		.match({
			predicate: rdf("type"),
			object: aat(typeLocalName),
		})
		.map((triple) => triple.subject);

	expect(resources).toHaveLength(1);
	return resources[0] ?? iriTerm("urn:missing-resource");
}

function onlyPayloadForOwner(
	graph: Rdf12Graph,
	owner: Rdf12IriTerm,
): Rdf12IriTerm {
	const payloads = graph
		.match({
			subject: owner,
			predicate: aat("payload"),
		})
		.map((triple) => triple.object)
		.filter((object): object is Rdf12IriTerm => object.termType === "iri");

	expect(payloads).toHaveLength(1);
	return payloads[0] ?? iriTerm("urn:missing-payload");
}

function onlyPayloadByKind(
	graph: Rdf12Graph,
	kind: "node" | "edge",
): Rdf12IriTerm {
	const payloads = graph
		.match({
			predicate: aat("payloadKind"),
			object: stringLiteral(kind),
		})
		.map((triple) => triple.subject);

	expect(payloads).toHaveLength(1);
	return payloads[0] ?? iriTerm("urn:missing-payload");
}

function expectNoPayloadOwner(graph: Rdf12Graph, payload: Rdf12IriTerm): void {
	expect(
		graph.match({
			predicate: aat("payload"),
			object: payload,
		}),
	).toHaveLength(0);
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

function expectNoLiteralPredicate(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
): void {
	expect(
		graph.match({
			subject,
			predicate: aat(predicateLocalName),
		}),
	).toHaveLength(0);
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
