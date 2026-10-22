import type { LineSpan } from "./model";
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
// rx.js 340 行
const DescriptionListRx =
	/^(?!\/\/[^/])[ \t]*([^ \t].*?)(:::{0,2}|;;)(?:$|[ \t]+([\s\S]*)$)/;
// rx.js 238、177 行
const BlockTitleRx = /^\.(\.?[^ \t.].*)$/;
const AttributeEntryRx = new RegExp(
	String.raw`^:(!?[${CC_WORD}][^:]*):(?:[ \t]+(.*))?$`,
	"u",
);

// startLine 是段落读进的第一行；返回读进的最后一行。官方跳过的行注释不打断段落，也不算读进的行。
// breakAtList 对应官方在列表里读段落：列表标记行也让段落停下。
// skipsLineComments 为 false 时行注释是段落的行：普通方式读缩进的段落（parser.js 1041-1046 行）。
export function paragraphEndLine(
	lineTable: LineTable,
	startLine: number,
	breakAtList: boolean,
	skipsLineComments = true,
): number {
	let last = startLine;
	for (let line = startLine + 1; line <= lineTable.lines.length; line += 1) {
		// 官方 Reader 交出的行去掉了行尾空白。
		const text = lineText(lineTable, line).trimEnd();
		if (text === "" || text === "+" || terminatesParagraph(text, breakAtList)) {
			break;
		}
		if (!(skipsLineComments && isLineComment(text))) {
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

export type DescriptionText = {
	// 文字所在的行：术语行写了文字时从术语行起，否则从并进的段落起。
	span: LineSpan;
	// 文字在第一行从第几列起（按码点计，从 1 起）：术语行上从分隔符之后的第一个字符起；文字另起一行时从行首起，
	// 缩进留在范围里，和后面几行一样（标题字段的值据此去掉公共缩进）。
	startColumn: number;
	// 术语行与并进的段落之间，官方当作 metadata 读掉、随段落丢弃的行。
	discardedSpan?: LineSpan;
	// 普通方式读的缩进段落不跳过行注释，注释行是文字。
	readsLineComments: boolean;
};

// 描述的文字在哪些行（09 号书「描述的文字」）：termLine 是描述所属的最后一个术语的行。
// 逐句对照官方 Parser.parseListItem（parser.js 1880-2018 行）与 readLinesForListItem（2035-2263 行）。
// 紧挨着的那一块是不是段落，官方在 nextBlock 里还要分出 admonition、引语、块宏、分隔线等许多写法；
// 它们不是段落就不会并掉，作为描述的子块留在官方 AST 里，坐标正是那一行，所以由调用方用 occupied 回答，
// 不移植 nextBlock 的分支。没有文字时返回 undefined。
export function descriptionText(
	lineTable: LineTable,
	termLine: number,
	occupied: (line: number) => boolean,
): DescriptionText | undefined {
	const termText = lineText(lineTable, termLine).trimEnd();
	const itemText = DescriptionListRx.exec(termText)?.[3];
	const hasText = Boolean(itemText);
	// 第 3 组一直取到行尾，起点就是行长减去它的长度。
	const termTextColumn =
		[...termText].length - [...(itemText ?? "")].length + 1;
	const lastLine = lineTable.lines.length;
	let line = termLine + 1;
	if (!hasText) {
		// readLinesForListItem 丢掉没有文字的术语后面的空行（2218 行）。
		while (line <= lastLine && lineText(lineTable, line).trim() === "") {
			line += 1;
		}
	}
	// 术语行写了文字时，描述列表不改用 text_only（1994 行），metadata 按普通方式读。
	while (
		line <= lastLine &&
		isDescriptionMetadata(lineText(lineTable, line).trimEnd(), !hasText)
	) {
		line += 1;
	}
	const text = lineText(lineTable, line).trimEnd();
	const folds =
		line <= lastLine &&
		text !== "" &&
		text !== "+" &&
		!terminatesParagraph(text, true) &&
		!occupied(line);
	if (!folds) {
		return hasText
			? {
					span: { startLine: termLine, endLine: termLine },
					startColumn: termTextColumn,
					readsLineComments: false,
				}
			: undefined;
	}
	const readsLineComments =
		hasText && /^[ \t]/u.test(lineText(lineTable, line));
	return {
		span: {
			startLine: hasText ? termLine : line,
			endLine: paragraphEndLine(lineTable, line, true, !readsLineComments),
		},
		startColumn: hasText ? termTextColumn : 1,
		...(hasText && line > termLine + 1
			? { discardedSpan: { startLine: termLine + 1, endLine: line - 1 } }
			: {}),
		readsLineComments,
	};
}

// parseBlockMetadataLine（2798-2880 行）。块属性行与锚点行不在这里：它们在描述列表里打断条目（2085-2120 行），
// 下面紧跟的是嵌套列表时才留下，那时紧挨着的块是列表，没有续行；二者都由 terminatesParagraph 拦下。
function isDescriptionMetadata(text: string, textOnly: boolean): boolean {
	if (isLineComment(text)) {
		return true;
	}
	return (
		!textOnly &&
		((text.startsWith(".") && BlockTitleRx.test(text)) ||
			(text.startsWith(":") && AttributeEntryRx.test(text)))
	);
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

// 术语与描述之间的分隔符：照官方 DescriptionListRx 取术语，术语里可以带不跟空白的 `::`（如 `std::string`）。
// index 是分隔符在这一行里的位置（UTF-16）。
export function descriptionListDelimiter(
	text: string,
): { raw: string; index: number } | undefined {
	const match = DescriptionListRx.exec(text);
	if (!match?.[1] || !match[2]) {
		return undefined;
	}
	const indent = text.length - text.replace(/^[ \t]*/u, "").length;
	return { raw: match[2], index: indent + match[1].length };
}

function terminatesParagraph(text: string, breakAtList: boolean): boolean {
	return (
		officialDelimiter(text) !== undefined ||
		(text.startsWith("[") && BlockAttributeLineRx.test(text)) ||
		(breakAtList && AnyListRx.test(text))
	);
}
