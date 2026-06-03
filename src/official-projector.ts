import type {
	AsciidoctorAdapter,
	AsciidoctorBlock,
} from "./asciidoctor-adapter";
import { addTarget, applyOfficialBindings } from "./binding-merge";
import type {
	AbundantNode,
	AnchorOccurrenceNode,
	AsciidoctorLayer,
	ListingNode,
	ParagraphNode,
	SectionNode,
	TableNode,
	TargetNode,
	TargetType,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";
import { officialBlockPolicy } from "./official-block-policy";
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
	xrefsByLine: Map<number, XrefOccurrenceNode[]>;
	anchorsByLine: Map<number, AnchorOccurrenceNode[]>;
	usedAnchorKeys: Set<string>;
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>;
	projectableBlocks?: WeakSet<AsciidoctorBlock> | undefined;
	containerFallbackBlocks?: WeakSet<AsciidoctorBlock> | undefined;
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
	adapter: OfficialProjectionAdapter;
	targets: TargetNode[];
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
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>;
	projectableBlocks?: WeakSet<AsciidoctorBlock> | undefined;
	containerFallbackBlocks?: WeakSet<AsciidoctorBlock> | undefined;
	sectionByBlock: WeakMap<AsciidoctorBlock, SectionNode>;
	adapter: OfficialProjectionAdapter;
}): { children: AbundantNode[]; targets: TargetNode[] } {
	const targets: TargetNode[] = [];
	const context: ProjectContext = {
		officialDocument: options.officialDocument,
		lineTable: options.lineTable,
		sections: options.sections,
		sectionByLine: options.sectionByLine,
		xrefsByLine: groupByLine(options.xrefOccurrences),
		anchorsByLine: groupByLine(options.anchorOccurrences),
		usedAnchorKeys: new Set(),
		intervalByBlock: options.intervalByBlock,
		projectableBlocks: options.projectableBlocks,
		containerFallbackBlocks: options.containerFallbackBlocks,
		sectionByBlock: options.sectionByBlock,
		adapter: options.adapter,
		targets,
	};

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

	for (const block of officialDocument.getBlocks?.() ?? []) {
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
		return (block.getBlocks?.() ?? []).flatMap((child) =>
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
		asciidoctor: section.asciidoctor,
	});
	section.children = (block.getBlocks?.() ?? []).flatMap((child) =>
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

	for (const child of block.getBlocks?.() ?? []) {
		const childLine =
			child.getSourceLocation?.()?.getLineNumber?.() ??
			findBlockSourceLine(context, child, cursor);
		const built = toNodes(buildNode(child, context, childLine));
		nodes.push(...built);
		cursor = Math.max(cursor, ...built.map(nodeEndLine).filter(isNumber)) + 1;
	}

	return nodes;
}

function toNodes(result: BuildResult): AbundantNode[] {
	if (result === undefined) {
		return [];
	}
	return Array.isArray(result) ? result : [result];
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
	const xrefs = collectOccurrencesInLineRange(
		context.xrefsByLine,
		contentSpan.startLine,
		contentSpan.endLine,
	);
	const anchors = collectOccurrencesInLineRange(
		context.anchorsByLine,
		contentSpan.startLine,
		contentSpan.endLine,
	).filter((anchor) => {
		const key = anchorKey(anchor);
		if (context.usedAnchorKeys.has(key)) {
			return false;
		}
		context.usedAnchorKeys.add(key);
		return true;
	});
	applyOfficialBindings(
		xrefs,
		xrefs.map((xref) =>
			context.adapter.resolveXrefBinding(context.officialDocument, block, xref),
		),
	);
	const sourceSpan =
		interval?.sourceSpan ??
		sourceSpanFromLineSpan(context.lineTable, blockSpan);
	const source = sourceSpan
		? {
				span: blockSpan,
				sourceSpan,
			}
		: { span: blockSpan };
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
		children: [...xrefs, ...anchors].sort(compareNodesBySource),
	} as ParagraphNode;

	registerOfficialBlockTarget(context, block, {
		targetType: "block",
		title: block.getTitle?.(),
		sourceSpan,
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
	const ids = metadata.flatMap((surface) => surface.ids);
	const listing = definedObject({
		kind: "listing",
		ids,
		title:
			metadata.find((surface) => surface.title)?.title ?? block.getTitle?.(),
		style:
			metadata.find((surface) => surface.style)?.style ?? block.getStyle?.(),
		language:
			metadata.find((surface) => surface.language)?.language ??
			stringAttr(block, "language"),
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
		contentSpan,
		span,
		source: {
			span,
			sourceSpan:
				interval?.sourceSpan ?? sourceSpanFromLineSpan(context.lineTable, span),
		},
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
		asciidoctor: listing.asciidoctor,
	});
	return listing;
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
	const ids = metadata.flatMap((surface) => surface.ids);
	const tableXrefs = collectOccurrencesInLineRange(
		context.xrefsByLine,
		interval?.contentSpan?.startLine ?? span.startLine,
		interval?.contentSpan?.endLine ?? span.endLine,
	);
	const tableAnchors = collectOccurrencesInLineRange(
		context.anchorsByLine,
		interval?.contentSpan?.startLine ?? span.startLine,
		interval?.contentSpan?.endLine ?? span.endLine,
	).filter((anchor) => {
		const key = anchorKey(anchor);
		if (context.usedAnchorKeys.has(key)) {
			return false;
		}
		context.usedAnchorKeys.add(key);
		return true;
	});
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
		span,
		source: {
			span,
			sourceSpan:
				interval?.sourceSpan ?? sourceSpanFromLineSpan(context.lineTable, span),
		},
		asciidoctor: definedObject({
			context: block.getContext?.(),
			nodeName: block.getNodeName?.(),
			resolvedId: block.getId?.(),
			resolvedType: "table",
			reftext: block.getTitle?.(),
		}) as AsciidoctorLayer,
		children: [...tableXrefs, ...tableAnchors].sort(compareNodesBySource),
	}) as TableNode;

	const officialId = block.getId?.();
	if (table.ids.length === 0 && officialId) {
		table.ids = [officialId];
	}
	registerOfficialBlockTarget(context, block, {
		targetType: "table",
		title: table.title,
		sourceSpan: table.source?.sourceSpan,
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
			asciidoctor,
		}) as TargetNode,
	);
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
