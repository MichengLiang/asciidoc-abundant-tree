import type {
	AnchorOccurrenceNode,
	HeadingInlineMetadataOccurrenceNode,
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

export type SectionSourceScope = {
	readonly relativePath: string;
	readonly startLine: number;
	readonly endLine: number;
};

const sectionSourceScopeBySection = new WeakMap<
	SectionNode,
	SectionSourceScope
>();

export function registerSectionSourceScope(
	section: SectionNode,
	scope: SectionSourceScope,
): void {
	sectionSourceScopeBySection.set(section, scope);
}

export function buildSourceScopeIndex(
	sections: readonly SectionNode[],
): SourceScopeIndex {
	return {
		candidates: sections.flatMap((section) => {
			const scope = sourceScopeForSection(section);
			if (!scope) {
				return [];
			}
			return [
				{
					...scope,
					section,
				},
			];
		}),
	};
}

function sourceScopeForSection(
	section: SectionNode,
): SectionSourceScope | undefined {
	const registered = sectionSourceScopeBySection.get(section);
	if (registered) {
		return registered;
	}
	const relativePath = section.source?.relativePath;
	const startLine = section.source?.span?.startLine ?? section.source?.line;
	const endLine =
		section.source?.span?.endLine ?? section.source?.line ?? startLine;
	if (!relativePath || startLine === undefined || endLine === undefined) {
		return undefined;
	}
	return {
		relativePath,
		startLine,
		endLine,
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
	headingInlineMetadataOccurrences: HeadingInlineMetadataOccurrenceNode[],
	index: SourceScopeIndex,
): void {
	for (const occurrence of [
		...xrefs,
		...anchors,
		...headingInlineMetadataOccurrences,
	]) {
		const sectionId = lookupContainingSection(index, occurrence)?.ids[0];
		if (sectionId !== undefined) {
			occurrence.containingSectionId = sectionId;
		}
	}
}
