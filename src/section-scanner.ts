import {
	collectPrecedingMetadata,
	type MetadataSurface,
} from "./metadata-parser";
import type { SectionNode, SourceSpan } from "./model";
import type { LineTable } from "./source-lines";
import { lineText, spanForLineText } from "./source-lines";
import { isLineInListing, type SourceRanges } from "./source-ranges";

type SectionSurface = {
	line: number;
	level: number;
	title: string;
	titleSpan: SourceSpan;
	metadata: MetadataSurface[];
};

const headingPattern = /^(=+)\s+(.+)$/;

export function scanSections(
	lineTable: LineTable,
	ranges: SourceRanges,
): SectionNode[] {
	const surfaces: SectionSurface[] = [];

	for (const line of lineTable.lines) {
		if (line.number === 1 || isLineInListing(line.number, ranges)) {
			continue;
		}
		const match = headingPattern.exec(lineText(lineTable, line.number));
		if (!match) {
			continue;
		}

		const marker = match[1] ?? "";
		const title = match[2] ?? "";
		surfaces.push({
			line: line.number,
			level: marker.length - 1,
			title,
			titleSpan: spanForLineText(lineTable, line.number, marker.length + 2),
			metadata: collectPrecedingMetadata(lineTable, line.number),
		});
	}

	return surfaces.map((surface, index) => {
		const metadataStart = surface.metadata.at(0)?.line;
		const nextBoundary = surfaces
			.slice(index + 1)
			.find((candidate) => candidate.level <= surface.level);
		const ids = surface.metadata.flatMap((metadata) => metadata.ids);
		const idOrigin = ids.length > 0 ? "source" : "asciidoctor-generated";
		return {
			kind: "section",
			level: surface.level,
			ids,
			title: surface.title,
			line: surface.line,
			span: {
				startLine: metadataStart ?? surface.line,
				endLine:
					(nextBoundary?.metadata.at(0)?.line ??
						nextBoundary?.line ??
						lineTable.lines.length + 1) - 1,
			},
			titleSpan: surface.titleSpan,
			idOrigin,
			metadata: surface.metadata.map((metadata) => metadata.node),
			asciidoctor: {
				context: "section",
				nodeName: "section",
				resolvedType: "section",
				reftext: surface.title,
			},
			children: [],
		};
	});
}
