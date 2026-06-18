import type { AbundantDocument, AbundantNode, MetadataNode } from "../model";
import { fieldPredicate } from "./field-predicate";
import type { Rdf12Graph } from "./graph";
import { rdf12Triple } from "./graph";
import { stringLiteral } from "./literals";
import type { Rdf12NodeIndex } from "./node-index";
import type { Rdf12IriTerm } from "./terms";
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

export function projectSurfaceAttributes(
	input: ProjectSurfaceAttributesInput,
): void {
	for (const node of input.document.children) {
		projectNodeAttributes(input.graph, input.nodeIndex, node);
	}
}

function projectNodeAttributes(
	graph: Rdf12Graph,
	nodeIndex: Rdf12NodeIndex,
	node: AbundantNode,
): void {
	if (node.kind === "section") {
		projectHeadingMetadataAttributes(graph, nodeIndex, node, node.metadata);
		projectHeadingDescriptionMetadataAttributes(graph, nodeIndex, node);
	}

	for (const child of node.children ?? []) {
		projectNodeAttributes(graph, nodeIndex, child);
	}
}

function projectHeadingMetadataAttributes(
	graph: Rdf12Graph,
	nodeIndex: Rdf12NodeIndex,
	node: AbundantNode,
	metadata: readonly MetadataNode[] | undefined,
): void {
	const owner = nodeIndex.get(node);
	if (owner === undefined) {
		return;
	}

	for (const item of metadata ?? []) {
		for (const role of item.roles ?? []) {
			addFieldTriple(graph, owner, "role", role);
		}
		if (item.metadataKind !== "attrlist" || item.attributes === undefined) {
			continue;
		}
		for (const [name, value] of Object.entries(item.attributes)) {
			addFieldTriple(graph, owner, name, String(value));
		}
	}
}

function projectHeadingDescriptionMetadataAttributes(
	graph: Rdf12Graph,
	nodeIndex: Rdf12NodeIndex,
	node: AbundantNode,
): void {
	if (node.kind !== "section") {
		return;
	}
	const owner = nodeIndex.get(node);
	if (owner === undefined) {
		return;
	}

	for (const [name, value] of Object.entries(
		node.descriptionMetadata?.fields ?? {},
	)) {
		addFieldTriple(graph, owner, name, value);
	}
}

function addFieldTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	fieldName: string,
	value: string,
): void {
	graph.add(
		rdf12Triple(subject, fieldPredicate(fieldName), stringLiteral(value)),
	);
}
