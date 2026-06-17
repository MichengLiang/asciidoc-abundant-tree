import type {
	AbundantDocument,
	AbundantNode,
	ListingNode,
	MetadataNode,
} from "../model";
import { fieldPredicate } from "./field-predicate";
import type { Rdf12Graph } from "./graph";
import { rdf12Triple } from "./graph";
import { findInnermostHeadingBySourceLine } from "./heading-ownership";
import type { Rdf12LabelCatalog } from "./label-catalog";
import { integerLiteral, stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import type { Rdf12NodeIndex } from "./node-index";
import {
	createOrdinalAllocator,
	makeBlockResourceLocalId,
	makeResourceIri,
	type OrdinalAllocator,
} from "./resource-identity";
import { bindSelector } from "./selector-binding";
import {
	addLineSpanTriples,
	sourceRelativePathOrFallback,
} from "./source-location";
import { iriTerm, type Rdf12IriTerm } from "./terms";
import type { Rdf12XrefIndex, Rdf12XrefIndexEntry } from "./xref-projector";

export type ProjectPayloadBlocksInput = {
	readonly graph: Rdf12Graph;
	readonly document: AbundantDocument;
	readonly baseIri: string;
	readonly documentKey: string;
	readonly relativePath: string;
	readonly labelCatalog: Rdf12LabelCatalog;
	readonly nodeIndex: Rdf12NodeIndex;
	readonly xrefIndex: Rdf12XrefIndex;
};

type ComplexPropertyProjectorContext = ProjectPayloadBlocksInput & {
	readonly ordinalAllocator: OrdinalAllocator;
	readonly sourceValues: readonly SourceValueBlockEntry[];
	readonly sourceValuesById: ReadonlyMap<
		string,
		readonly SourceValueBlockEntry[]
	>;
};

type SourceValueBlockEntry = {
	readonly ids: readonly string[];
	readonly language: string | undefined;
	readonly raw: string;
	readonly span: NonNullable<ListingNode["span"]>;
	readonly contentSpan: ListingNode["contentSpan"] | undefined;
	readonly relativePath: string;
	readonly roles: readonly string[];
	readonly attributes: Readonly<Record<string, string | number | boolean>>;
};

type HeadingMarker =
	| {
			readonly kind: "selector";
			readonly selector: string;
	  }
	| {
			readonly kind: "source-owner";
	  };

export function projectPayloadBlocks(input: ProjectPayloadBlocksInput): void {
	const sourceValues = collectSourceValueBlocks(input);
	const context: ComplexPropertyProjectorContext = {
		...input,
		ordinalAllocator: createOrdinalAllocator(),
		sourceValues,
		sourceValuesById: indexSourceValuesById(sourceValues),
	};

	for (const entry of sourceValues) {
		projectHeadingComplexProperty(context, entry);
	}
	for (const entry of input.xrefIndex.entries()) {
		projectXrefFields(context, entry);
	}
}

function collectSourceValueBlocks(
	input: ProjectPayloadBlocksInput,
): readonly SourceValueBlockEntry[] {
	const entries: SourceValueBlockEntry[] = [];

	for (const child of input.document.children) {
		collectSourceValueBlocksFromNode(input, child, entries);
	}

	return entries;
}

function collectSourceValueBlocksFromNode(
	input: ProjectPayloadBlocksInput,
	node: AbundantNode,
	entries: SourceValueBlockEntry[],
): void {
	if (node.kind === "listing") {
		const entry = sourceValueBlockEntry(input, node);
		if (entry !== undefined) {
			entries.push(entry);
		}
	}

	for (const child of node.children ?? []) {
		collectSourceValueBlocksFromNode(input, child, entries);
	}
}

function sourceValueBlockEntry(
	input: ProjectPayloadBlocksInput,
	node: ListingNode,
): SourceValueBlockEntry | undefined {
	if (node.span === undefined || node.content === undefined) {
		return undefined;
	}
	const relativePath = sourceRelativePathOrFallback(
		node.source,
		input.relativePath,
		input.document.mode,
	);
	if (relativePath === undefined) {
		return undefined;
	}

	return {
		ids: node.ids,
		language: node.language,
		raw: node.content,
		span: node.span,
		contentSpan: node.contentSpan,
		relativePath,
		roles: sourceValueRoles(node.metadata),
		attributes: sourceValueAttributes(node.metadata),
	};
}

function indexSourceValuesById(
	entries: readonly SourceValueBlockEntry[],
): ReadonlyMap<string, readonly SourceValueBlockEntry[]> {
	const index = new Map<string, SourceValueBlockEntry[]>();

	for (const entry of entries) {
		for (const id of entry.ids) {
			const values = index.get(id) ?? [];
			values.push(entry);
			index.set(id, values);
		}
	}

	return index;
}

function projectHeadingComplexProperty(
	context: ComplexPropertyProjectorContext,
	entry: SourceValueBlockEntry,
): void {
	const marker = headingMarkerFor(entry.attributes);
	if (marker === undefined) {
		return;
	}
	const [fieldName] = entry.roles;
	if (fieldName === undefined || entry.roles.length !== 1) {
		return;
	}
	const owner = headingOwnerForComplexProperty(context, entry, marker);
	if (owner === undefined) {
		return;
	}
	const value = createRawValueObject(context, entry);

	context.graph.add(rdf12Triple(owner, fieldPredicate(fieldName), value));
	if (marker.kind === "selector") {
		addString(context.graph, value, "forSelector", marker.selector);
	}
}

function headingOwnerForComplexProperty(
	context: ComplexPropertyProjectorContext,
	entry: SourceValueBlockEntry,
	marker: HeadingMarker,
): Rdf12IriTerm | undefined {
	if (marker.kind === "selector") {
		const result = bindSelector(context.labelCatalog, marker.selector);
		return result.status === "bound" ? result.target : undefined;
	}

	return findInnermostHeadingBySourceLine({
		nodeIndex: context.nodeIndex,
		relativePath: entry.relativePath,
		line: entry.span.startLine,
	})?.iri;
}

function projectXrefFields(
	context: ComplexPropertyProjectorContext,
	entry: Rdf12XrefIndexEntry,
): void {
	for (const [fieldName, rawValue] of Object.entries(
		entry.node.attributes ?? {},
	)) {
		if (fieldName === "rel") {
			continue;
		}
		const value = String(rawValue);
		const sourceValue = uniqueSourceValueForId(context, value);
		if (sourceValue === undefined) {
			addFieldLiteral(context.graph, entry.iri, fieldName, value);
			continue;
		}

		const rawValueObject = createRawValueObject(context, sourceValue);
		context.graph.add(
			rdf12Triple(entry.iri, fieldPredicate(fieldName), rawValueObject),
		);
		addString(context.graph, rawValueObject, "sourceValueId", value);
	}
}

function uniqueSourceValueForId(
	context: ComplexPropertyProjectorContext,
	id: string,
): SourceValueBlockEntry | undefined {
	const matches = context.sourceValuesById.get(id) ?? [];
	return matches.length === 1 ? matches[0] : undefined;
}

function createRawValueObject(
	context: ComplexPropertyProjectorContext,
	entry: SourceValueBlockEntry,
): Rdf12IriTerm {
	const ordinal = context.ordinalAllocator.next({
		kind: "payload",
		startLine: entry.span.startLine,
	});
	const value = makeResourceIri({
		baseIri: context.baseIri,
		documentKey: context.documentKey,
		localId: makeBlockResourceLocalId({
			kind: "payload",
			startLine: entry.span.startLine,
			ordinal,
		}),
	});

	addLineSpanTriples({
		graph: context.graph,
		subject: value,
		relativePath: entry.relativePath,
		span: entry.span,
	});
	addOptionalLineSpan(context.graph, value, "content", entry.contentSpan);
	addString(context.graph, value, "raw", entry.raw);
	addOptionalString(context.graph, value, "format", entry.language);

	return value;
}

function headingMarkerFor(
	attributes: Readonly<Record<string, string | number | boolean>>,
): HeadingMarker | undefined {
	const forSelector = markerValue(attributes.forSelector);
	if (forSelector !== undefined) {
		return forSelector;
	}
	return markerValue(attributes.for);
}

function markerValue(
	value: string | number | boolean | undefined,
): HeadingMarker | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value === "boolean") {
		return value ? { kind: "source-owner" } : undefined;
	}
	const selector = String(value).trim();
	return selector.length === 0
		? { kind: "source-owner" }
		: { kind: "selector", selector };
}

