import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAsciidoctorAdapter } from "./asciidoctor-adapter";
import { addAnchorTargets, bindXrefs } from "./binding-merge";
import type {
	AbundantDocument,
	AsciidoctorLayer,
	ParseAbundantTreeOptions,
} from "./model";
import { definedObject } from "./object-utils";
import { projectOfficialDocument } from "./official-projector";
import { buildLineTable, spanForLineText } from "./source-lines";
import { projectSourceSurfaces } from "./source-surfaces";

export function parseAbundantTree(
	options: ParseAbundantTreeOptions,
): AbundantDocument {
	const sourcePath = resolve(options.sourcePath);
	const source = readFileSync(sourcePath, "utf8");
	const lineTable = buildLineTable(source);
	const adapter = createAsciidoctorAdapter();
	const officialDocument = adapter.loadFile(sourcePath);
	const sourceSurfaces = projectSourceSurfaces({
		officialDocument,
		lineTable,
		sourcePath,
	});
	const officialProjection = projectOfficialDocument({
		officialDocument,
		lineTable,
		sections: sourceSurfaces.sections,
		sectionByLine: sourceSurfaces.sectionByLine,
		xrefOccurrences: sourceSurfaces.xrefOccurrences,
		anchorOccurrences: sourceSurfaces.anchorOccurrences,
		intervalByBlock: sourceSurfaces.intervalByBlock,
		projectableBlocks: sourceSurfaces.projectableBlocks,
		containerFallbackBlocks: sourceSurfaces.containerFallbackBlocks,
		sectionByBlock: sourceSurfaces.sectionByBlock,
		adapter,
	});

	addAnchorTargets(
		officialProjection.targets,
		sourceSurfaces.anchorOccurrences,
	);
	bindXrefs(sourceSurfaces.xrefOccurrences, officialProjection.targets);

	return {
		kind: "document",
		sourcePath,
		mode: "single-file",
		parser: {
			name: "@asciidoctor/core",
			version: adapter.parserVersion,
		},
		title: {
			kind: "title",
			text: officialDocument.getDocumentTitle?.() ?? "",
			source: {
				line: 1,
				sourceSpan: spanForLineText(lineTable, 1, 1),
			},
			asciidoctor: definedObject({
				context: officialDocument.getContext?.(),
				nodeName: officialDocument.getNodeName?.(),
			}) as AsciidoctorLayer,
		},
		children: officialProjection.children,
		targets: officialProjection.targets,
		xrefOccurrences: sourceSurfaces.xrefOccurrences,
		anchorOccurrences: sourceSurfaces.anchorOccurrences,
		toolDiagnostics: sourceSurfaces.toolDiagnostics,
	};
}
