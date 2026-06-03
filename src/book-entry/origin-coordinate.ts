import type {
	LineSpan,
	SourceLayer,
	SourceSpan,
	ToolDiagnostic,
} from "../model";
import type { LineTable } from "../source-lines";
import {
	lineText,
	logicalSourceForLineTable as logicalSourceForRegisteredLineTable,
	registerPendingLogicalSourceForLineTable,
	sourceLines,
} from "../source-lines";
import type { LineOrigin, LogicalSource, SourceFileRecord } from "./model";

export type BookEntryRecoveryDiagnosticCode =
	| "source-recovery.cross-origin-block"
	| "source-recovery.origin-line-missing"
	| "source-recovery.logical-interval-unmapped";

export type OriginRecoveryResult =
	| {
			readonly ok: true;
			readonly relativePath: string;
			readonly sourceLayer: SourceLayer;
			readonly lineSpan: LineSpan;
			readonly sourceSpan: SourceSpan;
	  }
	| {
			readonly ok: false;
			readonly diagnostic: ToolDiagnostic;
	  };

export function registerLogicalSourceForRecovery(
	logicalSource: LogicalSource,
): void {
	registerPendingLogicalSourceForLineTable(logicalSource);
}

export function logicalSourceForLineTable(
	lineTable: LineTable,
): LogicalSource | undefined {
	return logicalSourceForRegisteredLineTable(lineTable);
}

export function originForLogicalLine(
	logicalSource: LogicalSource,
	logicalLine: number,
): LineOrigin | undefined {
	return logicalSource.lineOrigins[logicalLine - 1];
}

export function sourceFileForOrigin(
	logicalSource: LogicalSource,
	origin: LineOrigin,
): SourceFileRecord | undefined {
	return logicalSource.sourceFiles.find(
		(sourceFile) => sourceFile.absolutePath === origin.absolutePath,
	);
}

