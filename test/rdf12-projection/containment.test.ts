import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { rdf12Triple } from "../../src/rdf12-projection/graph";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();

describe("rdf12 direct containment", () => {
	it("uses only direct children for document and section containment", () => {
		const projection = projectAbundantDocumentToRdf12(nestedDocument(), {
			documentRoot: projectRoot,
		});
		const contains = iriTerm(`${namespaces.aat}containsDirectly`);
		const document = iriTerm(projection.documentIri);
		const section = iriTerm(resourceIri(projection, "section-l1-o0"));
		const paragraph = iriTerm(resourceIri(projection, "paragraph-l2-o0"));
		const listing = iriTerm(resourceIri(projection, "listing-l3-o0"));

		expect(projection.graph.has(rdf12Triple(document, contains, section))).toBe(
			true,
		);
		expect(
			projection.graph.has(rdf12Triple(section, contains, paragraph)),
		).toBe(true);
		expect(projection.graph.has(rdf12Triple(section, contains, listing))).toBe(
			true,
		);
		expect(
			projection.graph.has(rdf12Triple(document, contains, paragraph)),
		).toBe(false);
		expect(projection.graph.has(rdf12Triple(document, contains, listing))).toBe(
			false,
		);
	});

	it("projects direct anchor children for paragraph and table without xref resources", () => {
		const projection = projectAbundantDocumentToRdf12(nestedDocument(), {
			documentRoot: projectRoot,
		});
		const contains = iriTerm(`${namespaces.aat}containsDirectly`);
		const paragraph = iriTerm(resourceIri(projection, "paragraph-l2-o0"));
		const table = iriTerm(resourceIri(projection, "table-l5-o0"));
		const paragraphAnchor = iriTerm(resourceIri(projection, "anchor-l2-c5-o0"));
		const tableAnchor = iriTerm(resourceIri(projection, "anchor-l6-c3-o0"));

		expect(
			projection.graph.has(rdf12Triple(paragraph, contains, paragraphAnchor)),
		).toBe(true);
		expect(
			projection.graph.has(rdf12Triple(table, contains, tableAnchor)),
		).toBe(true);
		expect(
			projection.graph.match({
				object: iriTerm(`${namespaces.aat}XrefOccurrence`),
			}),
		).toHaveLength(0);
	});
});

function nestedDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: join(projectRoot, "samples/reference-links.adoc"),
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "section",
				level: 1,
				ids: ["manual-section-id"],
				title: "Manual Section",
				idOrigin: "source",
				span: { startLine: 1, endLine: 8 },
				children: [
					{
						kind: "paragraph",
						text: "Paragraph with direct children.",
						source: {
							span: { startLine: 2, endLine: 2 },
						},
						children: [
							{
								kind: "anchor",
								syntax: "double-bracket",
								raw: "[[p-anchor]]",
								ids: ["p-anchor"],
								sourceSpan: {
									start: { line: 2, column: 5 },
									end: { line: 2, column: 17 },
								},
							},
							{
								kind: "xref",
								syntax: "shorthand",
								raw: "<<target>>",
								target: "target",
								sourceSpan: {
									start: { line: 2, column: 20 },
									end: { line: 2, column: 30 },
								},
							},
						],
					},
					{
						kind: "listing",
						ids: [],
						span: { startLine: 3, endLine: 4 },
					},
					{
						kind: "table",
						ids: [],
						span: { startLine: 5, endLine: 7 },
						children: [
							{
								kind: "anchor",
								syntax: "double-bracket",
								raw: "[[table-anchor]]",
								ids: ["table-anchor"],
								sourceSpan: {
									start: { line: 6, column: 3 },
									end: { line: 6, column: 19 },
								},
							},
						],
					},
				],
			},
		],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
}

function resourceIri(
	projection: ReturnType<typeof projectAbundantDocumentToRdf12>,
	localId: string,
): string {
	return `${projection.documentIri.slice(0, projection.documentIri.indexOf("#"))}#${localId}`;
}
