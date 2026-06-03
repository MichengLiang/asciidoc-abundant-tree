import type { SourceSpan } from "../model";

export type BookEntryConstructionErrorCode =
	| "include.missing-target"
	| "include.outside-document-root"
	| "include.cycle"
	| "include.unsupported-attrlist"
	| "logical-line-origin.count-mismatch"
	| "line-origin.source-file-missing"
	| "line-origin.source-line-out-of-range";

export type BookEntryDiagnostic = {
	readonly level: "error";
	readonly code: BookEntryConstructionErrorCode;
	readonly message: string;
	readonly source?: SourceSpan;
};

export class BookEntryConstructionError extends Error {
	readonly code: BookEntryConstructionErrorCode;
	readonly diagnostic: BookEntryDiagnostic;

	constructor(diagnostic: BookEntryDiagnostic) {
		super(`${diagnostic.code}: ${diagnostic.message}`);
		this.name = "BookEntryConstructionError";
		this.code = diagnostic.code;
		this.diagnostic = diagnostic;
	}
}

export function constructionError(
	code: BookEntryConstructionErrorCode,
	message: string,
	source?: SourceSpan,
): BookEntryConstructionError {
	return new BookEntryConstructionError({
		level: "error",
		code,
		message,
		...(source ? { source } : {}),
	});
}
