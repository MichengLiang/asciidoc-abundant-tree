import type { AbundantDocument } from "../model";
import { projectSurfaceAttributes } from "./attributes";
import { createRdf12Graph, type Rdf12Graph } from "./graph";
import { projectLabels } from "./labels";
import { namespaces, type Rdf12PrefixMap } from "./namespaces";
import type { Rdf12NodeIndex } from "./node-index";
import { normalizeRdf12Options, type Rdf12Options } from "./options";
import { computePathCoordinate } from "./path-coordinate";
import { projectPayloadBlocks } from "./payload-projector";
import { addProvenanceTriples } from "./provenance";
import { documentIriFor, documentResourceIri } from "./resource-identity";
import { normalizeSourceDigest } from "./source-digest";
import { projectSourceFiles } from "./source-file-projector";
import { projectStructureResources } from "./structure-projector";
import { projectXrefResources } from "./xref-projector";

export type Rdf12Projection = {
	readonly graph: Rdf12Graph;
	readonly prefixes: Rdf12PrefixMap;
	readonly relativePath: string;
	// 文档 IRI：baseIri 加上源文件相对路径。图里每个资源都是 <文档 IRI>#<局部名>。
	readonly documentIri: string;
	readonly sourceDocumentIri: string;
	readonly projectionIri: string;
	readonly projectionActivityIri: string;
	readonly abundantDocumentIri: string;
	readonly nodeIndex: Rdf12NodeIndex;
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

	const sourceDocumentIri = documentResourceIri(documentIri, "source");
	const projectionIri = documentResourceIri(documentIri, "projection");
	const projectionActivityIri = documentResourceIri(documentIri, "activity");
	const abundantDocumentIri = documentResourceIri(
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
	const headingOwners = projectLabels({ graph, structure });
	const xrefIndex = projectXrefResources({
		graph,
		document,
		options: normalizedOptions,
		documentIri,
		relativePath: coordinate.relativePath,
		headingOwners,
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
		headingOwners,
		nodeIndex,
		xrefIndex,
	});

	return {
		graph,
		prefixes: namespaces,
		relativePath: coordinate.relativePath,
		documentIri,
		sourceDocumentIri: sourceDocumentIri.value,
		projectionIri: projectionIri.value,
		projectionActivityIri: projectionActivityIri.value,
		abundantDocumentIri: abundantDocumentIri.value,
		nodeIndex,
	};
}
