import {
	type AbstractBlock,
	type Document,
	Extensions,
	getVersion,
	Html5Converter,
	type Inline,
	type InlineMacroProcessorDslInterface,
	load,
	type Registry,
} from "@asciidoctor/core";
import { type DefaultTreeAdapterMap, parseFragment } from "parse5";
import { interpretHeadingInlineMetadataAttributes } from "./heading-inline-metadata";

// aat 读一个 official 块时用到的那几样，是 aat 这一侧的窄接口：投影、扫描与测试替身都按它读块，不必满足
// 4.x 上百个成员的 AbstractBlock。返回类型照 4.x 的实情：getTitle、getStyle 缺值时是 null（getId 是 undefined）。
export type AsciidoctorBlock = {
	getAttributes?: () => Record<string, unknown>;
	getBlocks?: () => unknown[];
	getCatalog?: () => unknown;
	getContent?: () => Promise<string>;
	getContext?: () => string;
	getContentModel?: () => string;
	getDocumentTitle?: () => string | null;
	getId?: () => string | undefined;
	getLevel?: () => number;
	getNodeName?: () => string;
	// 4.x 的表格把行放在 rows 属性上（Ruby 的 Table#rows），不再有 getRows()。
	rows?: unknown;
	getSource?: () => string;
	getSourceLines?: () => string[];
	getSourceLocation?: () => {
		getDirectory?: () => string | undefined;
		getFile?: () => string | undefined;
		getLineNumber?: () => number;
		getPath?: () => string | undefined;
	};
	getSubstitutions?: () => string[];
	getRefs?: () => Record<string, unknown>;
	getStyle?: () => string | null;
	getText?: () => unknown;
	getTitle?: () => string | null;
};

// 交进 adapter 的块都出自它自己的 load/loadFile，还原成 4.x 的类型再调用它的方法。
function official<T extends AbstractBlock>(block: AsciidoctorBlock): T {
	return block as unknown as T;
}

type HtmlAnchorBinding = {
	href?: string | undefined;
	text: string;
	id?: string | undefined;
};

// 探测（09 号书第 7 章《Xref 由官方认定》）：一段文字交给收下它的官方节点重跑一遍替换，官方在哪些候选位置认下了
// xref，就收哪些。候选起点前插一个哨兵，转换器在探测期间把接到的 xref 换成一个记录标记；输出里紧跟在哨兵后面的
// 标记，就是官方在这个位置认下的 xref。标记取私用区码位，作者的文字里没有，替换也不碰它。
//
// 哨兵与它前面的字符相邻，官方的约束写法（`+…+` 透传、`*…*` 等）看闭合符后面是不是单词字符，所以哨兵要与它顶替的
// 那个字符同类：`xref:` 打头时是单词字符，取西夏文字母（书里不会出现）；`<<` 与 `\` 打头时是非单词字符，取私用区。
// 取错类时，`+xref:a[] b+xref:c[]` 里的 `+…+` 会被认成透传，吞掉官方原本认下的第一个 xref。
const WORD_SENTINEL_BASE = 0x17000;
const NON_WORD_SENTINEL_BASE = 0xf0000;
const MARKER_BASE = 0x100000;
const MAX_PROBE_INDEX = 0x17f7;

export type XrefProbeCandidate = {
	// 候选在 text 中的起点，含紧挨在前面的反斜杠：转义与否由官方判断。
	readonly offset: number;
	readonly syntax: "shorthand" | "macro";
	// 源文写下的目标与方括号（shorthand 是逗号）后的文字。
	readonly target: string;
	readonly label?: string | undefined;
};

export type XrefProbeRequest = {
	readonly owner: AsciidoctorBlock;
	// 标题文字（章节标题、块标题、文档标题）走官方的标题替换。
	readonly title: boolean;
	readonly text: string;
	readonly candidates: readonly XrefProbeCandidate[];
};

