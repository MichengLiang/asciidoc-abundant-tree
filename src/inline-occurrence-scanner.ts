import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import { parseMacroArguments } from "./macro-argument-parser";
import type {
	AnchorOccurrenceNode,
	LineSpan,
	SectionNode,
	SourceSpan,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";
import { officialBlockPolicy } from "./official-block-policy";
import type { OfficialBlockSurface } from "./official-block-walker";
import type { SourceInterval } from "./source-interval-resolver";
import type { LineRange, LineTable, SourceLine } from "./source-lines";
import { sourceSpanForRange } from "./source-lines";

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
		if (hasDiagnosticPolicyAncestor(surface)) {
			continue;
		}
		if (interval.metadataSpan) {
			scanMetadataRange(
				options.lineTable,
				interval.metadataSpan.startLine,
				interval.metadataSpan.endLine,
				xrefOccurrences,
				anchorOccurrences,
			);
		}
		const span = interval.contentSpan ?? interval.span;
		const policy = officialBlockPolicy(surface.context);
		if (policy !== "scan") {
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
				descendantUnscannableRanges(surface, options.intervalByBlock),
			);
		}
	}

	return {
		xrefOccurrences:
			dedupeOccurrences(xrefOccurrences).sort(compareSourceSpans),
		anchorOccurrences:
			dedupeOccurrences(anchorOccurrences).sort(compareSourceSpans),
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
	const parsed = parseMacroArguments(raw);
	const label = parsed.positional[0];
	return definedObject({
		label: label || undefined,
		attributes: Object.keys(parsed.named).length > 0 ? parsed.named : undefined,
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
		scanXrefMatches(lineTable, line, xrefOccurrences);
		scanAnchorMatches(lineTable, line, anchorOccurrences);
	}
}

function scanXrefMatches(
	lineTable: LineTable,
	line: SourceLine,
	xrefOccurrences: XrefOccurrenceNode[],
): void {
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
}

function scanTableInlineRange(
	lineTable: LineTable,
	block: AsciidoctorBlock,
	_startLine: number,
	_endLine: number,
	xrefOccurrences: XrefOccurrenceNode[],
	anchorOccurrences: AnchorOccurrenceNode[],
): void {
	for (const range of mergeLineSpans(collectTableScannableRanges(block))) {
		scanInlineRange(
			lineTable,
			range.startLine,
			range.endLine,
			xrefOccurrences,
			anchorOccurrences,
		);
	}
}

function collectTableScannableRanges(block: AsciidoctorBlock): LineSpan[] {
	const rows = block.getRows?.();
	if (!isRecord(rows)) {
		return [];
	}
	const ranges: LineSpan[] = [];
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
				ranges.push(...scannableRangesFromCell(cell));
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

type TableCell = {
	getInnerDocument?: () => { getBlocks?: () => InnerBlock[] } | undefined;
	getLineNumber?: () => number | undefined;
	getLines?: () => string[] | undefined;
	getStyle?: () => string | undefined;
};

function scannableRangesFromCell(cell: unknown): LineSpan[] {
	if (!isRecord(cell)) {
		return [];
	}
	const innerBlocks = innerBlocksFromCell(cell);
	if (innerBlocks.length > 0) {
		const ranges: LineSpan[] = [];
		for (const innerBlock of innerBlocks) {
			collectScannableInnerBlockRanges(innerBlock, ranges);
		}
		return ranges;
	}
	return ordinaryCellRange(cell);
}

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

function ordinaryCellRange(cell: TableCell): LineSpan[] {
	const startLine = cell.getLineNumber?.();
	if (startLine === undefined) {
		return [];
	}
	const lines = cell.getLines?.();
	const lineCount = Array.isArray(lines) ? Math.max(1, lines.length) : 1;
	return [{ startLine, endLine: startLine + lineCount - 1 }];
}

function collectScannableInnerBlockRanges(
	block: InnerBlock,
	ranges: LineSpan[],
): void {
	const context = block.getContext?.();
	if (context === "paragraph") {
		const range = sourceRangeForInnerBlock(block);
		if (range) {
			ranges.push(range);
		}
		return;
	}
	if (context !== "open" && context !== "section") {
		return;
	}
	for (const child of block.getBlocks?.() ?? []) {
		collectScannableInnerBlockRanges(child, ranges);
	}
}

function sourceRangeForInnerBlock(block: InnerBlock): LineSpan | undefined {
	const startLine = block.getSourceLocation?.()?.getLineNumber?.();
	if (startLine === undefined) {
		return undefined;
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

function mergeLineSpans(ranges: LineSpan[]): LineSpan[] {
	const sorted = [...ranges].sort(
		(left, right) =>
			left.startLine - right.startLine || left.endLine - right.endLine,
	);
	const merged: LineSpan[] = [];
	for (const range of sorted) {
		const previous = merged.at(-1);
		if (!previous || range.startLine > previous.endLine + 1) {
			merged.push({ ...range });
			continue;
		}
		previous.endLine = Math.max(previous.endLine, range.endLine);
	}
	return merged;
}

function descendantUnscannableRanges(
	surface: OfficialBlockSurface,
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
): LineRange[] {
	const ranges: LineRange[] = [];
	for (const child of surface.children) {
		collectUnscannableRanges(child, intervalByBlock, ranges);
	}
	return mergeLineSpans(ranges);
}

function collectUnscannableRanges(
	surface: OfficialBlockSurface,
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
	ranges: LineRange[],
): void {
	const policy = officialBlockPolicy(surface.context);
	const interval = intervalByBlock.get(surface.block);
	if (policy === "skip" || policy === "diagnostic") {
		if (interval) {
			ranges.push(interval.span);
		}
		return;
	}
	for (const child of surface.children) {
		collectUnscannableRanges(child, intervalByBlock, ranges);
	}
}

function isLineInRanges(line: number, ranges: LineRange[]): boolean {
	return ranges.some(
		(range) => line >= range.startLine && line <= range.endLine,
	);
}

function scanMetadataRange(
	lineTable: LineTable,
	startLine: number,
	endLine: number,
	xrefOccurrences: XrefOccurrenceNode[],
	anchorOccurrences: AnchorOccurrenceNode[],
): void {
	for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
		const line = lineTable.lines[lineNumber - 1];
		if (!line) {
			continue;
		}
		if (line.text.startsWith(".")) {
			scanXrefMatches(lineTable, line, xrefOccurrences);
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

function dedupeOccurrences<T extends { raw: string; sourceSpan?: SourceSpan }>(
	occurrences: T[],
): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const occurrence of occurrences) {
		const key = occurrenceKey(occurrence);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(occurrence);
	}
	return result;
}

function occurrenceKey(occurrence: {
	raw: string;
	sourceSpan?: SourceSpan;
}): string {
	return [
		occurrence.sourceSpan?.start.line ?? 0,
		occurrence.sourceSpan?.start.column ?? 0,
		occurrence.sourceSpan?.end.line ?? 0,
		occurrence.sourceSpan?.end.column ?? 0,
		occurrence.raw,
	].join(":");
}
