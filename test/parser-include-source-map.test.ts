import { describe, expect, it } from "vitest";
import type { AsciidoctorBlock } from "../src/asciidoctor-adapter";
import { createAsciidoctorAdapter } from "../src/asciidoctor-adapter";
import { parseAbundantTree } from "../src/parser";
import { buildLineTable } from "../src/source-lines";
import { projectSourceSurfaces } from "../src/source-surfaces";
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
			officialDocument
				.getBlocks?.()
				?.flatMap((block) => block.getBlocks?.() ?? [])
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
		const surfaces = projectSourceSurfaces({
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
});

function makeDocument(blocks: AsciidoctorBlock[]): AsciidoctorBlock {
	return {
		getBlocks: () => blocks,
	};
}

function makeBlock(
	context: string,
	line: number,
	options: {
		file: string;
		id?: string;
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
			getFile: () => options.file,
			getLineNumber: () => line,
			getPath: () => options.file,
		}),
	};
}
