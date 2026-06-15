import type { Rdf12NodeIndex, Rdf12NodeIndexEntry } from "./node-index";

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
