import type { AbundantDocument, SourceSpan } from "../model";
import type { Rdf12Graph } from "./graph";
import {
	createRdf12LabelCatalog,
	type Rdf12HeadingLabelKind,
	type Rdf12LabelCatalog,
} from "./label-catalog";
import type { Rdf12NodeIndex, Rdf12NodeIndexEntry } from "./node-index";
import type { Rdf12IriTerm } from "./terms";

export type ProjectLabelsInput = {
	readonly graph: Rdf12Graph;
	readonly document: AbundantDocument;
	readonly baseIri: string;
	readonly documentKey: string;
	readonly documentIri: Rdf12IriTerm;
	readonly relativePath: string;
	readonly nodeIndex: Rdf12NodeIndex;
};

export function projectLabels(input: ProjectLabelsInput): Rdf12LabelCatalog {
	const catalog = createRdf12LabelCatalog();

	for (const entry of input.nodeIndex.entries()) {
		addHeadingLabels(catalog, entry);
	}

	return catalog;
}

export function addXrefDisplayLabelResource(_input: {
	readonly graph: Rdf12Graph;
	readonly catalog: Rdf12LabelCatalog;
	readonly baseIri: string;
	readonly documentKey: string;
	readonly relativePath: string;
	readonly owner: Rdf12IriTerm;
	readonly value: string;
	readonly sourceSpan: SourceSpan;
}): void {
	// Xref display text is not part of the Batch 03 heading selector label space.
}

export function addAddressLabelResource(_input: {
	readonly graph: Rdf12Graph;
	readonly catalog: Rdf12LabelCatalog;
	readonly baseIri: string;
	readonly documentKey: string;
	readonly relativePath: string;
	readonly owner: Rdf12IriTerm;
	readonly value: string;
	readonly span: { readonly startLine: number; readonly endLine: number };
}): void {
	// Payload and block ids are not part of the Batch 03 heading selector label space.
}

function addHeadingLabels(
	catalog: Rdf12LabelCatalog,
	entry: Rdf12NodeIndexEntry,
): void {
	if (entry.kind === "document-title") {
		addCatalogEntry(catalog, entry, "headline", entry.node.text);
		return;
	}

	addCatalogEntry(catalog, entry, "headline", entry.node.title);
	const labelKind: Rdf12HeadingLabelKind =
		entry.node.idOrigin === "asciidoctor-generated"
			? "generatedAddressLabel"
			: "addressLabel";

	for (const id of entry.node.ids) {
		addCatalogEntry(catalog, entry, labelKind, id);
	}
}

function addCatalogEntry(
	catalog: Rdf12LabelCatalog,
	entry: Rdf12NodeIndexEntry,
	labelKind: Rdf12HeadingLabelKind,
	value: string | undefined,
): void {
	if (value === undefined || value.length === 0) {
		return;
	}

	catalog.add({
		owner: entry.iri,
		labelKind,
		value,
	});
}
