import type { AbundantDocument } from "../model";
import { addDocumentResourceTriples } from "./document-resource";
import { createRdf12Graph, type Rdf12Graph } from "./graph";
import { namespaces } from "./namespaces";
import type { Rdf12NodeIndex } from "./node-index";
import { normalizeRdf12Options, type Rdf12Options } from "./options";
import { computePathCoordinate } from "./path-coordinate";
import { addProvenanceTriples } from "./provenance";
import {
	documentResourceLocalId,
	makeActivityLocalId,
	makeProjectionLocalId,
	makeResourceIri,
	makeSourceLocalId,
} from "./resource-identity";
import { normalizeSourceDigest } from "./source-digest";
import { projectStructureResources } from "./structure-projector";

export type Rdf12PrefixMap = typeof namespaces;

export type Rdf12Projection = {
	readonly graph: Rdf12Graph;
	readonly prefixes: Rdf12PrefixMap;
	readonly relativePath: string;
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

	const documentIri = makeResourceIri({
		baseIri: normalizedOptions.baseIri,
		documentKey: coordinate.documentKey,
		localId: documentResourceLocalId(),
	});
	const sourceDocumentIri = makeResourceIri({
		baseIri: normalizedOptions.baseIri,
		documentKey: coordinate.documentKey,
		localId: makeSourceLocalId(),
	});
	const projectionIri = makeResourceIri({
		baseIri: normalizedOptions.baseIri,
		documentKey: coordinate.documentKey,
		localId: makeProjectionLocalId(),
	});
	const projectionActivityIri = makeResourceIri({
		baseIri: normalizedOptions.baseIri,
		documentKey: coordinate.documentKey,
		localId: makeActivityLocalId(),
	});
	const abundantDocumentIri = makeResourceIri({
		baseIri: normalizedOptions.baseIri,
		documentKey: coordinate.documentKey,
		localId: "abundant-document",
	});

	addProvenanceTriples({
		graph,
		sourceDocumentIri,
		projectionIri,
		projectionActivityIri,
		abundantDocumentIri,
		relativePath: coordinate.relativePath,
		...(sourceDigest !== undefined ? { sourceDigest } : {}),
	});
	addDocumentResourceTriples({
		graph,
		documentIri,
		relativePath: coordinate.relativePath,
	});
	const nodeIndex = projectStructureResources({
		graph,
		document,
		baseIri: normalizedOptions.baseIri,
		documentKey: coordinate.documentKey,
		documentIri,
		relativePath: coordinate.relativePath,
	});

	return {
		graph,
		prefixes: namespaces,
		relativePath: coordinate.relativePath,
		documentIri: documentIri.value,
		sourceDocumentIri: sourceDocumentIri.value,
		projectionIri: projectionIri.value,
		projectionActivityIri: projectionActivityIri.value,
		abundantDocumentIri: abundantDocumentIri.value,
		nodeIndex,
	};
}
