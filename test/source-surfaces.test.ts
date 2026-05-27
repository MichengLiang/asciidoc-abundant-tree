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
		children?: AsciidoctorBlock[];
		id?: string;
		source?: string;
	} = {},
): AsciidoctorBlock {
	return {
		getBlocks: () => options.children ?? [],
		getContext: () => context,
		getId: () => options.id,
		getNodeName: () => context,
		...(options.source ? { getSource: () => options.source as string } : {}),
		getSourceLocation: () => ({
			getLineNumber: () => line,
		}),
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
