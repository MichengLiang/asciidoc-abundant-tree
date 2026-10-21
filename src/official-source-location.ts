import { type AbstractBlock, Cursor } from "@asciidoctor/core";
import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import { asciidocCellDocuments, childBlocksOf } from "./official-block-utils";
import {
	isLineComment,
	type LineTable,
	lineText,
	quotedLineTable,
} from "./source-lines";

const takenFromParent = new WeakSet<AsciidoctorBlock>();
const borrowedFromChild = new WeakSet<AsciidoctorBlock>();
const markdownQuotes = new WeakSet<AsciidoctorBlock>();
const quoteDepths = new WeakMap<AsciidoctorBlock, number>();
const cellLineMappers = new WeakMap<
	AsciidoctorBlock,
	(line: number) => number
>();

// 官方块的坐标有四处要补正，都在官方块上改：遍历、投影与行内扫描都从官方块读坐标，改在这一处，它们读到的就是同一个。
// - Asciidoctor 在部导言里新建两种没有 source location 的开放块与段落（09 号书「官方合成的块」）。照官方给合成的
//   preamble 补坐标的做法（parser.js 632-633 行：preamble.sourceLocation = preamble.blocks[0].sourceLocation）补上。
// - markdown 引语的子块带的是引语内部的相对行号（09 号书「段落写法的引语」），换算成源行。
// - 表格里有行注释时，单元格与 a| 单元格里的块行号偏小（09 号书「表格里的行注释」），换算成源行。
// - callout 列表的坐标落在它的最后一条上（09 号书「Callout 列表的坐标」），改取第一条的。
export function completeOfficialSourceLocations(
	officialDocument: AsciidoctorBlock,
	lineTable: LineTable,
): void {
	for (const block of childBlocksOf(officialDocument)) {
		complete(block, undefined, lineTable, 0);
	}
}

// 与父块共用锚点行的子块：[partintro] 段落接过的文本行、markdown 引语的第一行内容。锚点之前的块属性行（如 [partintro]）
// 属于父块。合成的容器反过来借子块的坐标，属性行仍属于作者写下的那个子块，所以要分开记。
export function takesParentSourceLocation(block: AsciidoctorBlock): boolean {
	return takenFromParent.has(block);
}

// 合成的容器借的是第一个子块的锚点行，那一行可能是列表项或分隔符，不是容器的“第一行源文”。
export function borrowsChildSourceLocation(block: AsciidoctorBlock): boolean {
	return borrowedFromChild.has(block);
}

export function isMarkdownQuote(block: AsciidoctorBlock): boolean {
	return markdownQuotes.has(block);
}

// 块套在几层 markdown 引语里。官方读它时，每一层都已去掉一个 `> `（source-lines 的 quotedLineTable）。
export function markdownQuoteDepth(block: AsciidoctorBlock): number {
	return quoteDepths.get(block) ?? 0;
}

// 普通单元格不是块，没有 source location 可补；它带的行号是表格读取器的编号（跳过了行注释，表格在 markdown 引语里时
// 还是相对的），按表格的换算取源行。
export function cellSourceLine(table: AsciidoctorBlock, line: number): number {
	return cellLineMappers.get(table)?.(line) ?? line;
}

// 官方认 markdown 引语的条件（parser.js 1102 行）：官方读到的段落第一行以 `> ` 开头。用它建出的 quote 是复合块；
// [quote] 隐身段落即使文字以 `> ` 开头，也是 simple 的。套在引语里的 `____` 引语，源行以 `> ` 开头，但官方读到的
// 是去掉一层前缀的 `____`，所以要按块所在深度的视图判断。
function opensMarkdownQuote(block: AsciidoctorBlock, view: LineTable): boolean {
	const anchor = block.getSourceLocation?.()?.getLineNumber?.();
	return (
		anchor !== undefined &&
		block.getContext?.() === "quote" &&
		block.getContentModel?.() === "compound" &&
		lineText(view, anchor).startsWith("> ")
	);
}

