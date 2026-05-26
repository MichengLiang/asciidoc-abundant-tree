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
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";
import {
	collectOccurrencesInLineRange,
	compareNodesBySource,
	findClosingDelimiter,
	groupByLine,
	type LineTable,
	nextBlankLine,
	sourceLines,
	sourceSpanFromLineSpan,
} from "./source-lines";
import { collectPrecedingMetadata } from "./source-surfaces";

type ProjectContext = {
	lineTable: LineTable;
	sections: SectionNode[];
	sectionByLine: Map<number, SectionNode>;
	xrefsByLine: Map<number, XrefOccurrenceNode[]>;
	anchorsByLine: Map<number, AnchorOccurrenceNode[]>;
	usedAnchorKeys: Set<string>;
	adapter: AsciidoctorAdapter;
	targets: TargetNode[];
};

export function projectOfficialDocument(options: {
	officialDocument: AsciidoctorBlock;
	lineTable: LineTable;
	sections: SectionNode[];
	sectionByLine: Map<number, SectionNode>;
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	adapter: AsciidoctorAdapter;
}): { children: AbundantNode[]; targets: TargetNode[] } {
	const targets: TargetNode[] = [];
	const context: ProjectContext = {
		lineTable: options.lineTable,
		sections: options.sections,
		sectionByLine: options.sectionByLine,
		xrefsByLine: groupByLine(options.xrefOccurrences),
		anchorsByLine: groupByLine(options.anchorOccurrences),
		usedAnchorKeys: new Set(),
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
		const node = buildNode(block, context);
		if (node) {
			topLevel.push(node);
		}
	}

	return topLevel;
}

function buildNode(
	block: AsciidoctorBlock,
	context: ProjectContext,
): AbundantNode | undefined {
	const blockContext = block.getContext?.();
	const line = block.getSourceLocation?.()?.getLineNumber?.();

	if (blockContext === "section" && line !== undefined) {
		return buildSection(block, line, context);
	}
	if (blockContext === "paragraph" && line !== undefined) {
		return buildParagraph(block, line, context);
	}
	if (blockContext === "listing" && line !== undefined) {
		return buildListing(block, line, context);
	}
	if (blockContext === "table" && line !== undefined) {
		return buildTable(block, line, context);
	}
	return undefined;
}

function buildSection(
	block: AsciidoctorBlock,
	line: number,
	context: ProjectContext,
): SectionNode | undefined {
	const section = context.sections.find((candidate) => candidate.line === line);
	if (!section) {
		return undefined;
	}

	section.asciidoctor = definedObject({
		...section.asciidoctor,
		context: block.getContext?.(),
		nodeName: block.getNodeName?.(),
		resolvedId: block.getId?.(),
		resolvedType: "section",
		reftext: block.getTitle?.(),
	}) as AsciidoctorLayer;
	addTarget(
		context.targets,
		definedObject({
			kind: "target",
			id: section.ids[0] ?? block.getId?.() ?? "",
			targetType: "section",
			title: section.title,
			idOrigin: section.idOrigin,
			sourceSpan: sourceSpanFromLineSpan(context.lineTable, section.span),
			asciidoctor: section.asciidoctor,
		}) as TargetNode,
	);
	section.children = (block.getBlocks?.() ?? [])
		.map((child) => buildNode(child, context))
		.filter((node): node is AbundantNode => node !== undefined);
	return section;
}

