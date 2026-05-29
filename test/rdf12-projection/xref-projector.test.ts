import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument, XrefOccurrenceNode } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import {
	iriTerm,
	type Rdf12IriTerm,
	rdf12TripleTerm,
} from "../../src/rdf12-projection/terms";
import { writeFixture } from "../helpers";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");
const interdocumentPath = join(projectRoot, "samples/interdocument-xref.adoc");

describe("rdf12 xref edge projection", () => {
	it("projects local xref edge evidence, default relation triple, and reifier", () => {
		const projection = projectAbundantDocumentToRdf12(referenceDocument(), {
			documentRoot: projectRoot,
		});
		const edge = resourcesOfType(
			projection.graph,
			`${namespaces.aat}XrefEdge`,
		).find((iri) => iri.includes("#xref-edge-l10-c60-o0"));
		const source = heading(projection.documentIri, "heading-l8-o0");
		const target = heading(projection.documentIri, "heading-l25-o0");
		const predicate = iriTerm(`${namespaces.aat}references`);
		const relation = rdf12Triple(source, predicate, target);

		expect(edge).toBeDefined();
		expectResourceTypeCount(
			projection.graph,
			`${namespaces.aat}XrefOccurrence`,
			0,
		);
		expectStringTriple(
			projection.graph,
			edge ?? "",
			"targetSelector",
			"3. 核心引擎设计",
		);
		expectStringTriple(projection.graph, edge ?? "", "displayLabel", undefined);
		expectStringTriple(
			projection.graph,
			edge ?? "",
			"sourceSelector",
			"_1_引言",
		);
		expectStringTriple(
			projection.graph,
			edge ?? "",
			"raw",
			"<<3. 核心引擎设计>>",
		);
		expectStringTriple(projection.graph, edge ?? "", "syntax", "shorthand");
		expectNumberTriple(projection.graph, edge ?? "", "startLine", 10);
		expectNumberTriple(projection.graph, edge ?? "", "endLine", 10);
		expectNumberTriple(projection.graph, edge ?? "", "startColumn", 60);
		expectNumberTriple(projection.graph, edge ?? "", "endColumn", 73);
		expectTriple(projection.graph, edge ?? "", "sourceHeading", source);
		expectTriple(projection.graph, edge ?? "", "targetHeading", target);
		expect(projection.graph.has(relation)).toBe(true);
		expectTripleTerm(projection.graph, edge ?? "", relation);
	});

	it("writes xref display text as a literal field on the edge evidence", () => {
		const projection = projectAbundantDocumentToRdf12(referenceDocument(), {
			documentRoot: projectRoot,
		});
		const edge = resourcesOfType(
			projection.graph,
			`${namespaces.aat}XrefEdge`,
		).find((iri) => iri.includes("#xref-edge-l10-c100-o0"));

		expect(edge).toBeDefined();
		expectStringTriple(
			projection.graph,
			edge ?? "",
			"displayLabel",
			"最终结论",
		);
		expect(
			projection.graph.match({
				subject: iriTerm(edge ?? ""),
				predicate: iriTerm(`${namespaces.aat}hasLabel`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.rdf}value`),
				object: stringLiteral("最终结论"),
			}),
		).toHaveLength(0);
	});

	it("keeps same-line xref display labels as separate edge literals", () => {
		const projection = projectAbundantDocumentToRdf12(
			sameLineXrefLabelsDocument(),
			{ documentRoot: projectRoot },
		);
		const firstEdge = resourceIri(projection.documentIri, "xref-edge-l3-c1-o0");
		const secondEdge = resourceIri(
			projection.documentIri,
			"xref-edge-l3-c12-o0",
		);

		expectStringTriple(projection.graph, firstEdge, "displayLabel", "A");
		expectStringTriple(projection.graph, secondEdge, "displayLabel", "B");
		expect(
			resourcesOfType(projection.graph, `${namespaces.aat}XrefEdge`),
		).toEqual([firstEdge, secondEdge]);
	});

	it("keeps interdocument xrefs unbound without opening external files", () => {
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({ sourcePath: interdocumentPath }),
			{ documentRoot: projectRoot },
		);
		const edge = resourcesOfType(
			projection.graph,
			`${namespaces.aat}XrefEdge`,
		).find((iri) =>
			hasSelector(projection.graph, iri, "other.adoc#remote-target"),
		);

		expect(edge).toBeDefined();
		expect(
			projection.graph.match({
				subject: iriTerm(edge ?? ""),
				predicate: iriTerm(`${namespaces.aat}targetHeading`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				subject: iriTerm(edge ?? ""),
				predicate: iriTerm(`${namespaces.rdf}reifies`),
			}),
		).toHaveLength(0);
	});

	it("keeps unresolved selectors as edge evidence without relation triples", () => {
		const projection = projectAbundantDocumentToRdf12(unresolvedDocument(), {
			documentRoot: projectRoot,
		});
		const edge = onlyXrefEdge(projection.graph);

		expectStringTriple(
			projection.graph,
			edge,
			"targetSelector",
			"missing-target",
		);
		expect(
			projection.graph.match({
				subject: iriTerm(edge),
				predicate: iriTerm(`${namespaces.aat}targetHeading`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				subject: iriTerm(edge),
				predicate: iriTerm(`${namespaces.rdf}reifies`),
			}),
		).toHaveLength(0);
	});

	it("projects xref edges from the document-level xref index", () => {
		const projection = projectAbundantDocumentToRdf12(indexedXrefDocument(), {
			documentRoot: projectRoot,
		});
		const edge = onlyXrefEdge(projection.graph);

		expect(edge).toContain("#xref-edge-l9-c3-o0");
		expectStringTriple(
			projection.graph,
			edge,
			"targetSelector",
			"indexed-target",
		);
		expectNumberTriple(projection.graph, edge, "startLine", 9);
		expectNumberTriple(projection.graph, edge, "startColumn", 3);
	});

	it("deduplicates the same xref object appearing in index and children", () => {
		const projection = projectAbundantDocumentToRdf12(
			indexedAndNestedSameObjectDocument(),
			{ documentRoot: projectRoot },
		);

		expect(
			resourcesOfType(projection.graph, `${namespaces.aat}XrefEdge`),
		).toHaveLength(1);
	});

	it("ignores xref occurrences without source spans", () => {
		const projection = projectAbundantDocumentToRdf12(spanlessXrefDocument(), {
			documentRoot: projectRoot,
		});

		expect(
			resourcesOfType(projection.graph, `${namespaces.aat}XrefEdge`),
		).toHaveLength(0);
	});

	it("emits candidate headings but no single target or relation for multi-binding targets", () => {
		const projection = projectAbundantDocumentToRdf12(ambiguousDocument(), {
			documentRoot: projectRoot,
		});
		const edge = onlyXrefEdge(projection.graph);

		expect(
			projection.graph
				.match({
					subject: iriTerm(edge),
					predicate: iriTerm(`${namespaces.aat}candidateHeading`),
				})
				.map((triple) => triple.object.value),
		).toEqual([
			heading(projection.documentIri, "heading-l1-o0").value,
			heading(projection.documentIri, "heading-l4-o0").value,
		]);
		expect(
			projection.graph.match({
				subject: iriTerm(edge),
				predicate: iriTerm(`${namespaces.aat}targetHeading`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				subject: iriTerm(edge),
				predicate: iriTerm(`${namespaces.rdf}reifies`),
			}),
		).toHaveLength(0);
	});

	it("maps rel control fields and preserves payload selectors", () => {
		const projection = projectAbundantDocumentToRdf12(relPayloadDocument(), {
			documentRoot: projectRoot,
		});
		const edge = onlyXrefEdge(projection.graph);
		const source = heading(projection.documentIri, "heading-l1-o0");
		const target = heading(projection.documentIri, "heading-l1-o0");
		const predicate = iriTerm(`${namespaces.rel}depends-on`);
		const relation = rdf12Triple(source, predicate, target);

		expectStringTriple(projection.graph, edge, "rel", "depends-on");
		expectStringTriple(projection.graph, edge, "displayLabel", "Target");
		expectStringTriple(
			projection.graph,
			edge,
			"payloadSelector",
			"payload-one",
		);
		expect(projection.graph.has(relation)).toBe(true);
		expectTripleTerm(projection.graph, edge, relation);
		expect(
			projection.graph.match({
				subject: iriTerm(edge),
				predicate: iriTerm(`${namespaces.aat}hasAttribute`),
			}),
		).toHaveLength(0);
	});

	it("preserves unmappable rel values without asserting a relation triple", () => {
		const projection = projectAbundantDocumentToRdf12(invalidRelDocument(), {
			documentRoot: projectRoot,
		});
		const edge = onlyXrefEdge(projection.graph);

		expectStringTriple(projection.graph, edge, "rel", " bad rel ");
		expect(
			projection.graph.match({
				subject: iriTerm(edge),
				predicate: iriTerm(`${namespaces.rdf}reifies`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph
				.toArray()
				.filter((triple) => triple.predicate.value.includes("bad rel")),
		).toHaveLength(0);
	});

	it("uses leading macro rel attributes as relation predicates", () => {
		const sourcePath = writeFixture(
			"leading-macro-rel.adoc",
			`= 我的笔记本

== 水果

=== 苹果

他应该是xref:水果[rel=is, weight=0.8, payload=rel-delivery-capacity]
`,
		);
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({
				sourcePath,
			}),
			{ documentRoot: projectRoot },
		);
		const expectedRelation = projection.graph
			.toArray()
			.find((triple) => triple.predicate.value === `${namespaces.rel}is`);

		expect(expectedRelation).toBeDefined();
		expect(expectedRelation?.subject.value).toContain("#heading-l5-o0");
		expect(expectedRelation?.object.value).toContain("#heading-l3-o0");
		expect(
			projection.graph.has(
				rdf12Triple(
					expectedRelation?.subject ?? iriTerm("urn:missing"),
					iriTerm(`${namespaces.aat}references`),
					expectedRelation?.object ?? iriTerm("urn:missing"),
				),
			),
		).toBe(false);
		expectTripleTerm(
			projection.graph,
			onlyXrefEdge(projection.graph),
			expectedRelation ??
				rdf12Triple(
					iriTerm("urn:missing-source"),
					iriTerm("urn:missing-predicate"),
					iriTerm("urn:missing-target"),
				),
		);
		expectStringTriple(
			projection.graph,
			onlyXrefEdge(projection.graph),
			"rel",
			"is",
		);
		expectStringTriple(
			projection.graph,
			onlyXrefEdge(projection.graph),
			"payloadSelector",
			"rel-delivery-capacity",
		);
	});
});

function referenceDocument(): AbundantDocument {
	return parseAbundantTree({ sourcePath: referencePath });
}

function resourceIri(documentIri: string, localId: string): string {
	return `${documentIri.slice(0, documentIri.indexOf("#"))}#${localId}`;
}

function heading(documentIri: string, localId: string): Rdf12IriTerm {
	return iriTerm(resourceIri(documentIri, localId));
}

function resourcesOfType(graph: Rdf12Graph, typeIri: string): string[] {
	return graph
		.match({
			predicate: iriTerm(`${namespaces.rdf}type`),
			object: iriTerm(typeIri),
		})
		.map((triple) => triple.subject.value);
}

function expectResourceTypeCount(
	graph: Rdf12Graph,
	typeIri: string,
	count: number,
): void {
	expect(resourcesOfType(graph, typeIri)).toHaveLength(count);
}

function hasSelector(
	graph: Rdf12Graph,
	subject: string,
	selector: string,
): boolean {
	return graph.has(
		rdf12Triple(
			iriTerm(subject),
			iriTerm(`${namespaces.aat}targetSelector`),
			stringLiteral(selector),
		),
	);
}

function onlyXrefEdge(graph: Rdf12Graph): string {
	const [edge] = resourcesOfType(graph, `${namespaces.aat}XrefEdge`);
	if (edge === undefined) {
		throw new Error("expected one xref edge");
	}
	return edge;
}

function expectTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
	object: Rdf12IriTerm,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				object,
			),
		),
	).toBe(true);
}

function expectTripleTerm(
	graph: Rdf12Graph,
	subject: string,
	relation: ReturnType<typeof rdf12Triple>,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.rdf}reifies`),
				rdf12TripleTerm(relation),
			),
		),
	).toBe(true);
	expect(
		graph.match({
			subject: iriTerm(subject),
			predicate: iriTerm(`${namespaces.rdf}reifies`),
		})[0]?.object.termType,
	).toBe("triple");
}

function expectStringTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
	value: string | undefined,
): void {
	if (value === undefined) {
		expect(
			graph.match({
				subject: iriTerm(subject),
				predicate: iriTerm(`${namespaces.aat}${predicateLocalName}`),
			}),
		).toHaveLength(0);
		return;
	}

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

function unresolvedDocument(): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			sectionNode(1, "source", "Source", [
				{
					kind: "paragraph",
					text: "Missing target.",
					source: { span: { startLine: 3, endLine: 3 } },
					children: [
						{
							kind: "xref",
							syntax: "shorthand",
							raw: "<<missing-target>>",
							target: "missing-target",
							containingSectionId: "source",
							sourceSpan: {
								start: { line: 3, column: 1 },
								end: { line: 3, column: 19 },
							},
						},
					],
				},
			]),
		],
	};
}

function indexedXrefDocument(): AbundantDocument {
	return {
		...baseDocument(),
		xrefOccurrences: [indexedXref()],
	};
}

function indexedAndNestedSameObjectDocument(): AbundantDocument {
	const xref = indexedXref();
	return {
		...baseDocument(),
		xrefOccurrences: [xref],
		children: [
			{
				kind: "paragraph",
				text: "Indexed and nested.",
				source: { span: { startLine: 9, endLine: 9 } },
				children: [xref],
			},
		],
	};
}

function spanlessXrefDocument(): AbundantDocument {
	return {
		...baseDocument(),
		xrefOccurrences: [
			{
				kind: "xref",
				syntax: "shorthand",
				raw: "<<target>>",
				target: "target",
			},
		],
	};
}

function indexedXref(): XrefOccurrenceNode {
	return {
		kind: "xref",
		syntax: "shorthand",
		raw: "<<indexed-target>>",
		target: "indexed-target",
		sourceSpan: {
			start: { line: 9, column: 3 },
			end: { line: 9, column: 21 },
		},
	};
}

function ambiguousDocument(): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			sectionNode(1, "duplicate-target", "First"),
			sectionNode(4, "duplicate-target", "Second"),
			sectionNode(7, "source", "Source", [
				{
					kind: "paragraph",
					text: "Ambiguous target.",
					source: { span: { startLine: 9, endLine: 9 } },
					children: [
						{
							kind: "xref",
							syntax: "shorthand",
							raw: "<<duplicate-target>>",
							target: "duplicate-target",
							containingSectionId: "source",
							sourceSpan: {
								start: { line: 9, column: 1 },
								end: { line: 9, column: 21 },
							},
						},
					],
				},
			]),
		],
	};
}

function relPayloadDocument(): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			sectionNode(1, "target", "Target", [
				{
					kind: "paragraph",
					text: "Rel target.",
					source: { span: { startLine: 4, endLine: 4 } },
					children: [
						{
							kind: "xref",
							syntax: "macro",
							raw: "xref:target[Target, rel=depends-on, payload=payload-one]",
							target: "target",
							label: "Target",
							containingSectionId: "target",
							attributes: {
								rel: "depends-on",
								payload: "payload-one",
							},
							sourceSpan: {
								start: { line: 4, column: 1 },
								end: { line: 4, column: 56 },
							},
						},
					],
				},
			]),
		],
	};
}

function invalidRelDocument(): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			sectionNode(1, "target", "Target", [
				{
					kind: "paragraph",
					text: "Invalid rel target.",
					source: { span: { startLine: 4, endLine: 4 } },
					children: [
						{
							kind: "xref",
							syntax: "macro",
							raw: "xref:target[Target, rel= bad rel ]",
							target: "target",
							label: "Target",
							containingSectionId: "target",
							attributes: {
								rel: " bad rel ",
							},
							sourceSpan: {
								start: { line: 4, column: 1 },
								end: { line: 4, column: 36 },
							},
						},
					],
				},
			]),
		],
	};
}

function sameLineXrefLabelsDocument(): AbundantDocument {
	const firstXref: XrefOccurrenceNode = {
		kind: "xref",
		syntax: "shorthand",
		raw: "<<missing-a,A>>",
		target: "missing-a",
		label: "A",
		sourceSpan: {
			start: { line: 3, column: 1 },
			end: { line: 3, column: 14 },
		},
	};
	const secondXref: XrefOccurrenceNode = {
		kind: "xref",
		syntax: "shorthand",
		raw: "<<missing-b,B>>",
		target: "missing-b",
		label: "B",
		sourceSpan: {
			start: { line: 3, column: 12 },
			end: { line: 3, column: 25 },
		},
	};

	return {
		...baseDocument(),
		children: [
			{
				kind: "paragraph",
				text: "two same-line xrefs",
				source: { span: { startLine: 3, endLine: 3 } },
				children: [firstXref, secondXref],
			},
		],
		xrefOccurrences: [firstXref, secondXref],
	};
}

function sectionNode(
	startLine: number,
	id: string,
	title: string,
	children: AbundantDocument["children"] = [],
): NonNullable<AbundantDocument["children"][number]> {
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

function baseDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: referencePath,
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
}
