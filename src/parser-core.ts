import type {
	AsciidoctorAdapter,
	AsciidoctorBlock,
} from "./asciidoctor-adapter";
import { addAnchorTargets, bindXrefs } from "./binding-merge";
import {
	recoverSourceAwareDocumentTitleSourceLayer,
	sourceAwareDocumentForLineTable,
} from "./book-entry/source-aware-coordinate";
import { attachHeadingDescriptionMetadata } from "./heading-description-metadata";
import type { AbundantDocument, AsciidoctorLayer, ParserInfo } from "./model";
import { definedObject } from "./object-utils";
import { projectOfficialDocument } from "./official-projector";
import type { SourceIdentityApi } from "./source-identity";
import { type LineTable, spanForLineText } from "./source-lines";
import { projectSourceSurfaces } from "./source-surfaces";

export type ParserCoreInput = {
	readonly officialDocument: AsciidoctorBlock;
	readonly adapter: AsciidoctorAdapter;
	readonly lineTable: LineTable;
	readonly sourcePath: string;
	readonly sourceText: string;
	readonly sourceFiles?: AbundantDocument["sourceFiles"];
	readonly mode: AbundantDocument["mode"];
	readonly sourceIdentity: SourceIdentityApi;
	readonly sourceSurfacePath?: string;
};

export function parseAsciidoctorDocument(
	input: ParserCoreInput,
): AbundantDocument {
	const sourceSurfaces = projectSourceSurfaces({
		officialDocument: input.officialDocument,
		lineTable: input.lineTable,
		sourceIdentity: input.sourceIdentity,
		...(input.sourceSurfacePath ? { sourcePath: input.sourceSurfacePath } : {}),
	});
	const officialProjection = projectOfficialDocument({
		officialDocument: input.officialDocument,
		lineTable: input.lineTable,
		sections: sourceSurfaces.sections,
		sectionByLine: sourceSurfaces.sectionByLine,
		xrefOccurrences: sourceSurfaces.xrefOccurrences,
		anchorOccurrences: sourceSurfaces.anchorOccurrences,
		headingInlineMetadataOccurrences:
			sourceSurfaces.headingInlineMetadataOccurrences,
		intervalByBlock: sourceSurfaces.intervalByBlock,
		projectableBlocks: sourceSurfaces.projectableBlocks,
		containerFallbackBlocks: sourceSurfaces.containerFallbackBlocks,
		sectionByBlock: sourceSurfaces.sectionByBlock,
		adapter: input.adapter,
	});

	addAnchorTargets(
		officialProjection.targets,
		sourceSurfaces.anchorOccurrences,
	);
	bindXrefs(sourceSurfaces.xrefOccurrences, officialProjection.targets);
	const titleSource = documentTitleSource(input.lineTable);

	const document: AbundantDocument = {
		kind: "document",
		sourcePath: input.sourcePath,
		sourceText: input.sourceText,
		...(input.sourceFiles !== undefined
			? { sourceFiles: input.sourceFiles }
			: {}),
		mode: input.mode,
		parser: parserInfo(input.adapter),
		title: {
			kind: "title",
			text: input.officialDocument.getDocumentTitle?.() ?? "",
			source: titleSource,
			asciidoctor: definedObject({
				context: input.officialDocument.getContext?.(),
				nodeName: input.officialDocument.getNodeName?.(),
			}) as AsciidoctorLayer,
		},
		children: officialProjection.children,
		targets: officialProjection.targets,
		xrefOccurrences: sourceSurfaces.xrefOccurrences,
		anchorOccurrences: sourceSurfaces.anchorOccurrences,
		headingInlineMetadataOccurrences:
			sourceSurfaces.headingInlineMetadataOccurrences,
		toolDiagnostics: sourceSurfaces.toolDiagnostics,
	};
	return attachHeadingDescriptionMetadata(document);
}

function documentTitleSource(lineTable: LineTable) {
	const sourceSpan = spanForLineText(lineTable, 1, 1);
	const sourceAwareDocument = sourceAwareDocumentForLineTable(lineTable);
	if (sourceAwareDocument) {
		const recovered = recoverSourceAwareDocumentTitleSourceLayer(
			sourceAwareDocument,
			sourceSpan,
		);
		if (recovered?.sourceLayer) {
			return recovered.sourceLayer;
		}
	}
	return {
		line: 1,
		sourceSpan,
	};
}

function parserInfo(adapter: AsciidoctorAdapter): ParserInfo {
	return {
		name: "@asciidoctor/core",
		version: adapter.parserVersion,
	};
}
