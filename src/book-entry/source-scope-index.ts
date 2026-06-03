import type {
	AnchorOccurrenceNode,
	SectionNode,
	XrefOccurrenceNode,
} from "../model";

export type SourceScopeLookup = {
	readonly relativePath?: string;
	readonly line?: number;
	readonly source?: {
		readonly relativePath?: string;
		readonly line?: number;
	};
};

export type SourceScopeIndex = {
	readonly candidates: readonly SourceScopeCandidate[];
};

type SourceScopeCandidate = {
	readonly relativePath: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly section: SectionNode;
};

export function buildSourceScopeIndex(
	sections: readonly SectionNode[],
): SourceScopeIndex {
	return {
		candidates: sections.flatMap((section) => {
			const relativePath = section.source?.relativePath;
			const startLine = section.source?.span?.startLine ?? section.source?.line;
			const endLine =
				section.source?.span?.endLine ?? section.source?.line ?? startLine;
			if (!relativePath || startLine === undefined || endLine === undefined) {
				return [];
			}
			return [
				{
					relativePath,
					startLine,
					endLine,
					section,
				},
			];
		}),
	};
}

export function lookupContainingSection(
	index: SourceScopeIndex,
	lookup: SourceScopeLookup,
): SectionNode | undefined {
	const relativePath = lookup.relativePath ?? lookup.source?.relativePath;
	const line = lookup.line ?? lookup.source?.line;
	if (!relativePath || line === undefined) {
		return undefined;
	}
	let containingSection: SectionNode | undefined;
	for (const candidate of index.candidates) {
		if (candidate.relativePath !== relativePath) {
			continue;
		}
		if (line < candidate.startLine || line > candidate.endLine) {
			continue;
		}
		containingSection = candidate.section;
	}
	return containingSection;
}

export function assignContainingSectionIdsFromSourceScope(
	xrefs: XrefOccurrenceNode[],
	anchors: AnchorOccurrenceNode[],
	index: SourceScopeIndex,
): void {
	for (const occurrence of [...xrefs, ...anchors]) {
		const sectionId = lookupContainingSection(index, occurrence)?.ids[0];
		if (sectionId !== undefined) {
			occurrence.containingSectionId = sectionId;
		}
	}
}
