import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAsciidoctorAdapter } from "./asciidoctor-adapter";
import { constructionError } from "./book-entry/diagnostics";
import { preprocessBookEntryWithOfficialReader } from "./book-entry/official-reader-preprocessor";
import { registerSourceAwareDocumentForRecovery } from "./book-entry/source-aware-coordinate";
import type { AbundantDocument, ParseAbundantTreeOptions } from "./model";
import { parseAsciidoctorDocument } from "./parser-core";
import { buildLineTable } from "./source-lines";

export function parseAbundantTree(
	options: ParseAbundantTreeOptions,
): AbundantDocument {
	const sourcePath = resolve(options.sourcePath);
	const adapter = createAsciidoctorAdapter();

	if (options.mode === "book-entry") {
		if (!options.documentRoot) {
			throw new Error("Book-entry mode requires documentRoot.");
		}
		const sourceAwareDocument = preprocessBookEntryWithOfficialReader({
			adapter,
			sourcePath,
			documentRoot: options.documentRoot,
		});
		const constructionDiagnostic = sourceAwareDocument.diagnostics.find(
			(diagnostic) => diagnostic.level === "error",
		);
		if (constructionDiagnostic) {
			throw constructionError(
				constructionDiagnostic.code,
				constructionDiagnostic.message,
				constructionDiagnostic.source,
			);
		}
		registerSourceAwareDocumentForRecovery(sourceAwareDocument);
		const lineTable = buildLineTable(sourceAwareDocument.logicalText);
		return parseAsciidoctorDocument({
			officialDocument: adapter.loadSource(sourceAwareDocument.logicalText),
			adapter,
			lineTable,
			sourcePath,
			sourceText: sourceAwareDocument.logicalText,
			sourceFiles: sourceAwareDocument.sourceFiles.map((sourceFile) => ({
				relativePath: sourceFile.relativePath,
				raw: sourceFile.text,
			})),
			mode: "book-entry",
		});
	}
	if (options.mode !== undefined && options.mode !== "single-file") {
		throw new Error(`Unsupported mode: ${String(options.mode)}.`);
	}

	const source = readFileSync(sourcePath, "utf8");
	const lineTable = buildLineTable(source);
	return parseAsciidoctorDocument({
		officialDocument: adapter.loadFile(sourcePath),
		adapter,
		lineTable,
		sourcePath,
		sourceText: source,
		mode: "single-file",
		sourceSurfacePath: sourcePath,
	});
}
