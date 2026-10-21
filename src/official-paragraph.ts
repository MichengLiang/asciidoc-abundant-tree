import { officialDelimiter } from "./official-delimiter";
import { type LineTable, lineText } from "./source-lines";

// 官方读一个段落读到哪一行停（09 号书「官方怎样读段落」）。逐句移植 aat 实际运行的 Asciidoctor.js 4.1.1：
// Parser.readParagraphLines（packages/core/src/parser.js 3018-3047 行，Compliance.blockTerminatesParagraph 取默认的
// 开启）与它交给 Reader#readLinesUntil 的段落选项（reader.js 498-531 行）。官方没有导出 Parser，正则照 rx.js 移植。
const CC_ALPHA = String.raw`\p{Alphabetic}`;
const CC_WORD = String.raw`\p{Alphabetic}\p{N}\p{Pc}`;
// rx.js 229 行
const BlockAttributeLineRx = new RegExp(
	String.raw`^\[(?:|[${CC_WORD}.#%{,"'].*|\[(?:|[${CC_ALPHA}_:][${CC_WORD}\-:.]*(?:, *.+)?)\])\]$`,
	"u",
);
// rx.js 306 行
const AnyListRx =
	/^(?:[ \t]*(?:-|\*\**|\.\.*|•|\d+\.|[a-zA-Z]\.|[IVXivx]+\))[ \t]|(?!\/\/[^/])[ \t]*[^ \t].*?(?::::{0,2}|;;)(?:$|[ \t])|<(?:\d+|\.)>[ \t])/;

// startLine 是段落读进的第一行；返回读进的最后一行。官方跳过的行注释不打断段落，也不算读进的行。
// breakAtList 对应官方在列表里读段落：列表标记行也让段落停下。
export function paragraphEndLine(
	lineTable: LineTable,
	startLine: number,
	breakAtList: boolean,
): number {
	let last = startLine;
	for (let line = startLine + 1; line <= lineTable.lines.length; line += 1) {
		// 官方 Reader 交出的行去掉了行尾空白。
		const text = lineText(lineTable, line).trimEnd();
		if (text === "" || text === "+" || terminatesParagraph(text, breakAtList)) {
			break;
		}
		if (!(text.startsWith("//") && !text.startsWith("///"))) {
			last = line;
		}
	}
	return last;
}

function terminatesParagraph(text: string, breakAtList: boolean): boolean {
	return (
		officialDelimiter(text) !== undefined ||
		(text.startsWith("[") && BlockAttributeLineRx.test(text)) ||
		(breakAtList && AnyListRx.test(text))
	);
}
