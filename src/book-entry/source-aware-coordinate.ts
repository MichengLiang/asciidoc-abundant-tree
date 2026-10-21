import type {
	LineSpan,
	SourceLayer,
	SourceSpan,
	ToolDiagnostic,
} from "../model";
import type { LineTable } from "../source-lines";
import { sourceLines } from "../source-lines";
import { lookupOriginColumn } from "./column-map";
import type {
	LogicalLineRecord,
	PhysicalLineOrigin,
	SourceAwareLogicalDocument,
	SourceFileRecord,
} from "./line-origin-model";

export type SourceAwareRecoveryResult =
	| {
			readonly ok: true;
			readonly relativePath: string;
			readonly sourceLayer: SourceLayer;
			readonly lineSpan: LineSpan;
			readonly sourceSpan?: SourceSpan | undefined;
	  }
	| {
			readonly ok: false;
			readonly diagnostic: ToolDiagnostic;
	  };

export type SourceAwarePointRecoveryResult =
	| {
			readonly ok: true;
			readonly relativePath: string;
			readonly lineSpan: LineSpan;
			readonly sourceLayer: SourceLayer;
			readonly sourceSpan?: SourceSpan | undefined;
	  }
	| {
			readonly ok: false;
			readonly diagnostic: ToolDiagnostic;
			readonly sourceLayer?: SourceLayer | undefined;
	  };

const sourceAwareByLineTable = new WeakMap<
	LineTable,
	SourceAwareLogicalDocument
>();
const pendingSourceAwareByText = new Map<
	string,
	SourceAwareLogicalDocument[]
>();

export function registerSourceAwareDocumentForRecovery(
	document: SourceAwareLogicalDocument,
): void {
	const pending = pendingSourceAwareByText.get(document.logicalText) ?? [];
	pending.push(document);
	pendingSourceAwareByText.set(document.logicalText, pending);
}

export function bindPendingSourceAwareDocumentToLineTable(
	lineTable: LineTable,
): void {
	const pending = pendingSourceAwareByText.get(lineTable.source);
	const document = pending?.shift();
	if (document) {
		sourceAwareByLineTable.set(lineTable, document);
	}
	if (pending?.length === 0) {
		pendingSourceAwareByText.delete(lineTable.source);
	}
}

export function sourceAwareDocumentForLineTable(
	lineTable: LineTable,
): SourceAwareLogicalDocument | undefined {
	return sourceAwareByLineTable.get(lineTable);
}

