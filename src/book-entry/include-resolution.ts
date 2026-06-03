import type { SourceSpan } from "../model";
import { type LineTable, sourceSpanForRange } from "../source-lines";
import { constructionError } from "./diagnostics";

export type IncludeDirective =
	| {
			readonly kind: "include";
			readonly target: string;
			readonly sourceSpan: SourceSpan;
	  }
	| {
			readonly kind: "ordinary";
	  };

const includeDirectivePattern = /^(\s*)include::([^[]+)\[([^\]]*)\]\s*$/u;

export function parseIncludeDirective(
	lineTable: LineTable,
	lineNumber: number,
): IncludeDirective {
	const line = lineTable.lines[lineNumber - 1];
	if (!line) {
		return { kind: "ordinary" };
	}
	if (line.text.trimStart().startsWith("\\include::")) {
		return { kind: "ordinary" };
	}
	const match = includeDirectivePattern.exec(line.text);
	if (!match) {
		return { kind: "ordinary" };
	}
	const [, leadingWhitespace = "", target = "", attrlist = ""] = match;
	const sourceSpan = sourceSpanForRange(
		lineTable,
		lineNumber,
		leadingWhitespace.length,
		line.text.trimStart(),
	);
	if (attrlist.trim() !== "") {
		throw constructionError(
			"include.unsupported-attrlist",
			`Include directive uses unsupported attrlist '${attrlist}'.`,
			sourceSpan,
		);
	}
	return {
		kind: "include",
		target,
		sourceSpan,
	};
}
