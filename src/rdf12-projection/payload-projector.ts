import type { AbundantDocument, AbundantNode, ListingNode } from "../model";
import type { Rdf12Graph } from "./graph";
import { rdf12Triple } from "./graph";
import type { Rdf12LabelCatalog } from "./label-catalog";
import { addAddressLabelResource } from "./labels";
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
import { addLineSpanTriples } from "./source-location";
import { iriTerm, type Rdf12IriTerm } from "./terms";
import type { Rdf12XrefIndex } from "./xref-projector";

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
	readonly payloadsBySelector: Map<string, PayloadRecord[]>;
};

type PayloadKind = "node" | "xref";

type PayloadRecord = {
	readonly iri: Rdf12IriTerm;
	readonly kind: PayloadKind;
	readonly forSelector?: string;
};

export function projectPayloadBlocks(input: ProjectPayloadBlocksInput): void {
	const context: PayloadProjectorContext = {
		...input,
		ordinalAllocator: createOrdinalAllocator(),
		payloadsBySelector: new Map(),
	};

	for (const child of input.document.children) {
		projectNodePayloads(context, child);
	}
	bindNodePayloads(context);
	bindXrefPayloads(context);
}

function projectNodePayloads(
	context: PayloadProjectorContext,
	node: AbundantNode,
): void {
	if (node.kind === "listing") {
		projectPayloadListing(context, node);
	}

	for (const child of node.children ?? []) {
		projectNodePayloads(context, child);
	}
}

function projectPayloadListing(
	context: PayloadProjectorContext,
	node: ListingNode,
): void {
	const payloadKind = payloadKindForListing(node);
	if (payloadKind === undefined || node.span === undefined) {
		return;
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

	context.graph.add(
		rdf12Triple(
			payload,
			iriTerm(`${namespaces.rdf}type`),
			iriTerm(`${namespaces.aat}PayloadBlock`),
		),
	);
	context.graph.add(
		rdf12Triple(
			payload,
			iriTerm(`${namespaces.aat}payloadKind`),
			stringLiteral(payloadKind),
		),
	);
	addLineSpanTriples({
		graph: context.graph,
		subject: payload,
		relativePath: context.relativePath,
		span: node.span,
	});
	addOptionalLineSpan(context.graph, payload, "content", node.contentSpan);
	addOptionalString(context.graph, payload, "sourceText", node.content);
	addOptionalString(context.graph, payload, "dataFormat", dataFormatFor(node));
	addOptionalString(
		context.graph,
		payload,
		"forSelector",
		forSelectorFor(node),
	);

	for (const id of node.ids) {
		addAddressLabelResource({
			graph: context.graph,
			catalog: context.labelCatalog,
			baseIri: context.baseIri,
			documentKey: context.documentKey,
			relativePath: context.relativePath,
			owner: payload,
			value: id,
			span: labelSpanFor(node),
		});
		addPayloadSelector(context, id, {
			iri: payload,
			kind: payloadKind,
			...definedString("forSelector", forSelectorFor(node)),
		});
	}
}

function bindNodePayloads(context: PayloadProjectorContext): void {
	for (const entry of context.payloadsBySelector.values()) {
		for (const payload of entry) {
			if (payload.kind !== "node" || payload.forSelector === undefined) {
				continue;
			}
			const result = bindSelector(context.labelCatalog, payload.forSelector);
			if (result.status !== "bound") {
				continue;
			}
			context.graph.add(
				rdf12Triple(
					result.target,
					iriTerm(`${namespaces.aat}hasPayload`),
					payload.iri,
				),
			);
			context.graph.add(
				rdf12Triple(
					payload.iri,
					iriTerm(`${namespaces.aat}payloadOf`),
					result.target,
				),
			);
		}
	}
}

function bindXrefPayloads(context: PayloadProjectorContext): void {
	for (const entry of context.xrefIndex.entries()) {
		const payloadSelector = stringAttribute(entry.node.attributes, "payload");
		if (payloadSelector === undefined) {
			continue;
		}
		const payload = uniquePayloadForSelector(context, payloadSelector);
		if (payload === undefined) {
			continue;
		}
		context.graph.add(
			rdf12Triple(entry.iri, iriTerm(`${namespaces.aat}hasPayload`), payload),
		);
	}
}

function payloadKindForListing(node: ListingNode): PayloadKind | undefined {
	const roles = node.metadata?.flatMap((item) => item.roles ?? []) ?? [];
	if (roles.includes("xref-payload")) {
		return "xref";
	}
	if (roles.includes("payload")) {
		return "node";
	}
	return undefined;
}

function dataFormatFor(node: ListingNode): string | undefined {
	for (const metadata of node.metadata ?? []) {
		if (metadata.metadataKind !== "attrlist") {
			continue;
		}
		const data = metadata.attributes?.data;
		if (data !== undefined) {
			return String(data);
		}
	}
	return node.language;
}

function forSelectorFor(node: ListingNode): string | undefined {
	for (const metadata of node.metadata ?? []) {
		if (metadata.metadataKind !== "attrlist") {
			continue;
		}
		const forSelector =
			metadata.attributes?.forSelector ?? metadata.attributes?.for;
		if (forSelector !== undefined) {
			return String(forSelector);
		}
	}
	return undefined;
}

function labelSpanFor(node: ListingNode): NonNullable<ListingNode["span"]> {
	if (node.span === undefined) {
		throw new Error("payload label requires listing span");
	}

	const idMetadata = node.metadata?.find((item) => item.metadataKind === "id");
	return idMetadata?.line === undefined
		? node.span
		: { startLine: idMetadata.line, endLine: idMetadata.line };
}

function addPayloadSelector(
	context: PayloadProjectorContext,
	selector: string,
	payload: PayloadRecord,
): void {
	const payloads = context.payloadsBySelector.get(selector) ?? [];
	payloads.push(payload);
	context.payloadsBySelector.set(selector, payloads);
}

function uniquePayloadForSelector(
	context: PayloadProjectorContext,
	selector: string,
): Rdf12IriTerm | undefined {
	const payloads = context.payloadsBySelector.get(selector) ?? [];
	const xrefPayloads = payloads.filter((payload) => payload.kind === "xref");
	return xrefPayloads.length === 1 ? xrefPayloads[0]?.iri : undefined;
}

function definedString<K extends string>(
	key: K,
	value: string | undefined,
): { readonly [P in K]: string } | Record<string, never> {
	return value === undefined
		? {}
		: ({ [key]: value } as { readonly [P in K]: string });
}

function stringAttribute(
	attributes: Record<string, string | number | boolean> | undefined,
	name: string,
): string | undefined {
	const value = attributes?.[name];
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

	graph.add(
		rdf12Triple(
			subject,
			iriTerm(`${namespaces.aat}${predicateLocalName}`),
			stringLiteral(value),
		),
	);
}
