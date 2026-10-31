import {
	type AsciidoctorAdapter,
	type AsciidoctorBlock,
	officialRefKind,
} from "./asciidoctor-adapter";
import { finishAnchorOccurrences } from "./inline-occurrence-scanner";
import type { AnchorOccurrenceNode, ToolDiagnostic } from "./model";
import type { LineTable } from "./source-lines";
import { offsetAt, regionText, type XrefProbeRegion } from "./xref-recognition";

// 锚点由官方认定（09 号书第 8 章 Anchor Occurrence），与 xref 同一个机制：扫描器给出候选与位置，交给收下这段文字
// 的官方节点重跑一遍替换，转换器接到的行内锚点（type ref 或 bibref）紧跟在哪个候选的哨兵后面，官方就认下了哪个。
// 透传（`+++…+++`、`pass:[]`）里的写法官方原样输出，不经转换器，所以不算。不以 refs 目录为准：官方只在读段落时登记
// 行内锚点（parser.js 1181 行），列表项、描述、单元格、块标题里的锚点转换出 <a id>，却不在目录里。
//
// 三种写法不经探测，按官方 refs 目录里的登记判（officialRefKind）：块锚点（单独一行的 [[id]]）与节标题末尾的 [[id]]
// 是所附着的官方块的 ID；参考文献条目 [[[id]]] 由官方读列表项时登记为 bibref——它的正则锚定在文字开头
// （InlineBiblioAnchorRx 的 ^），探测插在它前面的哨兵会让官方认不出它，而这一种登记是完整的。
export async function recognizeAnchorOccurrences(input: {
	readonly adapter: Pick<AsciidoctorAdapter, "probeAnchors">;
	readonly officialDocument: AsciidoctorBlock;
	readonly lineTable: LineTable;
	readonly regions: readonly XrefProbeRegion[];
	readonly anchors: readonly AnchorOccurrenceNode[];
	readonly toolDiagnostics: ToolDiagnostic[];
}): Promise<AnchorOccurrenceNode[]> {
	const kept: AnchorOccurrenceNode[] = [];
	const probes = new Map<
		XrefProbeRegion,
		{
			text: string;
			candidates: { offset: number; anchor: AnchorOccurrenceNode }[];
		}
	>();
	for (const anchor of input.anchors) {
		const [id] = anchor.ids;
		if (id === undefined) {
			continue;
		}
		if (anchor.anchorScope === "block") {
			if (officialRefKind(input.officialDocument, id) === "block") {
				kept.push(anchor);
			}
			continue;
		}
		if (anchor.syntax === "bibliography") {
			if (officialRefKind(input.officialDocument, id) === "bibref") {
				kept.push(anchor);
			}
			continue;
		}
		const located = locate(input.regions, anchor);
		if (!located) {
			continue;
		}
		if (
			endsHeadingTitle(located.region, located.text, located.offset, anchor) &&
			officialRefKind(input.officialDocument, id) === "block"
		) {
			kept.push(anchor);
			continue;
		}
		const probe = probes.get(located.region) ?? {
			text: located.text,
			candidates: [],
		};
		probe.candidates.push({ offset: located.offset, anchor });
		probes.set(located.region, probe);
	}

	const requests = [...probes].map(([region, probe]) => ({
		owner: region.owner,
		title: region.title,
		text: probe.text,
		candidates: probe.candidates.toSorted(
			(left, right) => left.offset - right.offset,
		),
	}));
	const results =
		requests.length === 0
			? []
			: await input.adapter.probeAnchors(input.officialDocument, requests);
	for (const [index, request] of requests.entries()) {
		for (const { candidate, official } of results[index]?.recognized ?? []) {
			const anchor = request.candidates[candidate]?.anchor;
			if (anchor?.ids.includes(official.id)) {
				kept.push(anchor);
			}
		}
	}
	return finishAnchorOccurrences(kept, {
		lineTable: input.lineTable,
		toolDiagnostics: input.toolDiagnostics,
	});
}

// 候选落在哪个交给官方替换的区域里（xref 的区域：正文、标题与块标题、单元格、出处的文字）。不在任何区域里的写法，
// 官方不对它做行内替换，不是行内锚点。
function locate(
	regions: readonly XrefProbeRegion[],
	anchor: AnchorOccurrenceNode,
): { region: XrefProbeRegion; text: string; offset: number } | undefined {
	const start = anchor.sourceSpan?.start;
	if (!start) {
		return undefined;
	}
	for (const region of regions) {
		const offset = offsetAt(region, start);
		if (offset !== undefined) {
			return { region, text: regionText(region), offset };
		}
	}
	return undefined;
}

// 节标题与独立标题末尾、前面隔着空格的 [[id]]：官方读标题时用 InlineSectionAnchorRx 把它摘下，当作这个标题的 ID
// （parser.js parseSectionTitle）。
function endsHeadingTitle(
	region: XrefProbeRegion,
	text: string,
	offset: number,
	anchor: AnchorOccurrenceNode,
): boolean {
	const context = region.owner.getContext?.();
	return (
		region.title &&
		(context === "section" || context === "floating_title") &&
		anchor.syntax === "double-bracket" &&
		text.charAt(offset - 1) === " " &&
		offset + anchor.raw.length === text.trimEnd().length
	);
}
