import createAsciidoctor from "@asciidoctor/core";
import { parseFragment } from "parse5";

type AsciidoctorAdapter = {
	parserVersion: string;
	loadFile(sourcePath: string): unknown;
	parseHtmlFragment(html: string): unknown;
};

export function createAsciidoctorAdapter(): AsciidoctorAdapter {
	const processor = createAsciidoctor();

	return {
		parserVersion: processor.getVersion(),
		loadFile(sourcePath) {
			return processor.loadFile(sourcePath, {
				safe: "secure",
				sourcemap: true,
				to_file: false,
			});
		},
		parseHtmlFragment(html) {
			return parseFragment(html);
		},
	};
}
