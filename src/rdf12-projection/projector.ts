import type { AbundantDocument } from "../model";
import { projectSurfaceAttributes } from "./attributes";
import { createRdf12Graph, type Rdf12Graph } from "./graph";
import type { Rdf12LabelCatalog } from "./label-catalog";
import { projectLabels } from "./labels";
import { namespaces } from "./namespaces";
import type { Rdf12NodeIndex } from "./node-index";
import { normalizeRdf12Options, type Rdf12Options } from "./options";
import { computePathCoordinate } from "./path-coordinate";
import { projectPayloadBlocks } from "./payload-projector";
import { addProvenanceTriples } from "./provenance";
import {
	documentIriFor,
	headingNamespaceFor,
	projectionResourceIri,
} from "./resource-identity";
import { normalizeSourceDigest } from "./source-digest";
import { projectSourceFiles } from "./source-file-projector";
import { projectStructureResources } from "./structure-projector";
import { projectXrefResources } from "./xref-projector";

export type Rdf12PrefixMap = typeof namespaces;

export type Rdf12Projection = {
	readonly graph: Rdf12Graph;
	readonly prefixes: Rdf12PrefixMap;
	readonly relativePath: string;
	// 文档 IRI：baseIri 加上源文件相对路径。标题节点是 headingNamespace 加名字，投影器的资源在 <文档 IRI>/projection# 下。
	readonly documentIri: string;
	readonly headingNamespace: string;
	readonly sourceDocumentIri: string;
	readonly projectionIri: string;
	readonly projectionActivityIri: string;
	readonly abundantDocumentIri: string;
	readonly nodeIndex: Rdf12NodeIndex;
	readonly labelCatalog: Rdf12LabelCatalog;
};

export function projectAbundantDocumentToRdf12(
	document: AbundantDocument,
	options: Rdf12Options,
): Rdf12Projection {
	const normalizedOptions = normalizeRdf12Options(options);
	const coordinate = computePathCoordinate({
		documentRoot: normalizedOptions.documentRoot,
		sourcePath: document.sourcePath,
	});
	const sourceDigest = normalizeSourceDigest(normalizedOptions);
	const graph = createRdf12Graph();
	const documentIri = documentIriFor(
		normalizedOptions.baseIri,
		coordinate.relativePath,
	);

	const sourceDocumentIri = projectionResourceIri(documentIri, "source");
	const projectionIri = projectionResourceIri(documentIri, "projection");
	const projectionActivityIri = projectionResourceIri(documentIri, "activity");
	const abundantDocumentIri = projectionResourceIri(
		documentIri,
		"abundant-document",
	);

	addProvenanceTriples({
		graph,
		sourceDocumentIri,
		projectionIri,
		projectionActivityIri,
		relativePath: coordinate.relativePath,
		...(sourceDigest !== undefined ? { sourceDigest } : {}),
	});
	projectSourceFiles({
		graph,
		document,
		documentIri,
		sourceDocumentIri,
	});
	const structure = projectStructureResources({
		graph,
		document,
		documentIri,
		relativePath: coordinate.relativePath,
		...(normalizedOptions.sourceText !== undefined
			? { sourceText: normalizedOptions.sourceText }
			: {}),
	});
	const { nodeIndex } = structure;
	const labelCatalog = projectLabels({ graph, structure });
	const xrefIndex = projectXrefResources({
		graph,
		document,
		options: normalizedOptions,
		documentIri,
		relativePath: coordinate.relativePath,
		labelCatalog,
		nodeIndex,
	});
	projectSurfaceAttributes({
		graph,
		document,
		nodeIndex,
		xrefIndex,
	});
	projectPayloadBlocks({
		graph,
		document,
		documentIri,
		relativePath: coordinate.relativePath,
		labelCatalog,
		nodeIndex,
		xrefIndex,
	});

	return {
		graph,
		prefixes: namespaces,
		relativePath: coordinate.relativePath,
		documentIri,
		headingNamespace: headingNamespaceFor(documentIri),
		sourceDocumentIri: sourceDocumentIri.value,
		projectionIri: projectionIri.value,
		projectionActivityIri: projectionActivityIri.value,
		abundantDocumentIri: abundantDocumentIri.value,
		nodeIndex,
		labelCatalog,
	};
}
