import type {
	AnchorOccurrenceNode,
	SectionNode,
	SourceSpan,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";
import type { LineTable, SourceLine } from "./source-lines";
import { sourceSpanForRange } from "./source-lines";
import {
	isLineInListing,
	isLineInTableStructure,
	type SourceRanges,
} from "./source-ranges";

const shorthandXrefPattern = /<<([^>,]+)(?:,\s*([^>]+))?>>/gu;
const macroXrefPattern = /xref:([^\s[]+)\[([^\]]*)\]/gu;
const anchorPattern =
	/\[\[([^,\]]+)(?:,([^\]]+))?\]\]|anchor:([^\s[]+)\[([^\]]*)\]/gu;

export function scanXrefOccurrences(
	lineTable: LineTable,
	ranges: SourceRanges,
): XrefOccurrenceNode[] {
	const xrefs: XrefOccurrenceNode[] = [];
	for (const line of lineTable.lines) {
		if (shouldSkipInlineLine(line, ranges)) {
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

export function scanAnchorOccurrences(
	lineTable: LineTable,
	ranges: SourceRanges,
): AnchorOccurrenceNode[] {
	const anchors: AnchorOccurrenceNode[] = [];
	for (const line of lineTable.lines) {
		if (shouldSkipInlineLine(line, ranges)) {
			continue;
		}
		for (const match of line.text.matchAll(anchorPattern)) {
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
					anchorScope:
						line.text.trim() === raw && doubleBracketId ? "block" : "inline",
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

export function assignContainingSectionIds(
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

function shouldSkipInlineLine(line: SourceLine, ranges: SourceRanges): boolean {
	return (
		isLineInListing(line.number, ranges) ||
		isLineInTableStructure(line.number, ranges)
	);
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
