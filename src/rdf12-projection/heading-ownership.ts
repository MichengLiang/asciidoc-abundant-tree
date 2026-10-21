import type { Rdf12NodeIndex, Rdf12NodeIndexEntry } from "./node-index";

/**
 * 出现处或目标所属的 section 对应的标题节点。
 *
 * 所属 section 已在逻辑文档上判定（10 号书「结构关系在 Logical Document 上判定」），标题可以和出现处不在
 * 同一个源文件里：被引入的文件没有自己的标题时，它属于引入它的那个标题。ID 在一份文档里唯一，
 * 仍多于一个候选时不选。
 */
export function findHeadingBySectionId(
	nodeIndex: Rdf12NodeIndex,
	sectionId: string | undefined,
): Rdf12NodeIndexEntry | undefined {
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
export function findInnermostHeadingBySourceLine(input: {
	readonly nodeIndex: Rdf12NodeIndex;
	readonly relativePath: string;
	readonly line: number;
}): Rdf12NodeIndexEntry | undefined {
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
	entry: Rdf12NodeIndexEntry,
	input: { readonly relativePath: string; readonly line: number },
): boolean {
	return (
		entry.relativePath === input.relativePath &&
		startLine(entry) <= input.line &&
		input.line <= endLine(entry)
	);
}

function spanLength(entry: Rdf12NodeIndexEntry): number {
	return endLine(entry) - startLine(entry);
}

function startLine(entry: Rdf12NodeIndexEntry): number {
	return entry.sourceStartLine ?? entry.startLine;
}

function endLine(entry: Rdf12NodeIndexEntry): number {
	return entry.sourceEndLine ?? entry.endLine;
}
