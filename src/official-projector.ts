import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import { addTarget, type OfficialBindingRequest } from "./binding-merge";
import type { SourceAwareLogicalDocument } from "./book-entry/line-origin-model";
import {
	originPointKey,
	originPointsForSpan,
	recoverSourceAwareContentLineSpan,
	recoverSourceAwareSourceLayer,
	sourceAwareDocumentForLineTable,
} from "./book-entry/source-aware-coordinate";
import type { MetadataSurface } from "./metadata-parser";
import type {
	AbundantNode,
	AnchorOccurrenceNode,
	AsciidoctorLayer,
	DescriptionListItemNode,
	DescriptionListNode,
	DescriptionNode,
	DescriptionTermNode,
	HeadingInlineMetadataOccurrenceNode,
	ListingNode,
	ParagraphNode,
	SectionNode,
	SourceLayer,
	SourceSpan,
	TableNode,
	TargetNode,
	TargetType,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";
import { officialBlockPolicy } from "./official-block-policy";
import {
	childBlocksOf,
	descriptionListItemsFromBlock,
} from "./official-block-utils";
import { descriptionListDelimiter } from "./official-paragraph";
import type { SourceInterval } from "./source-interval-resolver";
import {
	collectOccurrencesInLineRange,
	compareNodesBySource,
	groupByLine,
	type LineTable,
	lineText,
	sourceLines,
	sourceSpanFromLineSpan,
} from "./source-lines";

type ProjectContext = {
	officialDocument: AsciidoctorBlock;
	lineTable: LineTable;
	sections: SectionNode[];
	sectionByLine: Map<number, SectionNode>;
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[];
	xrefsByLine: Map<number, XrefOccurrenceNode[]>;
	anchorsByLine: Map<number, AnchorOccurrenceNode[]>;
	headingInlineMetadataByLine: Map<
		number,
		HeadingInlineMetadataOccurrenceNode[]
	>;
	usedAnchorKeys: Set<string>;
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>;
	projectableBlocks?: WeakSet<AsciidoctorBlock> | undefined;
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
	bindingRequests: OfficialBindingRequest[];
	targets: TargetNode[];
	sourceAwareDocument?: SourceAwareLogicalDocument;
};

type BuildResult = AbundantNode | AbundantNode[] | undefined;

export function projectOfficialDocument(options: {
	officialDocument: AsciidoctorBlock;
	lineTable: LineTable;
	sections: SectionNode[];
	sectionByLine: Map<number, SectionNode>;
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[];
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>;
	projectableBlocks?: WeakSet<AsciidoctorBlock> | undefined;
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
}): {
	children: AbundantNode[];
	targets: TargetNode[];
	bindingRequests: OfficialBindingRequest[];
} {
	const targets: TargetNode[] = [];
	const bindingRequests: OfficialBindingRequest[] = [];
	const sourceAwareDocument = sourceAwareDocumentForLineTable(
		options.lineTable,
	);
	const context: ProjectContext = definedObject({
		officialDocument: options.officialDocument,
		lineTable: options.lineTable,
		sections: options.sections,
		sectionByLine: options.sectionByLine,
		xrefOccurrences: options.xrefOccurrences,
		anchorOccurrences: options.anchorOccurrences,
		headingInlineMetadataOccurrences: options.headingInlineMetadataOccurrences,
		xrefsByLine: groupByLine(options.xrefOccurrences),
		anchorsByLine: groupByLine(options.anchorOccurrences),
		headingInlineMetadataByLine: groupByLine(
			options.headingInlineMetadataOccurrences,
		),
		usedAnchorKeys: new Set(),
		intervalByBlock: options.intervalByBlock,
		projectableBlocks: options.projectableBlocks,
		sectionByBlock: options.sectionByBlock,
		bindingRequests,
		targets,
		sourceAwareDocument,
	}) as ProjectContext;

	return {
		children: buildChildren(options.officialDocument, context),
		targets,
		bindingRequests,
	};
}

function buildChildren(
	officialDocument: AsciidoctorBlock,
	context: ProjectContext,
): AbundantNode[] {
	const topLevel: AbundantNode[] = [];

	for (const block of childBlocksOf(officialDocument)) {
		topLevel.push(...toNodes(buildNode(block, context)));
	}

	return topLevel;
}

function buildNode(
	block: AsciidoctorBlock,
	context: ProjectContext,
): BuildResult {
	const blockContext = block.getContext?.();
	const officialLine = block.getSourceLocation?.()?.getLineNumber?.();
	const interval = context.intervalByBlock.get(block);
	if (!canProjectBlock(block, context)) {
		return undefined;
	}

	if (blockContext === "section" && officialLine !== undefined) {
		return buildSection(block, context);
	}
	if (blockContext === "paragraph" && officialLine !== undefined) {
		return buildParagraph(block, officialLine, context, interval);
	}
	if (blockContext === "listing" && officialLine !== undefined) {
		return buildListing(block, officialLine, context, interval);
	}
	if (blockContext === "table" && officialLine !== undefined) {
		return buildTable(block, officialLine, context, interval);
	}
	if (blockContext === "dlist" && officialLine !== undefined) {
		return buildDescriptionList(block, officialLine, context, interval);
	}
	if (blockContext === "open" && officialLine !== undefined) {
		return childBlocksOf(block).flatMap((child) =>
			toNodes(buildNode(child, context)),
		);
	}
	if (officialBlockPolicy(block) === "diagnostic") {
		return undefined;
	}
	if (officialLine !== undefined) {
		const id = block.getId?.();
		registerOfficialBlockTarget(context, block, {
			targetType: "block",
			// discrete 标题没写 ID 时，官方按标题生成一个，与 section 相同。
			idOrigin:
				blockContext === "floating_title" &&
				!interval?.metadata.some((surface) => id && surface.ids.includes(id))
					? "asciidoctor-generated"
					: "source",
			sourceSpan:
				interval?.sourceSpan ??
				sourceSpanFromLineSpan(context.lineTable, {
					startLine: officialLine,
					endLine: officialLine,
				}),
		});
		requestTitleBindings(context, block);
		return childBlocksOf(block).flatMap((child) =>
			toNodes(buildNode(child, context)),
		);
	}
	return undefined;
}

// section 与 discrete 标题的标题行上的 xref 由扫描器找出（09 号书「Inline 扫描边界」），所在的块就是这个标题。
function requestTitleBindings(
	context: ProjectContext,
	block: AsciidoctorBlock,
): void {
	const blockContext = block.getContext?.();
	const line = context.intervalByBlock.get(block)?.blockStartLine;
	if (
		(blockContext !== "section" && blockContext !== "floating_title") ||
		line === undefined
	) {
		return;
	}
	const xrefs = collectXrefsInSpan(context, { startLine: line, endLine: line });
	if (xrefs.length > 0) {
		context.bindingRequests.push({ block, xrefs });
	}
}

function canProjectBlock(
	block: AsciidoctorBlock,
	context: ProjectContext,
): boolean {
	return context.projectableBlocks?.has(block) ?? true;
}

function buildSection(
	block: AsciidoctorBlock,
	context: ProjectContext,
): SectionNode | undefined {
	const section = context.sectionByBlock.get(block);
	if (!section) {
		return undefined;
	}

	const officialId = block.getId?.();
	if (section.ids.length === 0 && officialId) {
		section.ids = [officialId];
	}
	section.asciidoctor = definedObject({
		...section.asciidoctor,
		context: block.getContext?.(),
		nodeName: block.getNodeName?.(),
		resolvedId: officialId,
		resolvedType: "section",
		reftext: block.getTitle?.(),
	}) as AsciidoctorLayer;
	registerOfficialBlockTarget(context, block, {
		targetType: "section",
		title: section.title,
		idOrigin: section.idOrigin,
		sourceSpan:
			section.source?.sourceSpan ??
			sourceSpanFromLineSpan(context.lineTable, section.span),
		source: section.source,
		asciidoctor: section.asciidoctor,
	});
	requestTitleBindings(context, block);
	section.children = childBlocksOf(block).flatMap((child) =>
		toNodes(buildNode(child, context)),
	);
	return section;
}

function buildDescriptionList(
	block: AsciidoctorBlock,
	startLine: number,
	context: ProjectContext,
	interval: SourceInterval | undefined,
): DescriptionListNode {
	const metadata = interval?.metadata ?? [];
	const span = interval?.span ?? { startLine, endLine: startLine };
	const contentSpan = interval?.contentSpan ?? span;
	const source = blockSourceLayer(context, interval, span, "description list");
	const ids = metadata.flatMap((surface) => surface.ids);
	const list: DescriptionListNode = definedObject({
		kind: "descriptionList",
		ids,
		title:
			metadata.find((surface) => surface.title)?.title ?? block.getTitle?.(),
		style:
			metadata.find((surface) => surface.style)?.style ?? block.getStyle?.(),
		delimiter: descriptionListDelimiterMatch(context.lineTable, startLine)?.raw,
		metadata: metadata.map((surface) => surface.node),
		metadataSpan: interval?.metadataSpan,
		contentSpan: source
			? originLineSpan(context, contentSpan, span)
			: undefined,
		span: source?.span,
		source,
		asciidoctor: definedObject({
			context: block.getContext?.(),
			nodeName: block.getNodeName?.(),
			resolvedId: block.getId?.(),
			resolvedType: block.getId?.() ? "block" : undefined,
			reftext: block.getTitle?.(),
		}) as AsciidoctorLayer,
		items: descriptionListItemsFromBlock(block).map((item) =>
			buildDescriptionListItem(item, context),
		),
	}) as DescriptionListNode;
	const officialId = block.getId?.();
	if (list.ids.length === 0 && officialId) {
		list.ids = [officialId];
	}
	registerOfficialBlockTarget(context, block, {
		targetType: "block",
		title: list.title,
		sourceSpan: list.source?.sourceSpan,
		source: list.source,
		asciidoctor: list.asciidoctor,
	});
	return list;
}

function buildDescriptionListItem(
	item: ReturnType<typeof descriptionListItemsFromBlock>[number],
	context: ProjectContext,
): DescriptionListItemNode {
	const terms = item.terms.map((term) => buildDescriptionTerm(term, context));
	const description = item.description
		? buildDescription(item.description, context)
		: undefined;
	const itemSpan = mergeNodeLineSpans([
		...terms.map((term) => term.source?.span),
		description ? nodeTreeLineSpan(description) : undefined,
	]);
	return definedObject({
		kind: "descriptionListItem",
		terms,
		...(description ? { description } : {}),
		span: itemSpan,
	}) as DescriptionListItemNode;
}

function buildDescriptionTerm(
	block: AsciidoctorBlock,
	context: ProjectContext,
): DescriptionTermNode {
	const line = block.getSourceLocation?.()?.getLineNumber?.();
	const interval = context.intervalByBlock.get(block);
	const span = interval?.contentSpan ?? interval?.span;
	const sourceSpan =
		line === undefined
			? undefined
			: descriptionTermSourceSpan(context.lineTable, line);
	const source =
		span && sourceSpan
			? descriptionPartSourceLayer(
					context,
					span,
					sourceSpan,
					"description term",
				)
			: span
				? blockSourceLayer(context, interval, span, "description term")
				: undefined;
	const occurrenceSpan = occurrenceSpanOf(context, source, sourceSpan);
	const xrefs = span
		? collectXrefsInSpan(context, span).filter((xref) =>
				isOccurrenceInsideSourceSpan(xref, occurrenceSpan),
			)
		: [];
	const anchors = span
		? collectAnchorsInSpan(context, span).filter((anchor) => {
				if (!isOccurrenceInsideSourceSpan(anchor, occurrenceSpan)) {
					return false;
				}
				const key = anchorKey(anchor);
				if (context.usedAnchorKeys.has(key)) {
					return false;
				}
				context.usedAnchorKeys.add(key);
				return true;
			})
		: [];
	const headingInlineMetadata = span
		? collectHeadingInlineMetadataInSpan(context, span).filter((occurrence) =>
				isOccurrenceInsideSourceSpan(occurrence, occurrenceSpan),
			)
		: [];
	context.bindingRequests.push({ block, xrefs });
	return definedObject({
		kind: "descriptionTerm",
		text: normalizedListItemText(block),
		line,
		sourceSpan: sourceSpan ?? source?.sourceSpan,
		source,
		asciidoctor: definedObject({
			context: block.getContext?.(),
			nodeName: block.getNodeName?.(),
		}) as AsciidoctorLayer,
		children: [...xrefs, ...anchors, ...headingInlineMetadata].sort(
			compareNodesBySource,
		),
	}) as DescriptionTermNode;
}

function buildDescription(
	block: AsciidoctorBlock,
	context: ProjectContext,
): DescriptionNode {
	const line = block.getSourceLocation?.()?.getLineNumber?.();
	const interval = context.intervalByBlock.get(block);
	const span = interval?.contentSpan ?? interval?.span;
	// 文字的范围由区间解析器照官方读法算出（09 号书「描述的文字」）；没有直接文字的描述没有它。
	const sourceSpan = interval?.contentSourceSpan;
	const source =
		span && sourceSpan
			? descriptionPartSourceLayer(
					context,
					span,
					sourceSpan,
					"description item",
				)
			: span
				? blockSourceLayer(context, interval, span, "description item")
				: undefined;
	const occurrenceSpan = occurrenceSpanOf(context, source, sourceSpan);
	const xrefs = span
		? collectXrefsInSpan(context, span).filter((xref) =>
				isOccurrenceInsideSourceSpan(xref, occurrenceSpan),
			)
		: [];
	const anchors = span
		? collectAnchorsInSpan(context, span).filter((anchor) => {
				if (!isOccurrenceInsideSourceSpan(anchor, occurrenceSpan)) {
					return false;
				}
				const key = anchorKey(anchor);
				if (context.usedAnchorKeys.has(key)) {
					return false;
				}
				context.usedAnchorKeys.add(key);
				return true;
			})
		: [];
	const headingInlineMetadata = span
		? collectHeadingInlineMetadataInSpan(context, span).filter((occurrence) =>
				isOccurrenceInsideSourceSpan(occurrence, occurrenceSpan),
			)
		: [];
	context.bindingRequests.push({ block, xrefs });
	const children = [
		...xrefs,
		...anchors,
		...headingInlineMetadata,
		...childBlocksOf(block).flatMap((child) =>
			toNodes(buildNode(child, context)),
		),
	].sort(compareAbundantNodesBySource);
	return definedObject({
		kind: "description",
		text: normalizedListItemText(block) || undefined,
		line,
		sourceSpan: sourceSpan ?? source?.sourceSpan,
		source,
		asciidoctor: definedObject({
			context: block.getContext?.(),
			nodeName: block.getNodeName?.(),
		}) as AsciidoctorLayer,
		children,
	}) as DescriptionNode;
}

function toNodes(result: BuildResult): AbundantNode[] {
	if (result === undefined) {
		return [];
	}
	return Array.isArray(result) ? result : [result];
}

function normalizedListItemText(block: AsciidoctorBlock): string {
	const text = block.getText?.();
	if (typeof text !== "string") {
		return "";
	}
	return text.replace(/<[^>]+>/gu, "");
}

function descriptionTermSourceSpan(
	lineTable: LineTable,
	line: number,
): SourceSpan | undefined {
	const delimiter = descriptionListDelimiterMatch(lineTable, line);
	if (!delimiter) {
		return undefined;
	}
	return {
		start: { line, column: 1 },
		end: { line, column: delimiter.column },
	};
}

function descriptionListDelimiterMatch(
	lineTable: LineTable,
	line: number,
): { raw: string; index: number; column: number } | undefined {
	const text = lineText(lineTable, line);
	const delimiter = descriptionListDelimiter(text);
	if (!delimiter) {
		return undefined;
	}
	return {
		...delimiter,
		column: [...text.slice(0, delimiter.index)].length + 1,
	};
}

function descriptionPartSourceLayer(
	context: ProjectContext,
	span: { startLine: number; endLine: number },
	sourceSpan: SourceSpan,
	diagnosticContext: string,
): SourceLayer | undefined {
	if (!context.sourceAwareDocument) {
		return definedObject({
			span,
			sourceSpan,
			raw: sourceTextForSpan(context, sourceSpan),
		}) as SourceLayer;
	}
	const recovered = recoverSourceAwareSourceLayer(
		context.sourceAwareDocument,
		span,
		{
			logicalSourceSpan: sourceSpan,
			diagnosticContext,
		},
	);
	return recovered.ok ? recovered.sourceLayer : undefined;
}

function sourceTextForSpan(
	context: ProjectContext,
	sourceSpan: SourceSpan,
): string | undefined {
	const lines: string[] = [];
	for (
		let line = sourceSpan.start.line;
		line <= sourceSpan.end.line;
		line += 1
	) {
		const chars = Array.from(lineText(context.lineTable, line));
		lines.push(
			chars
				.slice(
					line === sourceSpan.start.line ? sourceSpan.start.column - 1 : 0,
					line === sourceSpan.end.line ? sourceSpan.end.column - 1 : undefined,
				)
				.join(""),
		);
	}
	return lines.join("\n");
}

// 术语与描述常在同一行，出现处归谁按列分。book-entry 中出现处只剩来源坐标（10 号书「结构关系在 Logical Document
// 上判定」），所以拿回源以后的 sourceSpan 比；文件模式两者是同一套坐标。回源失败时没有可比的列，不再按列分。
function occurrenceSpanOf(
	context: ProjectContext,
	source: SourceLayer | undefined,
	sourceSpan: SourceSpan | undefined,
): SourceSpan | undefined {
	return context.sourceAwareDocument ? source?.sourceSpan : sourceSpan;
}

function isOccurrenceInsideSourceSpan(
	occurrence: { sourceSpan?: SourceSpan },
	sourceSpan: SourceSpan | undefined,
): boolean {
	if (!sourceSpan || !occurrence.sourceSpan) {
		return true;
	}
	return (
		comparePositions(occurrence.sourceSpan.start, sourceSpan.start) >= 0 &&
		comparePositions(occurrence.sourceSpan.end, sourceSpan.end) <= 0
	);
}

function comparePositions(
	left: SourceSpan["start"],
	right: SourceSpan["start"],
): number {
	return left.line - right.line || left.column - right.column;
}

function mergeNodeLineSpans(
	spans: Array<{ startLine: number; endLine: number } | undefined>,
): { startLine: number; endLine: number } | undefined {
	const present = spans.filter(isLineSpan);
	if (present.length === 0) {
		return undefined;
	}
	return {
		startLine: Math.min(...present.map((span) => span.startLine)),
		endLine: Math.max(...present.map((span) => span.endLine)),
	};
}

function nodeTreeLineSpan(
	node: AbundantNode,
): { startLine: number; endLine: number } | undefined {
	return mergeNodeLineSpans([
		node.source?.span,
		...(node.children ?? []).map((child) => nodeTreeLineSpan(child)),
	]);
}

function compareAbundantNodesBySource(
	left: AbundantNode,
	right: AbundantNode,
): number {
	return (
		nodeSourceLine(left) - nodeSourceLine(right) ||
		nodeSourceColumn(left) - nodeSourceColumn(right)
	);
}

function nodeSourceLine(node: AbundantNode): number {
	return (
		sourceSpanOf(node)?.start.line ??
		node.source?.line ??
		node.source?.span?.startLine ??
		0
	);
}

function nodeSourceColumn(node: AbundantNode): number {
	return (
		sourceSpanOf(node)?.start.column ??
		node.source?.sourceSpan?.start.column ??
		0
	);
}

function sourceSpanOf(node: AbundantNode) {
	return "sourceSpan" in node ? node.sourceSpan : undefined;
}

function isLineSpan(
	value: { startLine: number; endLine: number } | undefined,
): value is { startLine: number; endLine: number } {
	return value !== undefined;
}

function buildParagraph(
	block: AsciidoctorBlock,
	line: number,
	context: ProjectContext,
	interval: SourceInterval | undefined,
): ParagraphNode {
	const blockSpan = interval?.span ?? {
		startLine: line,
		endLine: line,
	};
	const contentSpan = interval?.contentSpan ?? blockSpan;
	const source = blockSourceLayer(
		context,
		interval,
		blockSpan,
		"paragraph block",
	);
	const xrefs = collectXrefsInSpan(context, contentSpan);
	const anchors = collectAnchorsInSpan(context, contentSpan).filter(
		(anchor) => {
			const key = anchorKey(anchor);
			if (context.usedAnchorKeys.has(key)) {
				return false;
			}
			context.usedAnchorKeys.add(key);
			return true;
		},
	);
	const headingInlineMetadata = collectHeadingInlineMetadataInSpan(
		context,
		contentSpan,
	);
	context.bindingRequests.push({ block, xrefs });
	const sourceSpan = source?.sourceSpan;
	const asciidoctor = definedObject({
		context: block.getContext?.(),
		nodeName: block.getNodeName?.(),
		resolvedId: block.getId?.(),
		resolvedType: block.getId?.() ? "block" : undefined,
		reftext: block.getTitle?.(),
	}) as AsciidoctorLayer;
	const paragraph = {
		kind: "paragraph",
		text: sourceLines(
			context.lineTable,
			contentSpan.startLine,
			contentSpan.endLine,
		).join("\n"),
		source,
		asciidoctor,
		children: [...xrefs, ...anchors, ...headingInlineMetadata].sort(
			compareNodesBySource,
		),
	} as ParagraphNode;

	registerOfficialBlockTarget(context, block, {
		targetType: "block",
		title: block.getTitle?.() ?? undefined,
		sourceSpan,
		source,
		asciidoctor,
	});

	return paragraph;
}

function buildListing(
	block: AsciidoctorBlock,
	delimiterLine: number,
	context: ProjectContext,
	interval: SourceInterval | undefined,
): ListingNode {
	const metadata = interval?.metadata ?? [];
	const span = interval?.span ?? {
		startLine: delimiterLine,
		endLine: delimiterLine,
	};
	const contentSpan = interval?.contentSpan;
	const source = blockSourceLayer(context, interval, span, "listing block");
	const ids = metadata.flatMap((surface) => surface.ids);
	const listing = definedObject({
		kind: "listing",
		ids,
		title:
			metadata.find((surface) => surface.title)?.title ?? block.getTitle?.(),
		style:
			metadata.find((surface) => surface.style)?.style ?? block.getStyle?.(),
		language: listingLanguage(block, metadata),
		metadata: metadata.map((surface) => surface.node),
		content:
			block.getSource?.() ??
			(contentSpan
				? sourceLines(
						context.lineTable,
						contentSpan.startLine,
						contentSpan.endLine,
					).join("\n")
				: undefined),
		metadataSpan: interval?.metadataSpan,
		contentSpan: source
			? originLineSpan(context, contentSpan, span)
			: undefined,
		span: source?.span,
		source,
		asciidoctor: definedObject({
			context: block.getContext?.(),
			nodeName: block.getNodeName?.(),
			resolvedId: block.getId?.(),
			resolvedType: "listing",
			reftext: block.getTitle?.(),
		}) as AsciidoctorLayer,
	}) as ListingNode;

	const officialId = block.getId?.();
	if (listing.ids.length === 0 && officialId) {
		listing.ids = [officialId];
	}
	registerOfficialBlockTarget(context, block, {
		targetType: "listing",
		title: listing.title,
		sourceSpan: listing.source?.sourceSpan,
		source: listing.source,
		asciidoctor: listing.asciidoctor,
	});
	return listing;
}

function listingLanguage(
	block: AsciidoctorBlock,
	metadata: readonly MetadataSurface[],
): string | undefined {
	const explicitLanguage = metadata.find(
		(surface) => surface.language,
	)?.language;
	if (explicitLanguage !== undefined) {
		return explicitLanguage;
	}
	if (metadata.some(hasRdf12SourceOwnerMarker)) {
		return undefined;
	}
	return stringAttr(block, "language");
}

function hasRdf12SourceOwnerMarker(surface: MetadataSurface): boolean {
	if (surface.node.metadataKind !== "attrlist") {
		return false;
	}
	const attributes = surface.node.attributes ?? {};
	return attributes.for === true || attributes.forSelector === true;
}

function buildTable(
	block: AsciidoctorBlock,
	delimiterLine: number,
	context: ProjectContext,
	interval: SourceInterval | undefined,
): TableNode {
	const metadata = interval?.metadata ?? [];
	const span = interval?.span ?? {
		startLine: delimiterLine,
		endLine: delimiterLine,
	};
	const source = blockSourceLayer(context, interval, span, "table block");
	const ids = metadata.flatMap((surface) => surface.ids);
	const tableContentSpan = interval?.contentSpan ?? span;
	const tableXrefs = collectXrefsInSpan(context, tableContentSpan);
	const tableAnchors = collectAnchorsInSpan(context, tableContentSpan).filter(
		(anchor) => {
			const key = anchorKey(anchor);
			if (context.usedAnchorKeys.has(key)) {
				return false;
			}
			context.usedAnchorKeys.add(key);
			return true;
		},
	);
	const tableHeadingInlineMetadata = collectHeadingInlineMetadataInSpan(
		context,
		tableContentSpan,
	);
	context.bindingRequests.push({ block, xrefs: tableXrefs });
	const table = definedObject({
		kind: "table",
		ids,
		title:
			metadata.find((surface) => surface.title)?.title ?? block.getTitle?.(),
		metadata: metadata.map((surface) => surface.node),
		rows: rowsFromTable(block.rows),
		span: source?.span,
		source,
		asciidoctor: definedObject({
			context: block.getContext?.(),
			nodeName: block.getNodeName?.(),
			resolvedId: block.getId?.(),
			resolvedType: "table",
			reftext: block.getTitle?.(),
		}) as AsciidoctorLayer,
		children: [
			...tableXrefs,
			...tableAnchors,
			...tableHeadingInlineMetadata,
		].sort(compareNodesBySource),
	}) as TableNode;

	const officialId = block.getId?.();
	if (table.ids.length === 0 && officialId) {
		table.ids = [officialId];
	}
	registerOfficialBlockTarget(context, block, {
		targetType: "table",
		title: table.title,
		sourceSpan: table.source?.sourceSpan,
		source: table.source,
		asciidoctor: table.asciidoctor,
	});
	return table;
}

function registerOfficialBlockTarget(
	context: ProjectContext,
	block: AsciidoctorBlock,
	options: {
		targetType: TargetType;
		title?: string | undefined;
		idOrigin?: TargetNode["idOrigin"] | undefined;
		sourceSpan?: TargetNode["sourceSpan"] | undefined;
		source?: SourceLayer | undefined;
		asciidoctor?: AsciidoctorLayer | undefined;
	},
): void {
	const id = block.getId?.();
	if (!id) {
		return;
	}
	const asciidoctor = definedObject({
		context: block.getContext?.(),
		nodeName: block.getNodeName?.(),
		...options.asciidoctor,
		resolvedId: id,
		resolvedType: options.targetType,
		reftext:
			options.asciidoctor?.reftext ?? options.title ?? block.getTitle?.(),
	}) as AsciidoctorLayer;
	addTarget(
		context.targets,
		definedObject({
			kind: "target",
			id,
			targetType: options.targetType,
			title: options.title ?? block.getTitle?.(),
			idOrigin:
				options.idOrigin ??
				(options.targetType === "section" ? "asciidoctor-generated" : "source"),
			sourceSpan: options.sourceSpan,
			containingSectionId:
				options.targetType === "section"
					? undefined
					: blockSectionId(context, block),
			source: options.source,
			asciidoctor,
		}) as TargetNode,
	);
}

function blockSectionId(
	context: ProjectContext,
	block: AsciidoctorBlock,
): string | undefined {
	const line = context.intervalByBlock.get(block)?.span.startLine;
	return line === undefined
		? undefined
		: context.sectionByLine.get(line)?.ids[0];
}

function blockSourceLayer(
	context: ProjectContext,
	interval: SourceInterval | undefined,
	fallbackSpan: { startLine: number; endLine: number },
	diagnosticContext: string,
): SourceLayer | undefined {
	if (!context.sourceAwareDocument) {
		const sourceSpan = sourceSpanFromLineSpan(context.lineTable, fallbackSpan);
		return sourceSpan
			? {
					span: fallbackSpan,
					sourceSpan,
				}
			: { span: fallbackSpan };
	}
	if (!interval) {
		return undefined;
	}
	const logicalSourceSpan = sameLineSpan(fallbackSpan, interval.span)
		? interval.sourceSpan
		: undefined;
	const recovered = recoverSourceAwareSourceLayer(
		context.sourceAwareDocument,
		fallbackSpan,
		{
			logicalSourceSpan,
			raw: true,
			diagnosticContext,
		},
	);
	return recovered.ok ? recovered.sourceLayer : undefined;
}

function sameLineSpan(
	left: { startLine: number; endLine: number },
	right: { startLine: number; endLine: number },
): boolean {
	return left.startLine === right.startLine && left.endLine === right.endLine;
}

function originLineSpan(
	context: ProjectContext,
	span: { startLine: number; endLine: number } | undefined,
	blockSpan: { startLine: number; endLine: number },
): { startLine: number; endLine: number } | undefined {
	if (!span || !context.sourceAwareDocument) {
		return span;
	}
	// 内容可能整段来自 include：单独回源会落到被引入的文件上，和块的 source.relativePath 对不上。
	return recoverSourceAwareContentLineSpan(
		context.sourceAwareDocument,
		blockSpan,
		span,
	);
}

function collectXrefsInSpan(
	context: ProjectContext,
	logicalSpan: { startLine: number; endLine: number },
): XrefOccurrenceNode[] {
	return collectOccurrencesInSpan(
		context,
		context.xrefsByLine,
		context.xrefOccurrences,
		logicalSpan,
	);
}

function collectAnchorsInSpan(
	context: ProjectContext,
	logicalSpan: { startLine: number; endLine: number },
): AnchorOccurrenceNode[] {
	return collectOccurrencesInSpan(
		context,
		context.anchorsByLine,
		context.anchorOccurrences,
		logicalSpan,
	);
}

function collectHeadingInlineMetadataInSpan(
	context: ProjectContext,
	logicalSpan: { startLine: number; endLine: number },
): HeadingInlineMetadataOccurrenceNode[] {
	return collectOccurrencesInSpan(
		context,
		context.headingInlineMetadataByLine,
		context.headingInlineMetadataOccurrences,
		logicalSpan,
	);
}

function collectOccurrencesInSpan<T extends { source?: SourceLayer }>(
	context: ProjectContext,
	groupedByLine: Map<number, T[]>,
	occurrences: T[],
	logicalSpan: { startLine: number; endLine: number },
): T[] {
	if (!context.sourceAwareDocument) {
		return collectOccurrencesInLineRange(
			groupedByLine,
			logicalSpan.startLine,
			logicalSpan.endLine,
		);
	}
	// 出现处属于哪个块是逻辑文档上的结构关系（10 号书「结构关系在 Logical Document 上判定」），
	// 与块有没有坐标无关；出现处只剩来源坐标，所以按块内逻辑行的来源点认它。
	const points = originPointsForSpan(context.sourceAwareDocument, logicalSpan);
	return occurrences.filter((occurrence) => {
		const { relativePath, line } = occurrence.source ?? {};
		return (
			relativePath !== undefined &&
			line !== undefined &&
			points.has(originPointKey(relativePath, line))
		);
	});
}

export function rowsFromTable(rows: unknown): unknown[] {
	if (!isRecord(rows)) {
		return [];
	}
	const result: unknown[] = [];
	for (const groupName of ["head", "body", "foot"]) {
		const group = rows[groupName];
		if (!Array.isArray(group)) {
			continue;
		}
		for (const row of group) {
			if (!Array.isArray(row)) {
				continue;
			}
			result.push(
				row.map((cell) =>
					isRecord(cell) && typeof cell.getText === "function"
						? cell.getText()
						: String(cell),
				),
			);
		}
	}
	return result;
}

function stringAttr(block: AsciidoctorBlock, key: string): string | undefined {
	const value = block.getAttributes?.()?.[key];
	return typeof value === "string" ? value : undefined;
}

function anchorKey(anchor: AnchorOccurrenceNode): string {
	return `${anchor.sourceSpan?.start.line}:${anchor.sourceSpan?.start.column}:${anchor.raw}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}
