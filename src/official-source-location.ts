import { type AbstractBlock, Cursor } from "@asciidoctor/core";
import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import { childBlocksOf } from "./official-block-utils";
import {
	type LineTable,
	lineText,
	paragraphLine,
	quotedLineTable,
} from "./source-lines";

const takenFromParent = new WeakSet<AsciidoctorBlock>();
const borrowedFromChild = new WeakSet<AsciidoctorBlock>();
const markdownQuotes = new WeakSet<AsciidoctorBlock>();
const quoteDepths = new WeakMap<AsciidoctorBlock, number>();

// 官方块的坐标有两处要补正，都在官方块上改：遍历、投影与行内扫描都从官方块读坐标，改在这一处，它们读到的就是同一个。
// - Asciidoctor 在部导言里新建两种没有 source location 的开放块与段落（09 号书「官方合成的块」）。照官方给合成的
//   preamble 补坐标的做法（parser.js 632-633 行：preamble.sourceLocation = preamble.blocks[0].sourceLocation）补上。
// - markdown 引语的子块带的是引语内部的相对行号（09 号书「段落写法的引语」），换算成源行。
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
	if (
		location &&
		anchor !== undefined &&
		opensMarkdownQuote(block, quotedLineTable(lineTable, depth))
	) {
		markdownQuotes.add(block);
		relocateQuoted(block, location, anchor, lineTable, depth);
	}
	const children = childBlocksOf(block);
	const childDepth = markdownQuotes.has(block) ? depth + 1 : depth;
	for (const child of children) {
		complete(child, block, lineTable, childDepth);
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

// 官方为去掉 `> ` 的行新建的 Reader 不带游标（parser.js 1121 行，Ruby 版 2.0.26 相同）：引语里的块的行号从 1 数起、
// 没有文件。去掉前缀不改变行数，读引语这个段落时跳过的行注释也不在这些行里，所以相对的第 n 行就是从锚点行往下、
// 跳过行注释数到的第 n 行；哪些行是注释，按引语所在深度的视图判断。同一个 Reader 读出的块（引语里的列表项、分隔块
// 的子块）都带相对行号，一并换算；嵌套的 markdown 引语另有自己的 Reader，它的子块等 complete 走到它时从它换算后的
// 锚点行数起。
function relocateQuoted(
	quote: AsciidoctorBlock,
	location: NonNullable<
		ReturnType<NonNullable<AsciidoctorBlock["getSourceLocation"]>>
	>,
	anchor: number,
	lineTable: LineTable,
	depth: number,
): void {
	const outer = quotedLineTable(lineTable, depth);
	const inner = quotedLineTable(lineTable, depth + 1);
	const relocate = (block: AsciidoctorBlock): void => {
		for (const child of childBlocksOf(block)) {
			const relative = child.getSourceLocation?.()?.getLineNumber?.();
			if (relative !== undefined) {
				const line = paragraphLine(outer, anchor, relative, true);
				locate(
					child,
					new Cursor(
						location.getFile?.(),
						location.getDirectory?.(),
						location.getPath?.(),
						line,
					),
				);
				if (line === anchor) {
					takenFromParent.add(child);
				}
			}
			if (!opensMarkdownQuote(child, inner)) {
				relocate(child);
			}
		}
	};
	relocate(quote);
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