export type OfficialXref = {
	readonly href: string;
	readonly refid?: string | undefined;
	readonly path?: string | undefined;
	readonly fragment?: string | undefined;
	// refid 在官方的 refs 目录里：官方按它自己的规则找到了目标。
	readonly resolved: boolean;
	readonly reftext: string;
};

export type RecognizedXref = {
	readonly candidate: number;
	readonly official: OfficialXref;
	// 源文目标在这个位置的属性取值下展开属性引用以后的样子。
	readonly expandedTarget: string;
	readonly label?: string | undefined;
	readonly attributes?: Record<string, string> | undefined;
};

export type XrefProbeResult = {
	readonly recognized: readonly RecognizedXref[];
	// 官方认下、前面却没有哨兵的 xref：属性值展开出来的，源里没有字面写法。
	readonly withoutSource: readonly OfficialXref[];
};

// 锚点同 xref（09 号书第 8 章 Anchor Occurrence）：候选在 text 中的起点，转换器在探测期间接到的行内锚点
// （convert_inline_anchor，type 为 ref，参考文献条目为 bibref）紧跟在哪个哨兵后面，官方就认下了哪个候选。
export type AnchorProbeRequest = {
	readonly owner: AsciidoctorBlock;
	readonly title: boolean;
	readonly text: string;
	readonly candidates: readonly { readonly offset: number }[];
};

export type OfficialInlineAnchor = {
	readonly id: string;
	readonly type: "ref" | "bibref";
};

export type AnchorProbeResult = {
	readonly recognized: readonly {
		readonly candidate: number;
		readonly official: OfficialInlineAnchor;
	}[];
};

// 探测期间转换器把接到的哪一类行内节点换成记录标记：capture 交回要记下的事实，交回 undefined 的节点照常转换。
type ProbeState = {
	active: boolean;
	capture: ((node: Inline, html: string) => unknown) | undefined;
	hits: unknown[];
};

// 4.x 在 load.js 32 行把 Substitutors 混进 AbstractNode.prototype，每个节点都有这些替换方法；类型声明却只把它们
// 写成独立的 Substitutors 命名空间（types/substitutors.d.ts），没有并进 AbstractBlock。签名照那份声明。
type SubstitutingNode = {
	applySubs(text: string, subs?: string[]): Promise<string | string[]>;
	applyTitleSubs(text: string): Promise<string | string[]>;
	subAttributes(text: string): string;
	parseAttributes(
		attrlist: string,
		posattrs?: string[],
		opts?: Record<string, unknown>,
	): Promise<Record<string, unknown>>;
};

const probeStates = new WeakMap<object, ProbeState>();

// load 与 loadFile 都要在加载时交出转换器：官方在加载时就替换了标题、列表条目、描述列表与单元格的文字，
// 事后再换转换器，这些文字里的 xref 就接不到了。探测之外，转换器照常转换。
export function xrefProbeLoadOptions(): {
	readonly converter: typeof Html5Converter;
	register(document: AsciidoctorBlock): void;
} {
	const state: ProbeState = { active: false, capture: undefined, hits: [] };
	class XrefProbeConverter extends Html5Converter {
		override async convert_inline_anchor(node: Inline): Promise<string> {
			const html = await super.convert_inline_anchor(node);
			const hit = state.active ? state.capture?.(node, html) : undefined;
			if (hit === undefined) {
				return html;
			}
			state.hits.push(hit);
			return String.fromCodePoint(MARKER_BASE + state.hits.length - 1);
		}
	}
	return {
		converter: XrefProbeConverter,
		register(document) {
			probeStates.set(document, state);
		},
	};
}

function officialXref(node: Inline, html: string): OfficialXref {
	const refid = stringAttribute(node, "refid");
	const anchor = extractAnchorBindings(parseFragment(html)).find(
		(binding) => binding.href,
	);
	return {
		href: node.getTarget() ?? "",
		refid,
		path: stringAttribute(node, "path"),
		fragment: stringAttribute(node, "fragment"),
		resolved:
			refid !== undefined && Object.hasOwn(node.getDocument().getRefs(), refid),
		reftext: anchor?.text ?? "",
	};
}

