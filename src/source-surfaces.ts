import type {
	AnchorOccurrenceNode,
	MetadataNode,
	SectionNode,
	SourceSpan,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";
import {
	findClosingDelimiter,
	isLineInRanges,
	type LineRange,
	type LineTable,
	lineText,
	type SourceLine,
	sourceSpanForRange,
	spanForLineText,
} from "./source-lines";

type MetadataSurface = {
	node: MetadataNode;
	line: number;
	ids: string[];
	title?: string;
	style?: string;
	language?: string;
};

type SectionSurface = {
	line: number;
	level: number;
	title: string;
	titleSpan: SourceSpan;
	metadata: MetadataSurface[];
};

type SourceSurfaces = {
	opaqueRanges: LineRange[];
	sections: SectionNode[];
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	sectionByLine: Map<number, SectionNode>;
};

const headingPattern = /^(=+)\s+(.+)$/;
const idAttrPattern = /^\[#([^\]]+)\]$/;
const idLongAttrPattern = /^\[id=([^\]]+)\]$/;
const blockAnchorPattern = /^\[\[([^,\]]+)(?:,([^\]]+))?\]\]$/;
const titlePattern = /^\.(.+)$/;
const attrListPattern = /^\[([^\]]+)\]$/;
const shorthandXrefPattern = /<<([^>,]+)(?:,\s*([^>]+))?>>/gu;
const macroXrefPattern = /xref:([^\s[]+)\[([^\]]*)\]/gu;
const inlineAnchorPattern =
	/\[\[([^,\]]+)(?:,([^\]]+))?\]\]|anchor:([^\s[]+)\[([^\]]*)\]/gu;

export function scanSourceSurfaces(lineTable: LineTable): SourceSurfaces {
	const opaqueRanges = scanOpaqueRanges(lineTable);
	const sections = scanSections(lineTable, opaqueRanges);
	const xrefOccurrences = scanXrefOccurrences(lineTable, opaqueRanges);
	const anchorOccurrences = scanAnchorOccurrences(lineTable, opaqueRanges);
	const sectionByLine = mapSectionScope(sections, lineTable.lines.length);
	assignOccurrenceScopes(xrefOccurrences, anchorOccurrences, sectionByLine);

	return {
		opaqueRanges,
		sections,
		xrefOccurrences,
		anchorOccurrences,
		sectionByLine,
	};
}

export function collectPrecedingMetadata(
	lineTable: LineTable,
	ownerLine: number,
): MetadataSurface[] {
	const surfaces: MetadataSurface[] = [];
	let cursor = ownerLine - 1;

	while (cursor > 0) {
		const text = lineText(lineTable, cursor);
		const surface = parseMetadataLine(lineTable, cursor, text);
		if (!surface) {
			break;
		}
		surfaces.unshift(surface);
		cursor -= 1;
	}

	return surfaces;
}

function parseMetadataLine(
	lineTable: LineTable,
	line: number,
	raw: string,
): MetadataSurface | undefined {
	const sourceSpan = spanForLineText(lineTable, line, 1);
	const idAttr = idAttrPattern.exec(raw) ?? idLongAttrPattern.exec(raw);
	if (idAttr?.[1]) {
		const id = idAttr[1];
		return {
			node: {
				kind: "metadata",
				metadataKind: "id",
				raw,
				line,
				ids: [id],
				source: { raw, line, sourceSpan },
			},
			line,
			ids: [id],
		};
	}

	const blockAnchor = blockAnchorPattern.exec(raw);
	if (blockAnchor?.[1]) {
		const id = blockAnchor[1];
		return {
			node: {
				kind: "metadata",
				metadataKind: "anchor",
				raw,
				line,
				ids: [id],
				source: { raw, line, sourceSpan },
			},
			line,
			ids: [id],
		};
	}

	const title = titlePattern.exec(raw);
	if (title?.[1]) {
		return {
			node: {
				kind: "metadata",
				metadataKind: "title",
				raw,
				line,
				source: { raw, line, sourceSpan },
			},
			line,
			ids: [],
			title: title[1],
		};
	}

	const attrList = attrListPattern.exec(raw);
	if (attrList?.[1]) {
		const parsed = parseAttrList(attrList[1]);
		return definedObject({
			node: {
				kind: "metadata",
				metadataKind: "attrlist",
				raw,
				line,
				ids: parsed.ids,
				roles: parsed.roles,
				attributes: parsed.attributes,
				source: { raw, line, sourceSpan },
			},
			line,
			ids: parsed.ids,
			style: parsed.style,
			language: parsed.language,
		}) as MetadataSurface;
	}

	return undefined;
}

export function generatedSectionId(title: string): string {
	return `_${title.replace(/[^\p{L}\p{N}_]+/gu, "_").replace(/^_+|_+$/gu, "")}`;
}

