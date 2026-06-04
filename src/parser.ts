import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAsciidoctorAdapter } from "./asciidoctor-adapter";
import { buildLogicalSource } from "./book-entry/logical-source-builder";
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
		const logicalSource = buildLogicalSource({
			sourcePath,
			documentRoot: options.documentRoot,
		});
		const lineTable = buildLineTable(logicalSource.logicalText);
		return parseAsciidoctorDocument({
			officialDocument: adapter.loadSource(logicalSource.logicalText),
			adapter,
			lineTable,
			sourcePath,
			sourceText: logicalSource.logicalText,
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
