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
					iriTerm(`${namespaces.aat}HeadingProjection`),
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
		).toBe(false);
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
					sourceDocument,
				),
			),
		).toBe(true);
		expectPublicTypeAbsent(graph, "AsciiDocDocument");
		expectPublicTypeAbsent(graph, "AbundantDocument");
		expect(
			graph.match({
				object: iriTerm(projection.abundantDocumentIri),
			}),
		).toHaveLength(0);
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

function expectPublicTypeAbsent(
	graph: ReturnType<typeof projectAbundantDocumentToRdf12>["graph"],
	typeLocalName: string,
): void {
	expect(
		graph.match({
			predicate: iriTerm(`${namespaces.rdf}type`),
			object: iriTerm(`${namespaces.aat}${typeLocalName}`),
		}),
	).toHaveLength(0);
}

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
