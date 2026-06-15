import type { AbundantDocument, TargetNode } from "../model";
import { type Rdf12Graph, rdf12Triple } from "./graph";
import { findInnermostHeadingBySourceLine } from "./heading-ownership";
import {
	createRdf12LabelCatalog,
	type Rdf12HeadingLabelKind,
	type Rdf12LabelCatalog,
} from "./label-catalog";
import { stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import type { Rdf12NodeIndex, Rdf12NodeIndexEntry } from "./node-index";
import { sourceRelativePathOrFallback } from "./source-location";
import { iriTerm, type Rdf12IriTerm } from "./terms";

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
	for (const target of input.document.targets) {
		addLocalTargetAlias(catalog, input, target);
	}

	return catalog;
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

function addLocalTargetAlias(
	catalog: Rdf12LabelCatalog,
	input: ProjectLabelsInput,
	target: TargetNode,
): void {
	if (
		target.targetType === "section" ||
		!target.id ||
		target.sourceSpan === undefined
	) {
		return;
	}

	const relativePath = sourceRelativePathOrFallback(
		target.source,
		input.relativePath,
		input.document.mode,
	);
	if (relativePath === undefined) {
		return;
	}

	const owner = findInnermostHeadingBySourceLine({
		nodeIndex: input.nodeIndex,
		relativePath,
		line: target.sourceSpan.start.line,
	});
	if (owner === undefined) {
		return;
	}

	addCatalogEntry(catalog, owner, "addressLabel", target.id);
	input.graph.add(
		rdf12Triple(
			owner.iri,
			iriTerm(`${namespaces.aat}addressLabel`),
			stringLiteral(target.id),
		),
	);
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