function stringAttribute(node: Inline, name: string): string | undefined {
	const value = node.getAttribute(name);
	return typeof value === "string" ? value : undefined;
}

// 浏览器也能用的这一层：从源文本加载与探测 xref。从文件加载在 asciidoctor-file-adapter.ts——4.x 的浏览器构建
// 不导出 loadFile，这里导入它会让浏览器打包失败。
export type AsciidoctorAdapter = {
	parserVersion: string;
	// sourcePath 是这段文字所在的文件：官方从文件加载时据它设 docname（load.js 104-106 行），引用自己的
	// `xref:本文件.adoc#id[]` 才认作本文档。只交文字时要补上，读法才与官方读这个文件时相同。
	loadSource(
		sourceText: string,
		sourcePath?: string,
	): Promise<AsciidoctorBlock>;
	extractAnchorBindings(html: string): HtmlAnchorBinding[];
	probeXrefs(
		document: AsciidoctorBlock,
		requests: readonly XrefProbeRequest[],
	): Promise<XrefProbeResult[]>;
	probeAnchors(
		document: AsciidoctorBlock,
		requests: readonly AnchorProbeRequest[],
	): Promise<AnchorProbeResult[]>;
	expandAttributes(
		document: AsciidoctorBlock,
		requests: readonly AttributeExpansionRequest[],
	): Promise<string[]>;
	// 块的 attrlist（方括号里的文字）照官方拆：哪段是命名属性、名字是什么、哪段是位置属性（位置属性的键是 "1"、"2"……）。
	readAttributeList(
		document: AsciidoctorBlock,
		text: string,
	): Promise<Record<string, unknown>>;
};

export type AttributeExpansionRequest = {
	readonly owner: AsciidoctorBlock;
	readonly text: string;
};

export function createAsciidoctorAdapter(
	extensionRegistry: Registry = createExtensionRegistry(),
): AsciidoctorAdapter {
	return {
		parserVersion: getVersion(),
		async loadSource(sourceText, sourcePath) {
			const probing = xrefProbeLoadOptions();
			const document = (await load(sourceText, {
				safe: "secure",
				sourcemap: true,
				to_file: false,
				extension_registry: extensionRegistry,
				converter: probing.converter,
				...(sourcePath !== undefined
					? { attributes: { docname: docnameOf(sourcePath) } }
					: {}),
			})) as unknown as AsciidoctorBlock;
			probing.register(document);
			return document;
		},
		extractAnchorBindings(html) {
			return extractAnchorBindings(parseFragment(html));
		},
		probeXrefs,
		probeAnchors,
		expandAttributes,
		readAttributeList,
	};
}

function docnameOf(sourcePath: string): string {
	const name = sourcePath.split(/[\\/]/u).at(-1) ?? sourcePath;
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(0, dot) : name;
}

// 官方 refs 目录里这个 ID 登记成了什么（09 号书第 8 章 Anchor Occurrence）。两种锚点不经 convert_inline_anchor 认定，
// 按登记判：块锚点（单独一行的 [[id]]）与节标题末尾的 [[id]] 是所附着块的 ID，官方登记的是这个块（parser.js 1459 行
// 登记块，2353 行登记节；节标题末尾的锚点由 InlineSectionAnchorRx 摘下）；参考文献条目由 catalogInlineBiblioAnchor
// （1753 行）在读列表项时登记为 type 为 bibref 的行内锚点。
export function officialRefKind(
	document: AsciidoctorBlock,
	id: string,
): "block" | "ref" | "bibref" | undefined {
	const node = document.getRefs?.()[id] as
		| { getContext?: () => string; getType?: () => string }
		| undefined;
	if (node === undefined) {
		return undefined;
	}
	if (node.getContext?.() !== "anchor") {
		return "block";
	}
	const type = node.getType?.();
	return type === "ref" || type === "bibref" ? type : undefined;
}

