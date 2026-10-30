import type {
	AbundantDocument,
	LineSpan,
	SectionNode,
	TargetNode,
} from "../model";
import { type Rdf12Graph, rdf12Triple } from "./graph";
import {
	buildHeadingAddressBook,
	type HeadingAddressBook,
} from "./heading-address";
import {
	findHeadingBySectionId,
	findInnermostHeadingBySourceLine,
} from "./heading-ownership";
import {
	type HeadingSlice,
	resolveDocumentTitleHeadingSlice,
	resolveHeadingSlice,
} from "./heading-slice";
import {
	buildHeadingTreeProjection,
	type HeadingTreeEntry,
	type HeadingTreeProjection,
} from "./heading-tree";
import { integerLiteral, stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import {
	createRdf12NodeIndex,
	type MutableRdf12NodeIndex,
	type Rdf12NodeIndex,
	type Rdf12NodeIndexEntry,
} from "./node-index";
import { documentResourceIri, makeHeadingLocalId } from "./resource-identity";
import {
	addLineSpanTriples,
	sourceRelativePathOrFallback,
} from "./source-location";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type ProjectStructureResourcesInput = {
	readonly graph: Rdf12Graph;
	readonly document: AbundantDocument;
	readonly documentIri: string;
	readonly relativePath: string;
	readonly sourceText?: string;
};

export type HeadingNode = Rdf12NodeIndexEntry["node"];

// 归属到标题的本地非标题 target ID：它是这个标题的地址，经地址簿写成 aat:addressLabel。
type HeadingTargetAlias = {
	readonly owner: HeadingNode;
	readonly id: string;
};

export type StructureProjection = {
	readonly nodeIndex: Rdf12NodeIndex;
	readonly addressBook: HeadingAddressBook<HeadingNode>;
};

// 标题的切片与位置先定下：地址簿要看整份文档的标题，其中有按位置归属的本地 target ID。
type PlacedHeading = (Rdf12NodeIndexEntry extends infer Entry
	? Entry extends Rdf12NodeIndexEntry
		? Omit<Entry, "iri" | "localId">
		: never
	: never) & {
	readonly entry: HeadingTreeEntry;
	readonly slice: HeadingSlice;
};

export function projectStructureResources(
	input: ProjectStructureResourcesInput,
): StructureProjection {
	const headingTree = buildHeadingTreeProjection(input.document);
	const placed = headingTree.entries.flatMap((entry) => {
		const heading = placeHeading(input, entry);
		return heading === undefined ? [] : [heading];
	});
	const targetAliases = collectTargetAliases(input, placed);
	const addressBook = buildHeadingAddressBook(
		placed.map((heading) => ({
			key: heading.node,
			...(heading.entry.parent !== undefined
				? { parent: heading.entry.parent.node }
				: {}),
			headline: headlineOf(heading),
			ids: heading.kind === "section" ? heading.node.ids : [],
			idKind:
				heading.kind === "section" &&
				heading.node.idOrigin === "asciidoctor-generated"
					? ("generatedAddressLabel" as const)
					: ("addressLabel" as const),
			targetAliases: targetAliases
				.filter((alias) => alias.owner === heading.node)
				.map((alias) => alias.id),
		})),
	);

	const nodeIndex = createRdf12NodeIndex();
	for (const heading of placed) {
		projectHeading(input, nodeIndex, heading);
	}
	projectHeadingStructureEdges(input.graph, nodeIndex, headingTree);

	return { nodeIndex, addressBook };
}

function headlineOf(heading: PlacedHeading): string {
	return heading.kind === "document-title"
		? heading.node.text
		: heading.node.title;
}

function placeHeading(
	input: ProjectStructureResourcesInput,
	entry: HeadingTreeEntry,
): PlacedHeading | undefined {
	const common = {
		entry,
		documentOrder: entry.documentOrder,
		...(entry.childOrder !== undefined ? { childOrder: entry.childOrder } : {}),
		targetType: "section" as const,
	};
	if (entry.kind === "document-title") {
		const sourceText =
			input.document.mode === "book-entry"
				? undefined
				: (input.sourceText ?? input.document.sourceText);
		const slice = resolveDocumentTitleHeadingSlice(input.document, {
			...(sourceText !== undefined ? { sourceText } : {}),
		});
		if (slice === undefined) {
			return undefined;
		}
		const relativePath = entry.node.source?.relativePath ?? input.relativePath;
		return {
			...common,
			node: entry.node,
			kind: "document-title",
			slice,
			...(relativePath !== undefined
				? {
						relativePath,
						sourceStartLine: slice.span.startLine,
						sourceEndLine: slice.span.endLine,
					}
				: {}),
			startLine: slice.span.startLine,
			endLine: slice.span.endLine,
		};
	}

	const slice = resolveHeadingSlice(entry.node);
	if (slice === undefined) {
		return undefined;
	}
	const relativePath = sourceRelativePathOrFallback(
		entry.node.source,
		input.relativePath,
		input.document.mode,
	);
	return {
		...common,
		node: entry.node,
		kind: "section",
		slice,
		...(relativePath !== undefined ? { relativePath } : {}),
		...sourceScopeLines(input.document, entry.node, slice.span),
		startLine: slice.span.startLine,
		endLine: slice.span.endLine,
	};
}

function collectTargetAliases(
	input: ProjectStructureResourcesInput,
	placed: readonly PlacedHeading[],
): HeadingTargetAlias[] {
	const headings = { entries: () => placed };
	const aliases: HeadingTargetAlias[] = [];
	for (const target of input.document.targets) {
		if (
			target.targetType === "section" ||
			!target.id ||
			(target.sourceSpan === undefined &&
				target.containingSectionId === undefined)
		) {
			continue;
		}
		const owner =
			findHeadingBySectionId(headings, target.containingSectionId) ??
			ownerBySourceLine(input, headings, target);
		if (owner !== undefined) {
			aliases.push({ owner: owner.node, id: target.id });
		}
	}
	return aliases;
}

function ownerBySourceLine(
	input: ProjectStructureResourcesInput,
	headings: { entries(): readonly PlacedHeading[] },
	target: TargetNode,
): PlacedHeading | undefined {
	const relativePath = sourceRelativePathOrFallback(
		target.source,
		input.relativePath,
		input.document.mode,
	);
	if (relativePath === undefined || target.sourceSpan === undefined) {
		return undefined;
	}
	return findInnermostHeadingBySourceLine({
		nodeIndex: headings,
		relativePath,
		line: target.sourceSpan.start.line,
	});
}

function projectHeading(
	input: ProjectStructureResourcesInput,
	nodeIndex: MutableRdf12NodeIndex,
	heading: PlacedHeading,
): void {
	const { graph } = input;
	const localId = makeHeadingLocalId(heading.documentOrder);
	const iri = documentResourceIri(input.documentIri, localId);
	const { slice } = heading;

	addTypeAndSourceTriples(graph, iri, heading.relativePath, slice.span);
	addStringTriple(graph, iri, "headline", headlineOf(heading));
	addIntegerTriple(
		graph,
		iri,
		"headingLevel",
		heading.kind === "section" ? heading.node.level : 0,
	);
	addIntegerTriple(graph, iri, "documentOrder", heading.documentOrder);
	addOptionalIntegerTriple(graph, iri, "childOrder", heading.childOrder);
	addIntegerTriple(graph, iri, "headingLine", slice.headingLine);
	addStringTriple(graph, iri, "raw", slice.raw);
	if (heading.kind === "section") {
		addOptionalLineSpan(graph, iri, "metadata", slice.metadataSpan);
	}
	addOptionalLineSpan(graph, iri, "content", slice.contentSpan);

	const { entry: _entry, slice: _slice, ...indexed } = heading;
	nodeIndex.set({ ...indexed, iri, localId } as Rdf12NodeIndexEntry);
}

function projectHeadingStructureEdges(
	graph: Rdf12Graph,
	nodeIndex: Rdf12NodeIndex,
	headingTree: HeadingTreeProjection,
): void {
	for (const entry of headingTree.entries) {
		const parentIri = nodeIndex.get(entry.node);
		if (parentIri === undefined) {
			continue;
		}
		for (const child of entry.children) {
			const childIri = nodeIndex.get(child.node);
			if (childIri !== undefined) {
				graph.add(
					rdf12Triple(
						parentIri,
						iriTerm(`${namespaces.aat}containsDirectly`),
						childIri,
					),
				);
			}
		}
	}
}

function sourceScopeLines(
	document: AbundantDocument,
	node: SectionNode,
	sliceSpan: LineSpan,
):
	| {
			readonly sourceStartLine: number;
			readonly sourceEndLine: number;
	  }
	| Record<string, never> {
	if (node.source?.span !== undefined) {
		return {
			sourceStartLine: node.source.span.startLine,
			sourceEndLine: node.source.span.endLine,
		};
	}

	return document.mode === "single-file"
		? {
				sourceStartLine: sliceSpan.startLine,
				sourceEndLine: sliceSpan.endLine,
			}
		: {};
}

function addTypeAndSourceTriples(
	graph: Rdf12Graph,
	iri: Rdf12IriTerm,
	relativePath: string | undefined,
	span: LineSpan,
): void {
	graph.add(
		rdf12Triple(
			iri,
			iriTerm(`${namespaces.rdf}type`),
			iriTerm(`${namespaces.aat}Heading`),
		),
	);
	if (relativePath !== undefined) {
		addLineSpanTriples({
			graph,
			subject: iri,
			relativePath,
			span,
		});
	}
}

function addOptionalLineSpan(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	prefix: "metadata" | "content",
	span: LineSpan | undefined,
): void {
	if (span === undefined) {
		return;
	}

	addIntegerTriple(graph, subject, `${prefix}StartLine`, span.startLine);
	addIntegerTriple(graph, subject, `${prefix}EndLine`, span.endLine);
}

function addStringTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string | undefined,
): void {
	if (value === undefined) {
		return;
	}

	graph.add(
		rdf12Triple(
			subject,
			iriTerm(`${namespaces.aat}${predicateLocalName}`),
			stringLiteral(value),
		),
	);
}

function addIntegerTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: number,
): void {
	graph.add(
		rdf12Triple(
			subject,
			iriTerm(`${namespaces.aat}${predicateLocalName}`),
			integerLiteral(value),
		),
	);
}

function addOptionalIntegerTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: number | undefined,
): void {
	if (value === undefined) {
		return;
	}

	addIntegerTriple(graph, subject, predicateLocalName, value);
}
