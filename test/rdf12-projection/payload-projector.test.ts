import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	AbundantDocument,
	ListingNode,
	MetadataNode,
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

describe("rdf12 complex property projection", () => {
	it("projects selector-bound heading complex properties as field predicates", () => {
		const projection = projectAbundantDocumentToRdf12(
			headingValueDocument({
				attributes: { for: "delivery" },
				roles: ["release-policy-config"],
				language: "json",
			}),
			{ documentRoot: projectRoot },
		);
		const delivery = heading(projection.documentIri, "heading-l1-o0");
		const value = onlyIriObject(
			projection.graph,
			delivery,
			"release-policy-config",
		);

		expectTriple(projection.graph, delivery, "release-policy-config", value);
		expectLiteral(projection.graph, value, "forSelector", "delivery");
		expectLiteral(projection.graph, value, "format", "json");
		expectLiteral(projection.graph, value, "raw", '{"owner":"ops"}');
		expectLineSpan(projection.graph, value, 4, 8);
		expectInteger(projection.graph, value, "contentStartLine", 7);
		expectInteger(projection.graph, value, "contentEndLine", 7);
		expectForbiddenRawValueFields(projection.graph, value);
		expectForbiddenPublicPayloadPredicates(projection.graph);
	});

	it("binds no-value heading markers by source owner without an empty selector", () => {
		const path = writeFixture(
			"rdf12-no-value-for-complex-property.adoc",
			`= Probe

[#delivery]
== Delivery

[.review-playbook, for]
[source,yaml]
----
review_team: quality-ops
----
`,
		);
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({ sourcePath: path }),
			{ documentRoot: projectRoot },
		);
		const [delivery] = projection.labelCatalog.owners("delivery");
		const value = onlyIriObject(
			projection.graph,
			delivery ?? iriTerm("urn:missing-heading"),
			"review-playbook",
		);

		expectLiteral(projection.graph, value, "format", "yaml");
		expectLiteral(projection.graph, value, "raw", "review_team: quality-ops");
		expectNoPredicate(projection.graph, value, "forSelector");
		expectForbiddenRawValueFields(projection.graph, value);
	});

	it("keeps marker absence, empty selector, and source ownership distinct", () => {
		const absent = projectAbundantDocumentToRdf12(
			headingValueDocument({
				attributes: {},
				roles: ["review-playbook"],
			}),
			{ documentRoot: projectRoot },
		);
		expect(
			absent.graph.match({ predicate: aat("review-playbook") }),
		).toHaveLength(0);

		const emptySelector = projectAbundantDocumentToRdf12(
			headingValueDocument({
				attributes: { for: "" },
				roles: ["review-playbook"],
			}),
			{ documentRoot: projectRoot },
		);
		const delivery = heading(emptySelector.documentIri, "heading-l1-o0");
		const value = onlyIriObject(
			emptySelector.graph,
			delivery,
			"review-playbook",
		);
		expectNoPredicate(emptySelector.graph, value, "forSelector");

		const explicitOwner = projectAbundantDocumentToRdf12(
			headingValueDocument({
				attributes: { for: true },
				roles: ["review-playbook"],
			}),
			{ documentRoot: projectRoot },
		);
		const ownerValue = onlyIriObject(
			explicitOwner.graph,
			heading(explicitOwner.documentIri, "heading-l1-o0"),
			"review-playbook",
		);
		expectNoPredicate(explicitOwner.graph, ownerValue, "forSelector");
	});

	it("does not project invalid heading complex property candidates", () => {
		for (const document of [
			headingValueDocument({
				attributes: {},
				roles: ["role-only"],
			}),
			headingValueDocument({
				attributes: {},
				roles: [],
			}),
			headingValueDocument({
				attributes: { for: "delivery" },
				roles: [],
			}),
			headingValueDocument({
				attributes: { for: "delivery" },
				roles: ["first", "second"],
			}),
			headingValueDocument({
				attributes: { for: "missing" },
				roles: ["release-policy-config"],
			}),
			ambiguousHeadingValueDocument(),
		]) {
			const projection = projectAbundantDocumentToRdf12(document, {
				documentRoot: projectRoot,
			});

			expect(projection.graph.match({ predicate: aat("first") })).toHaveLength(
				0,
			);
			expect(projection.graph.match({ predicate: aat("second") })).toHaveLength(
				0,
			);
			expect(
				projection.graph.match({ predicate: aat("release-policy-config") }),
			).toHaveLength(0);
			expect(
				projection.graph.match({ predicate: aat("review-playbook") }),
			).toHaveLength(0);
		}
	});

	it("projects xref edge complex properties from named attributes bound to source value ids", () => {
		const projection = projectAbundantDocumentToRdf12(edgeValueDocument(), {
			documentRoot: projectRoot,
		});
		const edge = onlyResourceOfType(projection.graph, "XrefEdge");
		const value = onlyIriObject(projection.graph, edge, "dependency-evidence");

		expectTriple(projection.graph, edge, "dependency-evidence", value);
		expectLiteral(projection.graph, value, "sourceValueId", "rel-delivery");
		expectLiteral(projection.graph, value, "format", "yaml");
		expectLiteral(projection.graph, value, "raw", "reason: risk-control");
		expectLineSpan(projection.graph, value, 8, 12);
		expectInteger(projection.graph, value, "contentStartLine", 11);
		expectInteger(projection.graph, value, "contentEndLine", 11);
		expectForbiddenRawValueFields(projection.graph, value);
		expectNoPredicate(projection.graph, edge, "payload");
		expectNoPredicate(projection.graph, edge, "payloadSelector");
	});

	it("falls back to xref literal fields for unmatched and ambiguous source value ids", () => {
		const unmatched = projectAbundantDocumentToRdf12(
			edgeValueDocument({
				attributes: {
					"dependency-evidence": "missing-source-value",
					weight: "0.8",
				},
			}),
			{ documentRoot: projectRoot },
		);
		const unmatchedEdge = onlyResourceOfType(unmatched.graph, "XrefEdge");
		expectLiteral(
			unmatched.graph,
			unmatchedEdge,
			"dependency-evidence",
			"missing-source-value",
		);
		expectLiteral(unmatched.graph, unmatchedEdge, "weight", "0.8");
		expectNoIriObjects(unmatched.graph, unmatchedEdge, "dependency-evidence");

		const ambiguous = projectAbundantDocumentToRdf12(
			ambiguousEdgeValueDocument(),
			{ documentRoot: projectRoot },
		);
		const ambiguousEdge = onlyResourceOfType(ambiguous.graph, "XrefEdge");
		expectLiteral(
			ambiguous.graph,
			ambiguousEdge,
			"dependency-evidence",
			"rel-delivery",
		);
		expectNoIriObjects(ambiguous.graph, ambiguousEdge, "dependency-evidence");
	});

	it("projects multiple xref edge complex properties on the same edge", () => {
		const projection = projectAbundantDocumentToRdf12(
			edgeValueDocument({
				attributes: {
					"dependency-evidence": "rel-delivery",
					"risk-assessment": "rel-risk",
					"review-procedure": "rel-review",
					weight: "0.8",
				},
				sourceValues: [
					sourceValueListing({
						id: "rel-delivery",
						startLine: 8,
						contentLine: 11,
						content: "dependency: true",
					}),
					sourceValueListing({
						id: "rel-risk",
						startLine: 14,
						contentLine: 17,
						content: "risk: high",
					}),
					sourceValueListing({
						id: "rel-review",
						startLine: 20,
						contentLine: 23,
						content: "review: required",
					}),
				],
			}),
			{ documentRoot: projectRoot },
		);
		const edge = onlyResourceOfType(projection.graph, "XrefEdge");

		for (const [field, id] of [
			["dependency-evidence", "rel-delivery"],
			["risk-assessment", "rel-risk"],
			["review-procedure", "rel-review"],
		] as const) {
			const value = onlyIriObject(projection.graph, edge, field);
			expectLiteral(projection.graph, value, "sourceValueId", id);
		}
		expectLiteral(projection.graph, edge, "weight", "0.8");
	});

	it("reuses one raw value object when multiple xref edges bind the same source value id", () => {
		const projection = projectAbundantDocumentToRdf12(
			twoEdgeSharedValueDocument(),
			{ documentRoot: projectRoot },
		);
		const [firstEdge, secondEdge] = xrefEdgesInOrder(projection.graph);
		const firstValue = onlyIriObject(
			projection.graph,
			firstEdge ?? iriTerm("urn:missing-first-edge"),
			"dependency-evidence",
		);
		const secondValue = onlyIriObject(
			projection.graph,
			secondEdge ?? iriTerm("urn:missing-second-edge"),
			"dependency-evidence",
		);

		expect(firstValue).toEqual(secondValue);
		expect(
			projection.graph.match({
				predicate: aat("sourceValueId"),
				object: stringLiteral("rel-delivery"),
			}),
		).toHaveLength(1);
	});

	it("reuses one raw value object when two fields on one xref bind the same source value id", () => {
		const projection = projectAbundantDocumentToRdf12(
			edgeValueDocument({
				attributes: {
					"dependency-evidence": "rel-delivery",
					"review-procedure": "rel-delivery",
				},
			}),
			{ documentRoot: projectRoot },
		);
		const edge = onlyResourceOfType(projection.graph, "XrefEdge");
		const dependencyEvidence = onlyIriObject(
			projection.graph,
			edge,
			"dependency-evidence",
		);
		const reviewProcedure = onlyIriObject(
			projection.graph,
			edge,
			"review-procedure",
		);

		expect(dependencyEvidence).toEqual(reviewProcedure);
		expect(
			projection.graph.match({
				predicate: aat("sourceValueId"),
				object: stringLiteral("rel-delivery"),
			}),
		).toHaveLength(1);
	});

	it("derives raw value format only from listing language", () => {
		const projection = projectAbundantDocumentToRdf12(
			headingValueDocument({
				attributes: { for: "delivery", data: "toml" },
				roles: ["release-policy-config"],
				language: "yaml",
				content: "enabled: true",
			}),
			{ documentRoot: projectRoot },
		);
		const value = onlyIriObject(
			projection.graph,
			heading(projection.documentIri, "heading-l1-o0"),
			"release-policy-config",
		);

		expectLiteral(projection.graph, value, "format", "yaml");
		expectNoLiteral(projection.graph, value, "format", "toml");
	});
});

