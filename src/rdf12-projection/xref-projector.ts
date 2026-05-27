import type { AbundantDocument, XrefOccurrenceNode } from "../model";
import type { Rdf12Graph } from "./graph";
import { rdf12Triple } from "./graph";
import type { Rdf12LabelCatalog } from "./label-catalog";
import { addXrefDisplayLabelResource } from "./labels";
import { stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import type { NormalizedRdf12Options } from "./options";
import { addReifierTriple } from "./reifier";
import { mapRelationPredicate } from "./relation-predicate";
import {
	createOrdinalAllocator,
	makeOccurrenceResourceLocalId,
	makeResourceIri,
	type OrdinalAllocator,
} from "./resource-identity";
import { bindSelector } from "./selector-binding";
import { addSourceSpanTriples } from "./source-location";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type ProjectXrefResourcesInput = {
	readonly graph: Rdf12Graph;
	readonly document: AbundantDocument;
	readonly options: NormalizedRdf12Options;
	readonly documentKey: string;
	readonly documentIri: Rdf12IriTerm;
	readonly relativePath: string;
	readonly labelCatalog: Rdf12LabelCatalog;
};

type XrefProjectorContext = ProjectXrefResourcesInput & {
	readonly ordinalAllocator: OrdinalAllocator;
};

export function projectXrefResources(input: ProjectXrefResourcesInput): void {
	const context: XrefProjectorContext = {
		...input,
		ordinalAllocator: createOrdinalAllocator(),
	};

	for (const xref of collectXrefOccurrences(input.document.children)) {
		projectXref(context, xref);
	}
}

function collectXrefOccurrences(
	nodes: readonly AbundantDocument["children"][number][],
): XrefOccurrenceNode[] {
	const xrefs: XrefOccurrenceNode[] = [];

	for (const node of nodes) {
		if (node.kind === "xref") {
			xrefs.push(node);
		}
		if (node.children !== undefined) {
			xrefs.push(...collectXrefOccurrences(node.children));
		}
	}

	return xrefs;
}

function projectXref(
	context: XrefProjectorContext,
	xref: XrefOccurrenceNode,
): void {
	if (xref.sourceSpan === undefined) {
		return;
	}

	const xrefIri = createXrefResource(context, xref);
	const sourceNode = writeSourceBinding(context, xrefIri, xref);
	const targetNode = writeTargetBinding(context, xrefIri, xref);
	const rawRel = stringAttribute(xref.attributes, "rel");
	const payloadSelector = stringAttribute(xref.attributes, "payload");
	const predicateMapping = mapRelationPredicate(
		rawRel,
		context.options.relationPrefixMap,
	);

	if (predicateMapping.rawRel !== undefined) {
		addStringTriple(context.graph, xrefIri, "rawRel", predicateMapping.rawRel);
	}
	if (payloadSelector !== undefined) {
		addStringTriple(context.graph, xrefIri, "payloadSelector", payloadSelector);
	}
	if (
		sourceNode !== undefined &&
		targetNode !== undefined &&
		predicateMapping.predicate !== undefined
	) {
		const relation = rdf12Triple(
			sourceNode,
			predicateMapping.predicate,
			targetNode,
		);
		context.graph.add(relation);
		addReifierTriple(context.graph, xrefIri, relation);
	}
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
		localId: makeOccurrenceResourceLocalId({
			kind: "xref",
			startLine: xref.sourceSpan.start.line,
			startColumn: xref.sourceSpan.start.column,
			ordinal,
		}),
	});

	context.graph.add(
		rdf12Triple(
			xrefIri,
			iriTerm(`${namespaces.rdf}type`),
			iriTerm(`${namespaces.aat}XrefOccurrence`),
		),
	);
	addSourceSpanTriples({
		graph: context.graph,
		subject: xrefIri,
		relativePath: context.relativePath,
		sourceSpan: xref.sourceSpan,
	});
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
		addXrefDisplayLabelResource({
			graph: context.graph,
			catalog: context.labelCatalog,
			baseIri: context.options.baseIri,
			documentKey: context.documentKey,
			relativePath: context.relativePath,
			owner: xrefIri,
			value: xref.label,
			sourceSpan: xref.sourceSpan,
		});
	}

	return xrefIri;
}

function writeSourceBinding(
	context: XrefProjectorContext,
	xrefIri: Rdf12IriTerm,
	xref: XrefOccurrenceNode,
): Rdf12IriTerm | undefined {
	if (xref.containingSectionId === undefined) {
		context.graph.add(
			rdf12Triple(
				xrefIri,
				iriTerm(`${namespaces.aat}sourceNode`),
				context.documentIri,
			),
		);
		return context.documentIri;
	}

	addStringTriple(
		context.graph,
		xrefIri,
		"sourceSelector",
		xref.containingSectionId,
	);
	const result = bindSelector(context.labelCatalog, xref.containingSectionId);
	if (result.status !== "bound") {
		return undefined;
	}

	context.graph.add(
		rdf12Triple(xrefIri, iriTerm(`${namespaces.aat}sourceNode`), result.target),
	);
	return result.target;
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
				iriTerm(`${namespaces.aat}targetNode`),
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
					iriTerm(`${namespaces.aat}candidateNode`),
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