function buildParagraph(
	block: AsciidoctorBlock,
	line: number,
	context: ProjectContext,
): ParagraphNode {
	const blockEnd = nextBlankLine(context.lineTable, line) - 1;
	const xrefs = collectOccurrencesInLineRange(
		context.xrefsByLine,
		line,
		blockEnd,
	);
	const anchors = collectOccurrencesInLineRange(
		context.anchorsByLine,
		line,
		blockEnd,
	).filter((anchor) => {
		const key = anchorKey(anchor);
		if (context.usedAnchorKeys.has(key)) {
			return false;
		}
		context.usedAnchorKeys.add(key);
		return true;
	});
	const bindings = context.adapter.extractAnchorBindings(
		block.getContent?.() ?? "",
	);
	applyOfficialBindings(xrefs, bindings);
	const sourceSpan = sourceSpanFromLineSpan(context.lineTable, {
		startLine: line,
		endLine: blockEnd,
	});
	const source = sourceSpan
		? {
				span: { startLine: line, endLine: blockEnd },
				sourceSpan,
			}
		: { span: { startLine: line, endLine: blockEnd } };

	return {
		kind: "paragraph",
		text: sourceLines(context.lineTable, line, blockEnd).join("\n"),
		source,
		asciidoctor: definedObject({
			context: block.getContext?.(),
			nodeName: block.getNodeName?.(),
		}) as AsciidoctorLayer,
		children: [...xrefs, ...anchors].sort(compareNodesBySource),
	};
}

function buildListing(
	block: AsciidoctorBlock,
	delimiterLine: number,
	context: ProjectContext,
): ListingNode {
	const metadata = collectPrecedingMetadata(context.lineTable, delimiterLine);
	const startLine = metadata.at(0)?.line ?? delimiterLine;
	const endLine = findClosingDelimiter(
		context.lineTable,
		delimiterLine,
		"----",
	);
	const contentSpan = { startLine: delimiterLine + 1, endLine: endLine - 1 };
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
			sourceLines(
				context.lineTable,
				contentSpan.startLine,
				contentSpan.endLine,
			).join("\n"),
		metadataSpan:
			metadata.length > 0
				? { startLine, endLine: delimiterLine - 1 }
				: undefined,
		contentSpan,
		span: { startLine, endLine },
		source: {
			span: { startLine, endLine },
			sourceSpan: sourceSpanFromLineSpan(context.lineTable, {
				startLine,
				endLine,
			}),
		},
		asciidoctor: definedObject({
			context: block.getContext?.(),
			nodeName: block.getNodeName?.(),
			resolvedId: block.getId?.(),
			resolvedType: "listing",
			reftext: block.getTitle?.(),
		}) as AsciidoctorLayer,
	}) as ListingNode;

	if (listing.ids.length > 0) {
		addTarget(
			context.targets,
			definedObject({
				kind: "target",
				id: listing.ids[0] ?? "",
				targetType: "listing",
				title: listing.title,
				idOrigin: "source",
				sourceSpan: listing.source?.sourceSpan,
				asciidoctor: listing.asciidoctor,
			}) as TargetNode,
		);
	}
	return listing;
}

function buildTable(
	block: AsciidoctorBlock,
	delimiterLine: number,
	context: ProjectContext,
): TableNode {
	const metadata = collectPrecedingMetadata(context.lineTable, delimiterLine);
	const startLine = metadata.at(0)?.line ?? delimiterLine;
	const endLine = findClosingDelimiter(
		context.lineTable,
		delimiterLine,
		"|===",
	);
	const ids = metadata.flatMap((surface) => surface.ids);
	const table = definedObject({
		kind: "table",
		ids,
		title:
			metadata.find((surface) => surface.title)?.title ?? block.getTitle?.(),
		metadata: metadata.map((surface) => surface.node),
		rows: rowsFromTable(block.getRows?.()),
		span: { startLine, endLine },
		source: {
			span: { startLine, endLine },
			sourceSpan: sourceSpanFromLineSpan(context.lineTable, {
				startLine,
				endLine,
			}),
		},
		asciidoctor: definedObject({
			context: block.getContext?.(),
			nodeName: block.getNodeName?.(),
			resolvedId: block.getId?.(),
			resolvedType: "table",
			reftext: block.getTitle?.(),
		}) as AsciidoctorLayer,
	}) as TableNode;

	if (table.ids.length > 0) {
		addTarget(
			context.targets,
			definedObject({
				kind: "target",
				id: table.ids[0] ?? "",
				targetType: "table",
				title: table.title,
				idOrigin: "source",
				sourceSpan: table.source?.sourceSpan,
				asciidoctor: table.asciidoctor,
			}) as TargetNode,
		);
	}
	return table;
}

function rowsFromTable(rows: unknown): unknown[] {
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
