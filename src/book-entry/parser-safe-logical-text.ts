import type { LogicalLineRecord } from "./line-origin-model";
import {
	conditionalDirectivePattern,
	includeDirectivePattern,
} from "./reader-directive-patterns";

export type ParserSafeLogicalText = {
	readonly text: string;
	readonly lineRecords: readonly LogicalLineRecord[];
};

// loadSource 会把逻辑文本再交给 Reader 预处理一遍。第一次读取已经消费了所有真正的指令，它输出的行里仍然
// 长得像指令的，按构造都是字面内容：非 AsciiDoc 文件里写着的，以及被转义的 include 与条件指令（Reader 去掉
// 了反斜杠）。加回一个反斜杠，第二次预处理把它去掉，得到与第一次相同的行。
// 本身以反斜杠开头的字面行（如 .py 里写着 `\include::x[]`）表达不了：第二次预处理总会去掉一个反斜杠。
function needsEscape(text: string): boolean {
	const match =
		includeDirectivePattern.exec(text) ??
		conditionalDirectivePattern.exec(text);
	return match?.groups?.escape === "";
}

export function buildParserSafeLogicalText(
	lineRecords: readonly LogicalLineRecord[],
): ParserSafeLogicalText {
	const text = lineRecords
		.map((record) =>
			needsEscape(record.text) ? `\\${record.text}` : record.text,
		)
		.join("\n");
	return { text, lineRecords };
}
