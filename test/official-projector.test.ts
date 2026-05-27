import { describe, expect, it } from "vitest";
import type { AsciidoctorBlock } from "../src/asciidoctor-adapter";
import { scanInlineOccurrencesInOfficialBlocks } from "../src/inline-occurrence-scanner";
import type {
	AnchorOccurrenceNode,
	SectionNode,
	XrefOccurrenceNode,
} from "../src/model";
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

	it("uses official text to locate open-block children without source locations", () => {
		const paragraphBlock = {
			getBlocks: () => [],
			getContext: () => "paragraph",
			getId: () => "nested-paragraph",
			getNodeName: () => "paragraph",
			getSource: () => "Nested paragraph inside an open block.",
		} satisfies AsciidoctorBlock;
		const openBlock = {
			getBlocks: () => [paragraphBlock],
			getContext: () => "open",
			getNodeName: () => "open",
			getSourceLocation: () => ({
				getLineNumber: () => 1,
			}),
		} satisfies AsciidoctorBlock;

		const projected = projectOfficialDocument({
			officialDocument: {
				getBlocks: () => [openBlock],
			},
			lineTable: buildLineTable(
				"--\nNested paragraph inside an open block.\n--\n",
			),
			sections: [],
			sectionByLine: new Map(),
			xrefOccurrences: [],
			anchorOccurrences: [],
			intervalByBlock: new WeakMap(),
			sectionByBlock: new WeakMap(),
			adapter: fakeAdapter(),
		});

		expect(projected.children).toEqual([
			expect.objectContaining({
				kind: "paragraph",
				text: "Nested paragraph inside an open block.",
				source: expect.objectContaining({
					span: { startLine: 2, endLine: 2 },
				}),
			}),
		]);
		expect(projected.targets).toEqual([
			expect.objectContaining({
				id: "nested-paragraph",
				targetType: "block",
				sourceSpan: expect.objectContaining({
					start: { line: 2, column: 1 },
				}),
			}),
		]);
	});

	it("deduplicates anchors already consumed by paragraph children", () => {
		const paragraphBlock = {
			getBlocks: () => [],
			getContext: () => "paragraph",
			getNodeName: () => "paragraph",
			getSourceLocation: () => ({
				getLineNumber: () => 1,
			}),
		} satisfies AsciidoctorBlock;
		const duplicateAnchor: AnchorOccurrenceNode = {
			kind: "anchor",
			syntax: "double-bracket",
			raw: "[[dup]]",
			ids: ["dup"],
			sourceSpan: {
				start: { line: 1, column: 1 },
				end: { line: 1, column: 8 },
			},
		};

		const projected = projectOfficialDocument({
			officialDocument: {
				getBlocks: () => [paragraphBlock, paragraphBlock],
			},
			lineTable: buildLineTable("[[dup]] paragraph\n"),
			sections: [],
			sectionByLine: new Map(),
			xrefOccurrences: [],
			anchorOccurrences: [duplicateAnchor, duplicateAnchor],
			intervalByBlock: new WeakMap([
				[
					paragraphBlock,
					{
						blockStartLine: 1,
						metadata: [],
						contentSpan: { startLine: 1, endLine: 1 },
						span: { startLine: 1, endLine: 1 },
						diagnostics: [],
					},
				],
			]),
			sectionByBlock: new WeakMap(),
			adapter: fakeAdapter(),
		});

		expect(
			projected.children.map((node) =>
				node.children?.map((child) => child.kind),
			),
		).toEqual([["anchor"], []]);
	});

	it("skips official sections that have no source surface identity", () => {
		const sectionBlock = makeSectionBlock("Missing Surface", "missing-id", 2);

		const projected = projectOfficialDocument({
			officialDocument: {
				getBlocks: () => [sectionBlock],
			},
			lineTable: buildLineTable("= Probe\n== Missing Surface\n"),
			sections: [],
			sectionByLine: new Map(),
			xrefOccurrences: [],
			anchorOccurrences: [],
			intervalByBlock: new WeakMap(),
			sectionByBlock: new WeakMap(),
			adapter: fakeAdapter(),
		});

		expect(projected.children).toEqual([]);
		expect(projected.targets).toEqual([]);
	});

	it("uses official ids as listing and table targets when source metadata is absent", () => {
		const listingBlock = {
			getBlocks: () => [],
			getContext: () => "listing",
			getId: () => "official-listing",
			getNodeName: () => "listing",
			getSource: () => "code",
			getSourceLocation: () => ({
				getLineNumber: () => 1,
			}),
			getTitle: () => "Official Listing",
		} satisfies AsciidoctorBlock;
		const tableBlock = {
			getBlocks: () => [],
			getContext: () => "table",
			getId: () => "official-table",
			getNodeName: () => "table",
			getRows: () => ({
				body: [[{ getText: () => "cell" }]],
			}),
			getSourceLocation: () => ({
				getLineNumber: () => 3,
			}),
			getTitle: () => "Official Table",
		} satisfies AsciidoctorBlock;

		const projected = projectOfficialDocument({
			officialDocument: {
				getBlocks: () => [listingBlock, tableBlock],
			},
			lineTable: buildLineTable("----\ncode\n|===\n| cell\n|===\n"),
			sections: [],
			sectionByLine: new Map(),
			xrefOccurrences: [],
			anchorOccurrences: [],
			intervalByBlock: new WeakMap(),
			sectionByBlock: new WeakMap(),
			adapter: fakeAdapter(),
		});

		expect(projected.children).toEqual([
			expect.objectContaining({
				kind: "listing",
				ids: ["official-listing"],
				title: "Official Listing",
			}),
			expect.objectContaining({
				kind: "table",
				ids: ["official-table"],
				title: "Official Table",
				rows: [["cell"]],
			}),
		]);
		expect(
			projected.targets.map((target) => [target.id, target.targetType]),
		).toEqual([
			["official-listing", "listing"],
			["official-table", "table"],
		]);
	});

	it("deduplicates table anchors and resolves table xref bindings", () => {
		const tableBlock = {
			getBlocks: () => [],
			getContext: () => "table",
			getNodeName: () => "table",
			getRows: () => ({
				body: [[{ getText: () => "cell" }]],
			}),
			getSourceLocation: () => ({
				getLineNumber: () => 1,
			}),
		} satisfies AsciidoctorBlock;
		const duplicateAnchor: AnchorOccurrenceNode = {
			kind: "anchor",
			syntax: "double-bracket",
			raw: "[[table-anchor]]",
			ids: ["table-anchor"],
			sourceSpan: {
				start: { line: 2, column: 1 },
				end: { line: 2, column: 17 },
			},
		};
		const xref: XrefOccurrenceNode = {
			kind: "xref",
			syntax: "shorthand",
			raw: "<<target>>",
			target: "target",
			sourceSpan: {
				start: { line: 3, column: 1 },
				end: { line: 3, column: 11 },
			},
		};

		const projected = projectOfficialDocument({
			officialDocument: {
				getBlocks: () => [tableBlock],
			},
			lineTable: buildLineTable("|===\n[[table-anchor]]\n<<target>>\n|===\n"),
			sections: [],
			sectionByLine: new Map(),
			xrefOccurrences: [xref],
			anchorOccurrences: [duplicateAnchor, duplicateAnchor],
			intervalByBlock: new WeakMap([
				[
					tableBlock,
					{
						blockStartLine: 1,
						metadata: [],
						contentSpan: { startLine: 2, endLine: 3 },
						span: { startLine: 1, endLine: 4 },
						diagnostics: [],
					},
				],
			]),
			sectionByBlock: new WeakMap(),
			adapter: {
				...fakeAdapter(),
				resolveXrefBinding: () => ({
					href: "#target",
					resolvedId: "target",
					reftext: "Target",
				}),
			},
		});

		expect(projected.children).toEqual([
			expect.objectContaining({
				kind: "table",
				children: [
					expect.objectContaining({
						kind: "anchor",
						raw: "[[table-anchor]]",
					}),
					expect.objectContaining({
						kind: "xref",
						asciidoctor: expect.objectContaining({
							href: "#target",
							resolvedId: "target",
						}),
					}),
				],
			}),
		]);
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
			adapter: fakeAdapter(),
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

	it("scans macro xref attributes, anchor macros, and disjoint table cell ranges", () => {
		const tableBlock = {
			getContext: () => "table",
			getRows: () => ({
				head: [],
				foot: [],
				body: [
					[
						{
							getLineNumber: () => 1,
							getLines: () => ["first"],
						},
					],
					[
						{
							getLineNumber: () => 3,
							getLines: () => ["second"],
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
					contentSpan: { startLine: 1, endLine: 3 },
					span: { startLine: 1, endLine: 3 },
					diagnostics: [],
				},
			],
		]);

		const { xrefOccurrences, anchorOccurrences } =
			scanInlineOccurrencesInOfficialBlocks({
				lineTable: buildLineTable(
					[
						"first xref:target.adoc#id[Label,role=nav,window=_blank]",
						"outside <<not-cell>>",
						"second anchor:cell-anchor[Cell Anchor]",
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

		expect(xrefOccurrences).toEqual([
			expect.objectContaining({
				raw: "xref:target.adoc#id[Label,role=nav,window=_blank]",
				syntax: "macro",
				target: "target.adoc#id",
				label: "Label",
				attributes: {
					role: "nav",
					window: "_blank",
				},
				scope: "external",
			}),
		]);
		expect(anchorOccurrences).toEqual([
			expect.objectContaining({
				raw: "anchor:cell-anchor[Cell Anchor]",
				syntax: "macro",
				ids: ["cell-anchor"],
				reftext: "Cell Anchor",
				anchorScope: "inline",
			}),
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

function fakeAdapter() {
	return {
		parserVersion: "test",
		loadFile: () => ({}) as AsciidoctorBlock,
		extractAnchorBindings: () => [],
		resolveXrefTarget: () => undefined,
		resolveXrefBinding: () => undefined,
	};
}
