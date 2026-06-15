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
	const parts = raw
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	const ids: string[] = [];
	const roles: string[] = [];
	const attributes: Record<string, string | number | boolean> = {};

	for (const [index, part] of parts.entries()) {
		if (part.includes("=")) {
			const [key, ...value] = part.split("=");
			if (key) {
				attributes[key.trim()] = value.join("=").trim();
			}
			continue;
		}

		const parsedFirst = index === 0 ? parseStyleIdRoles(part) : undefined;
		if (parsedFirst) {
			ids.push(...parsedFirst.ids);
			roles.push(...parsedFirst.roles);
			if (parsedFirst.style) {
				attributes.style = parsedFirst.style;
			}
			continue;
		}

		if (part === "for" || part === "forSelector") {
			attributes[part] = true;
			continue;
		}

		const idMatch = /#([\p{L}\p{N}_-]+)/u.exec(part);
		if (idMatch?.[1]) {
			ids.push(idMatch[1]);
		}
		for (const role of part.matchAll(/\.([\p{L}\p{N}_-]+)/gu)) {
			if (role[1]) {
				roles.push(role[1]);
			}
		}
		if (
			index === 1 &&
			typeof attributes.style === "string" &&
			idMatch === null &&
			!part.includes(".")
		) {
			attributes.language = part;
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
