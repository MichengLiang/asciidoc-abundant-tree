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
