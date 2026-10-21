import { officialDelimiter } from "./official-delimiter";
import { isLineComment, type LineTable, lineText } from "./source-lines";

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
// rx.js 214、224 行
const BlockAnchorRx = new RegExp(
	String.raw`^\[\[(?:|([${CC_ALPHA}_:][${CC_WORD}\-:.]*)(?:, *(.+))?)\]\]$`,
	"u",
);
const BlockAttributeListRx = new RegExp(
	String.raw`^\[(|[${CC_WORD}.#%{,"'].*)\]$`,
	"u",
);

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
		if (!isLineComment(text)) {
			last = line;
		}
	}
	return last;
}

// 列表条目的文字读到哪一行：markerLine 是条目的标记行。紧挨着的内容官方以 text_only 读（parser.js 1985-2011 行）：
// 先读掉块的 metadata，text_only 时只认锚点行、属性列表行与行注释（parseBlockMetadataLine，2798-2880 行；`.标题`
// 此时不是 metadata，是文字），下面的段落在列表里读，再并进条目的文字（foldFirst），metadata 随之丢弃。
// 紧挨着的不是段落时没有续行，条目的文字只有标记行。
export function listItemTextEndLine(
	lineTable: LineTable,
	markerLine: number,
): number {
	let line = markerLine + 1;
	while (
		line <= lineTable.lines.length &&
		isTextOnlyMetadata(lineText(lineTable, line).trimEnd())
	) {
		line += 1;
	}
	const text = lineText(lineTable, line).trimEnd();
	if (
		line > lineTable.lines.length ||
		text === "" ||
		text === "+" ||
		terminatesParagraph(text, true)
	) {
		return markerLine;
	}
	return paragraphEndLine(lineTable, line, true);
}

function isTextOnlyMetadata(text: string): boolean {
	if (text.startsWith("[[")) {
		return text.endsWith("]]") && BlockAnchorRx.test(text);
	}
	if (text.startsWith("[")) {
		return text.endsWith("]") && BlockAttributeListRx.test(text);
	}
	return isLineComment(text);
}

function terminatesParagraph(text: string, breakAtList: boolean): boolean {
	return (
		officialDelimiter(text) !== undefined ||
		(text.startsWith("[") && BlockAttributeLineRx.test(text)) ||
		(breakAtList && AnyListRx.test(text))
	);
}