// 官方读块属性行时调 document.parseAttributes(..., { sub_input, sub_result })（parser.js 2839 行）。这里两个开关都不开：
// 拆法与名字照官方的 AttributeList，值保留作者写下的样子（09 号书第 8 章 Metadata Attachment；字段值按源表面值保存）。
async function readAttributeList(
	document: AsciidoctorBlock,
	text: string,
): Promise<Record<string, unknown>> {
	return (document as unknown as SubstitutingNode).parseAttributes(text);
}

// 按官方转换的顺序探测：先还原文档头的属性，再按文档顺序走官方块树，到每个块先回放它的属性条目
// （Document#playbackAttributes，官方转换时也这样做），属性引用因此按它在文中那个位置的取值展开。
async function probeXrefs(
	document: AsciidoctorBlock,
	requests: readonly XrefProbeRequest[],
): Promise<XrefProbeResult[]> {
	const state = probeStates.get(document);
	if (!state) {
		throw new Error("probeXrefs requires a document loaded by this adapter");
	}
	const root = official<Document>(document);
	return inPlaybackOrder(document, requests, (request) =>
		probeRequest(state, root, request),
	);
}

// 标题的地址取作者写下的文字，属性引用按它在文中那个位置的取值展开（06 号书第 2 章 Headline），与 xref 的
// selector 在同一个文本层。
async function expandAttributes(
	document: AsciidoctorBlock,
	requests: readonly AttributeExpansionRequest[],
): Promise<string[]> {
	return inPlaybackOrder(document, requests, async (request) =>
		(request.owner as unknown as SubstitutingNode).subAttributes(request.text),
	);
}

async function inPlaybackOrder<
	Request extends { readonly owner: object },
	Result,
>(
	document: AsciidoctorBlock,
	requests: readonly Request[],
	visit: (request: Request) => Promise<Result>,
): Promise<Result[]> {
	const results = new Map<Request, Result>();
	const requestsByOwner = new Map<object, Request[]>();
	for (const request of requests) {
		const owned = requestsByOwner.get(request.owner) ?? [];
		owned.push(request);
		requestsByOwner.set(request.owner, owned);
	}
	const root = official<Document>(document);
	root.restoreAttributes();
	for (const node of root.findBy({ traverseDocuments: true })) {
		official<Document>(
			node.getDocument() as unknown as AsciidoctorBlock,
		).playbackAttributes(node.getAttributes());
		for (const request of requestsByOwner.get(node) ?? []) {
			results.set(request, await visit(request));
		}
		requestsByOwner.delete(node);
	}
	// 走不到的节点（块树之外的官方节点）不再回放属性，照文档末尾的属性取值。
	for (const owned of requestsByOwner.values()) {
		for (const request of owned) {
			results.set(request, await visit(request));
		}
	}
	return requests.map((request) => results.get(request) as Result);
}

async function probeRequest(
	state: ProbeState,
	root: Document,
	request: XrefProbeRequest,
): Promise<XrefProbeResult> {
	const owner = request.owner as unknown as SubstitutingNode;
	const marked = await probeMarked(state, root, request, (node, html) =>
		node.getType() === "xref" ? officialXref(node, html) : undefined,
	);
	const recognized: RecognizedXref[] = [];
	const withoutSource: OfficialXref[] = [];
	for (const { candidate: candidateIndex, hit: official } of marked) {
		const candidate =
			candidateIndex === undefined
				? undefined
				: request.candidates[candidateIndex];
		if (candidateIndex === undefined || !candidate) {
			withoutSource.push(official);
			continue;
		}
		recognized.push({
			candidate: candidateIndex,
			official,
			expandedTarget: owner.subAttributes(candidate.target),
			...(await candidateLabel(owner, candidate)),
		});
	}
	return { recognized, withoutSource };
}

