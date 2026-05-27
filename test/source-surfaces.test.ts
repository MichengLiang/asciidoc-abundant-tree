import { describe, expect, it } from "vitest";
import type {
	AsciidoctorAdapter,
	AsciidoctorBlock,
} from "../src/asciidoctor-adapter";
import { projectOfficialDocument } from "../src/official-projector";
import { buildLineTable } from "../src/source-lines";
import { projectSourceSurfaces } from "../src/source-surfaces";

describe("projectSourceSurfaces", () => {
	it("diagnoses unknown official block contexts and skips their inline content", () => {
		const paragraph = makeBlock("paragraph", 2, {
			source: "Nested <<target>> should not be scanned.",
		});
		const unknown = makeBlock("mystery", 1, {
			id: "unknown-block",
			children: [paragraph],
			source: "Unknown <<target>> should not be scanned.",
		});
		const officialDocument = makeDocument([unknown]);
		const lineTable = buildLineTable(
			[
				"Unknown <<target>> should not be scanned.",
				"Nested <<target>> should not be scanned.",
				"== Target",
			].join("\n"),
		);

		const surfaces = projectSourceSurfaces({ officialDocument, lineTable });

		expect(surfaces.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "official-block-context.unknown",
				level: "warning",
				message: expect.stringContaining("mystery"),
			}),
		]);
		expect(surfaces.xrefOccurrences).toEqual([]);
		expect(surfaces.anchorOccurrences).toEqual([]);
	});

	it("diagnoses recognized official blocks that have no source location", () => {
		const paragraph = makeBlock("paragraph", undefined, {
			source: "Missing location <<target>> should not be scanned.",
		});
		const section = makeBlock("section", undefined, {
			id: "missing-section",
			title: "Missing Section",
		});
		const officialDocument = makeDocument([paragraph, section]);
		const lineTable = buildLineTable(
			[
				"Missing location <<target>> should not be scanned.",
				"== Missing Section",
			].join("\n"),
		);

		const surfaces = projectSourceSurfaces({ officialDocument, lineTable });

		expect(surfaces.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "source-location.missing",
				level: "warning",
				message: expect.stringContaining("paragraph"),
			}),
			expect.objectContaining({
				code: "source-location.missing",
				level: "warning",
				message: expect.stringContaining("section"),
			}),
		]);
		expect(surfaces.sections).toEqual([]);
		expect(surfaces.sectionByBlock.get(section)).toBeUndefined();
		expect(surfaces.sectionByLine.get(2)).toBeUndefined();
		expect(surfaces.xrefOccurrences).toEqual([]);
		expect(surfaces.anchorOccurrences).toEqual([]);
	});

	it("diagnoses unknown official blocks even when their source location is missing", () => {
		const unknown = makeBlock("mystery", undefined, {
			source: "Missing unknown <<target>> should not be scanned.",
		});
		const officialDocument = makeDocument([unknown]);
		const lineTable = buildLineTable(
			"Missing unknown <<target>> should not be scanned.",
		);

		const surfaces = projectSourceSurfaces({ officialDocument, lineTable });

		expect(surfaces.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "official-block-context.unknown",
				message: expect.stringContaining("mystery"),
			}),
			expect.objectContaining({
				code: "source-location.missing",
				message: expect.stringContaining("mystery"),
			}),
		]);
		expect(surfaces.xrefOccurrences).toEqual([]);
		expect(surfaces.anchorOccurrences).toEqual([]);
	});

	it("diagnoses missing context and source location without source scanning", () => {
		const unknown = makeBlock(undefined, undefined, {
			source: "Missing APIs <<target>> should not be scanned.",
		});
		const officialDocument = makeDocument([unknown]);
		const lineTable = buildLineTable(
			"Missing APIs <<target>> should not be scanned.",
		);

		const surfaces = projectSourceSurfaces({ officialDocument, lineTable });

		expect(surfaces.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "official-block-context.unknown",
				message: expect.stringContaining("undefined"),
			}),
			expect.objectContaining({
				code: "source-location.missing",
				message: expect.stringContaining(
					"context 'undefined' node 'undefined'",
				),
			}),
		]);
		expect(surfaces.projectableBlocks.has(unknown)).toBe(false);
		expect(surfaces.xrefOccurrences).toEqual([]);
		expect(surfaces.anchorOccurrences).toEqual([]);
	});

	it("diagnoses missing official block context without projecting hidden inline content", () => {
		const unknown = makeBlock(undefined, 1, {
			source: "Unknown <<target>> should not be scanned.",
		});
		const officialDocument = makeDocument([unknown]);
		const lineTable = buildLineTable(
			"Unknown <<target>> should not be scanned.",
		);

		const surfaces = projectSourceSurfaces({ officialDocument, lineTable });

		expect(surfaces.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "official-block-context.unknown",
				message: expect.stringContaining("undefined"),
			}),
		]);
		expect(surfaces.xrefOccurrences).toEqual([]);
		expect(surfaces.anchorOccurrences).toEqual([]);
	});

	it("keeps sections without official ids visible while leaving them out of the target catalog", () => {
		const section = makeBlock("section", 1, {
			title: "Untargeted",
		});
		const officialDocument = makeDocument([section]);
		const lineTable = buildLineTable("== Untargeted\nbody");

		const surfaces = projectSourceSurfaces({ officialDocument, lineTable });
		const projected = projectOfficialDocument({
			officialDocument,
			lineTable,
			sections: surfaces.sections,
			sectionByLine: surfaces.sectionByLine,
			xrefOccurrences: surfaces.xrefOccurrences,
			anchorOccurrences: surfaces.anchorOccurrences,
			intervalByBlock: surfaces.intervalByBlock,
			sectionByBlock: surfaces.sectionByBlock,
			adapter: fakeAdapter(),
		});

		expect(surfaces.sections).toEqual([
			expect.objectContaining({
				ids: [],
				idOrigin: "unknown",
				level: 1,
				title: "Untargeted",
			}),
		]);
		expect(surfaces.sectionByLine.get(1)).toBe(surfaces.sections[0]);
		expect(surfaces.sectionByBlock.get(section)).toBe(surfaces.sections[0]);
		expect(projected.children).toEqual([
			expect.objectContaining({
				kind: "section",
				ids: [],
				title: "Untargeted",
			}),
		]);
		expect(projected.targets).toEqual([]);
	});

	it("preserves untitled section surfaces without inventing ids or titles", () => {
		const section = makeBlock("section", 1);
		const lineTable = buildLineTable("==\nbody");

		const surfaces = projectSourceSurfaces({
			officialDocument: makeDocument([section]),
			lineTable,
		});

		expect(surfaces.sections).toEqual([
			expect.objectContaining({
				ids: [],
				idOrigin: "unknown",
				level: 1,
				title: "",
			}),
		]);
		expect(surfaces.sectionByBlock.get(section)).toBe(surfaces.sections[0]);
		expect(surfaces.sectionByLine.get(1)).toBe(surfaces.sections[0]);
	});

	it("does not diagnose sourceDirectory-only locations without a comparable file identity", () => {
		const paragraph = makeBlock("paragraph", 1, {
			directory: "/virtual/include",
			source: "External <<target>> should not be scanned.",
		});
		const lineTable = buildLineTable(
			"External <<target>> should not be scanned.",
		);

		const surfaces = projectSourceSurfaces({
			officialDocument: makeDocument([paragraph]),
			lineTable,
			sourcePath: "/virtual/main.adoc",
		});

		expect(surfaces.toolDiagnostics).toEqual([]);
		expect(surfaces.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"<<target>>",
		]);
	});

	it("uses sourceFile in external source diagnostics when sourcePath is unavailable", () => {
		const paragraph = makeBlock("paragraph", 1, {
			file: "/virtual/include/included.adoc",
			path: undefined,
			source: "External <<target>> should not be scanned.",
		});
		const lineTable = buildLineTable(
			"External <<target>> should not be scanned.",
		);

		const surfaces = projectSourceSurfaces({
			officialDocument: makeDocument([paragraph]),
			lineTable,
			sourcePath: "/virtual/main.adoc",
		});

		expect(surfaces.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "source-location.external-file",
				message: expect.stringContaining("/virtual/include/included.adoc"),
			}),
		]);
		expect(surfaces.xrefOccurrences).toEqual([]);
	});

	it("does not project unknown official block contexts into document children", () => {
		const paragraph = makeBlock("paragraph", 2, {
			source: "Nested paragraph should remain hidden.",
		});
		const unknown = makeBlock("mystery", 1, {
			id: "unknown-block",
			children: [paragraph],
		});
		const officialDocument = makeDocument([unknown]);
		const lineTable = buildLineTable(
			"Unknown block source.\nNested paragraph should remain hidden.\n",
		);
		const surfaces = projectSourceSurfaces({ officialDocument, lineTable });

		const projected = projectOfficialDocument({
			officialDocument,
			lineTable,
			sections: surfaces.sections,
			sectionByLine: surfaces.sectionByLine,
			xrefOccurrences: surfaces.xrefOccurrences,
			anchorOccurrences: surfaces.anchorOccurrences,
			intervalByBlock: surfaces.intervalByBlock,
			sectionByBlock: surfaces.sectionByBlock,
			adapter: fakeAdapter(),
		});

		expect(projected.children).toEqual([]);
		expect(projected.targets).toEqual([]);
	});

	it("does not expose descendant sections from unknown official block contexts", () => {
		const hiddenSection = makeBlock("section", 2, {
			id: "hidden-section",
			title: "Hidden Section",
		});
		const unknown = makeBlock("mystery", 1, {
			children: [hiddenSection],
		});
		const officialDocument = makeDocument([unknown]);
		const lineTable = buildLineTable(
			["mystery container", "== Hidden Section", "hidden body"].join("\n"),
		);

		const surfaces = projectSourceSurfaces({ officialDocument, lineTable });
		const projected = projectOfficialDocument({
			officialDocument,
			lineTable,
			sections: surfaces.sections,
			sectionByLine: surfaces.sectionByLine,
			xrefOccurrences: surfaces.xrefOccurrences,
			anchorOccurrences: surfaces.anchorOccurrences,
			intervalByBlock: surfaces.intervalByBlock,
			sectionByBlock: surfaces.sectionByBlock,
			adapter: fakeAdapter(),
		});

		expect(surfaces.toolDiagnostics).toEqual([
			expect.objectContaining({
				code: "official-block-context.unknown",
			}),
		]);
		expect(surfaces.sections).toEqual([]);
		expect(surfaces.sectionByLine.get(2)).toBeUndefined();
		expect(surfaces.sectionByBlock.get(hiddenSection)).toBeUndefined();
		expect(surfaces.projectableBlocks.has(hiddenSection)).toBe(false);
		expect(projected.children).toEqual([]);
		expect(projected.targets).toEqual([]);
	});
});

