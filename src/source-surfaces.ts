import { basename, isAbsolute, join, normalize, resolve } from "node:path";
import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import {
	logicalSourceForLineTable,
	recoverOriginSourceLayer,
	recoverSectionSourceLayer,
	recoverTitleSpan,
} from "./book-entry/origin-coordinate";
import {
	assignContainingSectionIdsFromSourceScope,
	buildSourceScopeIndex,
	registerSectionSourceScope,
	type SourceScopeIndex,
} from "./book-entry/source-scope-index";
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
import { type LineTable, sourceLines } from "./source-lines";

export type SourceSurfaces = {
	blockSurfaces: OfficialBlockSurface[];
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>;
	projectableBlocks: WeakSet<AsciidoctorBlock>;
	containerFallbackBlocks: WeakSet<AsciidoctorBlock>;
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
	sections: SectionNode[];
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	sectionByLine: Map<number, SectionNode>;
	sectionScopeIndex?: SourceScopeIndex;
	toolDiagnostics: ToolDiagnostic[];
};

type OriginHeadingBoundary = {
	readonly relativePath: string;
	readonly headingLine: number;
	readonly sliceStartLine: number;
};

type OriginHeadingBoundaryIndex = Map<string, readonly OriginHeadingBoundary[]>;

export { assignContainingSectionIds };

