import type {
	AbundantDocument,
	AbundantNode,
	AnchorOccurrenceNode,
	LineSpan,
	ListingNode,
	ParagraphNode,
	SectionNode,
	TableNode,
} from "../model";
import type { Rdf12Graph } from "./graph";
import { rdf12Triple } from "./graph";
import { integerLiteral, stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import {
	createRdf12NodeIndex,
	type MutableRdf12NodeIndex,
	type Rdf12NodeIndex,
} from "./node-index";
import {
	createOrdinalAllocator,
	makeBlockResourceLocalId,
	makeOccurrenceResourceLocalId,
	makeResourceIri,
	type OrdinalAllocator,
	type ResourceKind,
} from "./resource-identity";
import { addLineSpanTriples, addSourceSpanTriples } from "./source-location";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type ProjectStructureResourcesInput = {
	readonly graph: Rdf12Graph;
	readonly document: AbundantDocument;
	readonly baseIri: string;
	readonly documentKey: string;
	readonly documentIri: Rdf12IriTerm;
	readonly relativePath: string;
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

	projectDirectChildren(context, input.documentIri, input.document.children);

	return context.nodeIndex;
}

function projectDirectChildren(
	context: StructureProjectorContext,
	parentIri: Rdf12IriTerm,
	children: readonly AbundantNode[] | undefined,
): void {
	for (const child of children ?? []) {
		const childIri = projectNode(context, child);

		if (childIri !== undefined) {
			addContainsDirectlyTriple(context.graph, parentIri, childIri);
		}
	}
}

function projectNode(
	context: StructureProjectorContext,
	node: AbundantNode,
): Rdf12IriTerm | undefined {
	switch (node.kind) {
		case "section":
			return projectSection(context, node);
		case "paragraph":
			return projectParagraph(context, node);
		case "listing":
			return projectListing(context, node);
		case "table":
			return projectTable(context, node);
		case "anchor":
			return projectAnchor(context, node);
		default:
			return undefined;
	}
}

function projectSection(
	context: StructureProjectorContext,
	node: SectionNode,
): Rdf12IriTerm | undefined {
	if (node.span === undefined) {
		return undefined;
	}

	const iri = createBlockResource(context, node, {
		kind: "section",
		span: node.span,
		typeLocalName: "Section",
	});
	context.graph.add(
		rdf12Triple(
			iri,
			iriTerm(`${namespaces.aat}sectionLevel`),
			integerLiteral(node.level),
		),
	);
	projectDirectChildren(context, iri, node.children);

	return iri;
}

function projectParagraph(
	context: StructureProjectorContext,
	node: ParagraphNode,
): Rdf12IriTerm | undefined {
	const span = node.source?.span;

	if (span === undefined) {
		return undefined;
	}

	const iri = createBlockResource(context, node, {
		kind: "paragraph",
		span,
		typeLocalName: "Paragraph",
	});

	if (node.text !== undefined) {
		context.graph.add(
			rdf12Triple(
				iri,
				iriTerm(`${namespaces.aat}sourceText`),
				stringLiteral(node.text),
			),
		);
	}

	projectDirectChildren(context, iri, node.children);

	return iri;
}

function projectListing(
	context: StructureProjectorContext,
	node: ListingNode,
): Rdf12IriTerm | undefined {
	if (node.span === undefined) {
		return undefined;
	}

	const iri = createBlockResource(context, node, {
		kind: "listing",
		span: node.span,
		typeLocalName: "ListingBlock",
	});
	addOptionalLineSpan(context, iri, "metadata", node.metadataSpan);
	addOptionalLineSpan(context, iri, "content", node.contentSpan);
	addOptionalString(context, iri, "listingStyle", node.style);
	addOptionalString(context, iri, "language", node.language);
	addOptionalString(context, iri, "sourceText", node.content);

	return iri;
}

function projectTable(
	context: StructureProjectorContext,
	node: TableNode,
): Rdf12IriTerm | undefined {
	if (node.span === undefined) {
		return undefined;
	}

	const iri = createBlockResource(context, node, {
		kind: "table",
		span: node.span,
		typeLocalName: "TableBlock",
	});
	projectDirectChildren(context, iri, node.children);

	return iri;
}

function projectAnchor(
	context: StructureProjectorContext,
	node: AnchorOccurrenceNode,
): Rdf12IriTerm | undefined {
	if (node.sourceSpan === undefined) {
		return undefined;
	}

	const ordinal = context.ordinalAllocator.next({
		kind: "anchor",
		startLine: node.sourceSpan.start.line,
		startColumn: node.sourceSpan.start.column,
	});
	const localId = makeOccurrenceResourceLocalId({
		kind: "anchor",
		startLine: node.sourceSpan.start.line,
		startColumn: node.sourceSpan.start.column,
		ordinal,
	});
	const iri = makeResourceIri({
		baseIri: context.baseIri,
		documentKey: context.documentKey,
		localId,
	});

	context.graph.add(
		rdf12Triple(
			iri,
			iriTerm(`${namespaces.rdf}type`),
			iriTerm(`${namespaces.aat}AnchorTarget`),
		),
	);
	addSourceSpanTriples({
		graph: context.graph,
		subject: iri,
		relativePath: context.relativePath,
		sourceSpan: node.sourceSpan,
	});
	context.nodeIndex.set({
		node,
		iri,
		localId,
		kind: node.kind,
		startLine: node.sourceSpan.start.line,
		startColumn: node.sourceSpan.start.column,
	});

	return iri;
}

function createBlockResource(
	context: StructureProjectorContext,
	node: AbundantNode,
	input: {
		readonly kind: ResourceKind;
		readonly span: LineSpan;
		readonly typeLocalName: string;
	},
): Rdf12IriTerm {
	const ordinal = context.ordinalAllocator.next({
		kind: input.kind,
		startLine: input.span.startLine,
	});
	const localId = makeBlockResourceLocalId({
		kind: input.kind,
		startLine: input.span.startLine,
		ordinal,
	});
	const iri = makeResourceIri({
		baseIri: context.baseIri,
		documentKey: context.documentKey,
		localId,
	});

	context.graph.add(
		rdf12Triple(
			iri,
			iriTerm(`${namespaces.rdf}type`),
			iriTerm(`${namespaces.aat}${input.typeLocalName}`),
		),
	);
	addLineSpanTriples({
		graph: context.graph,
		subject: iri,
		relativePath: context.relativePath,
		span: input.span,
	});
	context.nodeIndex.set({
		node,
		iri,
		localId,
		kind: node.kind,
		startLine: input.span.startLine,
	});

	return iri;
}

function addContainsDirectlyTriple(
	graph: Rdf12Graph,
	parentIri: Rdf12IriTerm,
	childIri: Rdf12IriTerm,
): void {
	graph.add(
		rdf12Triple(
			parentIri,
			iriTerm(`${namespaces.aat}containsDirectly`),
			childIri,
		),
	);
}

function addOptionalLineSpan(
	context: StructureProjectorContext,
	subject: Rdf12IriTerm,
	prefix: "metadata" | "content",
	span: LineSpan | undefined,
): void {
	if (span === undefined) {
		return;
	}

	context.graph.add(
		rdf12Triple(
			subject,
			iriTerm(`${namespaces.aat}${prefix}StartLine`),
			integerLiteral(span.startLine),
		),
	);
	context.graph.add(
		rdf12Triple(
			subject,
			iriTerm(`${namespaces.aat}${prefix}EndLine`),
			integerLiteral(span.endLine),
		),
	);
}

function addOptionalString(
	context: StructureProjectorContext,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string | undefined,
): void {
	if (value === undefined) {
		return;
	}

	context.graph.add(
		rdf12Triple(
			subject,
			iriTerm(`${namespaces.aat}${predicateLocalName}`),
			stringLiteral(value),
		),
	);
}
