import { createAsciidoctorAdapter } from "./asciidoctor-adapter";
import type {
	AbundantDocument,
	ParseAbundantTreeFromSourceOptions,
} from "./model";
import { parseAsciidoctorDocument } from "./parser-core";
import { browserSourceIdentity } from "./source-identity-browser";
import { buildLineTable } from "./source-lines";

const DEFAULT_BROWSER_SOURCE_PATH = "document.adoc";

export function parseAbundantTreeFromSource(
	options: ParseAbundantTreeFromSourceOptions,
): AbundantDocument {
	const sourcePath = options.sourcePath ?? DEFAULT_BROWSER_SOURCE_PATH;
	const adapter = createAsciidoctorAdapter();
	const officialDocument = adapter.loadSource(options.sourceText);
	const lineTable = buildLineTable(options.sourceText);

	return parseAsciidoctorDocument({
		officialDocument,
		adapter,
		lineTable,
		sourcePath,
		sourceText: options.sourceText,
		mode: "single-file",
		sourceIdentity: browserSourceIdentity,
	});
}
