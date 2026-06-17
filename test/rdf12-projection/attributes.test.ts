import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument, ListingNode } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm, type Rdf12IriTerm } from "../../src/rdf12-projection/terms";
import { writeFixture } from "../helpers";

const projectRoot = process.cwd();
const sourcePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 direct field predicate projection", () => {
	it("projects parsed heading attrlist roles and named fields as direct predicates", () => {
		const path = writeFixture(
			"rdf12-section-attrlist.adoc",
			`= Probe

[#abc.section, kind=policy, status=active, owner=ops]
== 西红柿
`,
		);
		const projection = projectAbundantDocumentToRdf12(
			parseAbundantTree({ sourcePath: path }),
			{ documentRoot: projectRoot },
		);
		const heading = onlyHeadingWithLiteral(
			projection.graph,
			"headline",
			"西红柿",
		);

		expectStringTriple(projection.graph, heading, "addressLabel", "abc");
		expectStringTriple(projection.graph, heading, "role", "section");
		expectStringTriple(projection.graph, heading, "kind", "policy");
		expectStringTriple(projection.graph, heading, "status", "active");
		expectStringTriple(projection.graph, heading, "owner", "ops");
		expectNoPublicAttributeResources(projection.graph);
		expectPredicateAbsent(projection.graph, `${namespaces.aat}id`);
	});

	it("does not double-project xref named attributes before complex property handling", () => {
		const projection = projectAbundantDocumentToRdf12(attributeDocument(), {
			documentRoot: projectRoot,
		});
		const edge = resourceOfType(projection.graph, `${namespaces.aat}XrefEdge`);
		const evidence = onlyIriObject(
			projection.graph,
			edge,
			"dependency-evidence",
		);

		expectStringTriple(projection.graph, edge, "rel", "depends-on");
		expectStringTriple(projection.graph, edge, "weight", "0.8");
		expectStringTriple(
			projection.graph,
			evidence,
			"sourceValueId",
			"rel-delivery-capacity",
		);
		expectNoLiteralTriple(
			projection.graph,
			edge,
			"dependency-evidence",
			"rel-delivery-capacity",
		);
		expectPredicateAbsent(projection.graph, `${namespaces.aat}payloadSelector`);
		expectPredicateAbsent(projection.graph, `${namespaces.aat}payload`);
		expectNoPublicAttributeResources(projection.graph);
	});

	it("maps encoded xref literal field names through the complex property projector", () => {
		const projection = projectAbundantDocumentToRdf12(encodedFieldsDocument(), {
			documentRoot: projectRoot,
		});
		const edge = resourceOfType(projection.graph, `${namespaces.aat}XrefEdge`);

		expectTripleWithPredicateIri(
			projection.graph,
			edge,
			`${namespaces.aat}field-%C3%BCber%20score`,
			"high",
		);
		expectTripleWithPredicateIri(
			projection.graph,
			edge,
			`${namespaces.aat}field-9priority`,
			"urgent",
		);
		expectNoPublicAttributeResources(projection.graph);
	});
});

function attributeDocument(): AbundantDocument {
	const xref = {
		kind: "xref" as const,
		syntax: "macro" as const,
		raw: "xref:target[Target, rel=depends-on, dependency-evidence=rel-delivery-capacity, weight=0.8]",
		target: "target",
		label: "Target",
		containingSectionId: "source",
		attributes: {
			rel: "depends-on",
			"dependency-evidence": "rel-delivery-capacity",
			weight: "0.8",
		},
		sourceSpan: {
			start: { line: 4, column: 3 },
			end: { line: 4, column: 100 },
		},
	};

	return {
		...baseDocument(),
		children: [
			sectionNode(1, "source", "Source", [
				{
					kind: "paragraph",
					text: "xref with direct fields",
					source: { span: { startLine: 4, endLine: 4 } },
					children: [xref],
				},
				sourceValueListing("rel-delivery-capacity", 8, 11),
			]),
			sectionNode(14, "target", "Target"),
		],
		xrefOccurrences: [xref],
	};
}