export function recoverSourceAwareSourceLayer(
	document: SourceAwareLogicalDocument,
	logicalSpan: LineSpan,
	options: {
		readonly logicalSourceSpan?: SourceSpan | undefined;
		readonly raw?: boolean | undefined;
		readonly diagnosticContext: string;
	},
): SourceAwareRecoveryResult {
	const records = recordsForSpan(document, logicalSpan);
	if (!records) {
		return recoveryFailure(
			"source-coordinate.degraded-line",
			`Parser core interval ${logicalSpan.startLine}-${logicalSpan.endLine} cannot map to logical line records for ${options.diagnosticContext}.`,
			options.logicalSourceSpan,
		);
	}
	const degraded = records.find((record) => record.kind === "degraded");
	if (degraded?.kind === "degraded") {
		return {
			ok: false,
			diagnostic: {
				level: "warning",
				code: degraded.diagnostic.code,
				message: degraded.diagnostic.message,
				...(options.logicalSourceSpan
					? { source: options.logicalSourceSpan }
					: {}),
			},
		};
	}
	const sourceRecords = records.filter(hasOrigin);
	if (sourceRecords.length === 0) {
		return recoveryFailure(
			"source-coordinate.generated-line",
			`Parser core interval ${logicalSpan.startLine}-${logicalSpan.endLine} contains only generated control lines for ${options.diagnosticContext}.`,
			options.logicalSourceSpan,
		);
	}
	const firstRecord = sourceRecords[0];
	const lastRecord = sourceRecords.at(-1);
	if (!firstRecord || !lastRecord) {
		return recoveryFailure(
			"source-coordinate.generated-line",
			`Parser core interval ${logicalSpan.startLine}-${logicalSpan.endLine} has no source-backed lines for ${options.diagnosticContext}.`,
			options.logicalSourceSpan,
		);
	}
	// 块的作者文件由首尾两行决定（10 号书「Block Raw」）：中间来自别的文件的行，是作者文件里某条 include 指令
	// 展开的结果，raw 保留那条指令，所以不算跨文件。首尾落在两个文件时，没有一个文件给得出连续原文。
	const relativePath = firstRecord.origin.relativePath;
	if (firstRecord.origin.absolutePath !== lastRecord.origin.absolutePath) {
		return recoveryFailure(
			"block-origin.multi-source-span",
			`${options.diagnosticContext} starts at ${originLabel(firstRecord.origin)} and ends at ${originLabel(lastRecord.origin)}; no single origin source file holds its raw.`,
			options.logicalSourceSpan,
		);
	}
	if (!authorLinesInSourceOrder(sourceRecords, firstRecord.origin)) {
		return recoveryFailure(
			"block-origin.multi-source-span",
			`${options.diagnosticContext} from ${originLabel(firstRecord.origin)} to ${originLabel(lastRecord.origin)} reads ${relativePath} out of source order; no contiguous raw exists.`,
			options.logicalSourceSpan,
		);
	}
	const sourceFile = sourceFileForOrigin(document, firstRecord.origin);
	if (!sourceFile) {
		return recoveryFailure(
			"line-origin.source-file-missing",
			`Origin file line table is missing for ${relativePath}.`,
			options.logicalSourceSpan,
		);
	}
	const lineSpan = {
		startLine: firstRecord.origin.sourceLine,
		endLine: lastRecord.origin.sourceLine,
	};
	const sourceSpan = options.logicalSourceSpan
		? recoverSourceAwareSpan(document, options.logicalSourceSpan, false)
		: undefined;
	if (sourceSpan && !sourceSpan.ok) {
		return sourceSpan;
	}
	return {
		ok: true,
		relativePath,
		lineSpan,
		...(sourceSpan?.sourceSpan ? { sourceSpan: sourceSpan.sourceSpan } : {}),
		sourceLayer: {
			relativePath,
			line: lineSpan.startLine,
			span: lineSpan,
			...(sourceSpan?.sourceSpan ? { sourceSpan: sourceSpan.sourceSpan } : {}),
			...(options.raw
				? {
						raw: `${sourceLines(
							sourceFile.lineTable,
							lineSpan.startLine,
							lineSpan.endLine,
						).join("\n")}\n`,
					}
				: {}),
		},
	};
}

export function recoverSourceAwarePointSourceLayer(
	document: SourceAwareLogicalDocument,
	logicalSourceSpan: SourceSpan,
	raw: string,
): SourceAwarePointRecoveryResult {
	const recovered = recoverSourceAwareSpan(document, logicalSourceSpan, true);
	if (!recovered.ok) {
		if (recovered.sourceLayer) {
			return {
				ok: false,
				diagnostic: recovered.diagnostic,
				sourceLayer: {
					raw,
					...recovered.sourceLayer,
				},
			};
		}
		return recovered;
	}
	return {
		ok: true,
		relativePath: recovered.relativePath,
		lineSpan: {
			startLine: recovered.sourceSpan.start.line,
			endLine: recovered.sourceSpan.end.line,
		},
		sourceSpan: recovered.sourceSpan,
		sourceLayer: {
			raw,
			relativePath: recovered.relativePath,
			line: recovered.sourceSpan.start.line,
			sourceSpan: recovered.sourceSpan,
		},
	};
}

/**
 * 块的 content span 在作者文件里的行区间。
 *
 * 内容的首行或尾行来自被引入的文件时，作者文件里与之对应的是那条 include 指令：从块里紧挨在内容之前的
 * 作者行往后一行起，到紧挨在内容之后的作者行往前一行止。作者文件由块的首行决定，调用方应已用
 * {@link recoverSourceAwareSourceLayer} 确认整块落在同一个作者文件里。
 */