export function projectSourceSurfaces(options: {
	officialDocument: AsciidoctorBlock;
	lineTable: LineTable;
	sourcePath?: string;
}): SourceSurfaces {
	const blockSurfaces = walkOfficialBlocks(options.officialDocument);
	const intervalByBlock = new WeakMap<AsciidoctorBlock, SourceInterval>();
	const projectableBlocks = new WeakSet<AsciidoctorBlock>();
	const containerFallbackBlocks = new WeakSet<AsciidoctorBlock>();
	const toolDiagnostics: ToolDiagnostic[] = [];
	const mainSourcePath = options.sourcePath
		? normalize(resolve(options.sourcePath))
		: undefined;
	const logicalSource = logicalSourceForLineTable(options.lineTable);

	for (const surface of blockSurfaces) {
		const policy = officialBlockPolicy(surface.context);
		if (isExternalSourceSurface(surface, mainSourcePath)) {
			if (policy === "diagnostic") {
				toolDiagnostics.push(unknownContextDiagnostic(surface));
			}
			toolDiagnostics.push({
				level: "warning",
				code: "source-location.external-file",
				message: `Official block source location points outside the parsed source file: ${sourceLocationLabel(surface)}.`,
			});
			continue;
		}
		if (surface.sourceLine === undefined) {
			if (policy === "diagnostic") {
				toolDiagnostics.push(unknownContextDiagnostic(surface));
			}
			toolDiagnostics.push({
				level: "warning",
				code: "source-location.missing",
				message: `Official block source location is missing for context '${surface.context ?? "undefined"}' node '${surface.nodeName ?? "undefined"}'.`,
			});
			if (canUseContainerFallbackSurface(surface, policy)) {
				containerFallbackBlocks.add(surface.block);
			}
			continue;
		}
		const interval = resolveSourceInterval(surface, options.lineTable);
		if (!interval) {
			continue;
		}
		intervalByBlock.set(surface.block, interval);
		if (policy !== "diagnostic" && !hasDiagnosticPolicyAncestor(surface)) {
			projectableBlocks.add(surface.block);
		}
		toolDiagnostics.push(...interval.diagnostics);
		if (
			logicalSource &&
			["paragraph", "listing", "table"].includes(surface.context ?? "")
		) {
			const recovered = recoverOriginSourceLayer(logicalSource, interval.span, {
				logicalSourceSpan: interval.sourceSpan,
				raw: true,
				diagnosticContext: `${surface.context} block`,
			});
			if (!recovered.ok) {
				toolDiagnostics.push(recovered.diagnostic);
			}
		}
		if (policy === "diagnostic") {
			toolDiagnostics.push(unknownContextDiagnostic(surface, interval));
		}
	}

	const { sections, sectionByBlock } = buildSectionSurfaces(
		blockSurfaces,
		intervalByBlock,
		options.lineTable,
		toolDiagnostics,
		logicalSource,
	);
	const sectionByLine = logicalSource
		? new Map<number, SectionNode>()
		: mapSectionScope(sections, options.lineTable.lines.length);
	const { xrefOccurrences, anchorOccurrences } =
		scanInlineOccurrencesInOfficialBlocks({
			lineTable: options.lineTable,
			blockSurfaces,
			intervalByBlock,
			toolDiagnostics,
		});
	let sectionScopeIndex: SourceScopeIndex | undefined;
	if (logicalSource) {
		sectionScopeIndex = buildSourceScopeIndex(sections);
		assignContainingSectionIdsFromSourceScope(
			xrefOccurrences,
			anchorOccurrences,
			sectionScopeIndex,
		);
	} else {
		assignContainingSectionIds(
			xrefOccurrences,
			anchorOccurrences,
			sectionByLine,
		);
	}

	return {
		blockSurfaces,
		intervalByBlock,
		projectableBlocks,
		containerFallbackBlocks,
		sectionByBlock,
		sections,
		xrefOccurrences,
		anchorOccurrences,
		sectionByLine,
		...(sectionScopeIndex ? { sectionScopeIndex } : {}),
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

function unknownContextDiagnostic(
	surface: OfficialBlockSurface,
	interval?: SourceInterval | undefined,
): ToolDiagnostic {
	return definedObject({
		level: "warning",
		code: "official-block-context.unknown",
		message: `Unknown official block context '${surface.context ?? "undefined"}' was skipped conservatively.`,
		source: interval?.sourceSpan,
	}) as ToolDiagnostic;
}

function canUseContainerFallbackSurface(
	surface: OfficialBlockSurface,
	policy: ReturnType<typeof officialBlockPolicy>,
): boolean {
	return (
		surface.context === "paragraph" &&
		policy === "scan" &&
		!hasDiagnosticPolicyAncestor(surface)
	);
}

function buildSectionSurfaces(
	blockSurfaces: OfficialBlockSurface[],
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
	lineTable: LineTable,
	toolDiagnostics: ToolDiagnostic[],
	logicalSource: ReturnType<typeof logicalSourceForLineTable>,
): {
	sections: SectionNode[];
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
} {
	const sections: SectionNode[] = [];
	const sectionByBlock = new WeakMap<AsciidoctorBlock, SectionNode>();
	const originHeadingBoundaryIndex = buildOriginHeadingBoundaryIndex(
		blockSurfaces,
		intervalByBlock,
		logicalSource,
	);

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
		const sourceLine = surface.sourceLine;
		if (sourceLine === undefined) {
			continue;
		}
		const currentBoundary = originHeadingBoundaryForSection(
			originHeadingBoundaryIndex,
			logicalSource,
			sourceLine,
			interval.span.startLine,
		);
		const nextBoundary = nextOriginHeadingBoundary(
			originHeadingBoundaryIndex,
			currentBoundary,
		);
		const recoveredSource = logicalSource
			? recoverSectionSourceLayer(
					logicalSource,
					sourceLine,
					interval.span.startLine,
					interval.titleSpan,
					nextBoundary?.sliceStartLine,
				)
			: undefined;
		if (recoveredSource && !recoveredSource.ok) {
			toolDiagnostics.push(recoveredSource.diagnostic);
		}
		const sourceLayer = recoveredSource?.ok
			? recoveredSource.sourceLayer
			: definedObject({
					line: surface.sourceLine,
					span: interval.span,
					sourceSpan: interval.sourceSpan,
					raw: `${sourceLines(
						lineTable,
						interval.span.startLine,
						interval.span.endLine,
					).join("\n")}\n`,
				});
		const sectionLine = recoveredSource?.ok
			? recoveredSource.sourceLayer.line
			: sourceLine;
		const sectionSpan = recoveredSource?.ok
			? recoveredSource.sourceLayer.span
			: interval.span;
		const titleSpan =
			logicalSource && recoveredSource?.ok
				? recoverTitleSpan(logicalSource, interval.titleSpan)
				: interval.titleSpan;
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
			line: sectionLine,
			span: sectionSpan,
			titleSpan,
			idOrigin,
			metadata: metadata.map((entry) => entry.node),
			source: sourceLayer,
			asciidoctor: definedObject({
				context: surface.context,
				nodeName: surface.nodeName,
				resolvedId: officialId,
				resolvedType: "section" as TargetType,
				reftext: surface.title,
			}),
			children: [],
		}) as SectionNode;
		if (logicalSource) {
			const sourceScope = sectionSourceScopeFromLogicalInterval(
				logicalSource,
				interval.span,
				sourceLine,
			);
			if (sourceScope) {
				registerSectionSourceScope(section, sourceScope);
			}
		}
		sections.push(section);
		sectionByBlock.set(surface.block, section);
	}

	return { sections, sectionByBlock };
}

