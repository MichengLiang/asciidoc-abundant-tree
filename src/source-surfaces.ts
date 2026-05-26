import {
	assignContainingSectionIds,
	scanAnchorOccurrences,
	scanXrefOccurrences,
} from "./inline-occurrence-scanner";
import type {
	AnchorOccurrenceNode,
	SectionNode,
	XrefOccurrenceNode,
} from "./model";
import { scanSections } from "./section-scanner";
import type { LineTable } from "./source-lines";
import { type SourceRanges, scanSourceRanges } from "./source-ranges";

type SourceSurfaces = {
	ranges: SourceRanges;
	sections: SectionNode[];
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	sectionByLine: Map<number, SectionNode>;
};

export { assignContainingSectionIds };

export function scanSourceSurfaces(lineTable: LineTable): SourceSurfaces {
	const ranges = scanSourceRanges(lineTable);
	const sections = scanSections(lineTable, ranges);
	const xrefOccurrences = scanXrefOccurrences(lineTable, ranges);
	const anchorOccurrences = scanAnchorOccurrences(lineTable, ranges);
	const sectionByLine = mapSectionScope(sections, lineTable.lines.length);
	assignContainingSectionIds(xrefOccurrences, anchorOccurrences, sectionByLine);

	return {
		ranges,
		sections,
		xrefOccurrences,
		anchorOccurrences,
		sectionByLine,
	};
}

export function fallbackGeneratedSectionId(title: string): string {
	return `_${title.replace(/[^\p{L}\p{N}_]+/gu, "_").replace(/^_+|_+$/gu, "")}`;
}

function mapSectionScope(
	sections: SectionNode[],
	totalLines: number,
): Map<number, SectionNode> {
	const result = new Map<number, SectionNode>();
	for (const section of sections) {
		const start = section.span?.startLine ?? section.line ?? 1;
		const end = section.span?.endLine ?? totalLines;
		for (let line = start; line <= end; line += 1) {
			result.set(line, section);
		}
	}
	return result;
}
