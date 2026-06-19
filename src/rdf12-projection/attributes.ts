import type {
	AbundantDocument,
	AbundantNode,
	MetadataNode,
	SectionNode,
	SourceSpan,
} from "../model";
import { definedObject } from "../object-utils";
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

type HeadingFieldFact = {
	readonly owner: SectionNode;
	readonly field: string;
	readonly value: string;
	readonly sourceKind:
		| "attrlist-role"
		| "attrlist-attribute"
		| "description-metadata"
		| "heading-inline-metadata";
	readonly sourceSpan?: SourceSpan;
};

export function projectSurfaceAttributes(
	input: ProjectSurfaceAttributesInput,
): void {
	for (const fact of collectHeadingFieldFacts(
		input.document,
		input.nodeIndex,
	)) {
		const owner = input.nodeIndex.get(fact.owner);
		if (owner === undefined) {
			continue;
		}
		addFieldTriple(input.graph, owner, fact.field, fact.value);
	}
}

function collectHeadingFieldFacts(
	document: AbundantDocument,
	nodeIndex: Rdf12NodeIndex,
): HeadingFieldFact[] {
	const facts: HeadingFieldFact[] = [];
	for (const node of document.children) {
		collectNodeHeadingFieldFacts(facts, node);
	}
	facts.push(...headingInlineMetadataFacts(document, nodeIndex));
	return facts;
}

function collectNodeHeadingFieldFacts(
	facts: HeadingFieldFact[],
	node: AbundantNode,
): void {
	if (node.kind === "section") {
		facts.push(...headingMetadataFacts(node, node.metadata));
		facts.push(...headingDescriptionMetadataFacts(node));
	}

	for (const child of node.children ?? []) {
		collectNodeHeadingFieldFacts(facts, child);
	}
}

function headingMetadataFacts(
	owner: SectionNode,
	metadata: readonly MetadataNode[] | undefined,
): HeadingFieldFact[] {
	const facts: HeadingFieldFact[] = [];
	for (const item of metadata ?? []) {
		for (const role of item.roles ?? []) {
			facts.push(
				definedObject({
					owner,
					field: "role",
					value: role,
					sourceKind: "attrlist-role",
					sourceSpan: item.source?.sourceSpan,
				}) as HeadingFieldFact,
			);
		}
		if (item.metadataKind !== "attrlist" || item.attributes === undefined) {
			continue;
		}
		for (const [name, value] of Object.entries(item.attributes)) {
			facts.push(
				definedObject({
					owner,
					field: name,
					value: String(value),
					sourceKind: "attrlist-attribute",
					sourceSpan: item.source?.sourceSpan,
				}) as HeadingFieldFact,
			);
		}
	}
	return facts;
}

function headingDescriptionMetadataFacts(
	owner: SectionNode,
): HeadingFieldFact[] {
	return (owner.descriptionMetadata?.entries ?? []).map(
		(entry) =>
			definedObject({
				owner,
				field: entry.key,
				value: entry.value,
				sourceKind: "description-metadata",
				sourceSpan: entry.term.sourceSpan,
			}) as HeadingFieldFact,
	);
}

function headingInlineMetadataFacts(
	document: AbundantDocument,
	nodeIndex: Rdf12NodeIndex,
): HeadingFieldFact[] {
	const sectionById = sectionBySourceId(nodeIndex);
	return document.headingInlineMetadataOccurrences.flatMap((occurrence) => {
		if (occurrence.containingSectionId === undefined) {
			return [];
		}
		const owner = sectionById.get(occurrence.containingSectionId);
		if (!owner) {
			return [];
		}
		return [
			definedObject({
				owner,
				field: occurrence.field,
				value: occurrence.value,
				sourceKind: "heading-inline-metadata" as const,
				sourceSpan: occurrence.sourceSpan,
			}) as HeadingFieldFact,
		];
	});
}

function sectionBySourceId(
	nodeIndex: Rdf12NodeIndex,
): Map<string, SectionNode> {
	const sections = new Map<string, SectionNode>();
	for (const entry of nodeIndex.entries()) {
		if (entry.kind !== "section") {
			continue;
		}
		for (const id of entry.node.ids) {
			sections.set(id, entry.node);
		}
	}
	return sections;
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