export function recoverSourceAwareContentLineSpan(
	document: SourceAwareLogicalDocument,
	blockSpan: LineSpan,
	contentSpan: LineSpan,
): LineSpan | undefined {
	const blockRecords = recordsForSpan(document, blockSpan)?.filter(hasOrigin);
	const author = blockRecords?.[0]?.origin.absolutePath;
	if (!blockRecords || author === undefined) {
		return undefined;
	}
	const authored = blockRecords.filter(
		(record) => record.origin.absolutePath === author,
	);
	const inside = (record: LogicalLineRecord) =>
		record.logicalLine >= contentSpan.startLine &&
		record.logicalLine <= contentSpan.endLine;
	const firstInside = authored.find(inside);
	const lastInside = authored.findLast(inside);
	const before = authored.findLast(
		(record) => record.logicalLine < contentSpan.startLine,
	);
	const after = authored.find(
		(record) => record.logicalLine > contentSpan.endLine,
	);
	const startsWithAuthorLine =
		firstInside !== undefined &&
		firstInside.logicalLine === firstOriginLine(blockRecords, contentSpan);
	const endsWithAuthorLine =
		lastInside !== undefined &&
		lastInside.logicalLine === lastOriginLine(blockRecords, contentSpan);
	const startLine = startsWithAuthorLine
		? firstInside.origin.sourceLine
		: before && before.origin.sourceLine + 1;
	const endLine = endsWithAuthorLine
		? lastInside.origin.sourceLine
		: after && after.origin.sourceLine - 1;
	if (startLine === undefined || endLine === undefined || startLine > endLine) {
		return undefined;
	}
	return { startLine, endLine };
}

/**
 * 一段逻辑行在源文件里落在哪些行上：`relativePath` 与 `line` 的组合，用 {@link originPointKey} 编成键。
 *
 * 出现处回源后只剩来源坐标；判断它在不在一个块里，就看它的来源是不是这个块某条逻辑行的来源
 * （10 号书「结构关系在 Logical Document 上判定」）。被引入文件里的行也在其中。
 */
export function originPointsForSpan(
	document: SourceAwareLogicalDocument,
	logicalSpan: LineSpan,
): ReadonlySet<string> {
	const points = new Set<string>();
	for (const record of recordsForSpan(document, logicalSpan) ?? []) {
		if (hasOrigin(record)) {
			points.add(
				originPointKey(record.origin.relativePath, record.origin.sourceLine),
			);
		}
	}
	return points;
}

export function originPointKey(relativePath: string, line: number): string {
	return `${relativePath}\n${line}`;
}

export function recoverSourceAwareDocumentTitleSourceLayer(
	document: SourceAwareLogicalDocument,
	logicalTitleSpan: SourceSpan | undefined,
): SourceAwarePointRecoveryResult | undefined {
	if (!logicalTitleSpan) {
		return undefined;
	}
	return recoverSourceAwarePointSourceLayer(
		document,
		logicalTitleSpan,
		document.lines[logicalTitleSpan.start.line - 1]?.text ?? "",
	);
}

export function recoverSourceAwareSectionSourceLayer(
	document: SourceAwareLogicalDocument,
	logicalHeadingLine: number,
	logicalMetadataStartLine: number,
	logicalTitleSpan: SourceSpan | undefined,
	nextOriginHeadingSliceStartLine: number | undefined,
): SourceAwareRecoveryResult {
	const headingRecord = document.lines[logicalHeadingLine - 1];
	if (!headingRecord || !hasOrigin(headingRecord)) {
		return recoveryFailure(
			"source-coordinate.generated-line",
			`Section heading line ${logicalHeadingLine} does not have a precise origin.`,
			logicalTitleSpan,
		);
	}
	const metadataRecord = document.lines[logicalMetadataStartLine - 1];
	const startLine =
		metadataRecord &&
		hasOrigin(metadataRecord) &&
		metadataRecord.origin.relativePath === headingRecord.origin.relativePath
			? metadataRecord.origin.sourceLine
			: headingRecord.origin.sourceLine;
	const sourceFile = sourceFileForOrigin(document, headingRecord.origin);
	if (!sourceFile) {
		return recoveryFailure(
			"line-origin.source-file-missing",
			`Origin file line table is missing for ${headingRecord.origin.relativePath}.`,
			logicalTitleSpan,
		);
	}
	const endLine =
		nextOriginHeadingSliceStartLine !== undefined
			? Math.max(startLine, nextOriginHeadingSliceStartLine - 1)
			: finalAuthoredLine(sourceFile.lineTable);
	const titleSpan = logicalTitleSpan
		? recoverSourceAwareSpan(document, logicalTitleSpan, false)
		: undefined;
	if (titleSpan && !titleSpan.ok) {
		return titleSpan;
	}
	const lineSpan = { startLine, endLine };
	return {
		ok: true,
		relativePath: headingRecord.origin.relativePath,
		lineSpan,
		...(titleSpan?.sourceSpan ? { sourceSpan: titleSpan.sourceSpan } : {}),
		sourceLayer: {
			relativePath: headingRecord.origin.relativePath,
			line: headingRecord.origin.sourceLine,
			span: lineSpan,
			...(titleSpan?.sourceSpan ? { sourceSpan: titleSpan.sourceSpan } : {}),
			raw: `${sourceLines(sourceFile.lineTable, startLine, endLine).join("\n")}\n`,
		},
	};
}

