import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { rdf12Triple } from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";

describe("rdf12 internal projector", () => {
	const documentRoot = path.resolve("/repo");

	it("projects an empty document to a provenance and document-resource graph", () => {
		const projection = projectAbundantDocumentToRdf12(
			emptyDocument(path.join(documentRoot, "docs", "empty.adoc")),
			{ documentRoot },
		);

		expect(projection.relativePath).toBe("docs/empty.adoc");
		expect(projection.prefixes).toEqual(namespaces);
		expect(projection.documentIri).not.toBe(projection.sourceDocumentIri);
		expect(projection.graph.size).toBeGreaterThan(0);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(projection.documentIri),
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}AsciiDocDocument`),
				),
			),
		).toBe(true);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(projection.documentIri),
					iriTerm(`${namespaces.aat}relativePath`),
					stringLiteral("docs/empty.adoc"),
				),
			),
		).toBe(true);
	});

	it("does not project label resources before the label batch", () => {
		const projection = projectAbundantDocumentToRdf12(
			{
				...emptyDocument(path.join(documentRoot, "docs", "with-child.adoc")),
				children: [
					{
						kind: "section",
						level: 1,
						ids: ["section-basics"],
						title: "2. 基础概念",
						idOrigin: "source",
						line: 12,
						span: {
							startLine: 12,
							endLine: 24,
						},
					},
				],
			},
			{ documentRoot },
		);

		expect(
			projection.graph.match({
				object: iriTerm(`${namespaces.aat}TitleLabel`),
			}),
		).toHaveLength(0);
		expect(
			projection.graph.toArray().map((triple) => triple.subject.value),
		).not.toEqual(
			expect.arrayContaining([expect.stringContaining("label-l12")]),
		);
	});
});

function emptyDocument(sourcePath: string): AbundantDocument {
	return {
		kind: "document",
		sourcePath,
		mode: "single-file",
		parser: {
			name: "@asciidoctor/core",
			version: "test",
		},
		children: [],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
}
