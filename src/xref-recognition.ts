import type {
	AsciidoctorAdapter,
	AsciidoctorBlock,
	OfficialXref,
	RecognizedXref,
	XrefProbeCandidate,
} from "./asciidoctor-adapter";
import { finishXrefOccurrences } from "./inline-occurrence-scanner";
import type {
	AsciidoctorLayer,
	SectionNode,
	SourcePosition,
	SourceSpan,
	ToolDiagnostic,
	XrefOccurrenceNode,
} from "./model";
import { definedObject } from "./object-utils";
import type { LineTable, SourceLine } from "./source-lines";

// 一段交给官方节点替换的文字：扫描器按官方读进的行给出，每一段是某一行的 [startIndex, endIndex)。
// 标题文字走官方的标题替换。
export type XrefProbeSegment = {
	readonly line: SourceLine;
	readonly startIndex: number;
	readonly endIndex: number;
};

export type XrefProbeRegion = {
	readonly owner: AsciidoctorBlock;
	readonly title: boolean;
	readonly segments: XrefProbeSegment[];
};

// 候选的起点：每个 `xref:` 与 `<<`，连同紧挨在前面的反斜杠。透传、转义、目标的形状都不在这里判断。
const candidateStartPattern = /\\*(?:xref:|<<)/gu;
// 候选的结束处照抄官方的 InlineXrefMacroRx（Asciidoctor.js 4.1.1 rx.js 746 行，CC_WORD 见同文件 43 行）：
// 官方在转义了 < 与 > 的文字上匹配，源文本里写的是 << 与 >>。
const shorthandExtent = /<<([\p{Alphabetic}\p{N}\p{Pc}#/.:{][\s\S]*?)>>/uy;
const macroExtent =
	/xref:([\p{Alphabetic}\p{N}\p{Pc}#/.:{][\s\S]*?)\[(?:\]|([\s\S]*?[^\\])\])/uy;

type Candidate = XrefProbeCandidate & {
	readonly rawStart: number;
	readonly rawEnd: number;
};

export async function recognizeXrefOccurrences(input: {
	readonly adapter: Pick<AsciidoctorAdapter, "probeXrefs">;
	readonly officialDocument: AsciidoctorBlock;
	readonly lineTable: LineTable;
	readonly regions: readonly XrefProbeRegion[];
	readonly sectionByLine: Map<number, SectionNode>;
	readonly toolDiagnostics: ToolDiagnostic[];
}): Promise<XrefOccurrenceNode[]> {
	const probes = input.regions
		.map((region) => {
			const text = regionText(region);
			return { region, text, candidates: findCandidates(text) };
		})
		// 没有候选、但含属性引用的文字也要探测：属性值可能展开出 xref，只有官方知道，探到了报 xref.without-source。
		.filter((probe) => probe.candidates.length > 0 || probe.text.includes("{"));
	const results =
		probes.length === 0
			? []
			: await input.adapter.probeXrefs(
					input.officialDocument,
					probes.map((probe) => ({
						owner: probe.region.owner,
						title: probe.region.title,
						text: probe.text,
						candidates: probe.candidates,
					})),
				);

	const xrefs: XrefOccurrenceNode[] = [];
	for (const [index, probe] of probes.entries()) {
		const result = results[index];
		if (!result) {
			continue;
		}
		for (const recognized of result.recognized) {
			const candidate = probe.candidates[recognized.candidate];
			if (candidate) {
				xrefs.push(occurrence(probe.region, probe.text, candidate, recognized));
			}
		}
		for (const official of result.withoutSource) {
			input.toolDiagnostics.push(
				withoutSourceDiagnostic(probe.region, official),
			);
		}
	}
	return finishXrefOccurrences(xrefs, {
		lineTable: input.lineTable,
		sectionByLine: input.sectionByLine,
		toolDiagnostics: input.toolDiagnostics,
	});
}

// 扫描器交出的候选，未经官方认定：raw、写法、目标、标签与源位置。供检查扫描器交出了什么。
export function regionCandidates(region: XrefProbeRegion): Array<
	Pick<XrefOccurrenceNode, "raw" | "syntax" | "target" | "label"> & {
		sourceSpan: SourceSpan;
	}
> {
	const text = regionText(region);
	return findCandidates(text).map((candidate) => ({
		raw: text.slice(candidate.rawStart, candidate.rawEnd),
		syntax: candidate.syntax,
		target: candidate.target,
		...(candidate.label !== undefined ? { label: candidate.label } : {}),
		sourceSpan: {
			start: positionAt(region, candidate.rawStart),
			end: positionAt(region, candidate.rawEnd),
		},
	}));
}

export function regionText(region: XrefProbeRegion): string {
	return region.segments
		.map((segment) =>
			segment.line.text.slice(segment.startIndex, segment.endIndex),
		)
		.join("\n");
}

function findCandidates(text: string): Candidate[] {
	const candidates: Candidate[] = [];
	for (const match of text.matchAll(candidateStartPattern)) {
		const offset = match.index;
		const rawStart =
			offset + match[0].length - (match[0].endsWith("<<") ? 2 : 5);
		const shorthand = text.startsWith("<<", rawStart);
		const extent = shorthand ? shorthandExtent : macroExtent;
		extent.lastIndex = rawStart;
		const matched = extent.exec(text);
		if (!matched?.[1]) {
			continue;
		}
		const rawEnd = rawStart + matched[0].length;
		if (shorthand) {
			// 官方在第一个逗号处分开目标与链接文字，文字去掉开头的空白（substitutors.js 1139-1145 行）。
			const comma = matched[1].indexOf(",");
			const label =
				comma === -1 ? undefined : matched[1].slice(comma + 1).trimStart();
			candidates.push({
				offset,
				rawStart,
				rawEnd,
				syntax: "shorthand",
				target: comma === -1 ? matched[1] : matched[1].slice(0, comma),
				...(label ? { label } : {}),
			});
			continue;
		}
		candidates.push({
			offset,
			rawStart,
			rawEnd,
			syntax: "macro",
			target: matched[1],
			...(matched[2] !== undefined
				? { label: matched[2].split("\\]").join("]") }
				: {}),
		});
	}
	return candidates;
}

function occurrence(
	region: XrefProbeRegion,
	text: string,
	candidate: Candidate,
	recognized: RecognizedXref,
): XrefOccurrenceNode {
	const raw = text.slice(candidate.rawStart, candidate.rawEnd);
	const sourceSpan: SourceSpan = {
		start: positionAt(region, candidate.rawStart),
		end: positionAt(region, candidate.rawEnd),
	};
	const official = recognized.official;
	return definedObject({
		kind: "xref",
		syntax: candidate.syntax,
		raw,
		target: candidate.target,
		...addressOf(recognized.expandedTarget, official),
		label: recognized.label,
		attributes: recognized.attributes,
		sourceSpan,
		scope: official.path !== undefined ? "external" : "local",
		asciidoctor: definedObject({
			href: official.href,
			refid: official.refid,
			path: official.path,
			fragment: official.fragment,
			resolvedId: official.resolved ? official.refid : undefined,
			reftext: official.reftext,
		}) as AsciidoctorLayer,
		source: {
			raw,
			line: sourceSpan.start.line,
			sourceSpan,
		},
	}) as XrefOccurrenceNode;
}

// 地址按作者写下的文字取，不取官方的 fragment：官方解析成功一个自然引用后，把 fragment 改写成它找到的 ID
// （substitutors.js 1244 行），作者写下的标题原文就丢了。展开属性以后照官方切 # 的规则（同文件 1162-1166 行）：
// 开头的 # 只表示本文档；# 之前有文字、官方又认作别的文档时，那段文字是文档部分。
function addressOf(
	expandedTarget: string,
	official: OfficialXref,
): { selector?: string; document?: string } {
	const hash = expandedTarget.indexOf("#");
	const hasFragment =
		hash !== -1 && (hash === 0 || expandedTarget[hash - 1] !== "&");
	const fragment = hasFragment ? expandedTarget.slice(hash + 1) : undefined;
	if (official.path !== undefined) {
		return hasFragment
			? {
					document: expandedTarget.slice(0, hash),
					...(fragment ? { selector: fragment } : {}),
				}
			: { document: expandedTarget };
	}
	if (hasFragment) {
		return fragment ? { selector: fragment } : {};
	}
	return { selector: expandedTarget };
}

function positionAt(region: XrefProbeRegion, offset: number): SourcePosition {
	let segmentStart = 0;
	for (const segment of region.segments) {
		const length = segment.endIndex - segment.startIndex;
		if (offset <= segmentStart + length) {
			const index = segment.startIndex + offset - segmentStart;
			return {
				line: segment.line.number,
				column: [...segment.line.text.slice(0, index)].length + 1,
			};
		}
		segmentStart += length + 1;
	}
	const last = region.segments.at(-1);
	return {
		line: last?.line.number ?? 1,
		column: last ? [...last.line.text.slice(0, last.endIndex)].length + 1 : 1,
	};
}

// positionAt 的反向：源位置落在区域的哪一段里，换算成 regionText 里的偏移；不在任何一段里时为 undefined。
export function offsetAt(
	region: XrefProbeRegion,
	position: SourcePosition,
): number | undefined {
	let segmentStart = 0;
	for (const segment of region.segments) {
		if (segment.line.number === position.line) {
			const index = [...segment.line.text]
				.slice(0, position.column - 1)
				.join("").length;
			if (index >= segment.startIndex && index < segment.endIndex) {
				return segmentStart + index - segment.startIndex;
			}
		}
		segmentStart += segment.endIndex - segment.startIndex + 1;
	}
	return undefined;
}

function withoutSourceDiagnostic(
	region: XrefProbeRegion,
	official: OfficialXref,
): ToolDiagnostic {
	const first = region.segments[0];
	const last = region.segments.at(-1);
	return definedObject({
		level: "warning",
		code: "xref.without-source",
		message: `Asciidoctor recognized an xref to '${official.href}' that has no literal source text, such as one expanded from an attribute value; it is not collected as an occurrence.`,
		source:
			first && last
				? {
						start: { line: first.line.number, column: 1 },
						end: {
							line: last.line.number,
							column: [...last.line.text].length + 1,
						},
					}
				: undefined,
	}) as ToolDiagnostic;
}
