import type { AbundantDocument, AbundantNode, ListingNode } from "../model";
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

type PayloadProjectorContext = ProjectPayloadBlocksInput & {
	readonly ordinalAllocator: OrdinalAllocator;
	readonly xrefPayloadSelectors: ReadonlySet<string>;
	readonly edgePayloadsBySelector: Map<string, PayloadRecord[]>;
};

type PayloadKind = "node" | "edge";

type NodePayloadMarker =
	| { readonly kind: "selector"; readonly selector: string }
	| { readonly kind: "source-owner" };

type PayloadRecord = {
	readonly iri: Rdf12IriTerm;
	readonly kind: PayloadKind;
	readonly ids: readonly string[];
};

export function projectPayloadBlocks(input: ProjectPayloadBlocksInput): void {
	const context: PayloadProjectorContext = {
		...input,
		ordinalAllocator: createOrdinalAllocator(),
		xrefPayloadSelectors: collectXrefPayloadSelectors(input.xrefIndex),
		edgePayloadsBySelector: new Map(),
	};

	for (const child of input.document.children) {
		projectPayloads(context, child);
	}
	bindXrefPayloads(context);
}

function projectPayloads(
	context: PayloadProjectorContext,
	node: AbundantNode,
): void {
	if (node.kind === "listing") {
		projectPayloadListing(context, node);
	}

	for (const child of node.children ?? []) {
		projectPayloads(context, child);
	}
}

function projectPayloadListing(
	context: PayloadProjectorContext,
	node: ListingNode,
): void {
	if (node.span === undefined) {
		return;
	}

	const marker = nodePayloadMarkerFor(node);
	if (marker !== undefined) {
		const payload = createPayload(context, node, "node");
		writeNodeBinding(context, payload.iri, node, marker);
	}

	if (node.ids.some((id) => context.xrefPayloadSelectors.has(id))) {
		const payload = createPayload(context, node, "edge");
		for (const id of node.ids) {
			addString(context.graph, payload.iri, "payloadId", id);
			addPayloadSelector(context, id, payload);
		}
	}
}

function createPayload(
	context: PayloadProjectorContext,
	node: ListingNode,
	kind: PayloadKind,
): PayloadRecord {
	if (node.span === undefined) {
		throw new Error("payload resource requires a source span");
	}

	const ordinal = context.ordinalAllocator.next({
		kind: "payload",
		startLine: node.span.startLine,
	});
	const payload = makeResourceIri({
		baseIri: context.baseIri,
		documentKey: context.documentKey,
		localId: makeBlockResourceLocalId({
			kind: "payload",
			startLine: node.span.startLine,
			ordinal,
		}),
	});

	addString(context.graph, payload, "payloadKind", kind);
	for (const role of payloadRoles(node)) {
		addString(context.graph, payload, "role", role);
	}
	const relativePath = sourceRelativePathOrFallback(
		node.source,
		context.relativePath,
		context.document.mode,
	);
	if (relativePath !== undefined) {
		addLineSpanTriples({
			graph: context.graph,
			subject: payload,
			relativePath,
			span: node.span,
		});
	}
	addOptionalLineSpan(context.graph, payload, "content", node.contentSpan);
	addOptionalString(context.graph, payload, "raw", node.content);
	addOptionalString(context.graph, payload, "format", node.language);

	return {
		iri: payload,
		kind,
		ids: [...node.ids],
	};
}

function writeNodeBinding(
	context: PayloadProjectorContext,
	payload: Rdf12IriTerm,
	node: ListingNode,
	marker: NodePayloadMarker,
): void {
	if (marker.kind === "selector") {
		addString(context.graph, payload, "forSelector", marker.selector);
		const result = bindSelector(context.labelCatalog, marker.selector);
		if (result.status === "bound") {
			context.graph.add(
				rdf12Triple(
					result.target,
					iriTerm(`${namespaces.aat}payload`),
					payload,
				),
			);
		}
		return;
	}

	const relativePath = sourceRelativePathOrFallback(
		node.source,
		context.relativePath,
		context.document.mode,
	);
	if (relativePath === undefined || node.span === undefined) {
		return;
	}
	const owner = findInnermostHeadingBySourceLine({
		nodeIndex: context.nodeIndex,
		relativePath,
		line: node.span.startLine,
	});
	if (owner === undefined) {
		return;
	}

	context.graph.add(
		rdf12Triple(owner.iri, iriTerm(`${namespaces.aat}payload`), payload),
	);
}

function bindXrefPayloads(context: PayloadProjectorContext): void {
	for (const entry of context.xrefIndex.entries()) {
		const payloadSelector = stringAttribute(entry, "payload");
		if (payloadSelector === undefined) {
			continue;
		}
		const payload = uniquePayloadForSelector(context, payloadSelector);
		if (payload === undefined) {
			continue;
		}
		context.graph.add(
			rdf12Triple(entry.iri, iriTerm(`${namespaces.aat}payload`), payload),
		);
	}
}

function collectXrefPayloadSelectors(
	xrefIndex: Rdf12XrefIndex,
): ReadonlySet<string> {
	const selectors = new Set<string>();
	for (const entry of xrefIndex.entries()) {
		const selector = stringAttribute(entry, "payload");
		if (selector !== undefined) {
			selectors.add(selector);
		}
	}
	return selectors;
}

function nodePayloadMarkerFor(
	node: ListingNode,
): NodePayloadMarker | undefined {
	for (const metadata of node.metadata ?? []) {
		if (metadata.metadataKind !== "attrlist") {
			continue;
		}
		const attributes = metadata.attributes;
		if (attributes === undefined) {
			continue;
		}
		const forSelector = markerValue(attributes.forSelector);
		if (forSelector?.kind === "selector") {
			return forSelector;
		}
		const forValue = markerValue(attributes.for);
		if (forValue?.kind === "selector") {
			return forValue;
		}
		if (
			forSelector?.kind === "source-owner" ||
			forValue?.kind === "source-owner"
		) {
			return { kind: "source-owner" };
		}
	}
	return undefined;
}

function markerValue(
	value: string | number | boolean | undefined,
): NodePayloadMarker | undefined {
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

function payloadRoles(node: ListingNode): string[] {
	return node.metadata?.flatMap((item) => item.roles ?? []) ?? [];
}

function addPayloadSelector(
	context: PayloadProjectorContext,
	selector: string,
	payload: PayloadRecord,
): void {
	const payloads = context.edgePayloadsBySelector.get(selector) ?? [];
	payloads.push(payload);
	context.edgePayloadsBySelector.set(selector, payloads);
}

function uniquePayloadForSelector(
	context: PayloadProjectorContext,
	selector: string,
): Rdf12IriTerm | undefined {
	const payloads = context.edgePayloadsBySelector.get(selector) ?? [];
	return payloads.length === 1 ? payloads[0]?.iri : undefined;
}

function stringAttribute(
	entry: Rdf12XrefIndexEntry,
	name: string,
): string | undefined {
	const value = entry.node.attributes?.[name];
	return value === undefined ? undefined : String(value);
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
