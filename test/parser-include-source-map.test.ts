import { describe, expect, it } from "vitest";
import type { AsciidoctorBlock } from "../src/asciidoctor-adapter";
import { createAsciidoctorAdapter } from "../src/asciidoctor-adapter";
import { childBlocksOf } from "../src/official-block-utils";
import { projectOfficialDocument } from "../src/official-projector";
import { parseAbundantTree } from "../src/parser";
import { nodeSourceIdentity } from "../src/source-identity-node";
import { buildLineTable } from "../src/source-lines";
import {
	projectSourceSurfaces,
	type SourceSurfaces,
} from "../src/source-surfaces";
import { writeFixture } from "./helpers";

describe("include source map handling", () => {
	it("keeps secure-mode include directives anchored to the main file", () => {
		writeFixture(
			"included-secure.adoc",
			`[#included-section]
== Included Section
`,
		);
		const path = writeFixture(
			"include-secure-main.adoc",
			`= Include Probe

== Main Before

include::included-secure.adoc[]

[#main-after]
== Main After
`,
		);

		const officialDocument = createAsciidoctorAdapter().loadFile(path);
		const document = parseAbundantTree({ sourcePath: path });

		expect(
			childBlocksOf(officialDocument)
				.flatMap((block) => childBlocksOf(block))
				.map((block) => [block.getContext?.(), block.getSource?.()]),
		).toContainEqual(["paragraph", "link:included-secure.adoc[role=include]"]);
		expect(document.targets.map((target) => target.id)).toEqual(
			expect.arrayContaining(["_main_before", "main-after"]),
		);
		expect(document.targets.map((target) => target.id)).not.toContain(
			"included-section",
		);
	});

	it("diagnoses and skips official blocks mapped outside the main source file", () => {
		const includedSection = makeBlock("section", 2, {
			file: "/virtual/include/included.adoc",
			id: "included-section",
			source: "== Included Section",
			title: "Included Section",
		});
		const officialDocument = makeDocument([includedSection]);
		const surfaces = projectNodeSourceSurfaces({
			officialDocument,
			lineTable: buildLineTable(
				["= Main", "", "include::included.adoc[]"].join("\n"),
			),
			sourcePath: "/virtual/main.adoc",
		});

		expect(surfaces.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "source-location.external-file",
				level: "warning",
				message: expect.stringContaining("included.adoc"),
			}),
		]);
		expect(surfaces.sections).toEqual([]);
		expect(surfaces.sectionByBlock.get(includedSection)).toBeUndefined();
		expect(surfaces.sectionByLine.get(2)).toBeUndefined();
		expect(surfaces.xrefOccurrences).toEqual([]);
		expect(surfaces.anchorOccurrences).toEqual([]);
	});

	it("does not project external source-map blocks after source surface filtering", () => {
		const includedParagraph = makeBlock("paragraph", 2, {
			file: "/virtual/include/included.adoc",
			id: "included-paragraph",
			source: "Included paragraph",
		});
		const officialDocument = makeDocument([includedParagraph]);
		const lineTable = buildLineTable(
			["= Main", "include::included.adoc[]"].join("\n"),
		);
		const surfaces = projectNodeSourceSurfaces({
			officialDocument,
			lineTable,
			sourcePath: "/virtual/main.adoc",
		});

		const projected = projectOfficialDocument({
			officialDocument,
			lineTable,
			sections: surfaces.sections,
			sectionByLine: surfaces.sectionByLine,
			xrefOccurrences: surfaces.xrefOccurrences,
			anchorOccurrences: surfaces.anchorOccurrences,
			headingInlineMetadataOccurrences:
				surfaces.headingInlineMetadataOccurrences,
			intervalByBlock: surfaces.intervalByBlock,
			sectionByBlock: surfaces.sectionByBlock,
			projectableBlocks: surfaces.projectableBlocks,
			adapter: fakeAdapter(),
		});

		expect(surfaces.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "source-location.external-file",
			}),
		]);
		expect(projected.children).toEqual([]);
		expect(projected.targets).toEqual([]);
	});

	it("resolves relative source files against sourceDirectory before comparing to the main file", () => {
		const includedParagraph = makeBlock("paragraph", 2, {
			directory: "/virtual/include",
			file: "included.adoc",
			source: "Included <<target>>",
		});
		const officialDocument = makeDocument([includedParagraph]);

		const external = projectNodeSourceSurfaces({
			officialDocument,
			lineTable: buildLineTable("= Main\n\ninclude::included.adoc[]\n"),
			sourcePath: "/virtual/main.adoc",
		});
		const sameFile = projectNodeSourceSurfaces({
			officialDocument,
			lineTable: buildLineTable("= Included\nIncluded <<target>>\n"),
			sourcePath: "/virtual/include/included.adoc",
		});
		const noMainPath = projectNodeSourceSurfaces({
			officialDocument,
			lineTable: buildLineTable("= Included\nIncluded <<target>>\n"),
		});

		expect(external.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "source-location.external-file",
				message: expect.stringContaining("included.adoc"),
			}),
		]);
		expect(external.xrefOccurrences).toEqual([]);
		expect(sameFile.toolDiagnostics).toEqual([]);
		expect(sameFile.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"<<target>>",
		]);
		expect(noMainPath.toolDiagnostics).toEqual([]);
		expect(noMainPath.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"<<target>>",
		]);
	});

	it("uses sourcePath before sourceFile and tolerates missing source file identity", () => {
		const pathPreferredParagraph = makeBlock("paragraph", 2, {
			file: "/virtual/other-name.adoc",
			path: "/virtual/main.adoc",
			source: "Path-preferred <<target>>",
		});
		const missingFileParagraph = makeBlock("paragraph", 3, {
			file: undefined,
			path: undefined,
			source: "Missing file identity <<target>>",
		});
		const officialDocument = makeDocument([
			pathPreferredParagraph,
			missingFileParagraph,
		]);

		const surfaces = projectNodeSourceSurfaces({
			officialDocument,
			lineTable: buildLineTable(
				[
					"= Main",
					"Path-preferred <<target>>",
					"Missing file identity <<target>>",
				].join("\n"),
			),
			sourcePath: "/virtual/main.adoc",
		});

		expect(surfaces.toolDiagnostics).toEqual([]);
		expect(surfaces.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"<<target>>",
			"<<target>>",
		]);
	});

	it("does not diagnose relative source files when no sourceDirectory is available", () => {
		const relativeOnlyParagraph = makeBlock("paragraph", 2, {
			file: "included.adoc",
			source: "Relative-only <<target>>",
		});
		const surfaces = projectNodeSourceSurfaces({
			officialDocument: makeDocument([relativeOnlyParagraph]),
			lineTable: buildLineTable("= Main\nRelative-only <<target>>\n"),
			sourcePath: "/virtual/main.adoc",
		});

		expect(surfaces.toolDiagnostics).toEqual([]);
		expect(surfaces.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"<<target>>",
		]);
	});
});