function headingValueDocument(input: {
	readonly attributes: Record<string, string | boolean>;
	readonly roles: readonly string[];
	readonly language?: string;
	readonly content?: string;
}): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			sectionNode(1, "delivery", "Delivery", [
				sourceValueListing({
					startLine: 4,
					contentLine: 7,
					content: input.content ?? '{"owner":"ops"}',
					attributes: input.attributes,
					roles: input.roles,
					...(input.language !== undefined ? { language: input.language } : {}),
				}),
			]),
		],
	};
}

function ambiguousHeadingValueDocument(): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			sectionNode(1, "duplicate", "First"),
			sectionNode(4, "duplicate", "Second"),
			sourceValueListing({
				startLine: 8,
				contentLine: 11,
				content: '{"ambiguous":true}',
				attributes: { for: "duplicate" },
				roles: ["release-policy-config"],
			}),
		],
	};
}

function edgeValueDocument(
	input: {
		readonly attributes?: Record<string, string>;
		readonly sourceValues?: readonly ListingNode[];
	} = {},
): AbundantDocument {
	const xref = xrefNode(
		input.attributes ?? {
			"dependency-evidence": "rel-delivery",
			weight: "0.8",
		},
	);

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
				...(input.sourceValues ?? [
					sourceValueListing({
						id: "rel-delivery",
						startLine: 8,
						contentLine: 11,
						content: "reason: risk-control",
					}),
				]),
			]),
			sectionNode(5, "capacity", "Capacity"),
		],
		xrefOccurrences: [xref],
	};
}