export function recoverOriginSourceLayer(
	logicalSource: LogicalSource,
	logicalSpan: LineSpan,
	options: {
		readonly logicalSourceSpan?: SourceSpan | undefined;
		readonly raw?: boolean | undefined;
		readonly diagnosticContext: string;
	},
): OriginRecoveryResult {
	const origins = originsForLogicalSpan(logicalSource, logicalSpan);
	if (!origins) {
		return recoveryFailure(
			"source-recovery.logical-interval-unmapped",
			`Parser core interval ${logicalSpan.startLine}-${logicalSpan.endLine} cannot map to line origin for ${options.diagnosticContext}.`,
			options.logicalSourceSpan,
		);
	}

	const relativePath = origins[0]?.relativePath;
	if (
		!relativePath ||
		origins.some((origin) => origin.relativePath !== relativePath)
	) {
		return recoveryFailure(
			"source-recovery.cross-origin-block",
			`Block span ${logicalSpan.startLine}-${logicalSpan.endLine} maps to more than one origin source file for ${options.diagnosticContext}.`,
			options.logicalSourceSpan,
		);
	}

	const startOrigin = origins[0];
	const endOrigin = origins.at(-1);
	if (!startOrigin || !endOrigin) {
		return recoveryFailure(
			"source-recovery.logical-interval-unmapped",
			`Parser core interval ${logicalSpan.startLine}-${logicalSpan.endLine} cannot map to line origin for ${options.diagnosticContext}.`,
			options.logicalSourceSpan,
		);
	}

	const sourceFile = sourceFileForOrigin(logicalSource, startOrigin);
	if (!sourceFile) {
		return recoveryFailure(
			"source-recovery.origin-line-missing",
			`Origin file line table is missing for ${startOrigin.relativePath}.`,
			options.logicalSourceSpan,
		);
	}

	const lineSpan = {
		startLine: startOrigin.sourceLine,
		endLine: endOrigin.sourceLine,
	};
	const sourceSpan = originSourceSpan(
		sourceFile,
		lineSpan,
		options.logicalSourceSpan,
	);
	if (!sourceSpan) {
		return recoveryFailure(
			"source-recovery.origin-line-missing",
			`Origin file line table cannot recover requested source line ${lineSpan.endLine} in ${sourceFile.relativePath}.`,
			options.logicalSourceSpan,
		);
	}

	return {
		ok: true,
		relativePath,
		lineSpan,
		sourceSpan,
		sourceLayer: {
			relativePath,
			line: lineSpan.startLine,
			span: lineSpan,
			sourceSpan,
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

export function recoverOriginPointSourceLayer(
	logicalSource: LogicalSource,
	logicalSourceSpan: SourceSpan,
	raw: string,
): OriginRecoveryResult {
	const origin = originForLogicalLine(
		logicalSource,
		logicalSourceSpan.start.line,
	);
	if (!origin) {
		return recoveryFailure(
			"source-recovery.logical-interval-unmapped",
			`Parser core interval ${logicalSourceSpan.start.line}-${logicalSourceSpan.end.line} cannot map to line origin for inline occurrence.`,
			logicalSourceSpan,
		);
	}
	const endOrigin = originForLogicalLine(
		logicalSource,
		logicalSourceSpan.end.line,
	);
	if (!endOrigin) {
		return recoveryFailure(
			"source-recovery.logical-interval-unmapped",
			`Parser core interval ${logicalSourceSpan.start.line}-${logicalSourceSpan.end.line} cannot map to line origin for inline occurrence.`,
			logicalSourceSpan,
		);
	}
	if (origin.relativePath !== endOrigin.relativePath) {
		return recoveryFailure(
			"source-recovery.cross-origin-block",
			`Inline occurrence span ${logicalSourceSpan.start.line}-${logicalSourceSpan.end.line} maps to more than one origin source file.`,
			logicalSourceSpan,
		);
	}
	const sourceSpan = {
		start: {
			line: origin.sourceLine,
			column: logicalSourceSpan.start.column,
		},
		end: {
			line: endOrigin.sourceLine,
			column: logicalSourceSpan.end.column,
		},
	};
	return {
		ok: true,
		relativePath: origin.relativePath,
		lineSpan: {
			startLine: origin.sourceLine,
			endLine: endOrigin.sourceLine,
		},
		sourceSpan,
		sourceLayer: {
			raw,
			relativePath: origin.relativePath,
			line: origin.sourceLine,
			sourceSpan,
		},
	};
}

export function recoverSectionSourceLayer(
	logicalSource: LogicalSource,
	logicalHeadingLine: number,
	logicalMetadataStartLine: number,
	logicalTitleSpan: SourceSpan | undefined,
): OriginRecoveryResult {
	const headingOrigin = originForLogicalLine(logicalSource, logicalHeadingLine);
	if (!headingOrigin) {
		return recoveryFailure(
			"source-recovery.logical-interval-unmapped",
			`Parser core interval ${logicalHeadingLine}-${logicalHeadingLine} cannot map to line origin for section heading.`,
			logicalTitleSpan,
		);
	}
	const metadataOrigin =
		originForLogicalLine(logicalSource, logicalMetadataStartLine) ??
		headingOrigin;
	const sourceFile = sourceFileForOrigin(logicalSource, headingOrigin);
	if (!sourceFile) {
		return recoveryFailure(
			"source-recovery.origin-line-missing",
			`Origin file line table is missing for ${headingOrigin.relativePath}.`,
			logicalTitleSpan,
		);
	}

	const startLine =
		metadataOrigin.relativePath === headingOrigin.relativePath
			? metadataOrigin.sourceLine
			: headingOrigin.sourceLine;
	const lineSpan = {
		startLine,
		endLine: sectionHeadingSliceEndLine(
			sourceFile.lineTable,
			startLine,
			headingOrigin.sourceLine,
		),
	};
	const sourceSpan = originSourceSpan(sourceFile, lineSpan, undefined);
	if (!sourceSpan) {
		return recoveryFailure(
			"source-recovery.origin-line-missing",
			`Origin file line table cannot recover requested source line ${lineSpan.endLine} in ${sourceFile.relativePath}.`,
			logicalTitleSpan,
		);
	}

	return {
		ok: true,
		relativePath: headingOrigin.relativePath,
		lineSpan,
		sourceSpan,
		sourceLayer: {
			relativePath: headingOrigin.relativePath,
			line: headingOrigin.sourceLine,
			span: lineSpan,
			sourceSpan,
			raw: `${sourceLines(
				sourceFile.lineTable,
				startLine,
				lineSpan.endLine,
			).join("\n")}\n`,
		},
	};
}

export function recoverTitleSpan(
	logicalSource: LogicalSource,
	logicalTitleSpan: SourceSpan | undefined,
): SourceSpan | undefined {
	if (!logicalTitleSpan) {
		return undefined;
	}
	const startOrigin = originForLogicalLine(
		logicalSource,
		logicalTitleSpan.start.line,
	);
	const endOrigin = originForLogicalLine(
		logicalSource,
		logicalTitleSpan.end.line,
	);
	if (!startOrigin || !endOrigin) {
		return undefined;
	}
	if (startOrigin.relativePath !== endOrigin.relativePath) {
		return undefined;
	}
	return {
		start: {
			line: startOrigin.sourceLine,
			column: logicalTitleSpan.start.column,
		},
		end: {
			line: endOrigin.sourceLine,
			column: logicalTitleSpan.end.column,
		},
	};
}

function originsForLogicalSpan(
	logicalSource: LogicalSource,
	span: LineSpan,
): LineOrigin[] | undefined {
	const origins: LineOrigin[] = [];
	for (let line = span.startLine; line <= span.endLine; line += 1) {
		const origin = originForLogicalLine(logicalSource, line);
		if (!origin) {
			return undefined;
		}
		origins.push(origin);
	}
	return origins;
}

function originSourceSpan(
	sourceFile: SourceFileRecord,
	lineSpan: LineSpan,
	logicalSourceSpan: SourceSpan | undefined,
): SourceSpan | undefined {
	const startLine = sourceFile.lineTable.lines[lineSpan.startLine - 1];
	const endLine = sourceFile.lineTable.lines[lineSpan.endLine - 1];
	if (!startLine || !endLine) {
		return undefined;
	}
	return {
		start: {
			line: lineSpan.startLine,
			column: logicalSourceSpan?.start.column ?? 1,
		},
		end: {
			line: lineSpan.endLine,
			column: logicalSourceSpan?.end.column ?? [...endLine.text].length + 1,
		},
	};
}

function sectionHeadingSliceEndLine(
	lineTable: LineTable,
	startLine: number,
	headingLine: number,
): number {
	for (let line = headingLine + 1; line <= lineTable.lines.length; line += 1) {
		const text = lineText(lineTable, line);
		if (!isHeadingSliceBoundaryLine(text)) {
			continue;
		}
		return Math.max(
			startLine,
			metadataStartBeforeBoundary(lineTable, line, headingLine + 1) - 1,
		);
	}
	return lineTable.lines.length;
}

function metadataStartBeforeBoundary(
	lineTable: LineTable,
	boundaryLine: number,
	minLine: number,
): number {
	let startLine = boundaryLine;
	for (let line = boundaryLine - 1; line >= minLine; line -= 1) {
		if (!isBlockMetadataLine(lineText(lineTable, line))) {
			break;
		}
		startLine = line;
	}
	return startLine;
}

function isHeadingSliceBoundaryLine(text: string): boolean {
	const trimmed = text.trim();
	return (
		isSectionHeadingLine(trimmed) ||
		isBlockMetadataLine(trimmed) ||
		trimmed === "----" ||
		trimmed === "|==="
	);
}

function isSectionHeadingLine(trimmed: string): boolean {
	return /^={1,6}\s+\S/u.test(trimmed);
}

function isBlockMetadataLine(trimmed: string): boolean {
	return /^\[[^[\]]+\]$/u.test(trimmed) || /^\.[^\s.]/u.test(trimmed);
}

function recoveryFailure(
	code: BookEntryRecoveryDiagnosticCode,
	message: string,
	source: SourceSpan | undefined,
): OriginRecoveryResult {
	return {
		ok: false,
		diagnostic: {
			level: "warning",
			code,
			message,
			...(source ? { source } : {}),
		},
	};
}
