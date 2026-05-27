import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 structure projection", () => {
	it("projects sample section resources with relative path and line span", () => {
		const projection = projectAbundantDocumentToRdf12(referenceDocument(), {
			documentRoot: projectRoot,
		});
		const sections = resourcesOfType(
			projection.graph,
			`${namespaces.aat}Section`,
		);

		expect(sections).toHaveLength(5);
		const intro = sections.find((iri) => iri.includes("#section-l8-o0"));
		expect(intro).toBeDefined();
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(intro ?? ""),
					iriTerm(`${namespaces.aat}relativePath`),
					stringLiteral("samples/reference-links.adoc"),
				),
			),
		).toBe(true);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(intro ?? ""),
					iriTerm(`${namespaces.aat}startLine`),
					integerLiteral(8),
				),
			),
		).toBe(true);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(intro ?? ""),
					iriTerm(`${namespaces.aat}endLine`),
					integerLiteral(11),
				),
			),
		).toBe(true);
	});

	it("projects paragraph source text", () => {
		const projection = projectAbundantDocumentToRdf12(referenceDocument(), {
			documentRoot: projectRoot,
		});
		const paragraphs = resourcesOfType(
			projection.graph,
			`${namespaces.aat}Paragraph`,
		);

		expect(paragraphs.length).toBeGreaterThan(0);
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.aat}sourceText`),
				object: stringLiteral("这里是宇宙探索器的核心代码设计。"),
			}),
		).toHaveLength(1);
	});

	it("projects listing full, metadata, and content spans without merging them", () => {
		const projection = projectAbundantDocumentToRdf12(referenceDocument(), {
			documentRoot: projectRoot,
		});
		const listing = resourcesOfType(
			projection.graph,
			`${namespaces.aat}ListingBlock`,
		).find((iri) => iri.includes("#listing-l29-o0"));

		expect(listing).toBeDefined();
		expectNumberTriple(projection.graph, listing ?? "", "startLine", 29);
		expectNumberTriple(projection.graph, listing ?? "", "endLine", 36);
		expectNumberTriple(
			projection.graph,
			listing ?? "",
			"metadataStartLine",
			29,
		);
		expectNumberTriple(projection.graph, listing ?? "", "metadataEndLine", 31);
		expectNumberTriple(projection.graph, listing ?? "", "contentStartLine", 33);
		expectNumberTriple(projection.graph, listing ?? "", "contentEndLine", 35);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(listing ?? ""),
					iriTerm(`${namespaces.aat}listingStyle`),
					stringLiteral("source"),
				),
			),
		).toBe(true);
		expect(
			projection.graph.has(
				rdf12Triple(
					iriTerm(listing ?? ""),
					iriTerm(`${namespaces.aat}language`),
					stringLiteral("python"),
				),
			),
		).toBe(true);
	});

	it("projects table and anchor target resources with line spans", () => {
		const projection = projectAbundantDocumentToRdf12(referenceDocument(), {
			documentRoot: projectRoot,
		});
		const table = resourcesOfType(
			projection.graph,
			`${namespaces.aat}TableBlock`,
		).find((iri) => iri.includes("#table-l45-o0"));
		const anchor = resourcesOfType(
			projection.graph,
			`${namespaces.aat}AnchorTarget`,
		).find((iri) => iri.includes("#anchor-l56-c27-o0"));

		expect(table).toBeDefined();
		expectNumberTriple(projection.graph, table ?? "", "startLine", 45);
		expectNumberTriple(projection.graph, table ?? "", "endLine", 52);
		expect(anchor).toBeDefined();
		expectNumberTriple(projection.graph, anchor ?? "", "startLine", 56);
		expectNumberTriple(projection.graph, anchor ?? "", "endLine", 56);
		expectNumberTriple(projection.graph, anchor ?? "", "startColumn", 27);
		expectNumberTriple(projection.graph, anchor ?? "", "endColumn", 43);
	});

	it("does not source-scan or synthesize fake spans", () => {
		const document: AbundantDocument = {
			kind: "document",
			sourcePath: join(projectRoot, "samples/reference-links.adoc"),
			mode: "single-file",
			parser: { name: "@asciidoctor/core", version: "test" },
			children: [
				{
					kind: "listing",
					ids: [],
					content: "content exists without spans",
				},
			],
			targets: [],
			xrefOccurrences: [],
			anchorOccurrences: [],
			toolDiagnostics: [],
		};
		const projection = projectAbundantDocumentToRdf12(document, {
			documentRoot: projectRoot,
		});

		expect(
			resourcesOfType(projection.graph, `${namespaces.aat}ListingBlock`),
		).toHaveLength(0);
	});
});

function referenceDocument(): AbundantDocument {
	return parseAbundantTree({ sourcePath: referencePath });
}

function resourcesOfType(
	graph: { toArray(): ReturnType<typeof rdf12Triple>[] },
	typeIri: string,
): string[] {
	return graph
		.toArray()
		.filter(
			(triple) =>
				triple.predicate.value === `${namespaces.rdf}type` &&
				triple.object.termType === "iri" &&
				triple.object.value === typeIri,
		)
		.map((triple) => triple.subject.value);
}

function expectNumberTriple(
	graph: { has(triple: ReturnType<typeof rdf12Triple>): boolean },
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
