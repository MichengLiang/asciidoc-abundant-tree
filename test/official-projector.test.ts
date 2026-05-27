import { describe, expect, it } from "vitest";
import type { AsciidoctorBlock } from "../src/asciidoctor-adapter";
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
