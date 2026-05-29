import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
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
	it("projects parsed heading attrlist named fields as direct predicates", () => {
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

	it("projects xref ordinary named attributes as direct predicates on xref edges", () => {
		const projection = projectAbundantDocumentToRdf12(attributeDocument(), {
			documentRoot: projectRoot,
		});
		const edge = resourceOfType(projection.graph, `${namespaces.aat}XrefEdge`);

		expectStringTriple(projection.graph, edge, "rel", "depends-on");
		expectStringTriple(
			projection.graph,
			edge,
			"payloadSelector",
			"rel-delivery-capacity",
		);
		expectStringTriple(projection.graph, edge, "weight", "0.8");
		expectNoPublicAttributeResources(projection.graph);
		expectPredicateAbsent(projection.graph, `${namespaces.aat}payload`);
	});

	it("maps encoded field names to deterministic direct predicates", () => {
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
		raw: "xref:target[Target, rel=depends-on, payload=rel-delivery-capacity, weight=0.8]",
		target: "target",
		label: "Target",
		containingSectionId: "source",
		attributes: {
			rel: "depends-on",
			payload: "rel-delivery-capacity",
			weight: "0.8",
		},
		sourceSpan: {
			start: { line: 4, column: 3 },
			end: { line: 4, column: 80 },
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
			]),
			sectionNode(6, "target", "Target"),
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
		span: { startLine, endLine: startLine + 3 },
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
