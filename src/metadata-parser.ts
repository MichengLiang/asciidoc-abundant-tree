import type { AsciidoctorBlock } from "./asciidoctor-adapter";
import {
	recoverSourceAwareSourceLayer,
	sourceAwareDocumentForLineTable,
} from "./book-entry/source-aware-coordinate";
import type { MetadataNode, SourceLayer, SourceSpan } from "./model";
import { definedObject } from "./object-utils";
import {
	isLineComment,
	type LineTable,
	lineText,
	spanForLineText,
} from "./source-lines";

export type MetadataSurface = {
	node: MetadataNode;
	line: number;
	ids: string[];
	title?: string;
	style?: string;
	language?: string;
};

const idAttrPattern = /^\[#([^,.\]]+)\]$/;
const idLongAttrPattern = /^\[id=([^,\]]+)\]$/;
const blockAnchorPattern = /^\[\[([^,\]]+)(?:,([^\]]+))?\]\]$/;
const titlePattern = /^\.(.+)$/;
const attrListPattern = /^\[([^\]]+)\]$/;
// 官方在元数据之间读掉的属性条目（rx.js 的 AttributeEntryRx）与块注释的围栏。
const attributeEntryPattern = /^:(!?[\p{L}\p{N}_][^:]*):(?:[ \t]+.*)?$/u;
const blockCommentFencePattern = /^\/{4,}$/;

// 一次解析里，官方对每一个 attrlist 的读法，按方括号里的文字查（09 号书第 8 章 Metadata Attachment）。官方的
// parseAttributes 是异步的，元数据扫描却在同步的源区间推导里，所以解析开始时先读好（readAttributeLists），随这次解析
// 往下传。不带 block、不做替换时，官方的结果只取决于这段文字，按文字查即可。
export type AttributeListReadings = ReadonlyMap<
	string,
	Readonly<Record<string, unknown>>
>;

export async function readAttributeLists(
	lineTable: LineTable,
	read: (text: string) => Promise<Record<string, unknown>>,
): Promise<AttributeListReadings> {
	const readings = new Map<string, Readonly<Record<string, unknown>>>();
	for (const text of attrListTexts(lineTable)) {
		readings.set(text, await read(text));
	}
	return readings;
}

// 引语里的块在去掉每一层 `> ` 以后才是官方读到的样子（source-lines.ts 的 quotedLineTable），各层都收。
function attrListTexts(lineTable: LineTable): Set<string> {
	const texts = new Set<string>();
	for (const line of lineTable.lines) {
		let text = line.text;
		for (;;) {
			const inner = attrListPattern.exec(text)?.[1];
			if (inner !== undefined) {
				texts.add(inner);
			}
			const unquoted =
				text.trimEnd() === ">"
					? ""
					: text.startsWith("> ")
						? text.slice(2)
						: text;
			if (unquoted === text) {
				break;
			}
			text = unquoted;
		}
	}
	return texts;
}

// 元数据照官方的读法附着（09 号书第 8 章 Metadata Attachment；parser.js 的 nextBlock 与 parseBlockMetadataLines）：
// 官方每读完一行元数据就跳过其后的空行，夹在中间的行注释、块注释与属性条目也读掉，再读下一行，直到读出块。这里从
// 块往回读，同样越过它们。越过以后再碰到的块标题行未必是元数据：官方读段落时 `.标题` 行不断开段落
// （readParagraphLines 只在 attribute list、锚点行与分隔符处断开），它可能是上一个段落的末行。所以越过空行收下的
// 块标题，要官方块的标题（节的块标题也记在 attributes 的 title 里）确是这一行才算，否则就停在那里；离块更近处
// 已经收下了标题时，更远的标题被它覆盖，官方块上看不到，不再核对。
export function collectPrecedingMetadata(
	lineTable: LineTable,
	ownerLine: number,
	attributeLists: AttributeListReadings,
	owner: AsciidoctorBlock,
): MetadataSurface[] {
	const officialTitle = owner.getAttributes?.().title;
	const surfaces: MetadataSurface[] = [];
	let crossed = false;
	let titled = false;
	let cursor = ownerLine - 1;

	while (cursor > 0) {
		const text = lineText(lineTable, cursor);
		if (
			text.trim() === "" ||
			isLineComment(text) ||
			attributeEntryPattern.test(text)
		) {
			crossed = true;
			cursor -= 1;
			continue;
		}
		if (blockCommentFencePattern.test(text)) {
			const opening = blockCommentOpening(lineTable, cursor, text);
			if (opening === undefined) {
				break;
			}
			crossed = true;
			cursor = opening - 1;
			continue;
		}
		const surface = parseMetadataLine(lineTable, cursor, text, attributeLists);
		if (!surface) {
			break;
		}
		if (surface.title !== undefined) {
			if (crossed && !titled && surface.title !== officialTitle) {
				break;
			}
			titled = true;
		}
		surfaces.unshift(surface);
		cursor -= 1;
	}

	return surfaces;
}

// 往回读到的围栏是块注释的结束围栏，开头围栏是它上面最近的同一行。
function blockCommentOpening(
	lineTable: LineTable,
	closing: number,
	fence: string,
): number | undefined {
	for (let line = closing - 1; line > 0; line -= 1) {
		if (lineText(lineTable, line) === fence) {
			return line;
		}
	}
	return undefined;
}

