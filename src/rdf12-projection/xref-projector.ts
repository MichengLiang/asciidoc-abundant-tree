import type { AbundantDocument, XrefOccurrenceNode } from "../model";
import type { Rdf12Graph } from "./graph";
import { rdf12TermKey, rdf12Triple } from "./graph";
import { findInnermostHeadingBySourceLine } from "./heading-ownership";
import type { Rdf12LabelCatalog } from "./label-catalog";
import { stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import type { Rdf12NodeIndex } from "./node-index";
import type { NormalizedRdf12Options } from "./options";
import { addReifierTriple } from "./reifier";
import { mapRelationPredicate } from "./relation-predicate";
import {
	createOrdinalAllocator,
	makeResourceIri,
	makeXrefEdgeResourceLocalId,
	type OrdinalAllocator,
} from "./resource-identity";
import { bindSelector } from "./selector-binding";
import {
	addSourceSpanTriples,
	sourceRelativePathOrFallback,
} from "./source-location";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type ProjectXrefResourcesInput = {
	readonly graph: Rdf12Graph;
	readonly document: AbundantDocument;
	readonly options: NormalizedRdf12Options;
	readonly documentKey: string;
	readonly documentIri: Rdf12IriTerm;
	readonly relativePath: string;
	readonly labelCatalog: Rdf12LabelCatalog;
	readonly nodeIndex: Rdf12NodeIndex;
};

export type Rdf12XrefIndexEntry = {
	readonly node: XrefOccurrenceNode;
	readonly iri: Rdf12IriTerm;
};

export type Rdf12XrefIndex = {
	get(node: XrefOccurrenceNode): Rdf12IriTerm | undefined;
	entries(): readonly Rdf12XrefIndexEntry[];
};

type XrefProjectorContext = ProjectXrefResourcesInput & {
	readonly ordinalAllocator: OrdinalAllocator;
	readonly xrefIndex: MutableRdf12XrefIndex;
};

type MutableRdf12XrefIndex = Rdf12XrefIndex & {
	set(entry: Rdf12XrefIndexEntry): void;
};

export function projectXrefResources(
	input: ProjectXrefResourcesInput,
): Rdf12XrefIndex {
	const context: XrefProjectorContext = {
		...input,
		ordinalAllocator: createOrdinalAllocator(),
		xrefIndex: createRdf12XrefIndex(),
	};

	for (const xref of collectXrefOccurrences(input.document)) {
		projectXref(context, xref);
	}

	return context.xrefIndex;
}

function collectXrefOccurrences(
	document: AbundantDocument,
): XrefOccurrenceNode[] {
	const seen = new Set<XrefOccurrenceNode>();
	const xrefs: XrefOccurrenceNode[] = [];

	for (const xref of document.xrefOccurrences) {
		addXref(xrefs, seen, xref);
	}
	for (const xref of collectChildXrefOccurrences(document.children)) {
		addXref(xrefs, seen, xref);
	}

	return xrefs;
}

function collectChildXrefOccurrences(
	nodes: readonly AbundantDocument["children"][number][],
): XrefOccurrenceNode[] {
	const xrefs: XrefOccurrenceNode[] = [];

	for (const node of nodes) {
		if (node.kind === "xref") {
			xrefs.push(node);
		}
		if (node.children !== undefined) {
			xrefs.push(...collectChildXrefOccurrences(node.children));
		}
	}

	return xrefs;
}

function addXref(
	xrefs: XrefOccurrenceNode[],
	seen: Set<XrefOccurrenceNode>,
	xref: XrefOccurrenceNode,
): void {
	if (seen.has(xref)) {
		return;
	}

	seen.add(xref);
	xrefs.push(xref);
}

function projectXref(
	context: XrefProjectorContext,
	xref: XrefOccurrenceNode,
): void {
	if (xref.sourceSpan === undefined) {
		return;
	}

	const xrefIri = createXrefResource(context, xref);
	context.xrefIndex.set({ node: xref, iri: xrefIri });
	const sourceHeading = writeSourceBinding(context, xrefIri, xref);
	const targetHeading = writeTargetBinding(context, xrefIri, xref);
	const rawRel = stringAttribute(xref.attributes, "rel");
	const predicateMapping = mapRelationPredicate(
		rawRel,
		context.options.relationPrefixMap,
	);

	if (predicateMapping.rawRel !== undefined) {
		addStringTriple(context.graph, xrefIri, "rel", predicateMapping.rawRel);
	}
	if (
		sourceHeading !== undefined &&
		targetHeading !== undefined &&
		predicateMapping.predicate !== undefined
	) {
		const relation = rdf12Triple(
			sourceHeading,
			predicateMapping.predicate,
			targetHeading,
		);
		context.graph.add(relation);
		addReifierTriple(context.graph, xrefIri, relation);
	}
}

function createRdf12XrefIndex(): MutableRdf12XrefIndex {
	const iriByNode = new WeakMap<XrefOccurrenceNode, Rdf12IriTerm>();
	const entries: Rdf12XrefIndexEntry[] = [];

	return {
		get(node) {
			return iriByNode.get(node);
		},
		set(entry) {
			if (iriByNode.has(entry.node)) {
				return;
			}
			iriByNode.set(entry.node, entry.iri);
			entries.push(entry);
		},
		entries() {
			const entriesByIri = new Map<string, Rdf12XrefIndexEntry>();
			for (const entry of entries) {
				entriesByIri.set(rdf12TermKey(entry.iri), entry);
			}
			return [...entriesByIri.values()];
		},
	};
}

function createXrefResource(
	context: XrefProjectorContext,
	xref: XrefOccurrenceNode,
): Rdf12IriTerm {
	if (xref.sourceSpan === undefined) {
		throw new Error("xref resource requires a sourceSpan");
	}

	const ordinal = context.ordinalAllocator.next({
		kind: "xref",
		startLine: xref.sourceSpan.start.line,
		startColumn: xref.sourceSpan.start.column,
	});
	const xrefIri = makeResourceIri({
		baseIri: context.options.baseIri,
		documentKey: context.documentKey,
		localId: makeXrefEdgeResourceLocalId({
			startLine: xref.sourceSpan.start.line,
			startColumn: xref.sourceSpan.start.column,
			ordinal,
		}),
	});

	context.graph.add(
		rdf12Triple(
			xrefIri,
			iriTerm(`${namespaces.rdf}type`),
			iriTerm(`${namespaces.aat}XrefEdge`),
		),
	);
	const relativePath = sourceRelativePathOrFallback(
		xref.source,
		context.relativePath,
		context.document.mode,
	);
	if (relativePath !== undefined) {
		addSourceSpanTriples({
			graph: context.graph,
			subject: xrefIri,
			relativePath,
			sourceSpan: xref.sourceSpan,
		});
	}
	addStringTriple(context.graph, xrefIri, "syntax", xref.syntax);
	addStringTriple(context.graph, xrefIri, "raw", xref.raw);
	addStringTriple(context.graph, xrefIri, "targetSelector", xref.target);
	addOptionalStringTriple(
		context.graph,
		xrefIri,
		"officialHref",
		xref.asciidoctor?.href,
	);
	addOptionalStringTriple(
		context.graph,
		xrefIri,
		"officialResolvedId",
		xref.asciidoctor?.resolvedId,
	);
	addOptionalStringTriple(
		context.graph,
		xrefIri,
		"officialResolvedType",
		xref.asciidoctor?.resolvedType,
	);
	addOptionalStringTriple(
		context.graph,
		xrefIri,
		"officialReftext",
		xref.asciidoctor?.reftext,
	);

	if (xref.label !== undefined) {
		addStringTriple(context.graph, xrefIri, "displayLabel", xref.label);
	}

	return xrefIri;
}

function writeSourceBinding(
	context: XrefProjectorContext,
	xrefIri: Rdf12IriTerm,
	xref: XrefOccurrenceNode,
): Rdf12IriTerm | undefined {
	if (xref.containingSectionId !== undefined) {
		addStringTriple(
			context.graph,
			xrefIri,
			"sourceSelector",
			xref.containingSectionId,
		);
	}

	const sourceHeading = sourceHeadingForXref(context, xref);
	if (sourceHeading === undefined) {
		return undefined;
	}

	context.graph.add(
		rdf12Triple(
			xrefIri,
			iriTerm(`${namespaces.aat}sourceHeading`),
			sourceHeading,
		),
	);
	return sourceHeading;
}

function sourceHeadingForXref(
	context: XrefProjectorContext,
	xref: XrefOccurrenceNode,
): Rdf12IriTerm | undefined {
	if (xref.sourceSpan === undefined) {
		return undefined;
	}
	const relativePath = sourceRelativePathOrFallback(
		xref.source,
		context.relativePath,
		context.document.mode,
	);
	if (relativePath === undefined) {
		return undefined;
	}
	const selectorHeading = sourceHeadingBySelector(
		context.nodeIndex,
		relativePath,
		xref.containingSectionId,
	);
	if (selectorHeading !== undefined) {
		return selectorHeading;
	}

	const line = xref.sourceSpan.start.line;
	return findInnermostHeadingBySourceLine({
		nodeIndex: context.nodeIndex,
		relativePath,
		line,
	})?.iri;
}

function sourceHeadingBySelector(
	nodeIndex: Rdf12NodeIndex,
	relativePath: string,
	selector: string | undefined,
): Rdf12IriTerm | undefined {
	if (selector === undefined) {
		return undefined;
	}

	const candidates = nodeIndex.entries().filter((entry) => {
		return (
			entry.relativePath === relativePath &&
			entry.kind === "section" &&
			entry.node.ids.includes(selector)
		);
	});

	return candidates.length === 1 ? candidates[0]?.iri : undefined;
}

function writeTargetBinding(
	context: XrefProjectorContext,
	xrefIri: Rdf12IriTerm,
	xref: XrefOccurrenceNode,
): Rdf12IriTerm | undefined {
	const result = bindSelector(context.labelCatalog, xref.target);

	if (result.status === "bound") {
		context.graph.add(
			rdf12Triple(
				xrefIri,
				iriTerm(`${namespaces.aat}targetHeading`),
				result.target,
			),
		);
		return result.target;
	}

	if (result.status === "ambiguous") {
		for (const candidate of result.candidates) {
			context.graph.add(
				rdf12Triple(
					xrefIri,
					iriTerm(`${namespaces.aat}candidateHeading`),
					candidate,
				),
			);
		}
	}

	return undefined;
}

function stringAttribute(
	attributes: XrefOccurrenceNode["attributes"],
	name: string,
): string | undefined {
	const value = attributes?.[name];
	return value === undefined ? undefined : String(value);
}

function addOptionalStringTriple(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicateLocalName: string,
	value: string | undefined,
): void {
	if (value === undefined) {
		return;
	}

	addStringTriple(graph, subject, predicateLocalName, value);
}

function addStringTriple(
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