function ambiguousEdgeValueDocument(): AbundantDocument {
	return edgeValueDocument({
		attributes: { "dependency-evidence": "rel-delivery" },
		sourceValues: [
			sourceValueListing({
				id: "rel-delivery",
				startLine: 8,
				contentLine: 11,
				content: "first: true",
			}),
			sourceValueListing({
				id: "rel-delivery",
				startLine: 14,
				contentLine: 17,
				content: "second: true",
			}),
		],
	});
}

function twoEdgeSharedValueDocument(): AbundantDocument {
	const firstXref = xrefNode({ "dependency-evidence": "rel-delivery" }, 4);
	const secondXref = xrefNode({ "dependency-evidence": "rel-delivery" }, 5);

	return {
		...baseDocument(),
		children: [
			sectionNode(1, "delivery", "Delivery", [
				{
					kind: "paragraph",
					text: "See capacity twice.",
					source: { span: { startLine: 4, endLine: 5 } },
					children: [firstXref, secondXref],
				},
				sourceValueListing({
					id: "rel-delivery",
					startLine: 8,
					contentLine: 11,
					content: "reason: risk-control",
				}),
			]),
			sectionNode(20, "capacity", "Capacity"),
		],
		xrefOccurrences: [firstXref, secondXref],
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
		headingInlineMetadataOccurrences: [],
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
		span: { startLine, endLine: startLine + 20 },
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

function sourceValueListing(input: {
	readonly id?: string | readonly string[];
	readonly startLine: number;
	readonly contentLine: number;
	readonly content: string;
	readonly attributes?: Record<string, string | boolean>;
	readonly roles?: readonly string[];
	readonly language?: string;
}): ListingNode {
	const ids =
		input.id === undefined
			? []
			: typeof input.id === "string"
				? [input.id]
				: [...input.id];
	const roles = [...(input.roles ?? [])];

	return {
		kind: "listing",
		ids,
		style: "source",
		language: input.language ?? "yaml",
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
			attrlistMetadata({
				line: input.startLine + 1,
				roles,
				attributes: input.attributes ?? {},
			}),
		],
	};
}

function attrlistMetadata(input: {
	readonly line: number;
	readonly roles: readonly string[];
	readonly attributes: Record<string, string | boolean>;
}): MetadataNode {
	return {
		kind: "metadata",
		metadataKind: "attrlist",
		raw: "[source]",
		line: input.line,
		roles: [...input.roles],
		attributes: input.attributes,
	};
}

function xrefNode(
	attributes: Record<string, string>,
	line = 4,
): XrefOccurrenceNode {
	return {
		kind: "xref",
		syntax: "macro",
		raw: `xref:capacity[Capacity, rel=depends-on, ${Object.entries(attributes)
			.map(([name, value]) => `${name}=${value}`)
			.join(", ")}]`,
		target: "capacity",
		label: "Capacity",
		attributes: {
			rel: "depends-on",
			...attributes,
		},
		containingSectionId: "delivery",
		sourceSpan: {
			start: { line, column: 1 },
			end: { line, column: 90 },
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

function xrefEdgesInOrder(graph: Rdf12Graph): Rdf12IriTerm[] {
	return graph
		.match({
			predicate: rdf("type"),
			object: aat("XrefEdge"),
		})
		.map((triple) => triple.subject)
		.toSorted((left, right) => {
			return (
				Number(literalValue(graph, left, "startLine")) -
				Number(literalValue(graph, right, "startLine"))
			);
		});
}

function literalValue(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
): string {
	const [value] = graph
		.match({ subject, predicate: aat(predicateLocalName) })
		.flatMap((triple) =>
			triple.object.termType === "literal" ? [triple.object.value] : [],
		);

	if (value === undefined) {
		throw new Error(`expected literal ${predicateLocalName}`);
	}
	return value;
}

function onlyIriObject(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
): Rdf12IriTerm {
	const values = graph
		.match({
			subject,
			predicate: aat(predicateLocalName),
		})
		.map((triple) => triple.object)
		.filter((object): object is Rdf12IriTerm => object.termType === "iri");

	expect(values).toHaveLength(1);
	return values[0] ?? iriTerm("urn:missing-value");
}

function expectNoIriObjects(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
): void {
	expect(
		graph
			.match({ subject, predicate: aat(predicateLocalName) })
			.filter((triple) => triple.object.termType === "iri"),
	).toHaveLength(0);
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

function expectNoLiteral(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(subject, aat(predicateLocalName), stringLiteral(value)),
		),
	).toBe(false);
}

function expectNoPredicate(
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

function expectForbiddenRawValueFields(
	graph: Rdf12Graph,
	value: Rdf12IriTerm,
): void {
	for (const predicate of ["payloadKind", "role", "payloadId"]) {
		expectNoPredicate(graph, value, predicate);
	}
	expect(graph.has(rdf12Triple(value, rdf("type"), aat("PayloadBlock")))).toBe(
		false,
	);
	expect(graph.has(rdf12Triple(value, rdf("type"), aat("Heading")))).toBe(
		false,
	);
}

function expectForbiddenPublicPayloadPredicates(graph: Rdf12Graph): void {
	for (const predicate of ["payload", "payloadSelector"]) {
		expect(graph.match({ predicate: aat(predicate) })).toHaveLength(0);
	}
}

function aat(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.aat}${localName}`);
}

function rdf(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.rdf}${localName}`);
}
