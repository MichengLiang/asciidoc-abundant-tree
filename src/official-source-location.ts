import type { AbstractBlock } from "@asciidoctor/core";
import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import { childBlocksOf } from "./official-block-utils";

const takenFromParent = new WeakSet<AsciidoctorBlock>();
const borrowedFromChild = new WeakSet<AsciidoctorBlock>();

// Asciidoctor 在部导言里新建两种没有 source location 的开放块与段落（09 号书「官方合成的块」）。照官方给合成的
// preamble 补坐标的做法（parser.js 632-633 行：preamble.sourceLocation = preamble.blocks[0].sourceLocation），
// 在官方块上补上。遍历、投影与行内扫描都从官方块读坐标，补在这一处，它们读到的就是同一个。
export function completeSynthesizedSourceLocations(
	officialDocument: AsciidoctorBlock,
): void {
	for (const block of childBlocksOf(officialDocument)) {
		complete(block, undefined);
	}
}

// 接过父块文本行的段落：它与父块共用锚点行，锚点之前的块属性行（如 [partintro]）属于父块。合成的容器反过来借子块的
// 坐标，属性行仍属于作者写下的那个子块，所以要分开记。
export function takesParentSourceLocation(block: AsciidoctorBlock): boolean {
	return takenFromParent.has(block);
}

// 合成的容器借的是第一个子块的锚点行，那一行可能是列表项或分隔符，不是容器的“第一行源文”。
export function borrowsChildSourceLocation(block: AsciidoctorBlock): boolean {
	return borrowedFromChild.has(block);
}

function complete(
	block: AsciidoctorBlock,
	parent: AsciidoctorBlock | undefined,
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
	const children = childBlocksOf(block);
	for (const child of children) {
		complete(child, block);
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