// 锚点的探测与 xref 同一个做法，只是转换器记下的是行内锚点（09 号书第 8 章 Anchor Occurrence）。
async function probeAnchors(
	document: AsciidoctorBlock,
	requests: readonly AnchorProbeRequest[],
): Promise<AnchorProbeResult[]> {
	const state = probeStates.get(document);
	if (!state) {
		throw new Error("probeAnchors requires a document loaded by this adapter");
	}
	const root = official<Document>(document);
	return inPlaybackOrder(document, requests, async (request) => {
		const marked = await probeMarked(state, root, request, (node) => {
			const type = node.getType();
			return type === "ref" || type === "bibref"
				? ({ id: node.getId() ?? "", type } satisfies OfficialInlineAnchor)
				: undefined;
		});
		return {
			recognized: marked.flatMap(({ candidate, hit }) =>
				candidate === undefined || !request.candidates[candidate]
					? []
					: [{ candidate, official: hit }],
			),
		};
	});
}

// 一段文字交给收下它的官方节点重跑一遍替换：每个候选前插一个哨兵，转换器把 capture 认下的节点换成记录标记，
// 交回每个标记与紧挨在它前面的哨兵（没有哨兵时 candidate 为 undefined）。哨兵与候选的第一个字符同类（见上）。
async function probeMarked<Hit>(
	state: ProbeState,
	root: Document,
	request: {
		readonly owner: AsciidoctorBlock;
		readonly title: boolean;
		readonly text: string;
		readonly candidates: readonly { readonly offset: number }[];
	},
	capture: (node: Inline, html: string) => Hit | undefined,
): Promise<{ readonly candidate: number | undefined; readonly hit: Hit }[]> {
	const owner = request.owner as unknown as SubstitutingNode;
	const subs = probeSubstitutions(request);
	if (subs === undefined || request.candidates.length > MAX_PROBE_INDEX) {
		return [];
	}
	let marked = "";
	let last = 0;
	request.candidates.forEach((candidate, index) => {
		const base = wordCharacter.test(request.text.charAt(candidate.offset))
			? WORD_SENTINEL_BASE
			: NON_WORD_SENTINEL_BASE;
		marked +=
			request.text.slice(last, candidate.offset) +
			String.fromCodePoint(base + index);
		last = candidate.offset;
	});
	marked += request.text.slice(last);

	const footnotes = root.getFootnotes();
	const footnotesBefore = footnotes.length;
	state.active = true;
	state.capture = capture;
	state.hits = [];
	let output: string;
	try {
		output = String(
			request.title
				? await owner.applyTitleSubs(marked)
				: await owner.applySubs(marked, subs),
		);
		// 脚注里的 xref 随脚注文字登记进文档的脚注表，不在替换的输出里。
		output += footnotes
			.slice(footnotesBefore)
			.map((footnote) => footnote.getText())
			.join("");
	} finally {
		state.active = false;
		state.capture = undefined;
	}
	// 探测登记的脚注不属于文档。
	footnotes.splice(footnotesBefore);
	const hits = state.hits as Hit[];
	state.hits = [];

	const found: { candidate: number | undefined; hit: Hit }[] = [];
	const codePoints = [...output].map(
		(character) => character.codePointAt(0) ?? 0,
	);
	for (const [index, codePoint] of codePoints.entries()) {
		if (codePoint < MARKER_BASE) {
			continue;
		}
		const hit = hits[codePoint - MARKER_BASE];
		if (hit === undefined) {
			continue;
		}
		found.push({ candidate: sentinelIndex(codePoints[index - 1] ?? 0), hit });
	}
	return found;
}

const wordCharacter = /^[\p{Alphabetic}\p{N}\p{Pc}]$/u;

function sentinelIndex(codePoint: number): number | undefined {
	for (const base of [WORD_SENTINEL_BASE, NON_WORD_SENTINEL_BASE]) {
		if (codePoint >= base && codePoint <= base + MAX_PROBE_INDEX) {
			return codePoint - base;
		}
	}
	return undefined;
}

