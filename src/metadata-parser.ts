import type { MetadataNode } from "./model";
import { definedObject } from "./object-utils";
import { type LineTable, lineText, spanForLineText } from "./source-lines";

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

// attrlist 由官方拆（09 号书第 8 章 Metadata Attachment），官方的 parseAttributes 却是异步的，而元数据扫描在同步的
// 源区间推导里。所以解析之前先把源里每一个 attrlist 交给官方读一遍（readAttributeLists），扫描时按文字查。
// 不带 block、不做替换时，官方的结果只取决于这段文字，按文字记下即可，与哪份文档、哪一行无关。
const officialAttributeLists = new Map<string, Record<string, unknown>>();

export async function readAttributeLists(
	lineTable: LineTable,
	read: (text: string) => Promise<Record<string, unknown>>,
): Promise<void> {
	for (const text of attrListTexts(lineTable)) {
		if (!officialAttributeLists.has(text)) {
			officialAttributeLists.set(text, await read(text));
		}
	}
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

export function collectPrecedingMetadata(
	lineTable: LineTable,
	ownerLine: number,
): MetadataSurface[] {
	const surfaces: MetadataSurface[] = [];
	let cursor = ownerLine - 1;

	while (cursor > 0) {
		const text = lineText(lineTable, cursor);
		const surface = parseMetadataLine(lineTable, cursor, text);
		if (!surface) {
			break;
		}
		surfaces.unshift(surface);
		cursor -= 1;
	}

	return surfaces;
}

function parseMetadataLine(
	lineTable: LineTable,
	line: number,
	raw: string,
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
				source: { raw, line, sourceSpan },
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
				source: { raw, line, sourceSpan },
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
				source: { raw, line, sourceSpan },
			},
			line,
			ids: [],
			title: title[1],
		};
	}

	const attrList = attrListPattern.exec(raw);
	if (attrList?.[1]) {
		const parsed = parseAttrList(attrList[1]);
		return definedObject({
			node: {
				kind: "metadata",
				metadataKind: "attrlist",
				raw,
				line,
				ids: parsed.ids,
				roles: parsed.roles,
				attributes: parsed.attributes,
				source: { raw, line, sourceSpan },
			},
			line,
			ids: parsed.ids,
			style: parsed.style,
			language: parsed.language,
		}) as MetadataSurface;
	}

	return undefined;
}

function parseAttrList(raw: string): {
	ids: string[];
	roles: string[];
	attributes: Record<string, string | number | boolean>;
	style?: string;
	language?: string;
} {
	const official = officialAttributeLists.get(raw);
	if (official === undefined) {
		throw new Error(
			`attrlist [${raw}] was not read by Asciidoctor before scanning; readAttributeLists must run first`,
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
