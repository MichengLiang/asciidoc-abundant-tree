import { dirname, resolve } from "node:path";
import { stringify } from "yaml";
import { parseAbundantTree, rdf12 } from "../index";
import { readBusinessNodes } from "./graph-reader";
import type { ExportWarning } from "./payload-parser";
import { collectAnimationScriptTextBySectionId } from "./script-elements";
import { makeAnimationYamlDocument } from "./yaml-shape";

export type ExportAnimationYamlOptions = {
	readonly sourcePath: string;
	readonly documentRoot?: string;
};

export type ExportAnimationYamlResult = {
	readonly yaml: string;
	readonly warnings: readonly ExportWarning[];
};

export function exportAnimationYaml(
	options: ExportAnimationYamlOptions,
): ExportAnimationYamlResult {
	const sourcePath = resolve(options.sourcePath);
	const documentRoot = resolve(options.documentRoot ?? dirname(sourcePath));
	const warnings: ExportWarning[] = [];
	const document = parseAbundantTree({
		sourcePath,
		mode: "book-entry",
		documentRoot,
	});
	const projection = rdf12(document, { documentRoot });
	const nodes = readBusinessNodes({
		graph: projection.graph,
		scriptTextById: collectAnimationScriptTextBySectionId(document),
		warnings,
	});
	const yamlDocument = makeAnimationYamlDocument({
		sourceBook: sourcePath,
		documentRoot,
		nodes,
		warnings,
	});

	return {
		yaml: stringify(yamlDocument, {
			aliasDuplicateObjects: false,
			lineWidth: 0,
		}),
		warnings,
	};
}
