import type { LogicalLineRecord } from "./line-origin-model";

export type ParserSafeLogicalText = {
	readonly text: string;
	readonly lineRecords: readonly LogicalLineRecord[];
};

export function buildParserSafeLogicalText(
	lineRecords: readonly LogicalLineRecord[],
): ParserSafeLogicalText {
	const text = lineRecords
		.map((record) =>
			record.kind === "source-preserving" && record.escapedInclude
				? `\\${record.text}`
				: record.text,
		)
		.join("\n");
	return { text, lineRecords };
}