function buildOriginHeadingBoundaryIndex(
	blockSurfaces: readonly OfficialBlockSurface[],
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
	logicalSource: ReturnType<typeof logicalSourceForLineTable>,
): OriginHeadingBoundaryIndex | undefined {
	if (!logicalSource) {
		return undefined;
	}
	const grouped = new Map<string, OriginHeadingBoundary[]>();
	for (const surface of blockSurfaces) {
		if (surface.context !== "section") {
			continue;
		}
		if (hasDiagnosticPolicyAncestor(surface)) {
			continue;
		}
		const logicalHeadingLine = surface.sourceLine;
		const interval = intervalByBlock.get(surface.block);
		if (logicalHeadingLine === undefined || !interval) {
			continue;
		}
		const headingOrigin = logicalSource.lineOrigins[logicalHeadingLine - 1];
		if (!headingOrigin) {
			continue;
		}
		const metadataOrigin =
			logicalSource.lineOrigins[interval.span.startLine - 1] ?? headingOrigin;
		const sliceStartLine =
			metadataOrigin.relativePath === headingOrigin.relativePath
				? metadataOrigin.sourceLine
				: headingOrigin.sourceLine;
		const bucket = grouped.get(headingOrigin.relativePath) ?? [];
		bucket.push({
			relativePath: headingOrigin.relativePath,
			headingLine: headingOrigin.sourceLine,
			sliceStartLine,
		});
		grouped.set(headingOrigin.relativePath, bucket);
	}
	return new Map(
		[...grouped.entries()].map(([relativePath, boundaries]) => [
			relativePath,
			boundaries.toSorted(
				(left, right) =>
					left.sliceStartLine - right.sliceStartLine ||
					left.headingLine - right.headingLine,
			),
		]),
	);
}

function originHeadingBoundaryForSection(
	index: OriginHeadingBoundaryIndex | undefined,
	logicalSource: ReturnType<typeof logicalSourceForLineTable>,
	logicalHeadingLine: number,
	logicalMetadataStartLine: number,
): OriginHeadingBoundary | undefined {
	if (!index || !logicalSource) {
		return undefined;
	}
	const headingOrigin = logicalSource.lineOrigins[logicalHeadingLine - 1];
	if (!headingOrigin) {
		return undefined;
	}
	const metadataOrigin =
		logicalSource.lineOrigins[logicalMetadataStartLine - 1] ?? headingOrigin;
	const sliceStartLine =
		metadataOrigin.relativePath === headingOrigin.relativePath
			? metadataOrigin.sourceLine
			: headingOrigin.sourceLine;

	return index
		.get(headingOrigin.relativePath)
		?.find(
			(candidate) =>
				candidate.sliceStartLine === sliceStartLine &&
				candidate.headingLine === headingOrigin.sourceLine,
		);
}

function nextOriginHeadingBoundary(
	index: OriginHeadingBoundaryIndex | undefined,
	current: OriginHeadingBoundary | undefined,
): OriginHeadingBoundary | undefined {
	if (!index || !current) {
		return undefined;
	}
	return index
		.get(current.relativePath)
		?.find((candidate) => candidate.sliceStartLine > current.sliceStartLine);
}

function sectionSourceScopeFromLogicalInterval(
	logicalSource: NonNullable<ReturnType<typeof logicalSourceForLineTable>>,
	span: SourceInterval["span"],
	headingLogicalLine: number,
):
	| {
			readonly relativePath: string;
			readonly startLine: number;
			readonly endLine: number;
	  }
	| undefined {
	const headingOrigin = logicalSource.lineOrigins[headingLogicalLine - 1];
	if (!headingOrigin) {
		return undefined;
	}
	let endLine = headingOrigin.sourceLine;
	for (
		let logicalLine = span.startLine;
		logicalLine <= span.endLine;
		logicalLine += 1
	) {
		const origin = logicalSource.lineOrigins[logicalLine - 1];
		if (!origin || origin.relativePath !== headingOrigin.relativePath) {
			continue;
		}
		endLine = Math.max(endLine, origin.sourceLine);
	}
	return {
		relativePath: headingOrigin.relativePath,
		startLine: headingOrigin.sourceLine,
		endLine,
	};
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