function sourceValueRoles(
	metadata: readonly MetadataNode[] | undefined,
): readonly string[] {
	return metadata?.flatMap((item) => item.roles ?? []) ?? [];
}

function sourceValueAttributes(
	metadata: readonly MetadataNode[] | undefined,
): Readonly<Record<string, string | number | boolean>> {
	const attributes: Record<string, string | number | boolean> = {};

	for (const item of metadata ?? []) {
		if (item.metadataKind !== "attrlist" || item.attributes === undefined) {
			continue;
		}
		Object.assign(attributes, item.attributes);
	}

	return attributes;
}

function addOptionalLineSpan(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	prefix: "content",
	span: ListingNode["contentSpan"] | undefined,
): void {
	if (span === undefined) {
		return;
	}

	graph.add(
		rdf12Triple(
			subject,
			iriTerm(`${namespaces.aat}${prefix}StartLine`),
			integerLiteral(span.startLine),
		),
	);
	graph.add(
		rdf12Triple(
			subject,
			iriTerm(`${namespaces.aat}${prefix}EndLine`),
			integerLiteral(span.endLine),
		),
	);
}

function addOptionalString(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string | undefined,
): void {
	if (value === undefined) {
		return;
	}

	addString(graph, subject, predicateLocalName, value);
}

function addFieldLiteral(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	fieldName: string,
	value: string,
): void {
	graph.add(
		rdf12Triple(subject, fieldPredicate(fieldName), stringLiteral(value)),
	);
}

function addString(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string,
): void {
	graph.add(
		rdf12Triple(
			subject,
			iriTerm(`${namespaces.aat}${predicateLocalName}`),
			stringLiteral(value),
		),
	);
}
