import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import {
	bindSelector,
	candidateNodesForSelector,
} from "../../src/rdf12-projection/selector-binding";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 selector binding", () => {
	it("binds a unique selector to the matching resource IRI", () => {
		const projection = referenceProjection();
		const result = bindSelector(projection.labelCatalog, "engine-code");

		expect(result.status).toBe("bound");
		expect(result.selector).toBe("engine-code");
		if (result.status === "bound") {
			expect(result.target.value).toContain("#listing-l29-o0");
		}
	});

	it("keeps unresolved selector literal available without creating a target", () => {
		const projection = referenceProjection();
		const result = bindSelector(projection.labelCatalog, "missing-target");

		expect(result).toEqual({
			status: "unresolved",
			selector: "missing-target",
			selectorLiteral: "missing-target",
		});
	});

	it("returns candidate nodes for duplicate selector matches", () => {
		const projection = projectAbundantDocumentToRdf12(duplicateDocument(), {
			documentRoot: projectRoot,
		});
		const result = bindSelector(projection.labelCatalog, "duplicate-target");

		expect(result.status).toBe("ambiguous");
		if (result.status === "ambiguous") {
			expect(result.selectorLiteral).toBe("duplicate-target");
			expect(result.candidates.map((candidate) => candidate.value)).toEqual([
				expect.stringContaining("#section-l1-o0"),
				expect.stringContaining("#section-l4-o0"),
			]);
			expect("target" in result).toBe(false);
		}
		expect(
			candidateNodesForSelector(
				projection.labelCatalog,
				"duplicate-target",
			).map((candidate) => candidate.value),
		).toHaveLength(2);
	});

	it("uses TargetNode catalog supplementation without creating TargetNode resources", () => {
		const document = targetSupplementDocument();
		const projection = projectAbundantDocumentToRdf12(document, {
			documentRoot: projectRoot,
		});
		const result = bindSelector(projection.labelCatalog, "supplemented-id");

		expect(result.status).toBe("bound");
		if (result.status === "bound") {
			expect(result.target.value).toContain("#section-l10-o0");
		}
		expect(
			projection.graph
				.toArray()
				.map((triple) => triple.subject.value)
				.some((subject) => subject.includes("#target")),
		).toBe(false);
	});

	it("throws when a catalog reports one candidate without an owner term", () => {
		expect(() =>
			bindSelector(
				{
					add: () => undefined,
					find: () => [],
					owners: () => [undefined] as never,
					entries: () => [],
				},
				"broken-selector",
			),
		).toThrow(/unexpectedly empty/u);
	});
});

function referenceProjection() {
	return projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: referencePath }),
		{
			documentRoot: projectRoot,
		},
	);
}

function duplicateDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: referencePath,
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "section",
				level: 1,
				ids: ["duplicate-target"],
				title: "First",
				idOrigin: "source",
				span: { startLine: 1, endLine: 2 },
				metadata: [
					{
						kind: "metadata",
						metadataKind: "id",
						raw: "[#duplicate-target]",
						line: 1,
						ids: ["duplicate-target"],
					},
				],
				titleSpan: {
					start: { line: 1, column: 4 },
					end: { line: 1, column: 8 },
				},
			},
			{
				kind: "section",
				level: 1,
				ids: ["duplicate-target"],
				title: "Second",
				idOrigin: "source",
				span: { startLine: 4, endLine: 5 },
				metadata: [
					{
						kind: "metadata",
						metadataKind: "id",
						raw: "[#duplicate-target]",
						line: 4,
						ids: ["duplicate-target"],
					},
				],
				titleSpan: {
					start: { line: 4, column: 4 },
					end: { line: 4, column: 9 },
				},
			},
		],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
}

function targetSupplementDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: referencePath,
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "section",
				level: 1,
				ids: [],
				title: "Supplemented",
				idOrigin: "unknown",
				span: { startLine: 10, endLine: 12 },
				titleSpan: {
					start: { line: 10, column: 4 },
					end: { line: 10, column: 15 },
				},
			},
		],
		targets: [
			{
				kind: "target",
				id: "supplemented-id",
				targetType: "section",
				title: "Supplemented",
				idOrigin: "source",
				sourceSpan: {
					start: { line: 10, column: 1 },
					end: { line: 12, column: 1 },
				},
			},
		],
		xrefOccurrences: [],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
}
