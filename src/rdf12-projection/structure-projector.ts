import type {
	AbundantDocument,
	AbundantNode,
	LineSpan,
	SectionNode,
} from "../model";
import { type Rdf12Graph, rdf12Triple } from "./graph";
import { resolveHeadingSlice } from "./heading-slice";
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
import { addLineSpanTriples } from "./source-location";
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

	projectDocumentTitleHeading(context);
	for (const section of collectSections(input.document.children)) {
		projectHeading(context, section);
	}

	return context.nodeIndex;
}

function projectDocumentTitleHeading(context: StructureProjectorContext): void {
	const title = context.document.title;
	const headingLine = title?.source?.line;

	if (title === undefined || headingLine === undefined) {
		return;
	}

	const span = {
		startLine: headingLine,
		endLine: Math.max(headingLine, firstSectionStartLine(context.document) - 1),
	};
	const iri = createHeadingResource(context, {
		startLine: span.startLine,
		span,
	});

	addTypeAndSourceTriples(context.graph, iri, context.relativePath, span);
	addStringTriple(context.graph, iri, "headline", title.text);
	addIntegerTriple(context.graph, iri, "headingLevel", 0);
	addIntegerTriple(context.graph, iri, "headingLine", headingLine);
}

function firstSectionStartLine(document: AbundantDocument): number {
	const sectionStart = collectSections(document.children)
		.map((section) => sectionStartLine(section))
		.filter((line): line is number => line !== undefined)
		.sort((left, right) => left - right)[0];

	return sectionStart ?? Number.MAX_SAFE_INTEGER;
}

function collectSections(
	nodes: readonly AbundantNode[] | undefined,
): SectionNode[] {
	const sections: SectionNode[] = [];

	for (const node of nodes ?? []) {
		if (node.kind !== "section") {
			continue;
		}
		sections.push(node);
		sections.push(...collectSections(node.children));
	}

	return sections;
}

function projectHeading(
	context: StructureProjectorContext,
	node: SectionNode,
): void {
	const slice = resolveHeadingSlice(node);

	if (slice === undefined) {
		return;
	}

	const iri = createHeadingResource(context, {
		startLine: slice.span.startLine,
		span: slice.span,
	});

	addTypeAndSourceTriples(context.graph, iri, context.relativePath, slice.span);
	addIntegerTriple(context.graph, iri, "headingLine", slice.headingLine);
	addIntegerTriple(context.graph, iri, "headingLevel", node.level);
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
		startLine: slice.span.startLine,
		endLine: slice.span.endLine,
		targetType: "section",
	});
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
	relativePath: string,
	span: LineSpan,
): void {
	graph.add(
		rdf12Triple(
			iri,
			iriTerm(`${namespaces.rdf}type`),
			iriTerm(`${namespaces.aat}Heading`),
		),
	);
	addLineSpanTriples({
		graph,
		subject: iri,
		relativePath,
		span,
	});
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

function sectionStartLine(section: SectionNode): number | undefined {
	return (
		section.metadata
			?.map((item) => item.line)
			.find((line) => line !== undefined) ??
		section.line ??
		section.span?.startLine
	);
}

function localIdFromIri(iri: Rdf12IriTerm): string {
	const hashIndex = iri.value.lastIndexOf("#");
	return hashIndex === -1 ? iri.value : iri.value.slice(hashIndex + 1);
}
