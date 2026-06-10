import type { AbundantDocument, LineSpan, SectionNode } from "../model";
import { type Rdf12Graph, rdf12Triple } from "./graph";
import {
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
} from "./node-index";
import {
	createOrdinalAllocator,
	makeHeadingResourceLocalId,
	makeResourceIri,
	type OrdinalAllocator,
} from "./resource-identity";
import {
	addLineSpanTriples,
	sourceRelativePathOrFallback,
} from "./source-location";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type ProjectStructureResourcesInput = {
	readonly graph: Rdf12Graph;
	readonly document: AbundantDocument;
	readonly baseIri: string;
	readonly documentKey: string;
	readonly documentIri: Rdf12IriTerm;
	readonly relativePath: string;
	readonly sourceText?: string;
};

type StructureProjectorContext = ProjectStructureResourcesInput & {
	readonly nodeIndex: MutableRdf12NodeIndex;
	readonly ordinalAllocator: OrdinalAllocator;
};

export function projectStructureResources(
	input: ProjectStructureResourcesInput,
): Rdf12NodeIndex {
	const context: StructureProjectorContext = {
		...input,
		nodeIndex: createRdf12NodeIndex(),
		ordinalAllocator: createOrdinalAllocator(),
	};
	const headingTree = buildHeadingTreeProjection(input.document);

	for (const entry of headingTree.entries) {
		projectHeadingTreeEntry(context, entry);
	}
	projectHeadingStructureEdges(context, headingTree);

	return context.nodeIndex;
}

function projectHeadingTreeEntry(
	context: StructureProjectorContext,
	entry: HeadingTreeEntry,
): void {
	if (entry.kind === "document-title") {
		projectDocumentTitleHeading(context, entry);
		return;
	}

	projectHeading(context, entry);
}

function projectDocumentTitleHeading(
	context: StructureProjectorContext,
	entry: HeadingTreeEntry & { readonly kind: "document-title" },
): void {
	const title = entry.node;
	const sourceText =
		context.document.mode === "book-entry"
			? undefined
			: (context.sourceText ?? context.document.sourceText);
	const slice = resolveDocumentTitleHeadingSlice(context.document, {
		...(sourceText !== undefined ? { sourceText } : {}),
	});

	if (slice === undefined) {
		return;
	}

	const iri = createHeadingResource(context, {
		startLine: slice.span.startLine,
		span: slice.span,
	});
	const relativePath = title.source?.relativePath ?? context.relativePath;

	addTypeAndSourceTriples(context.graph, iri, relativePath, slice.span);
	addStringTriple(context.graph, iri, "headline", title.text);
	addIntegerTriple(context.graph, iri, "headingLevel", 0);
	addIntegerTriple(context.graph, iri, "documentOrder", entry.documentOrder);
	addOptionalIntegerTriple(context.graph, iri, "childOrder", entry.childOrder);
	addIntegerTriple(context.graph, iri, "headingLine", slice.headingLine);
	addStringTriple(context.graph, iri, "raw", slice.raw);
	addOptionalLineSpan(context.graph, iri, "content", slice.contentSpan);
	context.nodeIndex.set({
		node: title,
		iri,
		localId: localIdFromIri(iri),
		kind: "document-title",
		documentOrder: entry.documentOrder,
		...(entry.childOrder !== undefined ? { childOrder: entry.childOrder } : {}),
		...(relativePath !== undefined ? { relativePath } : {}),
		...(relativePath !== undefined
			? {
					sourceStartLine: slice.span.startLine,
					sourceEndLine: slice.span.endLine,
				}
			: {}),
		startLine: slice.span.startLine,
		endLine: slice.span.endLine,
		targetType: "section",
	});
}

function projectHeading(
	context: StructureProjectorContext,
	entry: HeadingTreeEntry & { readonly kind: "section" },
): void {
	const node = entry.node;
	const slice = resolveHeadingSlice(node);

	if (slice === undefined) {
		return;
	}

	const iri = createHeadingResource(context, {
		startLine: slice.span.startLine,
		span: slice.span,
	});
	const relativePath = sourceRelativePathOrFallback(
		node.source,
		context.relativePath,
		context.document.mode,
	);

	addTypeAndSourceTriples(context.graph, iri, relativePath, slice.span);
	addIntegerTriple(context.graph, iri, "headingLine", slice.headingLine);
	addIntegerTriple(context.graph, iri, "headingLevel", node.level);
	addIntegerTriple(context.graph, iri, "documentOrder", entry.documentOrder);
	addOptionalIntegerTriple(context.graph, iri, "childOrder", entry.childOrder);
	addStringTriple(context.graph, iri, "headline", node.title);
	addStringTriple(context.graph, iri, "raw", slice.raw);
	addOptionalLineSpan(context.graph, iri, "metadata", slice.metadataSpan);
	addOptionalLineSpan(context.graph, iri, "content", slice.contentSpan);
	addHeadingLabels(context.graph, iri, node);
	context.nodeIndex.set({
		node,
		iri,
		localId: localIdFromIri(iri),
		kind: "section",
		documentOrder: entry.documentOrder,
		...(entry.childOrder !== undefined ? { childOrder: entry.childOrder } : {}),
		...(relativePath !== undefined ? { relativePath } : {}),
		...sourceScopeLines(context.document, node, slice.span),
		startLine: slice.span.startLine,
		endLine: slice.span.endLine,
		targetType: "section",
	});
}

function projectHeadingStructureEdges(
	context: StructureProjectorContext,
	headingTree: HeadingTreeProjection,
): void {
	addHeadingStructureEdgesForChildren(context, undefined, headingTree.roots);
	for (const entry of headingTree.entries) {
		addHeadingStructureEdgesForChildren(context, entry, entry.children);
	}
}

function addHeadingStructureEdgesForChildren(
	context: StructureProjectorContext,
	parent: HeadingTreeEntry | undefined,
	children: readonly HeadingTreeEntry[],
): void {
	const parentIri =
		parent === undefined ? undefined : context.nodeIndex.get(parent.node);
	const projectedChildren = children.flatMap((child) => {
		const iri = context.nodeIndex.get(child.node);
		return iri === undefined ? [] : [iri];
	});

	for (const childIri of projectedChildren) {
		if (parentIri !== undefined) {
			context.graph.add(
				rdf12Triple(
					parentIri,
					iriTerm(`${namespaces.aat}containsDirectly`),
					childIri,
				),
			);
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

function createHeadingResource(
	context: StructureProjectorContext,
	input: { readonly startLine: number; readonly span: LineSpan },
): Rdf12IriTerm {
	const ordinal = context.ordinalAllocator.next({
		kind: "heading",
		startLine: input.startLine,
	});
	const localId = makeHeadingResourceLocalId({
		startLine: input.startLine,
		ordinal,
	});

	return makeResourceIri({
		baseIri: context.baseIri,
		documentKey: context.documentKey,
		localId,
	});
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

function addHeadingLabels(
	graph: Rdf12Graph,
	iri: Rdf12IriTerm,
	node: SectionNode,
): void {
	const predicate =
		node.idOrigin === "asciidoctor-generated"
			? "generatedAddressLabel"
			: "addressLabel";

	for (const id of node.ids) {
		addStringTriple(graph, iri, predicate, id);
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

function localIdFromIri(iri: Rdf12IriTerm): string {
	const hashIndex = iri.value.lastIndexOf("#");
	return hashIndex === -1 ? iri.value : iri.value.slice(hashIndex + 1);
}