export function recoverSourceAwareTitleSpan(
	document: SourceAwareLogicalDocument,
	logicalTitleSpan: SourceSpan | undefined,
): SourceSpan | undefined {
	if (!logicalTitleSpan) {
		return undefined;
	}
	const recovered = recoverSourceAwareSpan(document, logicalTitleSpan, false);
	return recovered.ok ? recovered.sourceSpan : undefined;
}

export function sourceScopeFromSourceAwareInterval(
	document: SourceAwareLogicalDocument,
	span: LineSpan,
	headingLogicalLine: number,
):
	| {
			readonly relativePath: string;
			readonly startLine: number;
			readonly endLine: number;
	  }
	| undefined {
	const headingRecord = document.lines[headingLogicalLine - 1];
	if (!headingRecord || !hasOrigin(headingRecord)) {
		return undefined;
	}
	let endLine = headingRecord.origin.sourceLine;
	for (
		let logicalLine = span.startLine;
		logicalLine <= span.endLine;
		logicalLine += 1
	) {
		const record = document.lines[logicalLine - 1];
		if (!record || !hasOrigin(record)) {
			continue;
		}
		if (record.origin.relativePath !== headingRecord.origin.relativePath) {
			continue;
		}
		endLine = Math.max(endLine, record.origin.sourceLine);
	}
	return {
		relativePath: headingRecord.origin.relativePath,
		startLine: headingRecord.origin.sourceLine,
		endLine,
	};
}

function recoverSourceAwareSpan(
	document: SourceAwareLogicalDocument,
	logicalSourceSpan: SourceSpan,
	requireColumns: boolean,
):
	| {
			readonly ok: true;
			readonly relativePath: string;
			readonly sourceSpan: SourceSpan;
	  }
	| {
			readonly ok: false;
			readonly diagnostic: ToolDiagnostic;
			readonly sourceLayer?: SourceLayer | undefined;
	  } {
	const start = recoverSourceAwarePoint(
		document,
		logicalSourceSpan.start,
		requireColumns,
	);
	if (!start.ok) {
		return start;
	}
	const end = recoverSourceAwarePoint(
		document,
		logicalSourceSpan.end,
		requireColumns,
	);
	if (!end.ok) {
		return end.sourceLayer
			? end
			: {
					...end,
					sourceLayer: {
						relativePath: start.relativePath,
						line: start.line,
					},
				};
	}
	if (start.relativePath !== end.relativePath) {
		return recoveryFailure(
			"block-origin.multi-source-span",
			`Source span starts at ${start.relativePath}:${start.line} and ends at ${end.relativePath}:${end.line}; no single origin source file holds it.`,
			logicalSourceSpan,
		);
	}
	return {
		ok: true,
		relativePath: start.relativePath,
		sourceSpan: {
			start: { line: start.line, column: start.column },
			end: { line: end.line, column: end.column },
		},
	};
}

