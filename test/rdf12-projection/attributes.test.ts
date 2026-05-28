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
import { iriTerm } from "../../src/rdf12-projection/terms";
import { writeFixture } from "../helpers";

const projectRoot = process.cwd();
const sourcePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 surface attribute projection", () => {
	it("projects metadata attrlist fields as surface attributes on structure resources", () => {
		const projection = projectAbundantDocumentToRdf12(attributeDocument(), {
			documentRoot: projectRoot,
		});
		const listing = resourceOfType(
			projection.graph,
			`${namespaces.aat}ListingBlock`,
		);
		const kind = surfaceAttributeForName(projection.graph, "kind");
		const status = surfaceAttributeForName(projection.graph, "status");

		expect(kind).toBeDefined();
		expect(status).toBeDefined();
		expectStringTriple(projection.graph, kind ?? "", "name", "kind");
		expectRdfValue(projection.graph, kind ?? "", "policy");
		expectStringTriple(projection.graph, status ?? "", "name", "status");
		expectRdfValue(projection.graph, status ?? "", "active");
		expectLineLocation(projection.graph, kind ?? "", 2, 2);
		expectLineLocation(projection.graph, status ?? "", 2, 2);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(listing),
					iriTerm(`${namespaces.aat}hasAttribute`),
					iriTerm(kind ?? ""),
				),
			),
		).toBe(true);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(listing),
					iriTerm(`${namespaces.aat}hasAttribute`),
					iriTerm(status ?? ""),
				),
			),
		).toBe(true);
	});

	it("projects only ordinary named xref attributes onto xref occurrence resources", () => {
		const projection = projectAbundantDocumentToRdf12(attributeDocument(), {
			documentRoot: projectRoot,
		});
		const xref = resourceOfType(
			projection.graph,
			`${namespaces.aat}XrefOccurrence`,
		);
		const weight = surfaceAttributeForName(projection.graph, "weight");

		expect(weight).toBeDefined();
		expectRdfValue(projection.graph, weight ?? "", "0.8");
		expectLineLocation(projection.graph, weight ?? "", 6, 6);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(xref),
					iriTerm(`${namespaces.aat}hasAttribute`),
					iriTerm(weight ?? ""),
				),
			),
		).toBe(true);
		expect(surfaceAttributeForName(projection.graph, "rel")).toBeUndefined();
		expect(
			surfaceAttributeForName(projection.graph, "payload"),
		).toBeUndefined();
	});

	it("projects parsed section attrlist fields onto the section resource", () => {
		const path = writeFixture(
			"rdf12-section-attrlist.adoc",
			`= Probe

[#abc.section, kind=policy, status=active, owner=ops]
== 西红柿
`,
		);
		const document = parseAbundantTree({ sourcePath: path });
		const projection = projectAbundantDocumentToRdf12(document, {
			documentRoot: projectRoot,
		});
		const section = resourceOfType(
			projection.graph,
			`${namespaces.aat}Section`,
		);
		const kind = surfaceAttributeForName(projection.graph, "kind");
		const status = surfaceAttributeForName(projection.graph, "status");
		const owner = surfaceAttributeForName(projection.graph, "owner");

		expect(kind).toBeDefined();
		expect(status).toBeDefined();
		expect(owner).toBeDefined();
		expectRdfValue(projection.graph, kind ?? "", "policy");
		expectRdfValue(projection.graph, status ?? "", "active");
		expectRdfValue(projection.graph, owner ?? "", "ops");
		expectLineLocationWithPath(
			projection.graph,
			kind ?? "",
			"tmp/test-fixtures/rdf12-section-attrlist.adoc",
			3,
			3,
		);
		for (const attribute of [kind, status, owner]) {
			expect(
				projection.graph.has(
					rdf12Triple(
						iriTerm(section),
						iriTerm(`${namespaces.aat}hasAttribute`),
						iriTerm(attribute ?? ""),
					),
				),
			).toBe(true);
		}
	});
});

function attributeDocument(): AbundantDocument {
	const xref = {
		kind: "xref" as const,
		syntax: "macro" as const,
		raw: "xref:target[Target, rel=depends-on, payload=rel-delivery-capacity, weight=0.8]",
		target: "target",
		label: "Target",
		attributes: {
			rel: "depends-on",
			payload: "rel-delivery-capacity",
			weight: "0.8",
		},
		sourceSpan: {
			start: { line: 6, column: 3 },
			end: { line: 6, column: 80 },
		},
	};

	return {
		kind: "document",
		sourcePath,
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "listing",
				ids: ["policy-listing"],
				span: { startLine: 2, endLine: 4 },
				metadata: [
					{
						kind: "metadata",
						metadataKind: "attrlist",
						raw: "[source,kind=policy,status=active]",
						line: 2,
						attributes: {
							kind: "policy",
							status: "active",
						},
						source: {
							raw: "[source,kind=policy,status=active]",
							line: 2,
							sourceSpan: {
								start: { line: 2, column: 1 },
								end: { line: 2, column: 35 },
							},
						},
					},
				],
				content: "policy body",
				contentSpan: { startLine: 3, endLine: 3 },
			},
			{
				kind: "section",
				level: 1,
				ids: ["target"],
				title: "Target",
				idOrigin: "source",
				span: { startLine: 5, endLine: 5 },
				titleSpan: {
					start: { line: 5, column: 4 },
					end: { line: 5, column: 10 },
				},
				metadata: [
					{
						kind: "metadata",
						metadataKind: "id",
						raw: "[#target]",
						line: 5,
						ids: ["target"],
					},
				],
			},
			{
				kind: "paragraph",
				text: "xref with surface attrs",
				source: { span: { startLine: 6, endLine: 6 } },
				children: [xref],
			},
		],
		targets: [],
		xrefOccurrences: [xref],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
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

function surfaceAttributeForName(
	graph: Rdf12Graph,
	name: string,
): string | undefined {
	return graph
		.match({
			predicate: iriTerm(`${namespaces.aat}name`),
			object: stringLiteral(name),
		})
		.find((triple) =>
			graph.has(
				rdf12Triple(
					triple.subject,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}SurfaceAttribute`),
				),
			),
		)?.subject.value;
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

function expectRdfValue(
	graph: Rdf12Graph,
	subject: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.rdf}value`),
				stringLiteral(value),
			),
		),
	).toBe(true);
}

function expectLineLocation(
	graph: Rdf12Graph,
	subject: string,
	startLine: number,
	endLine: number,
): void {
	expectLineLocationWithPath(
		graph,
		subject,
		"samples/reference-links.adoc",
		startLine,
		endLine,
	);
}

function expectLineLocationWithPath(
	graph: Rdf12Graph,
	subject: string,
	relativePath: string,
	startLine: number,
	endLine: number,
): void {
	expectStringTriple(graph, subject, "relativePath", relativePath);
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.aat}startLine`),
				integerLiteral(startLine),
			),
		),
	).toBe(true);
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.aat}endLine`),
				integerLiteral(endLine),
			),
		),
	).toBe(true);
}
