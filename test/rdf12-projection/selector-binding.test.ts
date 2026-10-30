import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";
import { headingStartingAt, labelOwners } from "./helpers/graph-matchers";

const projectRoot = process.cwd();
const referencePath = join(projectRoot, "samples/reference-links.adoc");

// selector 绑定到 label 空间里与它整串相等的全部拥有者（06 号书第 2 章「地址与 Label 空间」、第 5 章「Target
// Heading」）：一个、没有，或几个，投影器不再把结果分成“绑定 / 未解析 / 多义”三种结论。
describe("rdf12 selector binding", () => {
	it("binds selectors to heading address labels", async () => {
		const projection = await referenceProjection();

		expect(labelOwners(projection.graph, "section-basics")).toEqual([
			headingStartingAt(projection.graph, 12),
		]);
	});

	it("binds selectors to heading generated address labels and headlines", async () => {
		const projection = await referenceProjection();

		expect(labelOwners(projection.graph, "_1_引言")).toEqual([
			headingStartingAt(projection.graph, 8),
		]);
		expect(labelOwners(projection.graph, "3. 核心引擎设计")).toEqual([
			headingStartingAt(projection.graph, 25),
		]);
	});

	it("binds local non-heading target ids to their owning heading", async () => {
		const reference = await referenceProjection();

		for (const [selector, headingStartLine] of [
			["engine-code", 25],
			["perf-table", 40],
			["warning-text", 40],
		] as const) {
			expect(labelOwners(reference.graph, selector)).toEqual([
				headingStartingAt(reference.graph, headingStartLine),
			]);
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

			expect(labelOwners(projection.graph, selector)).toEqual([
				headingStartingAt(projection.graph, 3),
			]);
		}
	});

	it("keeps non-address surfaces out of selector binding", async () => {
		const projection = projectAbundantDocumentToRdf12(
			await parseAbundantTree({
				sourcePath: join(projectRoot, "samples/structural-payload.adoc"),
			}),
			{ documentRoot: projectRoot },
		);
		const [deliveryHeading] = labelOwners(projection.graph, "delivery");

		for (const selector of [
			"section",
			"policy",
			"banana",
			"pear",
			"配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery]。",
			deliveryHeading?.value ?? "",
		]) {
			expect(labelOwners(projection.graph, selector)).toEqual([]);
		}
	});

	it("binds an unknown selector to no heading", async () => {
		const projection = await referenceProjection();

		expect(labelOwners(projection.graph, "missing-target")).toEqual([]);
	});

	it("binds a selector shared by several headings to all of them", () => {
		const projection = projectAbundantDocumentToRdf12(duplicateDocument(), {
			documentRoot: projectRoot,
		});

		expect(labelOwners(projection.graph, "Duplicate")).toEqual(
			[
				headingStartingAt(projection.graph, 1),
				headingStartingAt(projection.graph, 4),
			].toSorted((left, right) => left.value.localeCompare(right.value)),
		);
	});

	it("binds a local target alias that belongs to several headings to all of them", () => {
		const projection = projectAbundantDocumentToRdf12(
			ambiguousTargetAliasDocument(),
			{ documentRoot: projectRoot },
		);

		expect(labelOwners(projection.graph, "shared")).toEqual(
			[
				headingStartingAt(projection.graph, 1),
				headingStartingAt(projection.graph, 5),
			].toSorted((left, right) => left.value.localeCompare(right.value)),
		);
	});

	it("counts a heading once when the same local target alias repeats inside it", () => {
		const projection = projectAbundantDocumentToRdf12(repeatedAliasDocument(), {
			documentRoot: projectRoot,
		});

		expect(labelOwners(projection.graph, "shared")).toEqual([
			headingStartingAt(projection.graph, 1),
		]);
	});

	it("does not bind a selector from xref display labels", () => {
		const projection = projectAbundantDocumentToRdf12(xrefDisplayDocument(), {
			documentRoot: projectRoot,
		});

		expect(labelOwners(projection.graph, "Display Label")).toEqual([]);
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.rdf}value`),
				object: stringLiteral("Display Label"),
			}),
		).toHaveLength(0);
	});
});

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