function recoverSourceAwarePoint(
	document: SourceAwareLogicalDocument,
	point: { readonly line: number; readonly column: number },
	requireColumn: boolean,
):
	| {
			readonly ok: true;
			readonly relativePath: string;
			readonly line: number;
			readonly column: number;
	  }
	| {
			readonly ok: false;
			readonly diagnostic: ToolDiagnostic;
			readonly sourceLayer?: SourceLayer | undefined;
	  } {
	const record = document.lines[point.line - 1];
	if (!record) {
		return recoveryFailure(
			"source-coordinate.degraded-line",
			`Logical line ${point.line} is outside source-aware line records.`,
			{ start: point, end: point },
		);
	}
	if (record.kind === "generated-control") {
		return recoveryFailure(
			"source-coordinate.generated-line",
			`Logical line ${point.line} is generated by include preprocessing.`,
			{ start: point, end: point },
		);
	}
	if (record.kind === "degraded") {
		return {
			ok: false,
			diagnostic: {
				level: "warning",
				code: record.diagnostic.code,
				message: record.diagnostic.message,
				source: { start: point, end: point },
			},
		};
	}
	const originColumn = lookupOriginColumn(record.columnMap, point.column);
	if (originColumn === undefined) {
		return requireColumn
			? recoveryFailure(
					"source-coordinate.column-unmapped",
					`Logical column ${point.column} on line ${point.line} does not map to an origin source column.`,
					{ start: point, end: point },
					{
						relativePath: record.origin.relativePath,
						line: record.origin.sourceLine,
					},
				)
			: {
					ok: true,
					relativePath: record.origin.relativePath,
					line: record.origin.sourceLine,
					column: 1,
				};
	}
	return {
		ok: true,
		relativePath: record.origin.relativePath,
		line: record.origin.sourceLine,
		column: originColumn,
	};
}

function recordsForSpan(
	document: SourceAwareLogicalDocument,
	span: LineSpan,
): readonly LogicalLineRecord[] | undefined {
	const records: LogicalLineRecord[] = [];
	for (let line = span.startLine; line <= span.endLine; line += 1) {
		const record = document.lines[line - 1];
		if (!record) {
			return undefined;
		}
		records.push(record);
	}
	return records;
}

function hasOrigin(
	record: LogicalLineRecord,
): record is Extract<
	LogicalLineRecord,
	{ readonly origin: PhysicalLineOrigin }
> {
	return "origin" in record;
}

function originLabel(origin: PhysicalLineOrigin): string {
	return `${origin.relativePath}:${origin.sourceLine}`;
}

// 同一个作者文件被引入两次时，一个块可能从前一次读入走到后一次读入；那时作者文件的行号会倒退，
// 两段之间没有一段连续原文。
function authorLinesInSourceOrder(
	records: readonly Extract<
		LogicalLineRecord,
		{ readonly origin: PhysicalLineOrigin }
	>[],
	author: PhysicalLineOrigin,
): boolean {
	let previous = 0;
	for (const record of records) {
		if (record.origin.absolutePath !== author.absolutePath) {
			continue;
		}
		if (record.origin.sourceLine <= previous) {
			return false;
		}
		previous = record.origin.sourceLine;
	}
	return true;
}

function firstOriginLine(
	records: readonly LogicalLineRecord[],
	span: LineSpan,
): number | undefined {
	return records.find(
		(record) =>
			record.logicalLine >= span.startLine &&
			record.logicalLine <= span.endLine,
	)?.logicalLine;
}

function lastOriginLine(
	records: readonly LogicalLineRecord[],
	span: LineSpan,
): number | undefined {
	return records.findLast(
		(record) =>
			record.logicalLine >= span.startLine &&
			record.logicalLine <= span.endLine,
	)?.logicalLine;
}

function sourceFileForOrigin(
	document: SourceAwareLogicalDocument,
	origin: PhysicalLineOrigin,
): SourceFileRecord | undefined {
	return document.sourceFiles.find(
		(sourceFile) => sourceFile.absolutePath === origin.absolutePath,
	);
}

function finalAuthoredLine(lineTable: LineTable): number {
	if (
		lineTable.lines.length > 1 &&
		lineTable.source.endsWith("\n") &&
		lineTable.lines.at(-1)?.text === ""
	) {
		return lineTable.lines.length - 1;
	}
	return lineTable.lines.length;
}

function recoveryFailure(
	code: string,
	message: string,
	source: SourceSpan | undefined,
	sourceLayer?: SourceLayer | undefined,
): SourceAwareRecoveryResult & {
	readonly ok: false;
	readonly sourceLayer?: SourceLayer | undefined;
} {
	return {
		ok: false,
		diagnostic: {
			level: "warning",
			code,
			message,
			...(source ? { source } : {}),
		},
		...(sourceLayer ? { sourceLayer } : {}),
	};
}
