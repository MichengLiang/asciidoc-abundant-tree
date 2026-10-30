import { describe, expect, it } from "vitest";
import type { AsciidoctorBlock } from "../src/asciidoctor-adapter";
import { createAsciidoctorFileAdapter } from "../src/asciidoctor-file-adapter";
import { childBlocksOf } from "../src/official-block-utils";
import { projectOfficialDocument } from "../src/official-projector";
import { parseAbundantTree } from "../src/parser";
import { nodeSourceIdentity } from "../src/source-identity-node";
import { buildLineTable } from "../src/source-lines";
import {
	projectSourceSurfaces,
	type SourceSurfaces,
} from "../src/source-surfaces";
import {
	officialAttributeLists,
	scannedXrefRaws,
	writeFixture,
} from "./helpers";

describe("include source map handling", () => {
	it("keeps secure-mode include directives anchored to the main file", async () => {
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

		const officialDocument =
			await createAsciidoctorFileAdapter().loadFile(path);
		const document = await parseAbundantTree({ sourcePath: path });

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

	it("diagnoses and skips official blocks mapped outside the main source file", async () => {
		const includedSection = makeBlock("section", 2, {
			file: "/virtual/include/included.adoc",
			id: "included-section",
			source: "== Included Section",
			title: "Included Section",
		});
		const officialDocument = makeDocument([includedSection]);
		const surfaces = await projectNodeSourceSurfaces({
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
		expect(scannedXrefRaws(surfaces.xrefRegions)).toEqual([]);
		expect(surfaces.anchorOccurrences).toEqual([]);
	});

	it("does not project external source-map blocks after source surface filtering", async () => {
		const includedParagraph = makeBlock("paragraph", 2, {
			file: "/virtual/include/included.adoc",
			id: "included-paragraph",
			source: "Included paragraph",
		});
		const officialDocument = makeDocument([includedParagraph]);
		const lineTable = buildLineTable(
			["= Main", "include::included.adoc[]"].join("\n"),
		);
		const surfaces = await projectNodeSourceSurfaces({
			officialDocument,
			lineTable,
			sourcePath: "/virtual/main.adoc",
		});

		const projected = projectOfficialDocument({
			officialDocument,
			lineTable,
			sections: surfaces.sections,
			sectionByLine: surfaces.sectionByLine,
			xrefOccurrences: [],
			anchorOccurrences: surfaces.anchorOccurrences,
			headingInlineMetadataOccurrences:
				surfaces.headingInlineMetadataOccurrences,
			intervalByBlock: surfaces.intervalByBlock,
			sectionByBlock: surfaces.sectionByBlock,
			projectableBlocks: surfaces.projectableBlocks,
		});

		expect(surfaces.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "source-location.external-file",
			}),
		]);
		expect(projected.children).toEqual([]);
		expect(projected.targets).toEqual([]);
	});

	it("resolves relative source files against sourceDirectory before comparing to the main file", async () => {
		const includedParagraph = makeBlock("paragraph", 2, {
			directory: "/virtual/include",
			file: "included.adoc",
			source: "Included <<target>>",
		});
		const officialDocument = makeDocument([includedParagraph]);

		const external = await projectNodeSourceSurfaces({
			officialDocument,
			lineTable: buildLineTable("= Main\n\ninclude::included.adoc[]\n"),
			sourcePath: "/virtual/main.adoc",
		});
		const sameFile = await projectNodeSourceSurfaces({
			officialDocument,
			lineTable: buildLineTable("= Included\nIncluded <<target>>\n"),
			sourcePath: "/virtual/include/included.adoc",
		});
		const noMainPath = await projectNodeSourceSurfaces({
			officialDocument,
			lineTable: buildLineTable("= Included\nIncluded <<target>>\n"),
		});

		expect(external.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "source-location.external-file",
				message: expect.stringContaining("included.adoc"),
			}),
		]);
		expect(scannedXrefRaws(external.xrefRegions)).toEqual([]);
		expect(sameFile.toolDiagnostics).toEqual([]);
		expect(scannedXrefRaws(sameFile.xrefRegions)).toEqual(["<<target>>"]);
		expect(noMainPath.toolDiagnostics).toEqual([]);
		expect(scannedXrefRaws(noMainPath.xrefRegions)).toEqual(["<<target>>"]);
	});

	it("uses sourcePath before sourceFile and tolerates missing source file identity", async () => {
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

		const surfaces = await projectNodeSourceSurfaces({
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
		expect(scannedXrefRaws(surfaces.xrefRegions)).toEqual([
			"<<target>>",
			"<<target>>",
		]);
	});

	it("does not diagnose relative source files when no sourceDirectory is available", async () => {
		const relativeOnlyParagraph = makeBlock("paragraph", 2, {
			file: "included.adoc",
			source: "Relative-only <<target>>",
		});
		const surfaces = await projectNodeSourceSurfaces({
			officialDocument: makeDocument([relativeOnlyParagraph]),
			lineTable: buildLineTable("= Main\nRelative-only <<target>>\n"),
			sourcePath: "/virtual/main.adoc",
		});

		expect(surfaces.toolDiagnostics).toEqual([]);
		expect(scannedXrefRaws(surfaces.xrefRegions)).toEqual(["<<target>>"]);
	});
});

function makeDocument(blocks: AsciidoctorBlock[]): AsciidoctorBlock {
	return {
		getBlocks: () => blocks,
	};
}

async function projectNodeSourceSurfaces(
	options: Omit<
		Parameters<typeof projectSourceSurfaces>[0],
		"sourceIdentity" | "attributeLists"
	>,
): Promise<SourceSurfaces> {
	return projectSourceSurfaces({
		...options,
		attributeLists: await officialAttributeLists(options.lineTable),
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
