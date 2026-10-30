import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import {
	createRdf12LabelCatalog,
	type Rdf12HeadingLabelKind,
	type Rdf12LabelCatalog,
} from "../../src/rdf12-projection/label-catalog";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import {
	projectAbundantDocumentToRdf12,
	type Rdf12Projection,
} from "../../src/rdf12-projection/projector";
import {
	bindSelector,
	candidateNodesForSelector,
} from "../../src/rdf12-projection/selector-binding";
import { iriTerm } from "../../src/rdf12-projection/terms";
import { aatTerm, headingStartingAt } from "./helpers/graph-matchers";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 selector binding", () => {
	it("binds selectors to heading address labels", async () => {
		const projection = await referenceProjection();
		const result = bindSelector(catalogOf(projection), "section-basics");

		expect(result.status).toBe("bound");
		expect(result.selector).toBe("section-basics");
		if (result.status === "bound") {
			expect(result.target).toEqual(headingStartingAt(projection.graph, 12));
		}
	});

	it("binds selectors to heading generated address labels and headlines", async () => {
		const projection = await referenceProjection();
		const generated = bindSelector(catalogOf(projection), "_1_引言");
		const headline = bindSelector(catalogOf(projection), "3. 核心引擎设计");

		expect(generated.status).toBe("bound");
		if (generated.status === "bound") {
			expect(generated.target).toEqual(headingStartingAt(projection.graph, 8));
		}
		expect(headline.status).toBe("bound");
		if (headline.status === "bound") {
			expect(headline.target).toEqual(headingStartingAt(projection.graph, 25));
		}
	});

	it("binds local non-heading target ids to their owning heading", async () => {
		const reference = await referenceProjection();

		for (const [selector, headingStartLine] of [
			["engine-code", 25],
			["perf-table", 40],
			["warning-text", 40],
		] as const) {
			const result = bindSelector(catalogOf(reference), selector);

			expect(result.status).toBe("bound");
			if (result.status === "bound") {
				expect(result.target).toEqual(
					headingStartingAt(reference.graph, headingStartLine),
				);
			}
		}
	});

	it("binds paragraph and block target ids to their containing heading", async () => {
		for (const [fixture, selector] of [
			["paragraph-id-audit.adoc", "para-target"],
			["block-anchor-audit.adoc", "block-para"],
		] as const) {
			const projection = projectAbundantDocumentToRdf12(
				await parseAbundantTree({
					sourcePath: join(projectRoot, "test/fixtures", fixture),
				}),
				{ documentRoot: projectRoot },
			);
			const result = bindSelector(catalogOf(projection), selector);

			expect(result.status).toBe("bound");
			if (result.status === "bound") {
				expect(result.target).toEqual(headingStartingAt(projection.graph, 3));
			}
		}
	});

	it("keeps non-address surfaces out of selector binding", async () => {
		const payloadProjection = projectAbundantDocumentToRdf12(
			await parseAbundantTree({
				sourcePath: join(projectRoot, "samples/structural-payload.adoc"),
			}),
			{ documentRoot: projectRoot },
		);
		const [deliveryHeading] = catalogOf(payloadProjection).owners("delivery");

		for (const [projection, selector] of [
			[payloadProjection, "section"],
			[payloadProjection, "policy"],
			[payloadProjection, "banana"],
			[payloadProjection, "pear"],
			[
				payloadProjection,
				"配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery]。",
			],
			[payloadProjection, deliveryHeading?.value ?? ""],
		] as const) {
			expect(bindSelector(catalogOf(projection), selector)).toEqual({
				status: "unresolved",
				selector,
				selectorLiteral: selector,
			});
		}
	});

	it("keeps unresolved selector literal available without creating a target", async () => {
		const projection = await referenceProjection();
		const result = bindSelector(catalogOf(projection), "missing-target");

		expect(result).toEqual({
			status: "unresolved",
			selector: "missing-target",
			selectorLiteral: "missing-target",
		});
	});

	it("returns all candidate headings for duplicate selector matches", () => {
		const projection = projectAbundantDocumentToRdf12(duplicateDocument(), {
			documentRoot: projectRoot,
		});
		const result = bindSelector(catalogOf(projection), "Duplicate");

		expect(result.status).toBe("ambiguous");
		if (result.status === "ambiguous") {
			expect(result.selectorLiteral).toBe("Duplicate");
			expect(result.candidates.map((candidate) => candidate.value)).toEqual([
				headingStartingAt(projection.graph, 1).value,
				headingStartingAt(projection.graph, 4).value,
			]);
			expect("target" in result).toBe(false);
		}
		expect(
			candidateNodesForSelector(catalogOf(projection), "Duplicate").map(
				(candidate) => candidate.value,
			),
		).toEqual([
			headingStartingAt(projection.graph, 1).value,
			headingStartingAt(projection.graph, 4).value,
		]);
	});

	it("keeps local target aliases ambiguous when they belong to multiple headings", () => {
		const document = ambiguousTargetAliasDocument();
		const projection = projectAbundantDocumentToRdf12(document, {
			documentRoot: projectRoot,
		});
		const result = bindSelector(catalogOf(projection), "shared");

		expect(result.status).toBe("ambiguous");
		if (result.status === "ambiguous") {
			expect(result.candidates.map((candidate) => candidate.value)).toEqual([
				headingStartingAt(projection.graph, 1).value,
				headingStartingAt(projection.graph, 5).value,
			]);
		}
	});

	it("deduplicates repeated local target aliases within one heading", () => {
		const projection = projectAbundantDocumentToRdf12(repeatedAliasDocument(), {
			documentRoot: projectRoot,
		});
		const result = bindSelector(catalogOf(projection), "shared");

		expect(result.status).toBe("bound");
		if (result.status === "bound") {
			expect(result.target).toEqual(headingStartingAt(projection.graph, 1));
		}
	});

	it("does not bind a selector from xref display labels", () => {
		const projection = projectAbundantDocumentToRdf12(xrefDisplayDocument(), {
			documentRoot: projectRoot,
		});

		expect(bindSelector(catalogOf(projection), "Display Label")).toEqual({
			status: "unresolved",
			selector: "Display Label",
			selectorLiteral: "Display Label",
		});
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.rdf}value`),
				object: stringLiteral("Display Label"),
			}),
		).toHaveLength(0);
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

// 绑定目录与图上的标签是同一份事实：从标题节点上的四个标签谓词建目录（06 号书第 2 章「地址与 Label 空间」）。
function catalogOf(projection: Rdf12Projection): Rdf12LabelCatalog {
	const catalog = createRdf12LabelCatalog();
	for (const labelKind of [
		"headline",
		"addressPath",
		"addressLabel",
		"generatedAddressLabel",
	] satisfies Rdf12HeadingLabelKind[]) {
		for (const triple of projection.graph.match({
			predicate: aatTerm(labelKind),
		})) {
			if (triple.object.termType === "literal") {
				catalog.add({
					owner: triple.subject,
					labelKind,
					value: triple.object.value,
				});
			}
		}
	}
	return catalog;
}

async function referenceProjection() {
	return projectAbundantDocumentToRdf12(
		await parseAbundantTree({ sourcePath: referencePath }),
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
				title: "Duplicate",
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
					end: { line: 1, column: 12 },
				},
			},
			{
				kind: "section",
				level: 1,
				ids: [],
				title: "Duplicate",
				idOrigin: "unknown",
				span: { startLine: 4, endLine: 5 },
				titleSpan: {
					start: { line: 4, column: 4 },
					end: { line: 4, column: 12 },
				},
			},
		],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		headingInlineMetadataOccurrences: [],
		toolDiagnostics: [],
	};
}

function ambiguousTargetAliasDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: referencePath,
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "section",
				level: 1,
				ids: ["shared"],
				title: "First",
				idOrigin: "source",
				span: { startLine: 1, endLine: 4 },
				metadata: [
					{
						kind: "metadata",
						metadataKind: "id",
						raw: "[#shared]",
						line: 1,
						ids: ["shared"],
					},
				],
				titleSpan: {
					start: { line: 1, column: 4 },
					end: { line: 1, column: 9 },
				},
			},
			{
				kind: "section",
				level: 1,
				ids: ["second"],
				title: "Second",
				idOrigin: "source",
				span: { startLine: 5, endLine: 9 },
				metadata: [
					{
						kind: "metadata",
						metadataKind: "id",
						raw: "[#second]",
						line: 5,
						ids: ["second"],
					},
				],
				titleSpan: {
					start: { line: 5, column: 4 },
					end: { line: 5, column: 10 },
				},
			},
		],
		targets: [
			{
				kind: "target",
				id: "shared",
				targetType: "block",
				idOrigin: "source",
				sourceSpan: {
					start: { line: 8, column: 1 },
					end: { line: 8, column: 9 },
				},
			},
		],
		xrefOccurrences: [],
		anchorOccurrences: [],
		headingInlineMetadataOccurrences: [],
		toolDiagnostics: [],
	};
}

function repeatedAliasDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: referencePath,
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "section",
				level: 1,
				ids: ["owner"],
				title: "Owner",
				idOrigin: "source",
				span: { startLine: 1, endLine: 10 },
				metadata: [
					{
						kind: "metadata",
						metadataKind: "id",
						raw: "[#owner]",
						line: 1,
						ids: ["owner"],
					},
				],
				titleSpan: {
					start: { line: 1, column: 4 },
					end: { line: 1, column: 9 },
				},
			},
		],
		targets: [
			{
				kind: "target",
				id: "shared",
				targetType: "block",
				idOrigin: "source",
				sourceSpan: {
					start: { line: 4, column: 1 },
					end: { line: 4, column: 9 },
				},
			},
			{
				kind: "target",
				id: "shared",
				targetType: "inline-anchor",
				idOrigin: "source",
				sourceSpan: {
					start: { line: 6, column: 1 },
					end: { line: 6, column: 9 },
				},
			},
		],
		xrefOccurrences: [],
		anchorOccurrences: [],
		headingInlineMetadataOccurrences: [],
		toolDiagnostics: [],
	};
}

function xrefDisplayDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: referencePath,
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "paragraph",
				text: "See Display Label.",
				source: {
					span: { startLine: 3, endLine: 3 },
				},
				children: [
					{
						kind: "xref",
						syntax: "shorthand",
						raw: "<<target,Display Label>>",
						target: "target",
						label: "Display Label",
						sourceSpan: {
							start: { line: 3, column: 5 },
							end: { line: 3, column: 28 },
						},
					},
				],
			},
		],
		targets: [],
		xrefOccurrences: [],
		anchorOccurrences: [],
		headingInlineMetadataOccurrences: [],
		toolDiagnostics: [],
	};
}