function makeDocument(blocks: AsciidoctorBlock[]): AsciidoctorBlock {
	return {
		getBlocks: () => blocks,
	};
}

function makeBlock(
	context: string | undefined,
	line: number | undefined,
	options: {
		children?: AsciidoctorBlock[];
		directory?: string;
		file?: string;
		id?: string;
		path?: string | undefined;
		source?: string;
		title?: string;
	} = {},
): AsciidoctorBlock {
	return {
		getBlocks: () => options.children ?? [],
		...(context !== undefined ? { getContext: () => context } : {}),
		getId: () => options.id,
		...(context !== undefined ? { getNodeName: () => context } : {}),
		...(options.source ? { getSource: () => options.source as string } : {}),
		...(options.title ? { getTitle: () => options.title as string } : {}),
		...(line !== undefined
			? {
					getSourceLocation: () => ({
						...(options.directory
							? { getDirectory: () => options.directory as string }
							: {}),
						...(options.file !== undefined
							? { getFile: () => options.file as string }
							: {}),
						getLineNumber: () => line,
						...(options.path !== undefined
							? { getPath: () => options.path as string }
							: {}),
					}),
				}
			: {}),
	};
}

function fakeAdapter(): AsciidoctorAdapter {
	return {
		parserVersion: "test",
		loadFile: () => makeDocument([]),
		extractAnchorBindings: () => [],
		resolveXrefTarget: () => undefined,
		resolveXrefBinding: () => undefined,
	};
}
