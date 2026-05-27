import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm, rdf12TripleTerm } from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");
const interdocumentPath = join(projectRoot, "samples/interdocument-xref.adoc");

describe("rdf12 xref projection", () => {
	it("projects local xref occurrence, binding, relation triple, and reifier", () => {
		const projection = projectAbundantDocumentToRdf12(referenceDocument(), {
			documentRoot: projectRoot,
		});
		const xref = resourcesOfType(
			projection.graph,
			`${namespaces.aat}XrefOccurrence`,
		).find((iri) => iri.includes("#xref-l10-c60-o0"));
		const source = iriTerm(
			resourceIri(projection.documentIri, "section-l8-o0"),
		);
		const target = iriTerm(
			resourceIri(projection.documentIri, "section-l25-o0"),
		);
		const predicate = iriTerm(`${namespaces.aat}references`);
		const relation = rdf12Triple(source, predicate, target);

		expect(xref).toBeDefined();
		expectStringTriple(
			projection.graph,
			xref ?? "",
			"targetSelector",
			"3. 核心引擎设计",
		);
		expectStringTriple(
			projection.graph,
			xref ?? "",
			"sourceSelector",
			"_1_引言",
		);
		expectStringTriple(
			projection.graph,
			xref ?? "",
			"raw",
			"<<3. 核心引擎设计>>",
		);
		expectStringTriple(projection.graph, xref ?? "", "syntax", "shorthand");
		expectNumberTriple(projection.graph, xref ?? "", "startLine", 10);
		expectNumberTriple(projection.graph, xref ?? "", "endLine", 10);
		expectNumberTriple(projection.graph, xref ?? "", "startColumn", 60);
		expectNumberTriple(projection.graph, xref ?? "", "endColumn", 73);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(xref ?? ""),
					iriTerm(`${namespaces.aat}sourceNode`),
					source,
				),
			),
		).toBe(true);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(xref ?? ""),
					iriTerm(`${namespaces.aat}targetNode`),
					target,
				),
			),
		).toBe(true);
		expect(projection.graph.has(relation)).toBe(true);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(xref ?? ""),
					iriTerm(`${namespaces.rdf}reifies`),
					rdf12TripleTerm(relation),
				),
			),
		).toBe(true);
		expect(
			projection.graph.match({
				subject: iriTerm(xref ?? ""),
				predicate: iriTerm(`${namespaces.rdf}reifies`),
			})[0]?.object.termType,
		).toBe("triple");
	});

	it("attaches xref display labels to xref occurrence resources only", () => {
		const projection = projectAbundantDocumentToRdf12(referenceDocument(), {
			documentRoot: projectRoot,
		});
		const xref = resourcesOfType(
			projection.graph,
			`${namespaces.aat}XrefOccurrence`,
		).find((iri) => iri.includes("#xref-l10-c100-o0"));
		const labels = labelsForValue(
			projection.graph,
			"XrefDisplayLabel",
			"最终结论",
		);

		expect(xref).toBeDefined();
		expect(labels).toHaveLength(1);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(xref ?? ""),
					iriTerm(`${namespaces.aat}hasLabel`),
					iriTerm(labels[0] ?? ""),
				),
			),
		).toBe(true);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(projection.documentIri),
					iriTerm(`${namespaces.aat}hasLabel`),
					iriTerm(labels[0] ?? ""),
				),
			),
		).toBe(false);
	});

	it("keeps same-line xref display labels distinct per occurrence owner", () => {
		const projection = projectAbundantDocumentToRdf12(
			sameLineXrefLabelsDocument(),
			{ documentRoot: projectRoot },
		);
		const firstXref = resourceIri(projection.documentIri, "xref-l3-c1-o0");
		const secondXref = resourceIri(projection.documentIri, "xref-l3-c12-o0");
		const [firstLabel] = labelsForValue(
			projection.graph,
			"XrefDisplayLabel",
			"A",
		);
		const [secondLabel] = labelsForValue(
			projection.graph,
			"XrefDisplayLabel",
			"B",
		);

		expect(firstLabel).toBeDefined();
		expect(secondLabel).toBeDefined();
		expect(firstLabel).not.toBe(secondLabel);
		expect(hasLabelOwner(projection.graph, firstXref, firstLabel ?? "")).toBe(
			true,
		);
		expect(hasLabelOwner(projection.graph, secondXref, secondLabel ?? "")).toBe(
			true,
		);
		expect(hasLabelOwner(projection.graph, firstXref, secondLabel ?? "")).toBe(
			false,
		);
		expect(hasLabelOwner(projection.graph, secondXref, firstLabel ?? "")).toBe(
			false,
		);
	});

	it("keeps interdocument xrefs unbound without opening external files", () => {
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({ sourcePath: interdocumentPath }),
			{ documentRoot: projectRoot },
		);
		const xref = resourcesOfType(
			projection.graph,
			`${namespaces.aat}XrefOccurrence`,
		).find(
			(iri) =>
				iri.includes("other.adoc") === false &&
				hasSelector(projection.graph, iri, "other.adoc#remote-target"),
		);

		expect(xref).toBeDefined();
		expect(
			projection.graph.match({
				subject: iriTerm(xref ?? ""),
				predicate: iriTerm(`${namespaces.aat}targetNode`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				subject: iriTerm(xref ?? ""),
				predicate: iriTerm(`${namespaces.rdf}reifies`),
			}),
		).toHaveLength(0);
	});

	it("does not create relation triples for unresolved targets", () => {
		const projection = projectAbundantDocumentToRdf12(unresolvedDocument(), {
			documentRoot: projectRoot,
		});
		const xref = onlyXref(projection.graph);

		expectStringTriple(
			projection.graph,
			xref,
			"targetSelector",
			"missing-target",
		);
		expect(
			projection.graph.match({
				subject: iriTerm(xref),
				predicate: iriTerm(`${namespaces.aat}targetNode`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				subject: iriTerm(xref),
				predicate: iriTerm(`${namespaces.rdf}reifies`),
			}),
		).toHaveLength(0);
	});

	it("projects xref occurrences from the document-level xref index", () => {
		const projection = projectAbundantDocumentToRdf12(indexedXrefDocument(), {
			documentRoot: projectRoot,
		});
		const xref = onlyXref(projection.graph);

		expectStringTriple(
			projection.graph,
			xref,
			"targetSelector",
			"indexed-target",
		);
		expectNumberTriple(projection.graph, xref, "startLine", 9);
		expectNumberTriple(projection.graph, xref, "startColumn", 3);
	});

	it("deduplicates the same xref object appearing in index and children", () => {
		const projection = projectAbundantDocumentToRdf12(
			indexedAndNestedSameObjectDocument(),
			{ documentRoot: projectRoot },
		);

		expect(
			resourcesOfType(projection.graph, `${namespaces.aat}XrefOccurrence`),
		).toHaveLength(1);
	});

	it("emits candidates but no single target for multi-binding targets", () => {
		const projection = projectAbundantDocumentToRdf12(ambiguousDocument(), {
			documentRoot: projectRoot,
		});
		const xref = onlyXref(projection.graph);

		expect(
			projection.graph.match({
				subject: iriTerm(xref),
				predicate: iriTerm(`${namespaces.aat}candidateNode`),
			}),
		).toHaveLength(2);
		expect(
			projection.graph.match({
				subject: iriTerm(xref),
				predicate: iriTerm(`${namespaces.aat}targetNode`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.match({
				subject: iriTerm(xref),
				predicate: iriTerm(`${namespaces.rdf}reifies`),
			}),
		).toHaveLength(0);
	});

	it("maps rel control fields and preserves payload selectors", () => {
		const projection = projectAbundantDocumentToRdf12(relPayloadDocument(), {
			documentRoot: projectRoot,
		});
		const xref = onlyXref(projection.graph);
		const source = iriTerm(resourceIri(projection.documentIri, "document"));
		const target = iriTerm(
			resourceIri(projection.documentIri, "section-l1-o0"),
		);
		const predicate = iriTerm(`${namespaces.rel}depends-on`);

		expectStringTriple(projection.graph, xref, "rawRel", "depends-on");
		expectStringTriple(
			projection.graph,
			xref,
			"payloadSelector",
			"payload-one",
		);
		expect(projection.graph.has(rdf12Triple(source, predicate, target))).toBe(
			true,
		);
		expect(
			projection.graph.match({
				subject: iriTerm(xref),
				predicate: iriTerm(`${namespaces.aat}hasAttribute`),
			}),
		).toHaveLength(0);
	});
});

function referenceDocument(): AbundantDocument {
	return parseAbundantTree({ sourcePath: referencePath });
}

function resourceIri(documentIri: string, localId: string): string {
	return `${documentIri.slice(0, documentIri.indexOf("#"))}#${localId}`;
}

function resourcesOfType(graph: Rdf12Graph, typeIri: string): string[] {
	return graph
		.match({
			predicate: iriTerm(`${namespaces.rdf}type`),
			object: iriTerm(typeIri),
		})
		.map((triple) => triple.subject.value);
}

function labelsForValue(
	graph: Rdf12Graph,
	classLocalName: string,
	value: string,
): string[] {
	return graph
		.match({
			predicate: iriTerm(`${namespaces.rdf}value`),
			object: stringLiteral(value),
		})
		.filter((triple) =>
			graph.has(
				rdf12Triple(
					triple.subject,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}${classLocalName}`),
				),
			),
		)
		.map((triple) => triple.subject.value);
}

function hasLabelOwner(
	graph: Rdf12Graph,
	owner: string,
	label: string,
): boolean {
	return graph.has(
		rdf12Triple(
			iriTerm(owner),
			iriTerm(`${namespaces.aat}hasLabel`),
			iriTerm(label),
		),
	);
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

function onlyXref(graph: Rdf12Graph): string {
	const [xref] = resourcesOfType(graph, `${namespaces.aat}XrefOccurrence`);
	if (xref === undefined) {
		throw new Error("expected one xref occurrence");
	}
	return xref;
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

function unresolvedDocument(): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			{
				kind: "paragraph",
				text: "Missing target.",
				source: { span: { startLine: 1, endLine: 1 } },
				children: [
					{
						kind: "xref",
						syntax: "shorthand",
						raw: "<<missing-target>>",
						target: "missing-target",
						sourceSpan: {
							start: { line: 1, column: 1 },
							end: { line: 1, column: 19 },
						},
					},
				],
			},
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

function indexedXref(): NonNullable<
	AbundantDocument["xrefOccurrences"][number]
> {
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
			{
				kind: "paragraph",
				text: "Ambiguous target.",
				source: { span: { startLine: 7, endLine: 7 } },
				children: [
					{
						kind: "xref",
						syntax: "shorthand",
						raw: "<<duplicate-target>>",
						target: "duplicate-target",
						sourceSpan: {
							start: { line: 7, column: 1 },
							end: { line: 7, column: 21 },
						},
					},
				],
			},
		],
	};
}

function relPayloadDocument(): AbundantDocument {
	return {
		...baseDocument(),
		children: [
			sectionNode(1, "target", "Target"),
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
		],
	};
}

function sameLineXrefLabelsDocument(): AbundantDocument {
	const firstXref = {
		kind: "xref" as const,
		syntax: "shorthand" as const,
		raw: "<<missing-a,A>>",
		target: "missing-a",
		label: "A",
		sourceSpan: {
			start: { line: 3, column: 1 },
			end: { line: 3, column: 14 },
		},
	};
	const secondXref = {
		kind: "xref" as const,
		syntax: "shorthand" as const,
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