function parseMetadataLine(
	lineTable: LineTable,
	line: number,
	raw: string,
	attributeLists: AttributeListReadings,
): MetadataSurface | undefined {
	const sourceSpan = spanForLineText(lineTable, line, 1);
	const idAttr = idAttrPattern.exec(raw) ?? idLongAttrPattern.exec(raw);
	if (idAttr?.[1]) {
		const id = idAttr[1];
		return {
			node: {
				kind: "metadata",
				metadataKind: "id",
				raw,
				line,
				ids: [id],
				source: metadataSource(lineTable, line, raw, sourceSpan),
			},
			line,
			ids: [id],
		};
	}

	const blockAnchor = blockAnchorPattern.exec(raw);
	if (blockAnchor?.[1]) {
		const id = blockAnchor[1];
		return {
			node: {
				kind: "metadata",
				metadataKind: "anchor",
				raw,
				line,
				ids: [id],
				source: metadataSource(lineTable, line, raw, sourceSpan),
			},
			line,
			ids: [id],
		};
	}

	const title = titlePattern.exec(raw);
	if (title?.[1]) {
		return {
			node: {
				kind: "metadata",
				metadataKind: "title",
				raw,
				line,
				source: metadataSource(lineTable, line, raw, sourceSpan),
			},
			line,
			ids: [],
			title: title[1],
		};
	}

	const attrList = attrListPattern.exec(raw);
	if (attrList?.[1]) {
		const parsed = parseAttrList(attrList[1], attributeLists);
		return definedObject({
			node: {
				kind: "metadata",
				metadataKind: "attrlist",
				raw,
				line,
				ids: parsed.ids,
				roles: parsed.roles,
				attributes: parsed.attributes,
				source: metadataSource(lineTable, line, raw, sourceSpan),
			},
			line,
			ids: parsed.ids,
			style: parsed.style,
			language: parsed.language,
		}) as MetadataSurface;
	}

	return undefined;
}

// source layer 是回源以后的坐标（10 号书第 7 章 Parser Integration）：book-entry 下 line 是展开 include 之后的逻辑行，
// 要经 line origin 回到作者写下它的文件与行。回不了源（生成的行）时不拿逻辑行冒充源坐标，只留 raw；逻辑行在节点的 line 上。
function metadataSource(
	lineTable: LineTable,
	line: number,
	raw: string,
	sourceSpan: SourceSpan,
): SourceLayer {
	const document = sourceAwareDocumentForLineTable(lineTable);
	if (document === undefined) {
		return { raw, line, sourceSpan };
	}
	const recovered = recoverSourceAwareSourceLayer(
		document,
		{ startLine: line, endLine: line },
		{ logicalSourceSpan: sourceSpan, diagnosticContext: "block metadata" },
	);
	return recovered.ok ? { ...recovered.sourceLayer, raw } : { raw };
}

function parseAttrList(
	raw: string,
	attributeLists: AttributeListReadings,
): {
	ids: string[];
	roles: string[];
	attributes: Record<string, string | number | boolean>;
	style?: string;
	language?: string;
} {
	const official = attributeLists.get(raw);
	if (official === undefined) {
		throw new Error(
			`attrlist [${raw}] was not read by Asciidoctor before scanning; pass the readings from readAttributeLists for this source`,
		);
	}
	const ids: string[] = [];
	const roles: string[] = [];
	const attributes: Record<string, string | number | boolean> = {};

	// 位置属性的键是 "1"、"2"……，其余是官方认下的命名属性；名字不合官方属性名规则的整段（葱、姜=多）是位置属性。
	const positional = new Map<number, string>();
	for (const [key, value] of Object.entries(official)) {
		if (typeof value !== "string") {
			continue;
		}
		if (/^\d+$/u.test(key)) {
			positional.set(Number(key), value);
		} else {
			attributes[key] = value;
		}
	}

	const first = positional.get(1);
	if (first !== undefined) {
		const parsedFirst = parseStyleIdRoles(first);
		ids.push(...parsedFirst.ids);
		roles.push(...parsedFirst.roles);
		if (parsedFirst.style) {
			attributes.style = parsedFirst.style;
		}
	}
	for (const [index, value] of positional) {
		if (index === 1) {
			continue;
		}
		if (value === "for" || value === "forSelector") {
			attributes[value] = true;
			continue;
		}
		if (
			index === 2 &&
			typeof attributes.style === "string" &&
			!value.includes("#") &&
			!value.includes(".")
		) {
			attributes.language = value;
		}
	}

	return definedObject({
		ids,
		roles,
		attributes,
		style: typeof attributes.style === "string" ? attributes.style : undefined,
		language:
			typeof attributes.language === "string" ? attributes.language : undefined,
	}) as {
		ids: string[];
		roles: string[];
		attributes: Record<string, string | number | boolean>;
		style?: string;
		language?: string;
	};
}

function parseStyleIdRoles(part: string): {
	style?: string;
	ids: string[];
	roles: string[];
} {
	const ids = [...part.matchAll(/#([\p{L}\p{N}_-]+)/gu)]
		.map((match) => match[1])
		.filter((id): id is string => id !== undefined);
	const roles = [...part.matchAll(/\.([\p{L}\p{N}_-]+)/gu)]
		.map((match) => match[1])
		.filter((role): role is string => role !== undefined);
	const style = part.split(/[.#]/u)[0];

	return definedObject({
		style: style || undefined,
		ids,
		roles,
	}) as {
		style?: string;
		ids: string[];
		roles: string[];
	};
}
