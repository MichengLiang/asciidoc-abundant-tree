import type {
	AbundantDocument,
	AbundantNode,
	AnchorOccurrenceNode,
	LineSpan,
	ListingNode,
	MetadataNode,
	SectionNode,
	TableNode,
	TargetNode,
} from "../model";
import type { Rdf12Graph } from "./graph";
import { rdf12Triple } from "./graph";
import {
	createRdf12LabelCatalog,
	type Rdf12LabelCatalog,
	type Rdf12LabelClass,
} from "./label-catalog";
import { stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import type { Rdf12NodeIndex } from "./node-index";
import {
	createOrdinalAllocator,
	makeLabelLocalId,
	makeResourceIri,
	type OrdinalAllocator,
} from "./resource-identity";
import { addLineSpanTriples, addSourceSpanTriples } from "./source-location";
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

type LabelProjectorContext = ProjectLabelsInput & {
	readonly catalog: Rdf12LabelCatalog;
	readonly ordinalAllocator: OrdinalAllocator;
};

export function projectLabels(input: ProjectLabelsInput): Rdf12LabelCatalog {
	const context: LabelProjectorContext = {
		...input,
		catalog: createRdf12LabelCatalog(),
		ordinalAllocator: createOrdinalAllocator(),
	};

	projectDocumentLabel(context);
	for (const child of input.document.children) {
		projectNodeLabels(context, child);
	}
	projectTargetSupplementLabels(context);

	return context.catalog;
}

function projectDocumentLabel(context: LabelProjectorContext): void {
	const title = context.document.title;

	if (title?.source?.sourceSpan === undefined) {
		return;
	}

	addLabelResource(context, {
		owner: context.documentIri,
		labelClass: "TitleLabel",
		value: title.text,
		sourceSpan: title.source.sourceSpan,
	});
}

function projectNodeLabels(
	context: LabelProjectorContext,
	node: AbundantNode,
): void {
	switch (node.kind) {
		case "section":
			projectSectionLabels(context, node);
			break;
		case "listing":
			projectListingLabels(context, node);
			break;
		case "table":
			projectTableLabels(context, node);
			break;
		case "paragraph":
			for (const child of node.children ?? []) {
				projectNodeLabels(context, child);
			}
			break;
		case "anchor":
			projectAnchorLabels(context, node);
			break;
		default:
			break;
	}
}

function projectSectionLabels(
	context: LabelProjectorContext,
	node: SectionNode,
): void {
	const owner = context.nodeIndex.get(node);

	if (owner === undefined) {
		return;
	}

	if (node.titleSpan !== undefined) {
		addLabelResource(context, {
			owner,
			labelClass: "TitleLabel",
			value: node.title,
			sourceSpan: node.titleSpan,
		});
	}

	for (const id of node.ids) {
		const idSpan =
			labelSpanFromMetadata(node.metadata, "id") ??
			(node.idOrigin === "asciidoctor-generated" && node.titleSpan !== undefined
				? lineSpanFromSourceSpan(node.titleSpan)
				: undefined);

		addLineBackedLabel(context, {
			owner,
			labelClass: labelClassForIdOrigin(node.idOrigin),
			value: id,
			span: idSpan,
		});
	}

	projectMetadataLabels(context, owner, node.metadata);

	for (const child of node.children ?? []) {
		projectNodeLabels(context, child);
	}
}

function projectListingLabels(
	context: LabelProjectorContext,
	node: ListingNode,
): void {
	const owner = context.nodeIndex.get(node);

	if (owner === undefined) {
		return;
	}

	for (const id of node.ids) {
		addLineBackedLabel(context, {
			owner,
			labelClass: "AddressLabel",
			value: id,
			span: labelSpanFromMetadata(node.metadata, "id") ?? node.span,
		});
	}

	if (node.title !== undefined) {
		addLineBackedLabel(context, {
			owner,
			labelClass: "BlockTitleLabel",
			value: node.title,
			span: labelSpanFromMetadata(node.metadata, "title") ?? node.span,
		});
	}

	projectMetadataLabels(context, owner, node.metadata);
}

function projectTableLabels(
	context: LabelProjectorContext,
	node: TableNode,
): void {
	const owner = context.nodeIndex.get(node);

	if (owner === undefined) {
		return;
	}

	for (const id of node.ids) {
		addLineBackedLabel(context, {
			owner,
			labelClass: "AddressLabel",
			value: id,
			span: labelSpanFromMetadata(node.metadata, "id") ?? node.span,
		});
	}

	if (node.title !== undefined) {
		addLineBackedLabel(context, {
			owner,
			labelClass: "BlockTitleLabel",
			value: node.title,
			span: labelSpanFromMetadata(node.metadata, "title") ?? node.span,
		});
	}

	projectMetadataLabels(context, owner, node.metadata);
	for (const child of node.children ?? []) {
		projectNodeLabels(context, child);
	}
}

function projectAnchorLabels(
	context: LabelProjectorContext,
	node: AnchorOccurrenceNode,
): void {
	const owner = context.nodeIndex.get(node);

	if (owner === undefined) {
		return;
	}

	for (const id of node.ids) {
		addLabelResource(context, {
			owner,
			labelClass: "AnchorLabel",
			value: id,
			sourceSpan: node.sourceSpan,
		});
	}

	if (node.reftext !== undefined) {
		addLabelResource(context, {
			owner,
			labelClass: "ReftextLabel",
			value: node.reftext,
			sourceSpan: node.sourceSpan,
		});
	}
}

function projectMetadataLabels(
	context: LabelProjectorContext,
	owner: Rdf12IriTerm,
	metadata: readonly MetadataNode[] | undefined,
): void {
	for (const item of metadata ?? []) {
		if (item.metadataKind === "attrlist") {
			for (const role of item.roles ?? []) {
				addLineBackedLabel(context, {
					owner,
					labelClass: "RoleLabel",
					value: role,
					span: lineSpanForMetadata(item),
				});
			}
			continue;
		}

		if (item.metadataKind === "anchor") {
			for (const id of item.ids ?? []) {
				addLineBackedLabel(context, {
					owner,
					labelClass: "AnchorLabel",
					value: id,
					span: lineSpanForMetadata(item),
				});
			}
		}
	}
}

function projectTargetSupplementLabels(context: LabelProjectorContext): void {
	for (const target of context.document.targets) {
		const owner = ownerForTarget(context, target);

		if (owner === undefined) {
			continue;
		}

		context.catalog.add({
			owner,
			labelClass: labelClassForTarget(target),
			value: target.id,
		});

		if (target.title !== undefined) {
			context.catalog.add({
				owner,
				labelClass:
					target.targetType === "section" ? "TitleLabel" : "BlockTitleLabel",
				value: target.title,
			});
		}

		if (target.asciidoctor?.reftext !== undefined) {
			context.catalog.add({
				owner,
				labelClass: "ReftextLabel",
				value: target.asciidoctor.reftext,
			});
		}
	}
}

function ownerForTarget(
	context: LabelProjectorContext,
	target: TargetNode,
): Rdf12IriTerm | undefined {
	if (target.sourceSpan === undefined) {
		return undefined;
	}

	return context.nodeIndex.findByTarget({
		targetType: target.targetType,
		startLine: target.sourceSpan.start.line,
		endLine: target.sourceSpan.end.line,
	});
}

function addLineBackedLabel(
	context: LabelProjectorContext,
	input: {
		readonly owner: Rdf12IriTerm;
		readonly labelClass: Rdf12LabelClass;
		readonly value: string;
		readonly span: LineSpan | undefined;
	},
): void {
	if (input.span === undefined) {
		return;
	}

	addLabelResource(context, {
		owner: input.owner,
		labelClass: input.labelClass,
		value: input.value,
		span: input.span,
	});
}

function addLabelResource(
	context: LabelProjectorContext,
	input: {
		readonly owner: Rdf12IriTerm;
		readonly labelClass: Rdf12LabelClass;
		readonly value: string;
		readonly span?: LineSpan;
		readonly sourceSpan?: NonNullable<MetadataNode["source"]>["sourceSpan"];
	},
): void {
	if (input.span === undefined && input.sourceSpan === undefined) {
		return;
	}

	const startLine = input.sourceSpan?.start.line ?? input.span?.startLine;

	if (startLine === undefined) {
		return;
	}

	const ordinal = context.ordinalAllocator.next({
		kind: "label",
		startLine,
	});
	const label = makeResourceIri({
		baseIri: context.baseIri,
		documentKey: context.documentKey,
		localId: makeLabelLocalId({ startLine, ordinal }),
	});

	context.graph.add(
		rdf12Triple(
			label,
			iriTerm(`${namespaces.rdf}type`),
			iriTerm(`${namespaces.aat}${input.labelClass}`),
		),
	);
	context.graph.add(
		rdf12Triple(
			label,
			iriTerm(`${namespaces.rdf}value`),
			stringLiteral(input.value),
		),
	);
	if (input.sourceSpan !== undefined) {
		addSourceSpanTriples({
			graph: context.graph,
			subject: label,
			relativePath: context.relativePath,
			sourceSpan: input.sourceSpan,
		});
	} else if (input.span !== undefined) {
		addLineSpanTriples({
			graph: context.graph,
			subject: label,
			relativePath: context.relativePath,
			span: input.span,
		});
	}
	context.graph.add(
		rdf12Triple(input.owner, iriTerm(`${namespaces.aat}hasLabel`), label),
	);
	context.catalog.add({
		owner: input.owner,
		label,
		labelClass: input.labelClass,
		value: input.value,
	});
}

function labelClassForIdOrigin(
	idOrigin: SectionNode["idOrigin"],
): Rdf12LabelClass {
	return idOrigin === "asciidoctor-generated"
		? "GeneratedAddressLabel"
		: "AddressLabel";
}

function labelClassForTarget(target: TargetNode): Rdf12LabelClass {
	if (target.targetType === "inline-anchor") {
		return "AnchorLabel";
	}

	return labelClassForIdOrigin(target.idOrigin);
}

function labelSpanFromMetadata(
	metadata: readonly MetadataNode[] | undefined,
	metadataKind: MetadataNode["metadataKind"],
): LineSpan | undefined {
	const item = metadata?.find((entry) => entry.metadataKind === metadataKind);
	return item ? lineSpanForMetadata(item) : undefined;
}

function lineSpanForMetadata(metadata: MetadataNode): LineSpan | undefined {
	return metadata.line === undefined
		? undefined
		: { startLine: metadata.line, endLine: metadata.line };
}

function lineSpanFromSourceSpan(
	sourceSpan: NonNullable<NonNullable<MetadataNode["source"]>["sourceSpan"]>,
): LineSpan {
	return {
		startLine: sourceSpan.start.line,
		endLine: sourceSpan.end.line,
	};
}
