import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { BookEntryDiagnostic } from "./diagnostics";
import { parseIncludeAttributes } from "./include-attribute-model";
import {
	normalizeDocumentRoot,
	relativePathWithinDocumentRoot,
	resolveIncludeTarget,
} from "./path-boundary";

export type ReaderBoundaryDiagnosticInput = {
	readonly target: string;
	readonly attrlist: string;
	readonly containingFilePath: string;
	readonly documentRoot: string;
	readonly missing: boolean;
};

export function readerPreprocessingOptions(options: {
	readonly sourcePath: string;
	readonly documentRoot: string;
	readonly attributes?: Record<string, unknown> | undefined;
}): {
	readonly sourcePath: string;
	readonly baseDir: string;
	readonly attributes?: Record<string, unknown> | undefined;
} {
	return {
		sourcePath: resolve(options.sourcePath),
		baseDir: normalizeDocumentRoot(options.documentRoot),
		...(options.attributes ? { attributes: options.attributes } : {}),
	};
}

export function classifyReaderBoundaryDiagnostic(
	input: ReaderBoundaryDiagnosticInput,
): BookEntryDiagnostic {
	if (isUriTarget(input.target)) {
		return {
			level: "error",
			code: "include.uri-target-unsupported",
			message: `URI include target is unsupported in book-entry preprocessing: ${input.target}.`,
		};
	}
	if (input.target.includes("{")) {
		return {
			level: "error",
			code: "include.target-unresolved-attribute",
			message: `Include target contains an unresolved attribute reference: ${input.target}.`,
		};
	}
	const resolved = resolveIncludeTarget(input.containingFilePath, input.target);
	try {
		relativePathWithinDocumentRoot(input.documentRoot, resolved);
	} catch {
		return {
			level: "error",
			code: "include.outside-document-root",
			message: `Resolved include path is outside documentRoot: ${resolved}.`,
		};
	}
	const attributes = parseIncludeAttributes(input.attrlist);
	if (!input.missing && attributes.classification === "unmapped") {
		return {
			level: "error",
			code: "include.official-reader-error",
			message: `Official Reader reported an include error for target: ${input.target}.`,
		};
	}
	if (input.missing || !existsSync(resolved)) {
		return {
			level: "error",
			code: "include.missing-target",
			message: `Include target file does not exist: ${resolved}.`,
		};
	}
	return {
		level: "error",
		code: "include.official-reader-error",
		message: `Official Reader reported an include error for target: ${input.target}.`,
	};
}

export function isUriTarget(target: string): boolean {
	return /^[a-z][a-z0-9+.-]*:/iu.test(target);
}
