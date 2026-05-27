import { describe, expect, it } from "vitest";
import type { AsciidoctorBlock } from "../src/asciidoctor-adapter";
import { scanInlineOccurrencesInOfficialBlocks } from "../src/inline-occurrence-scanner";
import type { SectionNode } from "../src/model";
import {
	projectOfficialDocument,
	rowsFromTable,
} from "../src/official-projector";
import { buildLineTable } from "../src/source-lines";

describe("official-projector helpers", () => {
	it("handles missing and irregular table row groups", () => {
		expect(rowsFromTable(null)).toEqual([]);
		expect(
			rowsFromTable({
				head: [["head-1", { getText: () => "head-2" }], "skip"],
				body: [[{ getText: () => "body-1" }], [{ getText: () => "body-2" }]],
				foot: [[{ getText: () => "foot-1" }]],
			}),
		).toEqual([["head-1", "head-2"], ["body-1"], ["body-2"], ["foot-1"]]);
	});

	it("projects sections by official block identity instead of colliding source lines", () => {
		const firstBlock = makeSectionBlock("First Block", "first-id", 2);
		const secondBlock = makeSectionBlock("Second Block", "second-id", 2);
		const firstSection = makeSectionNode("First Block", "first-id", 2);
		const secondSection = makeSectionNode("Second Block", "second-id", 2);
		const sectionByBlock = new WeakMap<AsciidoctorBlock, SectionNode>([
			[firstBlock, firstSection],
			[secondBlock, secondSection],
		]);

		const projected = projectOfficialDocument({
			officialDocument: {
				getBlocks: () => [firstBlock, secondBlock],
			},
			lineTable: buildLineTable("= Probe\n== Same Line\n== Same Line\n"),
			sections: [secondSection, firstSection],
			sectionByLine: new Map([
				[2, firstSection],
				[3, secondSection],
			]),
			xrefOccurrences: [],
			anchorOccurrences: [],
			intervalByBlock: new WeakMap(),
			sectionByBlock,
			adapter: {
				parserVersion: "test",
				loadFile: () => ({}) as AsciidoctorBlock,
				extractAnchorBindings: () => [],
				resolveXrefTarget: () => undefined,
				resolveXrefBinding: () => undefined,
			},
		});

		expect(
			projected.children.map((node) =>
				node.kind === "section" ? node.title : undefined,
			),
		).toEqual(["First Block", "Second Block"]);
		expect(projected.targets.map((target) => target.id)).toEqual([
			"first-id",
			"second-id",
		]);
	});
});

