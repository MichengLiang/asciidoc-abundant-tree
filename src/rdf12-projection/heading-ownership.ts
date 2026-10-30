import type { SectionNode, TitleNode } from "../model";

// 归属判断只用标题条目的位置与 section ID，不用 IRI：标题的名字要等本地 target 的归属定下以后才定得出来
// （06 号书第 2 章「身份」），所以 IRI 生成之前的待定条目与 Rdf12NodeIndex 的条目都能交进来。
export type HeadingOwnershipEntry =
	| {
			readonly kind: "section";
			readonly node: SectionNode;
			readonly relativePath?: string;
			readonly sourceStartLine?: number;
			readonly sourceEndLine?: number;
			readonly startLine: number;
			readonly endLine: number;
	  }
	| {
			readonly kind: "document-title";
			readonly node: TitleNode;
			readonly relativePath?: string;
			readonly sourceStartLine?: number;
			readonly sourceEndLine?: number;
			readonly startLine: number;
			readonly endLine: number;
	  };

type HeadingEntries<T extends HeadingOwnershipEntry> = {
	entries(): readonly T[];
};

/**
 * 出现处或目标所属的 section 对应的标题节点。
 *
 * 所属 section 已在逻辑文档上判定（10 号书「结构关系在 Logical Document 上判定」），标题可以和出现处不在
 * 同一个源文件里：被引入的文件没有自己的标题时，它属于引入它的那个标题。ID 在一份文档里唯一，
 * 仍多于一个候选时不选。
 */
export function findHeadingBySectionId<T extends HeadingOwnershipEntry>(
	nodeIndex: HeadingEntries<T>,
	sectionId: string | undefined,
): T | undefined {
	if (sectionId === undefined) {
		return undefined;
	}
	const candidates = nodeIndex
		.entries()
		.filter(
			(entry) => entry.kind === "section" && entry.node.ids.includes(sectionId),
		);
	return candidates.length === 1 ? candidates[0] : undefined;
}

// 只有来源坐标、没有所属 section 时的回退：按同一源文件里包含该行的最内层标题找。
export function findInnermostHeadingBySourceLine<
	T extends HeadingOwnershipEntry,
>(input: {
	readonly nodeIndex: HeadingEntries<T>;
	readonly relativePath: string;
	readonly line: number;
}): T | undefined {
	const candidates = input.nodeIndex
		.entries()
		.filter((entry) => containsLine(entry, input))
		.map((entry, index) => ({ entry, index }))
		.toSorted((left, right) => {
			const leftSpan = spanLength(left.entry);
			const rightSpan = spanLength(right.entry);
			if (leftSpan !== rightSpan) {
				return leftSpan - rightSpan;
			}

			const startDelta = startLine(right.entry) - startLine(left.entry);
			if (startDelta !== 0) {
				return startDelta;
			}

			return left.index - right.index;
		});

	return candidates[0]?.entry;
}

function containsLine(
	entry: HeadingOwnershipEntry,
	input: { readonly relativePath: string; readonly line: number },
): boolean {
	return (
		entry.relativePath === input.relativePath &&
		startLine(entry) <= input.line &&
		input.line <= endLine(entry)
	);
}

function spanLength(entry: HeadingOwnershipEntry): number {
	return endLine(entry) - startLine(entry);
}

function startLine(entry: HeadingOwnershipEntry): number {
	return entry.sourceStartLine ?? entry.startLine;
}

function endLine(entry: HeadingOwnershipEntry): number {
	return entry.sourceEndLine ?? entry.endLine;
}
