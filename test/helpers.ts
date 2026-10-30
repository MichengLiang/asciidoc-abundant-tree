import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type AsciidoctorBlock,
	createAsciidoctorAdapter,
} from "../src/asciidoctor-adapter";
import {
	type AttributeListReadings,
	readAttributeLists,
} from "../src/metadata-parser";
import type {
	SectionNode,
	ToolDiagnostic,
	XrefOccurrenceNode,
} from "../src/model";
import type { LineTable } from "../src/source-lines";
import {
	recognizeXrefOccurrences,
	regionCandidates,
	type XrefProbeRegion,
} from "../src/xref-recognition";

const projectRoot = new URL("..", import.meta.url).pathname;
const fixtureRoot = join(projectRoot, "tmp/test-fixtures");

export function writeFixture(name: string, source: string): string {
	mkdirSync(fixtureRoot, { recursive: true });
	const path = join(fixtureRoot, name);
	writeFileSync(path, source, "utf8");
	return path;
}

// 官方对这份源里每一个 attrlist 的读法（解析时 parser-core 交给扫描的那一份）。不带 block、不做替换时官方的读法只
// 取决于文字，所以替身官方块的测试也能拿一份空的真文档来读。
export async function officialAttributeLists(
	lineTable: LineTable,
): Promise<AttributeListReadings> {
	const adapter = createAsciidoctorAdapter();
	const document = await adapter.loadSource("");
	return readAttributeLists(lineTable, (text) =>
		adapter.readAttributeList(document, text),
	);
}

// 扫描器交给官方探测的 xref 候选（未经官方认定），按源位置排序。替身官方块做不了探测，单元测试看这一层。
export function scannedXrefRaws(regions: readonly XrefProbeRegion[]): string[] {
	return regions
		.flatMap(regionCandidates)
		.sort(
			(left, right) =>
				left.sourceSpan.start.line - right.sourceSpan.start.line ||
				left.sourceSpan.start.column - right.sourceSpan.start.column,
		)
		.map((candidate) => candidate.raw);
}

// 一个认下每个候选的官方替身：用替身官方块测扫描到收尾的整条路（坐标、回源、去重）时用。
// 官方认不认、标签怎样分出命名属性，要用真文档测。
export function recognizeEveryCandidate(input: {
	readonly regions: readonly XrefProbeRegion[];
	readonly lineTable: LineTable;
	readonly sectionByLine?: Map<number, SectionNode>;
	readonly toolDiagnostics?: ToolDiagnostic[];
}): Promise<XrefOccurrenceNode[]> {
	return recognizeXrefOccurrences({
		adapter: {
			async probeXrefs(_document, requests) {
				return requests.map((request) => ({
					recognized: request.candidates.map((candidate, index) => ({
						candidate: index,
						official: {
							href: `#${candidate.target}`,
							resolved: false,
							reftext: "",
						},
						expandedTarget: candidate.target,
						label: candidate.label,
					})),
					withoutSource: [],
				}));
			},
		},
		officialDocument: {} as AsciidoctorBlock,
		lineTable: input.lineTable,
		regions: input.regions,
		sectionByLine: input.sectionByLine ?? new Map(),
		toolDiagnostics: input.toolDiagnostics ?? [],
	});
}
