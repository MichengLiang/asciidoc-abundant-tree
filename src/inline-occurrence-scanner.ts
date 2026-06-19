import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import {
	logicalSourceForLineTable,
	recoverOriginPointSourceLayer,
} from "./book-entry/origin-coordinate";
import {
	recoverSourceAwarePointSourceLayer,
	sourceAwareDocumentForLineTable,
} from "./book-entry/source-aware-coordinate";
import { interpretHeadingInlineMetadataAttributes } from "./heading-inline-metadata";
import { parseMacroArguments } from "./macro-argument-parser";
import type {
	AnchorOccurrenceNode,
	HeadingInlineMetadataOccurrenceNode,
	LineSpan,
	SectionNode,
	SourceSpan,
	ToolDiagnostic,
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
const headingInlineMetadataPattern = /hmeta:([^\s[]+)\[([^\]]*)\]/gu;

export function scanInlineOccurrencesInOfficialBlocks(options: {
	lineTable: LineTable;
	blockSurfaces: OfficialBlockSurface[];
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>;
	toolDiagnostics?: ToolDiagnostic[];
}): {
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[];
} {
	const xrefOccurrences: XrefOccurrenceNode[] = [];
	const anchorOccurrences: AnchorOccurrenceNode[] = [];
	const headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[] =
		[];

	for (const surface of options.blockSurfaces) {
		const interval = options.intervalByBlock.get(surface.block);
		if (!interval) {
			continue;
		}
		if (hasDiagnosticPolicyAncestor(surface)) {
			if (isPreambleParagraph(surface)) {
				scanHeadingInlineMetadataRange(
					options.lineTable,
					interval.contentSpan?.startLine ?? interval.span.startLine,
					interval.contentSpan?.endLine ?? interval.span.endLine,
					headingInlineMetadataOccurrences,
					options.toolDiagnostics,
				);
			}
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
		if (!scansMacroSubstitutedContent(surface)) {
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
				headingInlineMetadataOccurrences,
				options.toolDiagnostics,
			);
		} else {
			scanInlineRange(
				options.lineTable,
				span.startLine,
				span.endLine,
				xrefOccurrences,
				anchorOccurrences,
				headingInlineMetadataOccurrences,
				options.toolDiagnostics,
				descendantUnscannableRanges(surface, options.intervalByBlock),
			);
		}
	}

	const sourceAwareDocument = sourceAwareDocumentForLineTable(
		options.lineTable,
	);
	const logicalSource = logicalSourceForLineTable(options.lineTable);
	const recoveredXrefs = sourceAwareDocument
		? recoverSourceAwareInlineOrigins(
				xrefOccurrences,
				sourceAwareDocument,
				options.toolDiagnostics,
			)
		: logicalSource
			? recoverInlineOrigins(
					xrefOccurrences,
					logicalSource,
					options.toolDiagnostics,
				)
			: xrefOccurrences;
	const recoveredAnchors = sourceAwareDocument
		? recoverSourceAwareInlineOrigins(
				anchorOccurrences,
				sourceAwareDocument,
				options.toolDiagnostics,
			)
		: logicalSource
			? recoverInlineOrigins(
					anchorOccurrences,
					logicalSource,
					options.toolDiagnostics,
				)
			: anchorOccurrences;
	const recoveredHeadingInlineMetadata = sourceAwareDocument
		? recoverSourceAwareInlineOrigins(
				headingInlineMetadataOccurrences,
				sourceAwareDocument,
				options.toolDiagnostics,
			)
		: logicalSource
			? recoverInlineOrigins(
					headingInlineMetadataOccurrences,
					logicalSource,
					options.toolDiagnostics,
				)
			: headingInlineMetadataOccurrences;

	return {
		xrefOccurrences: dedupeOccurrences(recoveredXrefs).sort(compareSourceSpans),
		anchorOccurrences:
			dedupeOccurrences(recoveredAnchors).sort(compareSourceSpans),
		headingInlineMetadataOccurrences: dedupeOccurrences(
			recoveredHeadingInlineMetadata,
		).sort(compareSourceSpans),
	};
}

function recoverSourceAwareInlineOrigins<
	T extends {
		raw: string;
		sourceSpan?: SourceSpan;
		source?: {
			raw?: string;
			line?: number;
			sourceSpan?: SourceSpan;
			relativePath?: string;
		};
	},
>(
	occurrences: T[],
	sourceAwareDocument: NonNullable<
		ReturnType<typeof sourceAwareDocumentForLineTable>
	>,
	toolDiagnostics: ToolDiagnostic[] | undefined,
): T[] {
	const recoveredOccurrences: T[] = [];
	for (const occurrence of occurrences) {
		if (!occurrence.sourceSpan) {
			recoveredOccurrences.push(occurrence);
			continue;
		}
		const recovered = recoverSourceAwarePointSourceLayer(
			sourceAwareDocument,
			occurrence.sourceSpan,
			occurrence.raw,
		);
		if (!recovered.ok) {
			toolDiagnostics?.push(recovered.diagnostic);
			if (recovered.sourceLayer) {
				delete occurrence.sourceSpan;
				occurrence.source = {
					...occurrence.source,
					...recovered.sourceLayer,
				};
			}
			recoveredOccurrences.push(occurrence);
			continue;
		}
		if (recovered.sourceSpan) {
			occurrence.sourceSpan = recovered.sourceSpan;
		}
		occurrence.source = {
			...occurrence.source,
			...recovered.sourceLayer,
		};
		recoveredOccurrences.push(occurrence);
	}
	return recoveredOccurrences;
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

function isPreambleParagraph(surface: OfficialBlockSurface): boolean {
	return (
		surface.context === "paragraph" && surface.parent?.context === "preamble"
	);
}

function scansMacroSubstitutedContent(surface: OfficialBlockSurface): boolean {
	// Asciidoctor exposes term/cell inline substitutions below these containers,
	// not as a useful "macros" entry on the container block itself.
	if (surface.context === "dlist" || surface.context === "table") {
		return true;
	}
	const substitutions = surface.block.getSubstitutions?.();
	return !Array.isArray(substitutions) || substitutions.includes("macros");
}

export function assignContainingSectionIds(
	xrefs: XrefOccurrenceNode[],
	anchors: AnchorOccurrenceNode[],
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[],
	sectionByLine: Map<number, SectionNode>,
): void {
	for (const occurrence of [
		...xrefs,
		...anchors,
		...headingInlineMetadataOccurrences,
	]) {
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

function recoverInlineOrigins<
	T extends {
		raw: string;
		sourceSpan?: SourceSpan;
		source?: {
			raw?: string;
			line?: number;
			sourceSpan?: SourceSpan;
			relativePath?: string;
		};
	},
>(
	occurrences: T[],
	logicalSource: NonNullable<ReturnType<typeof logicalSourceForLineTable>>,
	toolDiagnostics: ToolDiagnostic[] | undefined,
): T[] {
	const recoveredOccurrences: T[] = [];
	for (const occurrence of occurrences) {
		if (!occurrence.sourceSpan) {
			recoveredOccurrences.push(occurrence);
			continue;
		}
		const recovered = recoverOriginPointSourceLayer(
			logicalSource,
			occurrence.sourceSpan,
			occurrence.raw,
		);
		if (!recovered.ok) {
			toolDiagnostics?.push(recovered.diagnostic);
			recoveredOccurrences.push(occurrence);
			continue;
		}
		occurrence.sourceSpan = recovered.sourceSpan;
		occurrence.source = {
			...occurrence.source,
			...recovered.sourceLayer,
		};
		recoveredOccurrences.push(occurrence);
	}
	return recoveredOccurrences;
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
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[],
	toolDiagnostics: ToolDiagnostic[] | undefined,
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
		scanHeadingInlineMetadataMatches(
			lineTable,
			line,
			headingInlineMetadataOccurrences,
			toolDiagnostics,
		);
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
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[],
	toolDiagnostics: ToolDiagnostic[] | undefined,
): void {
	for (const range of mergeLineSpans(collectTableScannableRanges(block))) {
		scanInlineRange(
			lineTable,
			range.startLine,
			range.endLine,
			xrefOccurrences,
			anchorOccurrences,
			headingInlineMetadataOccurrences,
			toolDiagnostics,
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

function scanHeadingInlineMetadataRange(
	lineTable: LineTable,
	startLine: number,
	endLine: number,
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[],
	toolDiagnostics: ToolDiagnostic[] | undefined,
): void {
	for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
		const line = lineTable.lines[lineNumber - 1];
		if (!line) {
			continue;
		}
		scanHeadingInlineMetadataMatches(
			lineTable,
			line,
			headingInlineMetadataOccurrences,
			toolDiagnostics,
		);
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

function scanHeadingInlineMetadataMatches(
	lineTable: LineTable,
	line: SourceLine,
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[],
	toolDiagnostics: ToolDiagnostic[] | undefined,
): void {
	for (const match of line.text.matchAll(headingInlineMetadataPattern)) {
		if (match.index === undefined || !match[1]) {
			continue;
		}
		const raw = match[0];
		const field = match[1].trim();
		const sourceSpan = sourceSpanForRange(
			lineTable,
			line.number,
			match.index,
			raw,
		);
		const interpreted = interpretHeadingInlineMetadataAttributes(
			field,
			match[2] ?? "",
		);
		if (!interpreted.ok) {
			toolDiagnostics?.push({
				level: "warning",
				code: "heading-inline-metadata.missing-value",
				message: `Heading inline metadata macro '${raw}' is missing a value.`,
				source: sourceSpan,
			});
			continue;
		}
		headingInlineMetadataOccurrences.push(
			definedObject({
				kind: "headingInlineMetadata",
				syntax: "macro",
				raw,
				field: interpreted.field,
				value: interpreted.value,
				label: interpreted.label,
				sourceSpan,
				source: {
					raw,
					line: line.number,
					sourceSpan,
				},
			}) as HeadingInlineMetadataOccurrenceNode,
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