function complete(
	block: AsciidoctorBlock,
	parent: AsciidoctorBlock | undefined,
	lineTable: LineTable,
	depth: number,
): void {
	// [partintro] 段落的文本行被交给新建的段落子块（parser.js 566-575 行），它就在父块的位置上。
	if (
		!block.getSourceLocation?.() &&
		block.getContext?.() === "paragraph" &&
		parent?.getContext?.() === "open"
	) {
		locate(block, parent.getSourceLocation?.());
		takenFromParent.add(block);
	}
	if (depth > 0) {
		quoteDepths.set(block, depth);
	}
	const location = block.getSourceLocation?.();
	const anchor = location?.getLineNumber?.();
	const view = quotedLineTable(lineTable, depth);
	if (location && anchor !== undefined && opensMarkdownQuote(block, view)) {
		markdownQuotes.add(block);
		// 官方为去掉 `> ` 的行新建的 Reader 不带游标（parser.js 1121 行，Ruby 版 2.0.26 相同）：引语里的块的行号从 1
		// 数起、没有文件。去掉前缀不改变行数，读引语这个段落时跳过的行注释也不在这些行里，所以相对的第 n 行就是从锚点行
		// 往下、按引语所在深度的视图跳过行注释数到的第 n 行。
		relocateReader(
			block,
			location,
			anchor,
			numbering(
				lineTable,
				anchor,
				1,
				(line) => !isLineComment(lineText(view, line)),
			),
			quotedLineTable(lineTable, depth + 1),
		);
	}
	// 官方读表格先去掉行注释，再从内容的第一行起逐行编号（parser.js 1266-1276 行：readLinesUntil 带
	// skip_line_comments，交给以分隔符下一行为游标的新 Reader），注释之后的行号都偏小。在引语里或外层表格里的表格，
	// 已在外层换算时按嵌套的读取器换过。
	if (
		location &&
		anchor !== undefined &&
		block.getContext?.() === "table" &&
		!cellLineMappers.has(block)
	) {
		relocateReader(
			block,
			location,
			anchor,
			numbering(
				lineTable,
				anchor + 1,
				anchor + 1,
				(line) => !isLineComment(lineText(view, line)),
			),
			view,
		);
	}
	const children = childBlocksOf(block);
	const childDepth = markdownQuotes.has(block) ? depth + 1 : depth;
	for (const child of children) {
		complete(child, block, lineTable, childDepth);
	}
	for (const cellBlock of cellBlocksOf(block)) {
		complete(cellBlock, undefined, lineTable, childDepth);
	}
	// 官方建完块取上一次 mark 的位置（parser.js 1443 行），parseCalloutList 每读一条后续条目都 mark 一次
	// （1812-1862 行），所以列表落在最后一条上。条目自己的坐标是对的；在引语里时，上面已经换算过。
	if (block.getContext?.() === "colist") {
		locate(block, children[0]?.getSourceLocation?.());
	}
	// 部的第一个块被包进新建的 partintro 开放块（parser.js 554-565、587-596 行）。
	if (!block.getSourceLocation?.() && block.getContext?.() === "open") {
		const location = children
			.find((child) => child.getSourceLocation?.())
			?.getSourceLocation?.();
		if (location) {
			locate(block, location);
			borrowedFromChild.add(block);
		}
	}
}

// 一个读取器的编号：它交出的行是源行里 visible 的那些，第一条编号为 first、从源行 from 开始，之后逐行累加。
type Numbering = {
	readonly toSource: (line: number) => number;
	readonly visible: (line: number) => boolean;
};

function numbering(
	lineTable: LineTable,
	from: number,
	first: number,
	visible: (line: number) => boolean,
): Numbering {
	return {
		visible,
		toSource: (line) => {
			let counted = first - 1;
			for (let source = from; source <= lineTable.lines.length; source += 1) {
				if (visible(source)) {
					counted += 1;
					if (counted === line) {
						return source;
					}
				}
			}
			return Math.max(from, lineTable.lines.length);
		},
	};
}

// container 的读取器只交出部分源行、行号却逐行累加：它读出的块都带这套编号，按 reader 换成源行。同一个读取器读出的
// 块一并换算：嵌套的分隔块、列表项、a| 单元格里的块（单元格文档接着单元格的游标读，table.js 386、432 行）。嵌套的表格
// 自己又跳过一次它视图里的行注释，它的单元格按它自己的编号换算。嵌套的 markdown 引语另有自己的 Reader，它的子块等
// complete 走到它时从它换算后的锚点行数起；view 是读出这些块的视图，用来认出它。
function relocateReader(
	container: AsciidoctorBlock,
	location: NonNullable<
		ReturnType<NonNullable<AsciidoctorBlock["getSourceLocation"]>>
	>,
	anchor: number,
	reader: Numbering,
	view: LineTable,
): void {
	if (container.getContext?.() === "table") {
		cellLineMappers.set(container, reader.toSource);
	}
	const relocate = (block: AsciidoctorBlock): void => {
		for (const child of [...childBlocksOf(block), ...cellBlocksOf(block)]) {
			const relative = child.getSourceLocation?.()?.getLineNumber?.();
			const line =
				relative === undefined ? undefined : reader.toSource(relative);
			if (relative !== undefined && line !== undefined) {
				locate(
					child,
					new Cursor(
						location.getFile?.(),
						location.getDirectory?.(),
						location.getPath?.(),
						line,
					),
				);
				// markdown 引语的第一行内容就在引语的锚点行上。
				if (line === anchor) {
					takenFromParent.add(child);
				}
				if (child.getContext?.() === "table") {
					relocateReader(
						child,
						location,
						line,
						numbering(
							view,
							line + 1,
							relative + 1,
							(source) =>
								reader.visible(source) &&
								!isLineComment(lineText(view, source)),
						),
						view,
					);
					continue;
				}
			}
			if (!opensMarkdownQuote(child, view)) {
				relocate(child);
			}
		}
	};
	relocate(container);
}

// a| 单元格里的块：官方用单元格的游标读它们，它们与表格读自同一个 Reader，坐标的补正一样适用。
function cellBlocksOf(block: AsciidoctorBlock): AsciidoctorBlock[] {
	return asciidocCellDocuments(block).flatMap(childBlocksOf);
}

function locate(
	block: AsciidoctorBlock,
	location:
		| ReturnType<NonNullable<AsciidoctorBlock["getSourceLocation"]>>
		| undefined,
): void {
	if (location) {
		(block as unknown as AbstractBlock).sourceLocation =
			location as unknown as AbstractBlock["sourceLocation"];
	}
}
