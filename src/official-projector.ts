import type {
	AsciidoctorAdapter,
	AsciidoctorBlock,
} from "./asciidoctor-adapter";
import { addTarget, applyOfficialBindings } from "./binding-merge";
import type { SourceAwareLogicalDocument } from "./book-entry/line-origin-model";
import type { LogicalSource } from "./book-entry/model";
import {
	logicalSourceForLineTable,
	recoverOriginSourceLayer,
} from "./book-entry/origin-coordinate";
import {
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
	containerFallbackBlocks?: WeakSet<AsciidoctorBlock> | undefined;
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
	adapter: OfficialProjectionAdapter;
	targets: TargetNode[];
	logicalSource?: LogicalSource;
	sourceAwareDocument?: SourceAwareLogicalDocument;
};

type OfficialProjectionAdapter = Pick<AsciidoctorAdapter, "resolveXrefBinding">;

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
	containerFallbackBlocks?: WeakSet<AsciidoctorBlock> | undefined;
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
	adapter: OfficialProjectionAdapter;
}): { children: AbundantNode[]; targets: TargetNode[] } {
	const targets: TargetNode[] = [];
	const sourceAwareDocument = sourceAwareDocumentForLineTable(
		options.lineTable,
	);
	const logicalSource = logicalSourceForLineTable(options.lineTable);
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
		containerFallbackBlocks: options.containerFallbackBlocks,
		sectionByBlock: options.sectionByBlock,
		adapter: options.adapter,
		targets,
		sourceAwareDocument,
		...(logicalSource ? { logicalSource } : {}),
	}) as ProjectContext;

	return {
		children: buildChildren(options.officialDocument, context),
		targets,
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
	fallbackLine?: number | undefined,
): BuildResult {
	const blockContext = block.getContext?.();
	const officialLine = block.getSourceLocation?.()?.getLineNumber?.();
	const line = officialLine ?? fallbackLine;
	const interval = context.intervalByBlock.get(block);
	if (!canProjectBlock(block, context, officialLine, fallbackLine)) {
		return undefined;
	}

	if (blockContext === "section" && officialLine !== undefined) {
		return buildSection(block, context);
	}
	if (blockContext === "paragraph" && line !== undefined) {
		return buildParagraph(block, line, context, interval);
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
	if (blockContext === "open" && line !== undefined) {
		return buildOpenChildren(block, line, context);
	}
	if (officialBlockPolicy(blockContext) === "diagnostic") {
		return undefined;
	}
	if (officialLine !== undefined) {
		registerOfficialBlockTarget(context, block, {
			targetType: "block",
			sourceSpan:
				interval?.sourceSpan ??
				sourceSpanFromLineSpan(context.lineTable, {
					startLine: officialLine,
					endLine: officialLine,
				}),
		});
		return childBlocksOf(block).flatMap((child) =>
			toNodes(buildNode(child, context)),
		);
	}
	return undefined;
}

function canProjectBlock(
	block: AsciidoctorBlock,
	context: ProjectContext,
	officialLine: number | undefined,
	fallbackLine: number | undefined,
): boolean {
	if (!context.projectableBlocks) {
		return true;
	}
	if (context.projectableBlocks.has(block)) {
		return true;
	}
	return (
		officialLine === undefined &&
		fallbackLine !== undefined &&
		(context.containerFallbackBlocks?.has(block) ?? false)
	);
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
	section.children = childBlocksOf(block).flatMap((child) =>
		toNodes(buildNode(child, context)),
	);
	return section;
}

function buildOpenChildren(
	block: AsciidoctorBlock,
	line: number,
	context: ProjectContext,
): AbundantNode[] {
	const nodes: AbundantNode[] = [];
	let cursor = line;

	for (const child of childBlocksOf(block)) {
		const childLine =
			child.getSourceLocation?.()?.getLineNumber?.() ??
			findBlockSourceLine(context, child, cursor);
		const built = toNodes(buildNode(child, context, childLine));
		nodes.push(...built);
		cursor = Math.max(cursor, ...built.map(nodeEndLine).filter(isNumber)) + 1;
	}

	return nodes;
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
		contentSpan: source ? originLineSpan(context, contentSpan) : undefined,
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
	const xrefs = span
		? collectXrefsInSpan(context, span, source).filter((xref) =>
				isOccurrenceInsideSourceSpan(xref, sourceSpan),
			)
		: [];
	const anchors = span
		? collectAnchorsInSpan(context, span, source).filter((anchor) => {
				if (!isOccurrenceInsideSourceSpan(anchor, sourceSpan)) {
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
		? collectHeadingInlineMetadataInSpan(context, span, source).filter(
				(occurrence) => isOccurrenceInsideSourceSpan(occurrence, sourceSpan),
			)
		: [];
	applyOfficialBindings(
		xrefs,
		xrefs.map((xref) =>
			context.adapter.resolveXrefBinding(context.officialDocument, block, xref),
		),
	);
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
	const sourceSpan =
		line === undefined
			? undefined
			: descriptionTextSourceSpan(context.lineTable, line);
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
	const xrefs = span
		? collectXrefsInSpan(context, span, source).filter((xref) =>
				isOccurrenceInsideSourceSpan(xref, sourceSpan),
			)
		: [];
	const anchors = span
		? collectAnchorsInSpan(context, span, source).filter((anchor) => {
				if (!isOccurrenceInsideSourceSpan(anchor, sourceSpan)) {
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
		? collectHeadingInlineMetadataInSpan(context, span, source).filter(
				(occurrence) => isOccurrenceInsideSourceSpan(occurrence, sourceSpan),
			)
		: [];
	applyOfficialBindings(
		xrefs,
		xrefs.map((xref) =>
			context.adapter.resolveXrefBinding(context.officialDocument, block, xref),
		),
	);
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

function descriptionTextSourceSpan(
	lineTable: LineTable,
	line: number,
): SourceSpan | undefined {
	const delimiter = descriptionListDelimiterMatch(lineTable, line);
	if (!delimiter) {
		return undefined;
	}
	const text = lineText(lineTable, line);
	const afterDelimiterIndex = delimiter.index + delimiter.raw.length;
	const firstTextIndex =
		/\S/u.exec(text.slice(afterDelimiterIndex))?.index ?? 0;
	return {
		start: {
			line,
			column:
				[...text.slice(0, afterDelimiterIndex + firstTextIndex)].length + 1,
		},
		end: { line, column: [...text].length + 1 },
	};
}

function descriptionListDelimiterMatch(
	lineTable: LineTable,
	line: number,
): { raw: string; index: number; column: number } | undefined {
	const text = lineText(lineTable, line);
	const match = /:{2,4}|;;/u.exec(text);
	if (!match || match.index === undefined) {
		return undefined;
	}
	return {
		raw: match[0],
		index: match.index,
		column: [...text.slice(0, match.index)].length + 1,
	};
}

function descriptionPartSourceLayer(
	context: ProjectContext,
	span: { startLine: number; endLine: number },
	sourceSpan: SourceSpan,
	diagnosticContext: string,
): SourceLayer | undefined {
	if (!context.logicalSource && !context.sourceAwareDocument) {
		return { span, sourceSpan };
	}
	if (context.sourceAwareDocument) {
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
	if (!context.logicalSource) {
		return undefined;
	}
	const recovered = recoverOriginSourceLayer(context.logicalSource, span, {
		logicalSourceSpan: sourceSpan,
		diagnosticContext,
	});
	return recovered.ok ? recovered.sourceLayer : undefined;
}

function isOccurrenceInsideSourceSpan(
	occurrence: { sourceSpan?: SourceSpan },
	sourceSpan: SourceSpan | undefined,
): boolean {
	if (!sourceSpan || !occurrence.sourceSpan) {
		return true;
	}
	const start = occurrence.sourceSpan.start;
	const end = occurrence.sourceSpan.end;
	if (
		start.line !== sourceSpan.start.line ||
		end.line !== sourceSpan.end.line
	) {
		return false;
	}
	return (
		start.column >= sourceSpan.start.column &&
		end.column <= sourceSpan.end.column
	);
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

function findBlockSourceLine(
	context: ProjectContext,
	block: AsciidoctorBlock,
	startLine: number,
): number | undefined {
	const firstSourceLine = block
		.getSource?.()
		?.split(/\r?\n/u)
		.find((line) => line.trim() !== "")
		?.trim();
	if (!firstSourceLine) {
		return undefined;
	}
	for (
		let line = startLine;
		line <= context.lineTable.lines.length;
		line += 1
	) {
		if (lineText(context.lineTable, line).trim() === firstSourceLine) {
			return line;
		}
	}
	return undefined;
}

function nodeEndLine(node: AbundantNode): number | undefined {
	return node.source?.span?.endLine ?? node.source?.line;
}

function isNumber(value: unknown): value is number {
	return typeof value === "number";
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
	const xrefs = collectXrefsInSpan(context, contentSpan, source);
	const anchors = collectAnchorsInSpan(context, contentSpan, source).filter(
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
		source,
	);
	applyOfficialBindings(
		xrefs,
		xrefs.map((xref) =>
			context.adapter.resolveXrefBinding(context.officialDocument, block, xref),
		),
	);
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
		title: block.getTitle?.(),
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
		contentSpan: source ? originLineSpan(context, contentSpan) : undefined,
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
	const tableXrefs = collectXrefsInSpan(context, tableContentSpan, source);
	const tableAnchors = collectAnchorsInSpan(
		context,
		tableContentSpan,
		source,
	).filter((anchor) => {
		const key = anchorKey(anchor);
		if (context.usedAnchorKeys.has(key)) {
			return false;
		}
		context.usedAnchorKeys.add(key);
		return true;
	});
	const tableHeadingInlineMetadata = collectHeadingInlineMetadataInSpan(
		context,
		tableContentSpan,
		source,
	);
	applyOfficialBindings(
		tableXrefs,
		tableXrefs.map((xref) =>
			context.adapter.resolveXrefBinding(context.officialDocument, block, xref),
		),
	);
	const table = definedObject({
		kind: "table",
		ids,
		title:
			metadata.find((surface) => surface.title)?.title ?? block.getTitle?.(),
		metadata: metadata.map((surface) => surface.node),
		rows: rowsFromTable(block.getRows?.()),
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
			source: options.source,
			asciidoctor,
		}) as TargetNode,
	);
}

function blockSourceLayer(
	context: ProjectContext,
	interval: SourceInterval | undefined,
	fallbackSpan: { startLine: number; endLine: number },
	diagnosticContext: string,
): SourceLayer | undefined {
	if (!context.logicalSource && !context.sourceAwareDocument) {
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
	if (context.sourceAwareDocument) {
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
	if (!context.logicalSource) {
		return undefined;
	}
	const recovered = recoverOriginSourceLayer(
		context.logicalSource,
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
): { startLine: number; endLine: number } | undefined {
	if (!span || (!context.logicalSource && !context.sourceAwareDocument)) {
		return span;
	}
	if (context.sourceAwareDocument) {
		const recovered = recoverSourceAwareSourceLayer(
			context.sourceAwareDocument,
			span,
			{
				raw: false,
				diagnosticContext: "block content",
			},
		);
		return recovered.ok ? recovered.lineSpan : undefined;
	}
	if (!context.logicalSource) {
		return undefined;
	}
	const recovered = recoverOriginSourceLayer(context.logicalSource, span, {
		raw: false,
		diagnosticContext: "block content",
	});
	return recovered.ok ? recovered.lineSpan : undefined;
}

function collectXrefsInSpan(
	context: ProjectContext,
	logicalSpan: { startLine: number; endLine: number },
	source: SourceLayer | undefined,
): XrefOccurrenceNode[] {
	return collectOccurrencesInSpan(
		context,
		context.xrefsByLine,
		context.xrefOccurrences,
		logicalSpan,
		source,
	);
}

function collectAnchorsInSpan(
	context: ProjectContext,
	logicalSpan: { startLine: number; endLine: number },
	source: SourceLayer | undefined,
): AnchorOccurrenceNode[] {
	return collectOccurrencesInSpan(
		context,
		context.anchorsByLine,
		context.anchorOccurrences,
		logicalSpan,
		source,
	);
}

function collectHeadingInlineMetadataInSpan(
	context: ProjectContext,
	logicalSpan: { startLine: number; endLine: number },
	source: SourceLayer | undefined,
): HeadingInlineMetadataOccurrenceNode[] {
	return collectOccurrencesInSpan(
		context,
		context.headingInlineMetadataByLine,
		context.headingInlineMetadataOccurrences,
		logicalSpan,
		source,
	);
}

function collectOccurrencesInSpan<T extends { source?: SourceLayer }>(
	context: ProjectContext,
	groupedByLine: Map<number, T[]>,
	occurrences: T[],
	logicalSpan: { startLine: number; endLine: number },
	source: SourceLayer | undefined,
): T[] {
	if (!context.logicalSource && !context.sourceAwareDocument) {
		return collectOccurrencesInLineRange(
			groupedByLine,
			logicalSpan.startLine,
			logicalSpan.endLine,
		);
	}
	if (!source?.relativePath || !source.span) {
		return [];
	}
	const relativePath = source.relativePath;
	const sourceSpan = source.span;
	return occurrences.filter((occurrence) => {
		const line = occurrence.source?.line;
		return (
			occurrence.source?.relativePath === relativePath &&
			line !== undefined &&
			line >= sourceSpan.startLine &&
			line <= sourceSpan.endLine
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