// 单元格的替换列表不经 getSubstitutions 交出：literal 单元格只做 basic 替换，其余做 normal 替换（table.js 436-451 行）。
function probeSubstitutions(request: {
	readonly owner: AsciidoctorBlock;
	readonly title: boolean;
}): string[] | undefined {
	if (request.title) {
		return [];
	}
	const owner = request.owner;
	if (owner.getContext?.() === "table_cell") {
		return owner.getContentModel?.() === "verbatim" ? undefined : NORMAL_SUBS;
	}
	const subs = owner.getSubstitutions?.() ?? [];
	// 复合块（如 markdown 引语）自己没有替换列表，送来探测的只有它的出处文字，官方用 normal 替换（parser.js 1119-1132 行）。
	if (subs.length === 0) {
		return NORMAL_SUBS;
	}
	return subs.includes("macros") ? subs : undefined;
}

const NORMAL_SUBS = [
	"specialcharacters",
	"quotes",
	"attributes",
	"replacements",
	"macros",
	"post_replacements",
];

// 标签照官方的读法分出命名属性（substitutors.js 1147-1158 行用 extractAttributesFromText 拆），值取源文本。这里调
// parseAttributes、不开替换：两者用同一个 AttributeList 拆，extractAttributesFromText 却把节点当 block 传入，单引号
// 里的值会经过 replacements（'a--b' 成了破折号的实体），不是作者写下的值。整段只是一个位置属性时，两者给出的标签都是
// 原文、命名属性都为空。
async function candidateLabel(
	owner: SubstitutingNode,
	candidate: XrefProbeCandidate,
): Promise<{
	label?: string;
	attributes?: Record<string, string>;
}> {
	const label = candidate.label;
	if (label === undefined || label === "") {
		return {};
	}
	if (candidate.syntax === "shorthand" || !label.includes("=")) {
		return { label };
	}
	const parsed = await owner.parseAttributes(label);
	const text = parsed["1"];
	const attributes: Record<string, string> = {};
	for (const [name, value] of Object.entries(parsed)) {
		if (!/^\d+$/u.test(name) && typeof value === "string") {
			attributes[name] = value;
		}
	}
	return {
		...(typeof text === "string" && text !== "" ? { label: text } : {}),
		...(Object.keys(attributes).length > 0 ? { attributes } : {}),
	};
}

export function createExtensionRegistry(): Registry {
	const registry = Extensions.create();
	registry.inlineMacro(
		"hmeta",
		function (this: InlineMacroProcessorDslInterface) {
			this.positionalAttributes("value");
			this.process(
				(
					parent: AbstractBlock,
					target: string,
					attributes: Record<string, unknown>,
				) => {
					const interpreted = interpretHeadingInlineMetadataAttributes(
						target,
						attributes,
					);
					return this.createInline(
						parent,
						"quoted",
						interpreted.ok ? interpreted.displayText : target,
						{ type: "mark" },
					);
				},
			);
		},
	);
	return registry;
}

function extractAnchorBindings(
	fragment: DefaultTreeAdapterMap["documentFragment"],
): HtmlAnchorBinding[] {
	const bindings: HtmlAnchorBinding[] = [];

	function walk(node: DefaultTreeAdapterMap["node"]): void {
		if (isElement(node) && node.tagName === "a") {
			const attrs = new Map(node.attrs.map((attr) => [attr.name, attr.value]));
			bindings.push({
				href: attrs.get("href"),
				id: attrs.get("id"),
				text: collectText(node),
			});
		}

		for (const child of getChildNodes(node)) {
			walk(child);
		}
	}

	walk(fragment);
	return bindings;
}

function collectText(node: DefaultTreeAdapterMap["node"]): string {
	if ("value" in node && typeof node.value === "string") {
		return node.value;
	}

	return getChildNodes(node).map(collectText).join("");
}

function getChildNodes(
	node: DefaultTreeAdapterMap["node"],
): DefaultTreeAdapterMap["node"][] {
	if ("childNodes" in node && Array.isArray(node.childNodes)) {
		return node.childNodes;
	}
	return [];
}

function isElement(
	node: DefaultTreeAdapterMap["node"],
): node is DefaultTreeAdapterMap["element"] {
	return "tagName" in node;
}
