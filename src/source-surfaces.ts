import { basename, isAbsolute, join, normalize, resolve } from "node:path";
import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import {
	assignContainingSectionIds,
	scanInlineOccurrencesInOfficialBlocks,
} from "./inline-occurrence-scanner";
import type {
	AnchorOccurrenceNode,
	SectionNode,
	TargetType,
	ToolDiagnostic,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";
import { officialBlockPolicy } from "./official-block-policy";
import type { OfficialBlockSurface } from "./official-block-walker";
import { walkOfficialBlocks } from "./official-block-walker";
import {
	resolveSourceInterval,
	type SourceInterval,
} from "./source-interval-resolver";
import type { LineTable } from "./source-lines";

export type SourceSurfaces = {
	blockSurfaces: OfficialBlockSurface[];
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>;
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
	sections: SectionNode[];
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	sectionByLine: Map<number, SectionNode>;
	toolDiagnostics: ToolDiagnostic[];
};

export { assignContainingSectionIds };

export function projectSourceSurfaces(options: {
	officialDocument: AsciidoctorBlock;
	lineTable: LineTable;
	sourcePath?: string;
}): SourceSurfaces {
	const blockSurfaces = walkOfficialBlocks(options.officialDocument);
	const intervalByBlock = new WeakMap<AsciidoctorBlock, SourceInterval>();
	const toolDiagnostics: ToolDiagnostic[] = [];
	const mainSourcePath = options.sourcePath
		? normalize(resolve(options.sourcePath))
		: undefined;

	for (const surface of blockSurfaces) {
		if (isExternalSourceSurface(surface, mainSourcePath)) {
			toolDiagnostics.push({
				level: "warning",
				code: "source-location.external-file",
				message: `Official block source location points outside the parsed source file: ${sourceLocationLabel(surface)}.`,
			});
			continue;
		}
		const interval = resolveSourceInterval(surface, options.lineTable);
		if (!interval) {
			continue;
		}
		intervalByBlock.set(surface.block, interval);
		toolDiagnostics.push(...interval.diagnostics);
		if (officialBlockPolicy(surface.context) === "diagnostic") {
			toolDiagnostics.push(
				definedObject({
					level: "warning",
					code: "official-block-context.unknown",
					message: `Unknown official block context '${surface.context ?? "undefined"}' was skipped conservatively.`,
					source: interval.sourceSpan,
				}) as ToolDiagnostic,
			);
		}
	}

	const { sections, sectionByBlock } = buildSectionSurfaces(
		blockSurfaces,
		intervalByBlock,
		toolDiagnostics,
	);
	const sectionByLine = mapSectionScope(
		sections,
		options.lineTable.lines.length,
	);
	const { xrefOccurrences, anchorOccurrences } =
		scanInlineOccurrencesInOfficialBlocks({
			lineTable: options.lineTable,
			blockSurfaces,
			intervalByBlock,
		});
	assignContainingSectionIds(xrefOccurrences, anchorOccurrences, sectionByLine);

	return {
		blockSurfaces,
		intervalByBlock,
		sectionByBlock,
		sections,
		xrefOccurrences,
		anchorOccurrences,
		sectionByLine,
		toolDiagnostics,
	};
}

function isExternalSourceSurface(
	surface: OfficialBlockSurface,
	mainSourcePath: string | undefined,
): boolean {
	if (!mainSourcePath) {
		return false;
	}
	const sourceFile = sourceFilePath(surface);
	return sourceFile !== undefined && normalize(sourceFile) !== mainSourcePath;
}

function sourceFilePath(surface: OfficialBlockSurface): string | undefined {
	const sourceFile = surface.sourcePath ?? surface.sourceFile;
	if (!sourceFile) {
		return undefined;
	}
	if (isAbsolute(sourceFile)) {
		return sourceFile;
	}
	if (surface.sourceDirectory) {
		return join(surface.sourceDirectory, sourceFile);
	}
	return undefined;
}

function sourceLocationLabel(surface: OfficialBlockSurface): string {
	return (
		surface.sourcePath ??
		surface.sourceFile ??
		(surface.sourceDirectory
			? join(surface.sourceDirectory, basename(surface.sourceFile ?? ""))
			: "unknown source")
	);
}

function buildSectionSurfaces(
	blockSurfaces: OfficialBlockSurface[],
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
	_toolDiagnostics: ToolDiagnostic[],
): {
	sections: SectionNode[];
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
} {
	const sections: SectionNode[] = [];
	const sectionByBlock = new WeakMap<AsciidoctorBlock, SectionNode>();

	for (const surface of blockSurfaces) {
		if (surface.context !== "section") {
			continue;
		}
		if (hasDiagnosticPolicyAncestor(surface)) {
			continue;
		}
		const interval = intervalByBlock.get(surface.block);
		if (!interval) {
			continue;
		}
		const metadata = interval.metadata;
		const ids = metadata.flatMap((entry) => entry.ids);
		const officialId = surface.id;
		const idOrigin =
			ids.length > 0
				? "source"
				: officialId
					? "asciidoctor-generated"
					: "unknown";
		const section = definedObject({
			kind: "section",
			level: surface.level ?? 1,
			ids: ids.length > 0 ? ids : officialId ? [officialId] : [],
			title: surface.title ?? "",
			line: surface.sourceLine,
			span: interval.span,
			titleSpan: interval.titleSpan,
			idOrigin,
			metadata: metadata.map((entry) => entry.node),
			source: definedObject({
				line: surface.sourceLine,
				sourceSpan: interval.sourceSpan,
			}),
			asciidoctor: definedObject({
				context: surface.context,
				nodeName: surface.nodeName,
				resolvedId: officialId,
				resolvedType: "section" as TargetType,
				reftext: surface.title,
			}),
			children: [],
		}) as SectionNode;
		sections.push(section);
		sectionByBlock.set(surface.block, section);
	}

	return { sections, sectionByBlock };
}

function hasDiagnosticPolicyAncestor(surface: OfficialBlockSurface): boolean {
	let current = surface.parent;
	while (current) {
		if (officialBlockPolicy(current.context) === "diagnostic") {
			return true;
		}
		current = current.parent;
	}
	return false;
}

function mapSectionScope(
	sections: SectionNode[],
	totalLines: number,
): Map<number, SectionNode> {
	const result = new Map<number, SectionNode>();
	for (const section of sections) {
		const start = section.span?.startLine ?? section.line ?? 1;
		const end = section.span?.endLine ?? totalLines;
		for (let line = start; line <= end; line += 1) {
			result.set(line, section);
		}
	}
	return result;
}
