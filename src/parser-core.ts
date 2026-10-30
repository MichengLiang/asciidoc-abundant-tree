import type {
	AsciidoctorAdapter,
	AsciidoctorBlock,
} from "./asciidoctor-adapter";
import { addAnchorTargets, completeXrefTargetTypes } from "./binding-merge";
import {
	recoverSourceAwareDocumentTitleSourceLayer,
	sourceAwareDocumentForLineTable,
} from "./book-entry/source-aware-coordinate";
import { attachHeadingDescriptionMetadata } from "./heading-description-metadata";
import { readAttributeLists } from "./metadata-parser";
import type { AbundantDocument, AsciidoctorLayer, ParserInfo } from "./model";
import { definedObject } from "./object-utils";
import { projectOfficialDocument } from "./official-projector";
import { completeOfficialSourceLocations } from "./official-source-location";
import type { SourceIdentityApi } from "./source-identity";
import { type LineTable, spanForLineText } from "./source-lines";
import {
	type HeadlineExpansion,
	projectSourceSurfaces,
} from "./source-surfaces";
import { recognizeXrefOccurrences } from "./xref-recognition";

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

export async function parseAsciidoctorDocument(
	input: ParserCoreInput,
): Promise<AbundantDocument> {
	completeOfficialSourceLocations(input.officialDocument, input.lineTable);
	// 元数据扫描是同步的，官方读 attrlist 是异步的：先让官方把这份源里每一个 attrlist 读一遍，随这次解析往下传。
	const attributeLists = await readAttributeLists(input.lineTable, (text) =>
		input.adapter.readAttributeList(input.officialDocument, text),
	);
	const sourceSurfaces = projectSourceSurfaces({
		officialDocument: input.officialDocument,
		lineTable: input.lineTable,
		attributeLists,
		sourceIdentity: input.sourceIdentity,
		...(input.sourceSurfacePath ? { sourcePath: input.sourceSurfacePath } : {}),
	});
	// xref 在投影之前定下：投影器按源范围把它们挂到段落、描述与表格下面。
	const xrefOccurrences = await recognizeXrefOccurrences({
		adapter: input.adapter,
		officialDocument: input.officialDocument,
		lineTable: input.lineTable,
		regions: sourceSurfaces.xrefRegions,
		sectionByLine: sourceSurfaces.sectionByLine,
		toolDiagnostics: sourceSurfaces.toolDiagnostics,
	});
	await expandHeadlineAttributes(input, sourceSurfaces.headlineExpansions);
	const titleSource = documentTitleSource(input.lineTable);
	const titleText = await documentTitleText(input);
	const officialProjection = projectOfficialDocument({
		officialDocument: input.officialDocument,
		lineTable: input.lineTable,
		sections: sourceSurfaces.sections,
		sectionByLine: sourceSurfaces.sectionByLine,
		xrefOccurrences,
		anchorOccurrences: sourceSurfaces.anchorOccurrences,
		headingInlineMetadataOccurrences:
			sourceSurfaces.headingInlineMetadataOccurrences,
		intervalByBlock: sourceSurfaces.intervalByBlock,
		projectableBlocks: sourceSurfaces.projectableBlocks,
		sectionByBlock: sourceSurfaces.sectionByBlock,
	});

	addAnchorTargets(
		officialProjection.targets,
		sourceSurfaces.anchorOccurrences,
	);
	completeXrefTargetTypes(xrefOccurrences, officialProjection.targets);

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
			text: titleText,
			source: titleSource,
			asciidoctor: definedObject({
				context: input.officialDocument.getContext?.(),
				nodeName: input.officialDocument.getNodeName?.(),
				reftext: input.officialDocument.getDocumentTitle?.() ?? undefined,
			}) as AsciidoctorLayer,
		},
		children: officialProjection.children,
		targets: officialProjection.targets,
		xrefOccurrences,
		anchorOccurrences: sourceSurfaces.anchorOccurrences,
		headingInlineMetadataOccurrences:
			sourceSurfaces.headingInlineMetadataOccurrences,
		toolDiagnostics: sourceSurfaces.toolDiagnostics,
	};
	return attachHeadingDescriptionMetadata(document);
}

async function expandHeadlineAttributes(
	input: ParserCoreInput,
	expansions: readonly HeadlineExpansion[],
): Promise<void> {
	if (expansions.length === 0) {
		return;
	}
	const expanded = await input.adapter.expandAttributes(
		input.officialDocument,
		expansions.map(({ owner, section }) => ({ owner, text: section.title })),
	);
	for (const [index, { section }] of expansions.entries()) {
		section.title = expanded[index] ?? section.title;
	}
}

// 文档标题同样取作者写下的文字（06 号书第 2 章 Headline），只认第一行的 `= 标题`；第一行不是标题时（标题来自
// doctitle 属性等），照官方给的标题。
async function documentTitleText(input: ParserCoreInput): Promise<string> {
	const official = input.officialDocument.getDocumentTitle?.() ?? "";
	const written = /^=[ \t]+(.+?)(?:[ \t]+=)?$/u.exec(
		input.lineTable.lines[0]?.text ?? "",
	)?.[1];
	if (written === undefined || official === "") {
		return official;
	}
	if (!written.includes("{")) {
		return written;
	}
	const [expanded] = await input.adapter.expandAttributes(
		input.officialDocument,
		[{ owner: input.officialDocument, text: written }],
	);
	return expanded ?? written;
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
