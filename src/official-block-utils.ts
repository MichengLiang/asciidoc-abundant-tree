import type { AsciidoctorBlock } from "./asciidoctor-adapter";

export type OfficialDescriptionListItem = {
	terms: AsciidoctorBlock[];
	description?: AsciidoctorBlock | undefined;
};

export function childBlocksOf(block: AsciidoctorBlock): AsciidoctorBlock[] {
	const rawBlocks = block.getBlocks?.() ?? [];
	if (block.getContext?.() === "dlist") {
		return descriptionListItemsFromBlock(block).flatMap((item) => [
			...item.terms,
			...(item.description ? [item.description] : []),
		]);
	}
	return rawBlocks.filter(isAsciidoctorBlock);
}

// a| 单元格的内容是一个内嵌文档（table.js 386、432 行：它的 Reader 接着单元格的游标）。它不是表格的子块，
// 投影不进节点树；补坐标与行内扫描要走进去（09 号书「Inline 扫描边界」）。
export function asciidocCellDocuments(
	block: AsciidoctorBlock,
): AsciidoctorBlock[] {
	return tableCells(block).flatMap((cell) => cellDocument(cell) ?? []);
}

export function tableCells(block: AsciidoctorBlock): unknown[] {
	const rows = block.getContext?.() === "table" ? block.rows : undefined;
	if (rows === null || typeof rows !== "object") {
		return [];
	}
	return ["head", "body", "foot"].flatMap((group) => {
		const groupRows = (rows as Record<string, unknown>)[group];
		return Array.isArray(groupRows)
			? groupRows.flatMap((row) => (Array.isArray(row) ? row : []))
			: [];
	});
}

export function cellDocument(cell: unknown): AsciidoctorBlock | undefined {
	const document = (
		cell as { getInnerDocument?: () => unknown } | null
	)?.getInnerDocument?.();
	return isAsciidoctorBlock(document) ? document : undefined;
}

export function descriptionListItemsFromBlock(
	block: AsciidoctorBlock,
): OfficialDescriptionListItem[] {
	const rawItems = block.getBlocks?.() ?? [];
	const items: OfficialDescriptionListItem[] = [];
	for (const rawItem of rawItems) {
		const item = descriptionListItemFromRaw(rawItem);
		if (item) {
			items.push(item);
		}
	}
	return items;
}

export function isAsciidoctorBlock(value: unknown): value is AsciidoctorBlock {
	return (
		value !== null &&
		typeof value === "object" &&
		(typeof (value as AsciidoctorBlock).getContext === "function" ||
			typeof (value as AsciidoctorBlock).getNodeName === "function" ||
			typeof (value as AsciidoctorBlock).getSourceLocation === "function" ||
			typeof (value as AsciidoctorBlock).getBlocks === "function")
	);
}

function descriptionListItemFromRaw(
	rawItem: unknown,
): OfficialDescriptionListItem | undefined {
	if (!Array.isArray(rawItem)) {
		return undefined;
	}
	const [rawTerms, rawDescription] = rawItem;
	if (!Array.isArray(rawTerms)) {
		return undefined;
	}
	const terms = rawTerms.filter(isAsciidoctorBlock);
	if (terms.length === 0) {
		return undefined;
	}
	return {
		terms,
		...(isAsciidoctorBlock(rawDescription)
			? { description: rawDescription }
			: {}),
	};
}
