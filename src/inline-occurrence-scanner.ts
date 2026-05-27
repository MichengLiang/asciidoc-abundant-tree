import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import type {
	AnchorOccurrenceNode,
	SectionNode,
	SourceSpan,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";
import type { OfficialBlockSurface } from "./official-block-walker";
import type { SourceInterval } from "./source-interval-resolver";
import type { LineRange, LineTable, SourceLine } from "./source-lines";
import { lineText, sourceSpanForRange } from "./source-lines";

const shorthandXrefPattern = /<<([^>,]+)(?:,\s*([^>]+))?>>/gu;
const macroXrefPattern = /xref:([^\s[]+)\[([^\]]*)\]/gu;
const anchorPattern =
	/\[\[([^,\]]+)(?:,([^\]]+))?\]\]|anchor:([^\s[]+)\[([^\]]*)\]/gu;

export function scanInlineOccurrencesInOfficialBlocks(options: {
	lineTable: LineTable;
	blockSurfaces: OfficialBlockSurface[];
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>;
}): {
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
} {
	const xrefOccurrences: XrefOccurrenceNode[] = [];
	const anchorOccurrences: AnchorOccurrenceNode[] = [];

	for (const surface of options.blockSurfaces) {
		const interval = options.intervalByBlock.get(surface.block);
		if (!interval) {
			continue;
		}
		if (interval.metadataSpan) {
			scanAnchorRange(
				options.lineTable,
				interval.metadataSpan.startLine,
				interval.metadataSpan.endLine,
				anchorOccurrences,
			);
		}
		const span = interval.contentSpan ?? interval.span;
		if (!shouldScanInlineContext(surface.context)) {
			continue;
		}
		if (surface.context === "table") {
			scanTableInlineRange(
				options.lineTable,
				surface.block,
				span.startLine,
				span.endLine,
				xrefOccurrences,
				anchorOccurrences,
			);
		} else {
			scanInlineRange(
				options.lineTable,
				span.startLine,
				span.endLine,
				xrefOccurrences,
				anchorOccurrences,
			);
		}
	}

	return {
		xrefOccurrences: xrefOccurrences.sort(compareSourceSpans),
		anchorOccurrences: anchorOccurrences.sort(compareSourceSpans),
	};
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

function shouldScanInlineContext(context: string | undefined): boolean {
	return context === "paragraph" || context === "table";
}

function scanInlineRange(
	lineTable: LineTable,
	startLine: number,
	endLine: number,
	xrefOccurrences: XrefOccurrenceNode[],
	anchorOccurrences: AnchorOccurrenceNode[],
	skipRanges: LineRange[] = [],
): void {
	for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
		if (isLineInRanges(lineNumber, skipRanges)) {
			continue;
		}
		const line = lineTable.lines[lineNumber - 1];
		if (!line) {
			continue;
		}
		for (const match of line.text.matchAll(shorthandXrefPattern)) {
			if (match.index === undefined || !match[1]) {
				continue;
			}
			const label = match[2]?.trim();
			xrefOccurrences.push(
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
			xrefOccurrences.push(
				makeXref(lineTable, line, match.index, match[0], parts),
			);
		}
		scanAnchorMatches(lineTable, line, anchorOccurrences);
	}
}

function scanTableInlineRange(
	lineTable: LineTable,
	block: AsciidoctorBlock,
	startLine: number,
	endLine: number,
	xrefOccurrences: XrefOccurrenceNode[],
	anchorOccurrences: AnchorOccurrenceNode[],
): void {
	scanInlineRange(
		lineTable,
		startLine,
		endLine,
		xrefOccurrences,
		anchorOccurrences,
		collectTableInnerSkipRanges(block, lineTable),
	);
}

function collectTableInnerSkipRanges(
	block: AsciidoctorBlock,
	lineTable: LineTable,
): LineRange[] {
	const rows = block.getRows?.();
	if (!isRecord(rows)) {
		return [];
	}
	const ranges: LineRange[] = [];
	for (const groupName of ["head", "body", "foot"]) {
		const group = rows[groupName];
		if (!Array.isArray(group)) {
			continue;
		}
		for (const row of group) {
			if (!Array.isArray(row)) {
				continue;
			}
			for (const cell of row) {
				for (const innerBlock of innerBlocksFromCell(cell)) {
					collectNonScannableRanges(innerBlock, lineTable, ranges);
				}
			}
		}
	}
	return ranges;
}

type InnerBlock = {
	getBlocks?: () => InnerBlock[];
	getContext?: () => string | undefined;
	getSource?: () => string | undefined;
	getSourceLocation?: () => {
		getLineNumber?: () => number | undefined;
	};
};

function innerBlocksFromCell(cell: unknown): InnerBlock[] {
	if (!isRecord(cell) || typeof cell.getInnerDocument !== "function") {
		return [];
	}
	const innerDocument = cell.getInnerDocument();
	if (
		!isRecord(innerDocument) ||
		typeof innerDocument.getBlocks !== "function"
	) {
		return [];
	}
	const blocks = innerDocument.getBlocks();
	return Array.isArray(blocks) ? (blocks as InnerBlock[]) : [];
}

function collectNonScannableRanges(
	block: InnerBlock,
	lineTable: LineTable,
	ranges: LineRange[],
): void {
	const context = block.getContext?.();
	if (!shouldScanInlineContext(context) && context !== "open") {
		const range = sourceRangeForInnerBlock(block, lineTable);
		if (range) {
			ranges.push(range);
		}
	}
	for (const child of block.getBlocks?.() ?? []) {
		collectNonScannableRanges(child, lineTable, ranges);
	}
}

function sourceRangeForInnerBlock(
	block: InnerBlock,
	lineTable: LineTable,
): LineRange | undefined {
	const startLine = block.getSourceLocation?.()?.getLineNumber?.();
	if (startLine === undefined) {
		return undefined;
	}
	const delimited = delimitedRangeFromOfficialAnchor(lineTable, startLine);
	if (delimited) {
		return delimited;
	}
	const source = block.getSource?.();
	if (source === undefined) {
		return { startLine, endLine: startLine };
	}
	return {
		startLine,
		endLine: startLine + Math.max(1, source.split(/\r?\n/u).length) - 1,
	};
}

function delimitedRangeFromOfficialAnchor(
	lineTable: LineTable,
	startLine: number,
): LineRange | undefined {
	const opening = lineText(lineTable, startLine).trim();
	if (!["----", "```", "....", "++++", "--"].includes(opening)) {
		return undefined;
	}
	for (let line = startLine + 1; line <= lineTable.lines.length; line += 1) {
		if (lineText(lineTable, line).trim() === opening) {
			return { startLine, endLine: line };
		}
	}
	return { startLine, endLine: startLine };
}

function isLineInRanges(line: number, ranges: LineRange[]): boolean {
	return ranges.some(
		(range) => line >= range.startLine && line <= range.endLine,
	);
}

function scanAnchorRange(
	lineTable: LineTable,
	startLine: number,
	endLine: number,
	anchorOccurrences: AnchorOccurrenceNode[],
): void {
	for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
		const line = lineTable.lines[lineNumber - 1];
		if (!line) {
			continue;
		}
		scanAnchorMatches(lineTable, line, anchorOccurrences);
	}
}

function scanAnchorMatches(
	lineTable: LineTable,
	line: SourceLine,
	anchorOccurrences: AnchorOccurrenceNode[],
): void {
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
		anchorOccurrences.push(
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}