function makeDocument(blocks: AsciidoctorBlock[]): AsciidoctorBlock {
	return {
		getBlocks: () => blocks,
	};
}

function projectNodeSourceSurfaces(
	options: Omit<Parameters<typeof projectSourceSurfaces>[0], "sourceIdentity">,
): SourceSurfaces {
	return projectSourceSurfaces({
		...options,
		sourceIdentity: nodeSourceIdentity,
	});
}

function makeBlock(
	context: string,
	line: number,
	options: {
		directory?: string;
		file: string | undefined;
		id?: string;
		path?: string | undefined;
		source?: string;
		title?: string;
	},
): AsciidoctorBlock {
	return {
		getBlocks: () => [],
		getContext: () => context,
		getId: () => options.id,
		getNodeName: () => context,
		...(options.source ? { getSource: () => options.source as string } : {}),
		...(options.title ? { getTitle: () => options.title as string } : {}),
		getSourceLocation: () => ({
			getDirectory: () => options.directory,
			getFile: () => options.file,
			getLineNumber: () => line,
			getPath: () => options.path ?? options.file,
		}),
	};
}

function fakeAdapter() {
	return {
		parserVersion: "test",
		loadFile: () => makeDocument([]),
		extractAnchorBindings: () => [],
		resolveXrefTarget: () => undefined,
		resolveXrefBinding: () => undefined,
	};
}