function encodedFieldsDocument(): AbundantDocument {
	const xref = {
		kind: "xref" as const,
		syntax: "macro" as const,
		raw: "xref:target[Target]",
		target: "target",
		label: "Target",
		containingSectionId: "source",
		attributes: {
			"über score": "high",
			"9priority": "urgent",
		},
		sourceSpan: {
			start: { line: 4, column: 3 },
			end: { line: 4, column: 22 },
		},
	};

	return {
		...baseDocument(),
		children: [
			sectionNode(1, "source", "Source", [
				{
					kind: "paragraph",
					text: "xref with encoded fields",
					source: { span: { startLine: 4, endLine: 4 } },
					children: [xref],
				},
			]),
			sectionNode(6, "target", "Target"),
		],
		xrefOccurrences: [xref],
	};
}

function sourceValueListing(
	id: string,
	startLine: number,
	contentLine: number,
): ListingNode {
	return {
		kind: "listing",
		ids: [id],
		style: "source",
		language: "yaml",
		span: { startLine, endLine: startLine + 4 },
		contentSpan: { startLine: contentLine, endLine: contentLine },
		content: "evidence: true",
		metadata: [
			{
				kind: "metadata",
				metadataKind: "id",
				raw: `[#${id}]`,
				line: startLine,
				ids: [id],
			},
			{
				kind: "metadata",
				metadataKind: "attrlist",
				raw: "[source,yaml]",
				line: startLine + 1,
				attributes: { style: "source", language: "yaml" },
			},
		],
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
		span: { startLine, endLine: startLine + 20 },
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

function resourceOfType(graph: Rdf12Graph, typeIri: string): Rdf12IriTerm {
	const [resource] = graph
		.match({
			predicate: iriTerm(`${namespaces.rdf}type`),
			object: iriTerm(typeIri),
		})
		.map((triple) => triple.subject);
	if (resource === undefined) {
		throw new Error(`expected resource of type ${typeIri}`);
	}
	return resource;
}

function onlyHeadingWithLiteral(
	graph: Rdf12Graph,
	predicateLocalName: string,
	value: string,
): Rdf12IriTerm {
	const headings = graph
		.match({
			predicate: iriTerm(`${namespaces.aat}${predicateLocalName}`),
			object: stringLiteral(value),
		})
		.map((triple) => triple.subject)
		.filter((subject) =>
			graph.has(
				rdf12Triple(
					subject,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}Heading`),
				),
			),
		);

	expect(headings).toHaveLength(1);
	return headings[0] ?? iriTerm("urn:missing-heading");
}

function onlyIriObject(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
): Rdf12IriTerm {
	const objects = graph
		.match({
			subject,
			predicate: iriTerm(`${namespaces.aat}${predicateLocalName}`),
		})
		.map((triple) => triple.object)
		.filter((object): object is Rdf12IriTerm => object.termType === "iri");

	expect(objects).toHaveLength(1);
	return objects[0] ?? iriTerm("urn:missing-object");
}

function expectStringTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string,
): void {
	expectTripleWithPredicateIri(
		graph,
		subject,
		`${namespaces.aat}${predicateLocalName}`,
		value,
	);
}

function expectNoLiteralTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				subject,
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				stringLiteral(value),
			),
		),
	).toBe(false);
}

function expectTripleWithPredicateIri(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateIri: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(subject, iriTerm(predicateIri), stringLiteral(value)),
		),
	).toBe(true);
}

function expectNoPublicAttributeResources(graph: Rdf12Graph): void {
	expect(
		graph.match({
			predicate: iriTerm(`${namespaces.rdf}type`),
			object: iriTerm(`${namespaces.aat}SurfaceAttribute`),
		}),
	).toHaveLength(0);
	expectPredicateAbsent(graph, `${namespaces.aat}hasAttribute`);
	expectPredicateAbsent(graph, `${namespaces.aat}name`);
	expectPredicateAbsent(graph, `${namespaces.rdf}value`);
}

function expectPredicateAbsent(graph: Rdf12Graph, predicateIri: string): void {
	expect(graph.match({ predicate: iriTerm(predicateIri) })).toHaveLength(0);
}
