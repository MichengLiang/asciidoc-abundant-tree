import {
	findClosingDelimiter,
	isLineInRanges,
	type LineRange,
	type LineTable,
	lineText,
} from "./source-lines";

export type SourceRanges = {
	listingRanges: LineRange[];
	tableRanges: LineRange[];
};

export function scanSourceRanges(lineTable: LineTable): SourceRanges {
	return {
		listingRanges: scanDelimitedRanges(lineTable, "----"),
		tableRanges: scanDelimitedRanges(lineTable, "|==="),
	};
}

export function isLineInListing(line: number, ranges: SourceRanges): boolean {
	return isLineInRanges(line, ranges.listingRanges);
}

export function isLineInTableStructure(
	line: number,
	ranges: SourceRanges,
): boolean {
	return ranges.tableRanges.some((range) => {
		if (line === range.startLine || line === range.endLine) {
			return true;
		}
		return false;
	});
}

function scanDelimitedRanges(
	lineTable: LineTable,
	delimiter: string,
): LineRange[] {
	const ranges: LineRange[] = [];
	for (const line of lineTable.lines) {
		const trimmed = lineText(lineTable, line.number).trim();
		if (trimmed === delimiter) {
			ranges.push({
				startLine: line.number,
				endLine: findClosingDelimiter(lineTable, line.number, delimiter),
			});
		}
	}
	return ranges.filter((range, index) =>
		ranges.every(
			(other, otherIndex) =>
				index === otherIndex ||
				range.startLine < other.startLine ||
				range.startLine > other.endLine,
		),
	);
}