function scanOpaqueRanges(lineTable: LineTable): LineRange[] {
	const ranges: LineRange[] = [];
	for (const line of lineTable.lines) {
		const trimmed = line.text.trim();
		if (trimmed === "----") {
			ranges.push({
				startLine: line.number,
				endLine: findClosingDelimiter(lineTable, line.number, "----"),
			});
		}
		if (trimmed === "|===") {
			ranges.push({
				startLine: line.number,
				endLine: findClosingDelimiter(lineTable, line.number, "|==="),
			});
		}
	}
	return ranges.filter((range, index) =>
		ranges.every(
			(other, otherIndex) =>
				index === otherIndex ||
				range.startLine < other.startLine ||
				range.startLine > other.endLine,
		),
	);
}

function scanSections(
	lineTable: LineTable,
	opaqueRanges: LineRange[],
): SectionNode[] {
	const surfaces: SectionSurface[] = [];

	for (const line of lineTable.lines) {
		if (line.number === 1 || isLineInRanges(line.number, opaqueRanges)) {
			continue;
		}
		const match = headingPattern.exec(line.text);
		if (!match) {
			continue;
		}

		const marker = match[1] ?? "";
		const title = match[2] ?? "";
		surfaces.push({
			line: line.number,
			level: marker.length - 1,
			title,
			titleSpan: spanForLineText(lineTable, line.number, marker.length + 2),
			metadata: collectPrecedingMetadata(lineTable, line.number),
		});
	}

	return surfaces.map((surface, index) => {
		const metadataStart = surface.metadata.at(0)?.line;
		const nextBoundary = surfaces
			.slice(index + 1)
			.find((candidate) => candidate.level <= surface.level);
		const ids = surface.metadata.flatMap((metadata) => metadata.ids);
		const generatedId = generatedSectionId(surface.title);
		const idOrigin = ids.length > 0 ? "source" : "asciidoctor-generated";
		return {
			kind: "section",
			level: surface.level,
			ids: ids.length > 0 ? ids : [generatedId],
			title: surface.title,
			line: surface.line,
			span: {
				startLine: metadataStart ?? surface.line,
				endLine:
					(nextBoundary?.metadata.at(0)?.line ??
						nextBoundary?.line ??
						lineTable.lines.length + 1) - 1,
			},
			titleSpan: surface.titleSpan,
			idOrigin,
			metadata: surface.metadata.map((metadata) => metadata.node),
			asciidoctor: {
				context: "section",
				nodeName: "section",
				resolvedId: ids[0] ?? generatedId,
				resolvedType: "section",
				reftext: surface.title,
			},
			children: [],
		};
	});
}

function scanXrefOccurrences(
	lineTable: LineTable,
	opaqueRanges: LineRange[],
): XrefOccurrenceNode[] {
	const xrefs: XrefOccurrenceNode[] = [];
	for (const line of lineTable.lines) {
		if (isLineInRanges(line.number, opaqueRanges)) {
			continue;
		}
		for (const match of line.text.matchAll(shorthandXrefPattern)) {
			if (match.index === undefined || !match[1]) {
				continue;
			}
			const label = match[2]?.trim();
			xrefs.push(
				makeXref(
					lineTable,
					line,
					match.index,
					match[0],
					label
						? {
								syntax: "shorthand",
								target: match[1].trim(),
								label,
							}
						: {
								syntax: "shorthand",
								target: match[1].trim(),
							},
				),
			);
		}
		for (const match of line.text.matchAll(macroXrefPattern)) {
			if (match.index === undefined || !match[1]) {
				continue;
			}
			const parsed = parseMacroLabel(match[2] ?? "");
			const parts = definedObject({
				syntax: "macro",
				target: match[1].trim(),
				label: parsed.label,
				attributes: parsed.attributes,
			}) as {
				syntax: "macro";
				target: string;
				label?: string;
				attributes?: Record<string, string | number | boolean>;
			};
			xrefs.push(makeXref(lineTable, line, match.index, match[0], parts));
		}
	}
	return xrefs.sort(compareSourceSpans);
}

function makeXref(
	lineTable: LineTable,
	line: SourceLine,
	index: number,
	raw: string,
	parts: {
		syntax: XrefOccurrenceNode["syntax"];
		target: string;
		label?: string;
		attributes?: Record<string, string | number | boolean>;
	},
): XrefOccurrenceNode {
	const sourceSpan = sourceSpanForRange(lineTable, line.number, index, raw);
	return definedObject({
		kind: "xref",
		...parts,
		raw,
		sourceSpan,
		targetKind: parts.target.includes(".adoc#")
			? "document-target"
			: parts.target.includes(".")
				? "natural-title-candidate"
				: "id-or-anchor",
		scope: parts.target.includes(".adoc#") ? "external" : undefined,
		source: {
			raw,
			line: line.number,
			sourceSpan,
		},
	}) as XrefOccurrenceNode;
}