describe("official table inline scanning", () => {
	it("skips tables without official row groups or usable cells", () => {
		const tableBlock = {
			getContext: () => "table",
			getRows: () => ({
				head: "not rows",
				body: [["not a cell"], "not a row"],
			}),
		} satisfies AsciidoctorBlock;
		const intervalByBlock = new WeakMap([
			[
				tableBlock,
				{
					blockStartLine: 1,
					metadata: [],
					contentSpan: { startLine: 1, endLine: 2 },
					span: { startLine: 1, endLine: 2 },
					diagnostics: [],
				},
			],
		]);

		const { xrefOccurrences } = scanInlineOccurrencesInOfficialBlocks({
			lineTable: buildLineTable("<<not-cell>>\n<<also-not-cell>>\n"),
			blockSurfaces: [
				{
					block: tableBlock,
					context: "table",
					nodeName: "table",
					level: undefined,
					title: undefined,
					id: undefined,
					sourceLine: 1,
					children: [],
					indexInParent: 0,
				},
			],
			intervalByBlock,
		});

		expect(xrefOccurrences).toEqual([]);
	});

	it("scans only official table cell ranges, not delimiter or separator source lines", () => {
		const tableBlock = {
			getContext: () => "table",
			getRows: () => ({
				head: [],
				foot: [],
				body: [
					[
						{
							getLineNumber: () => 4,
							getLines: () => ["cell <<cell>>"],
						},
					],
				],
			}),
		} satisfies AsciidoctorBlock;
		const intervalByBlock = new WeakMap([
			[
				tableBlock,
				{
					blockStartLine: 1,
					metadata: [],
					contentSpan: { startLine: 2, endLine: 5 },
					span: { startLine: 1, endLine: 6 },
					diagnostics: [],
				},
			],
		]);

		const { xrefOccurrences } = scanInlineOccurrencesInOfficialBlocks({
			lineTable: buildLineTable(
				[
					"|===",
					"|=== <<delimiter>>",
					"| header <<header>>",
					"cell <<cell>>",
					"|=== <<separator>>",
					"|===",
				].join("\n"),
			),
			blockSurfaces: [
				{
					block: tableBlock,
					context: "table",
					nodeName: "table",
					level: undefined,
					title: undefined,
					id: undefined,
					sourceLine: 1,
					children: [],
					indexInParent: 0,
				},
			],
			intervalByBlock,
		});

		expect(xrefOccurrences.map((xref) => xref.raw)).toEqual(["<<cell>>"]);
	});

	it("deduplicates same-line table cells and recurses through asciidoc cell containers", () => {
		const tableBlock = {
			getContext: () => "table",
			getRows: () => ({
				head: [],
				foot: [],
				body: [
					[
						{
							getLineNumber: () => 1,
							getLines: () => ["left <<same-line>>"],
						},
						{
							getLineNumber: () => 1,
							getLines: () => ["right"],
						},
					],
					[
						{
							getInnerDocument: () => ({
								getBlocks: () => [
									{
										getContext: () => "section",
										getBlocks: () => [
											{
												getContext: () => "paragraph",
												getSource: () => "section paragraph <<inner-section>>",
												getSourceLocation: () => ({
													getLineNumber: () => 3,
												}),
											},
										],
									},
									{
										getContext: () => "open",
										getBlocks: () => [
											{
												getContext: () => "paragraph",
												getSource: () => "open paragraph <<inner-open>>",
												getSourceLocation: () => ({
													getLineNumber: () => 4,
												}),
											},
										],
									},
									{
										getContext: () => "listing",
										getSource: () => "<<skip-listing>>",
										getSourceLocation: () => ({
											getLineNumber: () => 5,
										}),
									},
								],
							}),
						},
					],
				],
			}),
		} satisfies AsciidoctorBlock;
		const intervalByBlock = new WeakMap([
			[
				tableBlock,
				{
					blockStartLine: 1,
					metadata: [],
					contentSpan: { startLine: 1, endLine: 5 },
					span: { startLine: 1, endLine: 5 },
					diagnostics: [],
				},
			],
		]);

		const { xrefOccurrences } = scanInlineOccurrencesInOfficialBlocks({
			lineTable: buildLineTable(
				[
					"left <<same-line>> right",
					"not in any official cell <<outside>>",
					"section paragraph <<inner-section>>",
					"open paragraph <<inner-open>>",
					"<<skip-listing>>",
				].join("\n"),
			),
			blockSurfaces: [
				{
					block: tableBlock,
					context: "table",
					nodeName: "table",
					level: undefined,
					title: undefined,
					id: undefined,
					sourceLine: 1,
					children: [],
					indexInParent: 0,
				},
			],
			intervalByBlock,
		});

		expect(xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"<<same-line>>",
			"<<inner-section>>",
			"<<inner-open>>",
		]);
	});
});

function makeSectionBlock(
	title: string,
	id: string,
	line: number,
): AsciidoctorBlock {
	return {
		getBlocks: () => [],
		getContext: () => "section",
		getId: () => id,
		getLevel: () => 1,
		getNodeName: () => "section",
		getSourceLocation: () => ({
			getLineNumber: () => line,
		}),
		getTitle: () => title,
	};
}

function makeSectionNode(title: string, id: string, line: number): SectionNode {
	return {
		kind: "section",
		level: 1,
		ids: [id],
		title,
		line,
		span: { startLine: line, endLine: line },
		idOrigin: "source",
		children: [],
	};
}
