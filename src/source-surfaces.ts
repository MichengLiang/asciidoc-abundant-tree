import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import type { SourceAwareLogicalDocument } from "./book-entry/line-origin-model";
import {
	recoverSourceAwareSectionSourceLayer,
	recoverSourceAwareSourceLayer,
	recoverSourceAwareTitleSpan,
	sourceAwareDocumentForLineTable,
} from "./book-entry/source-aware-coordinate";
import { scanInlineOccurrencesInOfficialBlocks } from "./inline-occurrence-scanner";
import type { AttributeListReadings } from "./metadata-parser";
import type {
	AnchorOccurrenceNode,
	HeadingInlineMetadataOccurrenceNode,
	SectionNode,
	TargetType,
	ToolDiagnostic,
} from "./model";
import { definedObject } from "./object-utils";
import { officialBlockPolicy } from "./official-block-policy";
import type { OfficialBlockSurface } from "./official-block-walker";
import { walkOfficialBlocks } from "./official-block-walker";
import type { SourceIdentityApi } from "./source-identity";
import {
	resolveSourceInterval,
	type SourceInterval,
} from "./source-interval-resolver";
import { type LineTable, sourceLines } from "./source-lines";
import type { XrefProbeRegion } from "./xref-recognition";

export type SourceSurfaces = {
	blockSurfaces: OfficialBlockSurface[];
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>;
	projectableBlocks: WeakSet<AsciidoctorBlock>;
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
	sections: SectionNode[];
	// 标题文字里写了属性引用的 section：属性要按它在文中那个位置的取值展开，交给 adapter 在官方块树上回放。
	headlineExpansions: HeadlineExpansion[];
	// 收下 xref 的官方节点与文字区域，交给 xref-recognition 由官方认定。
	xrefRegions: XrefProbeRegion[];
	anchorOccurrences: AnchorOccurrenceNode[];
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[];
	// 键是逻辑行：出现处、块属于哪个 section 都在逻辑文档上判定（10 号书「结构关系在 Logical Document 上判定」）。
	sectionByLine: Map<number, SectionNode>;
	toolDiagnostics: ToolDiagnostic[];
};

export type HeadlineExpansion = {
	readonly owner: AsciidoctorBlock;
	readonly section: SectionNode;
};