function scanAnchorOccurrences(
	lineTable: LineTable,
	opaqueRanges: LineRange[],
): AnchorOccurrenceNode[] {
	const anchors: AnchorOccurrenceNode[] = [];
	for (const line of lineTable.lines) {
		if (
			isLineInRanges(line.number, opaqueRanges) ||
			parseMetadataLine(lineTable, line.number, line.text)?.node
				.metadataKind === "anchor"
		) {
			continue;
		}
		for (const match of line.text.matchAll(inlineAnchorPattern)) {
			if (match.index === undefined) {
				continue;
			}
			const doubleBracketId = match[1];
			const macroId = match[3];
			const id = doubleBracketId ?? macroId;
			if (!id) {
				continue;
			}
			const raw = match[0];
			const sourceSpan = sourceSpanForRange(
				lineTable,
				line.number,
				match.index,
				raw,
			);
			anchors.push(
				definedObject({
					kind: "anchor",
					syntax: doubleBracketId ? "double-bracket" : "macro",
					raw,
					ids: [id],
					reftext: match[2] ?? match[4] ?? undefined,
					sourceSpan,
					source: {
						raw,
						line: line.number,
						sourceSpan,
					},
				}) as AnchorOccurrenceNode,
			);
		}
	}
	return anchors;
}

function assignOccurrenceScopes(
	xrefs: XrefOccurrenceNode[],
	anchors: AnchorOccurrenceNode[],
	sectionByLine: Map<number, SectionNode>,
): void {
	for (const occurrence of [...xrefs, ...anchors]) {
		const line = occurrence.sourceSpan?.start.line;
		const sectionId =
			line === undefined ? undefined : sectionByLine.get(line)?.ids[0];
		if (sectionId !== undefined) {
			occurrence.containingSectionId = sectionId;
		}
	}
}

function mapSectionScope(
	sections: SectionNode[],
	totalLines: number,
): Map<number, SectionNode> {
	const result = new Map<number, SectionNode>();
	for (const section of sections) {
		const start = section.line ?? section.span?.startLine ?? 1;
		const end = section.span?.endLine ?? totalLines;
		for (let line = start; line <= end; line += 1) {
			result.set(line, section);
		}
	}
	return result;
}

function parseAttrList(raw: string): {
	ids: string[];
	roles: string[];
	attributes: Record<string, string | number | boolean>;
	style?: string;
	language?: string;
} {
	const parts = raw
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	const ids: string[] = [];
	const roles: string[] = [];
	const attributes: Record<string, string | number | boolean> = {};

	for (const [index, part] of parts.entries()) {
		const idMatch = /#([\p{L}\p{N}_-]+)/u.exec(part);
		if (idMatch?.[1]) {
			ids.push(idMatch[1]);
		}
		for (const role of part.matchAll(/\.([\p{L}\p{N}_-]+)/gu)) {
			if (role[1]) {
				roles.push(role[1]);
			}
		}
		if (part.includes("=")) {
			const [key, ...value] = part.split("=");
			if (key) {
				attributes[key.trim()] = value.join("=").trim();
			}
			continue;
		}
		if (index === 0) {
			attributes.style = part;
		}
		if (index === 1) {
			attributes.language = part;
		}
	}

	return definedObject({
		ids,
		roles,
		attributes,
		style: typeof attributes.style === "string" ? attributes.style : undefined,
		language:
			typeof attributes.language === "string" ? attributes.language : undefined,
	}) as {
		ids: string[];
		roles: string[];
		attributes: Record<string, string | number | boolean>;
		style?: string;
		language?: string;
	};
}

function parseMacroLabel(raw: string): {
	label?: string;
	attributes?: Record<string, string | number | boolean>;
} {
	const parts = raw.split(",").map((part) => part.trim());
	const label = parts.shift();
	const attributes: Record<string, string | number | boolean> = {};
	for (const part of parts) {
		const [key, ...value] = part.split("=");
		if (key) {
			attributes[key.trim()] = value.join("=").trim() || true;
		}
	}
	return definedObject({
		label: label || undefined,
		attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
	}) as {
		label?: string;
		attributes?: Record<string, string | number | boolean>;
	};
}

function compareSourceSpans(
	left: { sourceSpan?: SourceSpan },
	right: { sourceSpan?: SourceSpan },
): number {
	return (
		(left.sourceSpan?.start.line ?? 0) - (right.sourceSpan?.start.line ?? 0) ||
		(left.sourceSpan?.start.column ?? 0) - (right.sourceSpan?.start.column ?? 0)
	);
}
