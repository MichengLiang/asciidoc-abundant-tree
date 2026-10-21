import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAsciidoctorFileAdapter } from "./asciidoctor-file-adapter";
import { constructionError } from "./book-entry/diagnostics";
import { preprocessBookEntryWithOfficialReader } from "./book-entry/official-reader-preprocessor";
import { registerSourceAwareDocumentForRecovery } from "./book-entry/source-aware-coordinate";
import type { AbundantDocument, ParseAbundantTreeOptions } from "./model";
import { parseAsciidoctorDocument } from "./parser-core";
import { nodeSourceIdentity } from "./source-identity-node";
import { buildLineTable } from "./source-lines";

export async function parseAbundantTree(
	options: ParseAbundantTreeOptions,
): Promise<AbundantDocument> {
	const sourcePath = resolve(options.sourcePath);
	const adapter = createAsciidoctorFileAdapter();

	if (options.mode === "book-entry") {
		if (!options.documentRoot) {
			throw new Error("Book-entry mode requires documentRoot.");
		}
		const sourceAwareDocument = await preprocessBookEntryWithOfficialReader({
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
		const document = await parseAsciidoctorDocument({
			officialDocument: await adapter.loadSource(
				sourceAwareDocument.logicalText,
			),
			adapter,
			lineTable,
			sourcePath,
			sourceText: sourceAwareDocument.logicalText,
			sourceFiles: sourceAwareDocument.sourceFiles.map((sourceFile) => ({
				relativePath: sourceFile.relativePath,
				raw: sourceFile.text,
			})),
			mode: "book-entry",
			sourceIdentity: nodeSourceIdentity,
		});
		// 构造时的 warning（如 origin-map.selection-mismatch）不阻止文档成立，但要交给文档：下游拿到缺失的
		// 坐标时，靠它知道是哪一处 include 造成的（10 号书「Warning 的去向」）。
		document.toolDiagnostics.unshift(
			...sourceAwareDocument.diagnostics.filter(
				(diagnostic) => diagnostic.level === "warning",
			),
		);
		return document;
	}
	if (options.mode !== undefined && options.mode !== "single-file") {
		throw new Error(`Unsupported mode: ${String(options.mode)}.`);
	}

	const source = readFileSync(sourcePath, "utf8");
	const lineTable = buildLineTable(source);
	return parseAsciidoctorDocument({
		officialDocument: await adapter.loadFile(sourcePath),
		adapter,
		lineTable,
		sourcePath,
		sourceText: source,
		mode: "single-file",
		sourceIdentity: nodeSourceIdentity,
		sourceSurfacePath: sourcePath,
	});
}
