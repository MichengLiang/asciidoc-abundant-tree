import { createAsciidoctorAdapter } from "./asciidoctor-adapter";
import type { AbundantDocument, ParseAbundantTreeOptions } from "./model";

export function parseAbundantTree(
	options: ParseAbundantTreeOptions,
): AbundantDocument {
	const adapter = createAsciidoctorAdapter();

	throw new Error(
		`parseAbundantTree is not implemented yet for ${options.sourcePath} using @asciidoctor/core ${adapter.parserVersion}`,
	);
}
