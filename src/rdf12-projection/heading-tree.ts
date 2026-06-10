import type {
	AbundantDocument,
	AbundantNode,
	SectionNode,
	TitleNode,
} from "../model";

type HeadingTreeEntryBase = {
	readonly parent?: HeadingTreeEntry;
	readonly children: readonly HeadingTreeEntry[];
	readonly documentOrder: number;
	readonly childOrder?: number;
};

export type HeadingTreeEntry =
	| (HeadingTreeEntryBase & {
			readonly node: TitleNode;
			readonly kind: "document-title";
	  })
	| (HeadingTreeEntryBase & {
			readonly node: SectionNode;
			readonly kind: "section";
	  });

export type HeadingTreeProjection = {
	readonly entries: readonly HeadingTreeEntry[];
	readonly roots: readonly HeadingTreeEntry[];
};

type MutableHeadingTreeEntry =
	| MutableDocumentTitleHeadingTreeEntry
	| MutableSectionHeadingTreeEntry;

type MutableHeadingTreeEntryBase = {
	readonly parent?: MutableHeadingTreeEntry;
	readonly children: MutableHeadingTreeEntry[];
	readonly documentOrder: number;
	readonly childOrder?: number;
};

type MutableDocumentTitleHeadingTreeEntry = MutableHeadingTreeEntryBase & {
	readonly node: TitleNode;
	readonly kind: "document-title";
};

type MutableSectionHeadingTreeEntry = MutableHeadingTreeEntryBase & {
	readonly node: SectionNode;
	readonly kind: "section";
};

export function buildHeadingTreeProjection(
	document: AbundantDocument,
): HeadingTreeProjection {
	const entries: MutableHeadingTreeEntry[] = [];
	const roots: MutableHeadingTreeEntry[] = [];
	let nextDocumentOrder = 1;

	const createTitleEntry = (
		node: TitleNode,
	): MutableDocumentTitleHeadingTreeEntry => {
		const entry: MutableDocumentTitleHeadingTreeEntry = {
			node,
			kind: "document-title",
			children: [],
			documentOrder: nextDocumentOrder,
		};
		nextDocumentOrder += 1;
		entries.push(entry);
		return entry;
	};

	const createSectionEntry = (input: {
		readonly node: SectionNode;
		readonly parent?: MutableHeadingTreeEntry;
		readonly childOrder?: number;
	}): MutableSectionHeadingTreeEntry => {
		const entry: MutableSectionHeadingTreeEntry = {
			node: input.node,
			kind: "section",
			...(input.parent !== undefined ? { parent: input.parent } : {}),
			children: [],
			documentOrder: nextDocumentOrder,
			...(input.childOrder !== undefined
				? { childOrder: input.childOrder }
				: {}),
		};
		nextDocumentOrder += 1;
		entries.push(entry);
		return entry;
	};

	const titleEntry =
		document.title === undefined ? undefined : createTitleEntry(document.title);

	if (titleEntry === undefined) {
		roots.push(
			...appendSectionEntries(document.children, undefined, createSectionEntry),
		);
	} else {
		roots.push(titleEntry);
		titleEntry.children.push(
			...appendSectionEntries(
				document.children,
				titleEntry,
				createSectionEntry,
			),
		);
	}

	return { entries, roots };
}

function appendSectionEntries(
	nodes: readonly AbundantNode[] | undefined,
	parent: MutableHeadingTreeEntry | undefined,
	createSectionEntry: (input: {
		readonly node: SectionNode;
		readonly parent?: MutableHeadingTreeEntry;
		readonly childOrder?: number;
	}) => MutableSectionHeadingTreeEntry,
): MutableHeadingTreeEntry[] {
	const entries: MutableHeadingTreeEntry[] = [];
	let nextChildOrder = 1;

	for (const node of nodes ?? []) {
		if (node.kind !== "section") {
			continue;
		}

		const entry = createSectionEntry({
			node,
			...(parent !== undefined ? { parent, childOrder: nextChildOrder } : {}),
		});
		nextChildOrder += 1;
		entry.children.push(
			...appendSectionEntries(node.children, entry, createSectionEntry),
		);
		entries.push(entry);
	}

	return entries;
}