// headline 取作者写下的标题文字（06 号书第 2 章 Headline）：照官方认标题的 ExtAtxSectionTitleRx（rx.js 268 行）
// 去掉等号或 # 标记与结尾对称的标记。转换后的标题留在官方层（asciidoctor.reftext）。
const atxSectionTitlePattern = /^(=={0,5}|##{0,5})[ \t]+(.+?)(?:[ \t]+\1)?$/u;

export function sourceHeadline(text: string | undefined): string | undefined {
	return text === undefined
		? undefined
		: atxSectionTitlePattern.exec(text)?.[2];
}

type OriginHeadingBoundary = {
	readonly relativePath: string;
	readonly headingLine: number;
	readonly sliceStartLine: number;
};

type OriginHeadingBoundaryIndex = Map<string, readonly OriginHeadingBoundary[]>;

export function projectSourceSurfaces(options: {
	officialDocument: AsciidoctorBlock;
	lineTable: LineTable;
	attributeLists: AttributeListReadings;
	sourceIdentity: SourceIdentityApi;
	sourcePath?: string;
}): SourceSurfaces {
	const blockSurfaces = walkOfficialBlocks(options.officialDocument);
	const intervalByBlock = new WeakMap<AsciidoctorBlock, SourceInterval>();
	const projectableBlocks = new WeakSet<AsciidoctorBlock>();
	const toolDiagnostics: ToolDiagnostic[] = [];
	const mainSourcePath = options.sourcePath
		? options.sourceIdentity.normalize(
				options.sourceIdentity.resolve(options.sourcePath),
			)
		: undefined;
	const sourceAwareDocument = sourceAwareDocumentForLineTable(
		options.lineTable,
	);

	for (const surface of blockSurfaces) {
		const policy = officialBlockPolicy(surface.block);
		if (
			isExternalSourceSurface(surface, mainSourcePath, options.sourceIdentity)
		) {
			if (policy === "diagnostic") {
				toolDiagnostics.push(unknownContextDiagnostic(surface));
			}
			toolDiagnostics.push({
				level: "warning",
				code: "source-location.external-file",
				message: `Official block source location points outside the parsed source file: ${sourceLocationLabel(surface, options.sourceIdentity)}.`,
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
			continue;
		}
		const interval = resolveSourceInterval(
			surface,
			options.lineTable,
			options.attributeLists,
		);
		if (!interval) {
			continue;
		}
		intervalByBlock.set(surface.block, interval);
		if (policy !== "diagnostic" && !hasDiagnosticPolicyAncestor(surface)) {
			projectableBlocks.add(surface.block);
		}
		toolDiagnostics.push(...interval.diagnostics);
		if (
			sourceAwareDocument &&
			["paragraph", "listing", "table"].includes(surface.context ?? "")
		) {
			const recovered = recoverSourceAwareSourceLayer(
				sourceAwareDocument,
				interval.span,
				{
					logicalSourceSpan: interval.sourceSpan,
					raw: "lines",
					diagnosticContext: `${surface.context} block`,
				},
			);
			if (!recovered.ok) {
				toolDiagnostics.push(recovered.diagnostic);
			}
		}
		if (policy === "diagnostic") {
			toolDiagnostics.push(unknownContextDiagnostic(surface, interval));
		}
	}

	const { sections, sectionByBlock, headlineExpansions } = buildSectionSurfaces(
		blockSurfaces,
		intervalByBlock,
		options.lineTable,
		toolDiagnostics,
		sourceAwareDocument,
	);
	const sectionByLine = mapSectionScope(
		blockSurfaces,
		sectionByBlock,
		intervalByBlock,
	);
	const { xrefRegions, anchorOccurrences, headingInlineMetadataOccurrences } =
		scanInlineOccurrencesInOfficialBlocks({
			lineTable: options.lineTable,
			attributeLists: options.attributeLists,
			blockSurfaces,
			intervalByBlock,
			sectionByLine,
			officialDocument: options.officialDocument,
			toolDiagnostics,
		});

	return {
		blockSurfaces,
		intervalByBlock,
		projectableBlocks,
		sectionByBlock,
		sections,
		headlineExpansions,
		xrefRegions,
		anchorOccurrences,
		headingInlineMetadataOccurrences,
		sectionByLine,
		toolDiagnostics,
	};
}

function isExternalSourceSurface(
	surface: OfficialBlockSurface,
	mainSourcePath: string | undefined,
	sourceIdentity: SourceIdentityApi,
): boolean {
	if (!mainSourcePath) {
		return false;
	}
	const sourceFile = sourceFilePath(surface, sourceIdentity);
	return (
		sourceFile !== undefined &&
		sourceIdentity.normalize(sourceFile) !== mainSourcePath
	);
}

function sourceFilePath(
	surface: OfficialBlockSurface,
	sourceIdentity: SourceIdentityApi,
): string | undefined {
	const sourceFile = surface.sourcePath ?? surface.sourceFile;
	if (!sourceFile) {
		return undefined;
	}
	if (sourceIdentity.isAbsolute(sourceFile)) {
		return sourceFile;
	}
	if (surface.sourceDirectory) {
		return sourceIdentity.join(surface.sourceDirectory, sourceFile);
	}
	return undefined;
}

function sourceLocationLabel(
	surface: OfficialBlockSurface,
	sourceIdentity: SourceIdentityApi,
): string {
	return (
		surface.sourcePath ??
		surface.sourceFile ??
		(surface.sourceDirectory
			? sourceIdentity.join(
					surface.sourceDirectory,
					sourceIdentity.basename(surface.sourceFile ?? ""),
				)
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

function buildSectionSurfaces(
	blockSurfaces: OfficialBlockSurface[],
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
	lineTable: LineTable,
	toolDiagnostics: ToolDiagnostic[],
	sourceAwareDocument: SourceAwareLogicalDocument | undefined,
): {
	sections: SectionNode[];
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
	headlineExpansions: HeadlineExpansion[];
} {
	const sections: SectionNode[] = [];
	const headlineExpansions: HeadlineExpansion[] = [];
	const sectionByBlock = new WeakMap<AsciidoctorBlock, SectionNode>();
	const originHeadingBoundaryIndex = buildOriginHeadingBoundaryIndex(
		blockSurfaces,
		intervalByBlock,
		sourceAwareDocument,
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
			sourceAwareDocument,
			sourceLine,
			interval.span.startLine,
		);
		const nextBoundary = nextOriginHeadingBoundary(
			originHeadingBoundaryIndex,
			currentBoundary,
		);
		const recoveredSource = sourceAwareDocument
			? recoverSourceAwareSectionSourceLayer(
					sourceAwareDocument,
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
			sourceAwareDocument && recoveredSource?.ok
				? recoverSourceAwareTitleSpan(sourceAwareDocument, interval.titleSpan)
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
			title:
				sourceHeadline(lineTable.lines[sourceLine - 1]?.text) ??
				surface.title ??
				"",
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
		sections.push(section);
		sectionByBlock.set(surface.block, section);
		if (section.title.includes("{")) {
			headlineExpansions.push({ owner: surface.block, section });
		}
	}

	return { sections, sectionByBlock, headlineExpansions };
}

function buildOriginHeadingBoundaryIndex(
	blockSurfaces: readonly OfficialBlockSurface[],
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
	sourceAwareDocument: SourceAwareLogicalDocument | undefined,
): OriginHeadingBoundaryIndex | undefined {
	if (!sourceAwareDocument) {
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
		const headingOrigin = sourceAwareOriginForLine(
			sourceAwareDocument,
			logicalHeadingLine,
		);
		if (!headingOrigin) {
			continue;
		}
		const metadataOrigin =
			sourceAwareOriginForLine(sourceAwareDocument, interval.span.startLine) ??
			headingOrigin;
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
	sourceAwareDocument: SourceAwareLogicalDocument | undefined,
	logicalHeadingLine: number,
	logicalMetadataStartLine: number,
): OriginHeadingBoundary | undefined {
	if (!index || !sourceAwareDocument) {
		return undefined;
	}
	const headingOrigin = sourceAwareOriginForLine(
		sourceAwareDocument,
		logicalHeadingLine,
	);
	if (!headingOrigin) {
		return undefined;
	}
	const metadataOrigin =
		sourceAwareOriginForLine(sourceAwareDocument, logicalMetadataStartLine) ??
		headingOrigin;
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

function sourceAwareOriginForLine(
	document: SourceAwareLogicalDocument,
	logicalLine: number,
):
	| {
			readonly relativePath: string;
			readonly sourceLine: number;
	  }
	| undefined {
	const record = document.lines[logicalLine - 1];
	if (!record || !("origin" in record)) {
		return undefined;
	}
	return record.origin;
}

function hasDiagnosticPolicyAncestor(surface: OfficialBlockSurface): boolean {
	let current = surface.parent;
	while (current) {
		if (officialBlockPolicy(current.block) === "diagnostic") {
			return true;
		}
		current = current.parent;
	}
	return false;
}

function mapSectionScope(
	blockSurfaces: readonly OfficialBlockSurface[],
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>,
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
): Map<number, SectionNode> {
	// section 的逻辑区间从标题到整棵子树结束；先序铺开，内层覆盖外层，每行得到最内层的 section。
	// 逻辑区间不受 include 影响：被引入文件没有自己的标题时，它的行仍落在引入它的 section 里。
	const result = new Map<number, SectionNode>();
	for (const surface of blockSurfaces) {
		const section = sectionByBlock.get(surface.block);
		const span = intervalByBlock.get(surface.block)?.span;
		if (!section || !span) {
			continue;
		}
		for (let line = span.startLine; line <= span.endLine; line += 1) {
			result.set(line, section);
		}
	}
	return result;
}
