import type { LineTable } from "../source-lines";
import type { ColumnMap, IdentityColumnMap } from "./column-map";
import { type BookEntryDiagnostic, constructionError } from "./diagnostics";
import type { IncludeLineSelector } from "./include-selection-mapper";

export type ReaderLineCursor = {
	readonly file?: string | undefined;
	readonly directory?: string | undefined;
	readonly path?: string | undefined;
	readonly lineNumber?: number | undefined;
};

export type PhysicalLineOrigin = {
	readonly absolutePath: string;
	readonly relativePath: string;
	readonly sourceLine: number;
};

export type IncludeLineTransform = {
	readonly kind: "indent";
	readonly columns: number;
};

export type IncludeDirectiveEvidence = {
	readonly absolutePath: string;
	readonly relativePath: string;
	readonly sourceLine: number;
	readonly target: string;
	readonly attrlist: string;
};

export type SourcePreservingLineRecord = {
	readonly kind: "source-preserving";
	readonly logicalLine: number;
	readonly text: string;
	readonly origin: PhysicalLineOrigin;
	readonly columnMap: IdentityColumnMap;
	readonly escapedInclude?: boolean | undefined;
};

export type SelectedSourceLineRecord = {
	readonly kind: "selected-source";
	readonly logicalLine: number;
	readonly text: string;
	readonly origin: PhysicalLineOrigin;
	readonly selector: IncludeLineSelector;
	readonly columnMap: IdentityColumnMap;
};

export type TransformedSourceLineRecord = {
	readonly kind: "transformed-source";
	readonly logicalLine: number;
	readonly text: string;
	readonly originText: string;
	readonly origin: PhysicalLineOrigin;
	readonly transform: IncludeLineTransform;
	readonly columnMap: ColumnMap;
};

export type GeneratedControlLineRecord = {
	readonly kind: "generated-control";
	readonly logicalLine: number;
	readonly text: string;
	readonly generatedKind: "leveloffset-push" | "leveloffset-pop";
	readonly relatedInclude?: IncludeDirectiveEvidence | undefined;
};

export type DegradedLineRecord = {
	readonly kind: "degraded";
	readonly logicalLine: number;
	readonly text: string;
	readonly evidence: ReaderLineCursor;
	readonly diagnostic: BookEntryDiagnostic;
};

export type LogicalLineRecord =
	| SourcePreservingLineRecord
	| SelectedSourceLineRecord
	| TransformedSourceLineRecord
	| GeneratedControlLineRecord
	| DegradedLineRecord;

export type SourceFileRecord = {
	readonly absolutePath: string;
	readonly relativePath: string;
	readonly text: string;
	readonly lineTable: LineTable;
};

export type SourceAwareLogicalDocument = {
	readonly entryPath: string;
	readonly documentRoot: string;
	readonly logicalText: string;
	readonly lines: readonly LogicalLineRecord[];
	readonly sourceFiles: readonly SourceFileRecord[];
	readonly diagnostics: readonly BookEntryDiagnostic[];
	readonly optionalIncludes?: readonly IncludeDirectiveEvidence[] | undefined;
};

export function assertSourceAwareLogicalDocumentInvariants(
	document: SourceAwareLogicalDocument,
): void {
	const logicalLineCount =
		document.logicalText === "" && document.lines.length === 0
			? 0
			: document.logicalText.split(/\r?\n/u).length;
	if (logicalLineCount !== document.lines.length) {
		throw constructionError(
			"logical-line-record.count-mismatch",
			`Logical text line count ${logicalLineCount} does not match logical line record count ${document.lines.length}.`,
		);
	}
	const sourceFilesByPath = new Map(
		document.sourceFiles.map((sourceFile) => [
			sourceFile.absolutePath,
			sourceFile,
		]),
	);
	for (const [index, record] of document.lines.entries()) {
		if (record.logicalLine !== index + 1) {
			throw constructionError(
				"logical-line-record.count-mismatch",
				`Logical line record ${record.logicalLine} is not at index ${index + 1}.`,
			);
		}
		if (!("origin" in record)) {
			continue;
		}
		const sourceFile = sourceFilesByPath.get(record.origin.absolutePath);
		if (!sourceFile) {
			throw constructionError(
				"line-origin.source-file-missing",
				`Line origin references a source file missing from source file table: ${record.origin.absolutePath}.`,
			);
		}
		if (
			record.origin.sourceLine < 1 ||
			record.origin.sourceLine > sourceFile.lineTable.lines.length
		) {
			throw constructionError(
				"line-origin.source-line-out-of-range",
				`Line origin sourceLine ${record.origin.sourceLine} is outside origin file line table for ${record.origin.relativePath}.`,
			);
		}
	}
}
