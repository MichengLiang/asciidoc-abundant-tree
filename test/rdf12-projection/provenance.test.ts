import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { rdf12Triple } from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";

describe("rdf12 provenance resources", () => {
	const documentRoot = path.resolve("/repo");
	const document = emptyDocument(path.join(documentRoot, "docs", "empty.adoc"));

	it("writes required provenance triples", () => {
		const projection = projectAbundantDocumentToRdf12(document, {
			documentRoot,
		});
		const graph = projection.graph;
		const sourceDocument = iriTerm(projection.sourceDocumentIri);
		const projectionEntity = iriTerm(projection.projectionIri);
		const projectionActivity = iriTerm(projection.projectionActivityIri);
		const abundantDocument = iriTerm(projection.abundantDocumentIri);

		expect(
			graph.has(
				rdf12Triple(
					sourceDocument,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.prov}Entity`),
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					sourceDocument,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}AsciiDocSourceDocument`),
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					sourceDocument,
					iriTerm(`${namespaces.aat}relativePath`),
					stringLiteral("docs/empty.adoc"),
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					projectionEntity,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}RdfProjection`),
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					projectionEntity,
					iriTerm(`${namespaces.prov}hadPrimarySource`),
					sourceDocument,
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					projectionEntity,
					iriTerm(`${namespaces.prov}wasGeneratedBy`),
					projectionActivity,
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					projectionEntity,
					iriTerm(`${namespaces.dcterms}source`),
					sourceDocument,
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					projectionActivity,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.prov}Activity`),
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					projectionActivity,
					iriTerm(`${namespaces.prov}used`),
					sourceDocument,
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					projectionActivity,
					iriTerm(`${namespaces.prov}used`),
					abundantDocument,
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					abundantDocument,
					iriTerm(`${namespaces.prov}wasDerivedFrom`),
					sourceDocument,
				),
			),
		).toBe(true);
	});

	it("omits sourceDigest when no source digest is available", () => {
		const projection = projectAbundantDocumentToRdf12(document, {
			documentRoot,
		});

		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.aat}sourceDigest`),
			}),
		).toHaveLength(0);
	});

	it("writes sourceDigest when provided", () => {
		const projection = projectAbundantDocumentToRdf12(document, {
			documentRoot,
			sourceDigest: "sha256:provided",
		});

		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(projection.sourceDocumentIri),
					iriTerm(`${namespaces.aat}sourceDigest`),
					stringLiteral("sha256:provided"),
				),
			),
		).toBe(true);
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
