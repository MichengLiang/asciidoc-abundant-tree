import type {
	AbundantDocument,
	AbundantNode,
	LineSpan,
	MetadataNode,
	XrefOccurrenceNode,
} from "../model";
import type { Rdf12Graph } from "./graph";
import { rdf12Triple } from "./graph";
import { stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import type { Rdf12NodeIndex } from "./node-index";
import {
	createOrdinalAllocator,
	makeAttributeLocalId,
	makeResourceIri,
	type OrdinalAllocator,
} from "./resource-identity";
import { addLineSpanTriples } from "./source-location";
import { iriTerm, type Rdf12IriTerm } from "./terms";
import type { Rdf12XrefIndex } from "./xref-projector";

export type ProjectSurfaceAttributesInput = {
	readonly graph: Rdf12Graph;
	readonly document: AbundantDocument;
	readonly baseIri: string;
	readonly documentKey: string;
	readonly relativePath: string;
	readonly nodeIndex: Rdf12NodeIndex;
	readonly xrefIndex: Rdf12XrefIndex;
};

type AttributeProjectorContext = ProjectSurfaceAttributesInput & {
	readonly ordinalAllocator: OrdinalAllocator;
};

const xrefControlAttributes = new Set(["rel", "payload"]);

export function projectSurfaceAttributes(
	input: ProjectSurfaceAttributesInput,
): void {
	const context: AttributeProjectorContext = {
		...input,
		ordinalAllocator: createOrdinalAllocator(),
	};

	for (const node of input.document.children) {
		projectNodeAttributes(context, node);
	}
	for (const entry of input.xrefIndex.entries()) {
		projectXrefAttributes(context, entry.iri, entry.node);
	}
}

function projectNodeAttributes(
	context: AttributeProjectorContext,
	node: AbundantNode,
): void {
	switch (node.kind) {
		case "section":
		case "listing":
		case "table":
			projectMetadataAttributes(context, node, node.metadata);
			break;
		default:
			break;
	}

	for (const child of node.children ?? []) {
		projectNodeAttributes(context, child);
	}
}

function projectMetadataAttributes(
	context: AttributeProjectorContext,
	node: AbundantNode,
	metadata: readonly MetadataNode[] | undefined,
): void {
	const owner = context.nodeIndex.get(node);
	if (owner === undefined) {
		return;
	}

	for (const item of metadata ?? []) {
		if (item.metadataKind !== "attrlist" || item.attributes === undefined) {
			continue;
		}
		const span = lineSpanForMetadata(item);
		if (span === undefined) {
			continue;
		}
		for (const [name, value] of Object.entries(item.attributes)) {
			addSurfaceAttribute(context, {
				owner,
				name,
				value: String(value),
				span,
			});
		}
	}
}

function projectXrefAttributes(
	context: AttributeProjectorContext,
	owner: Rdf12IriTerm,
	xref: XrefOccurrenceNode,
): void {
	if (xref.attributes === undefined || xref.sourceSpan === undefined) {
		return;
	}

	const span = {
		startLine: xref.sourceSpan.start.line,
		endLine: xref.sourceSpan.end.line,
	};
	for (const [name, value] of Object.entries(xref.attributes)) {
		if (xrefControlAttributes.has(name)) {
			continue;
		}
		addSurfaceAttribute(context, {
			owner,
			name,
			value: String(value),
			span,
		});
	}
}

function addSurfaceAttribute(
	context: AttributeProjectorContext,
	input: {
		readonly owner: Rdf12IriTerm;
		readonly name: string;
		readonly value: string;
		readonly span: LineSpan;
	},
): void {
	const ordinal = context.ordinalAllocator.next({
		kind: "attribute",
		startLine: input.span.startLine,
	});
	const attribute = makeResourceIri({
		baseIri: context.baseIri,
		documentKey: context.documentKey,
		localId: makeAttributeLocalId({
			startLine: input.span.startLine,
			ordinal,
		}),
	});

	context.graph.add(
		rdf12Triple(
			attribute,
			iriTerm(`${namespaces.rdf}type`),
			iriTerm(`${namespaces.aat}SurfaceAttribute`),
		),
	);
	context.graph.add(
		rdf12Triple(
			attribute,
			iriTerm(`${namespaces.aat}name`),
			stringLiteral(input.name),
		),
	);
	context.graph.add(
		rdf12Triple(
			attribute,
			iriTerm(`${namespaces.rdf}value`),
			stringLiteral(input.value),
		),
	);
	addLineSpanTriples({
		graph: context.graph,
		subject: attribute,
		relativePath: context.relativePath,
		span: input.span,
	});
	context.graph.add(
		rdf12Triple(
			input.owner,
			iriTerm(`${namespaces.aat}hasAttribute`),
			attribute,
		),
	);
}

function lineSpanForMetadata(metadata: MetadataNode): LineSpan | undefined {
	return metadata.line === undefined
		? undefined
		: { startLine: metadata.line, endLine: metadata.line };
}
