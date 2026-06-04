import type { AbundantDocument } from "../model";
import { type Rdf12Graph, rdf12Triple } from "./graph";
import { stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import { makeResourceIri } from "./resource-identity";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type ProjectSourceFilesInput = {
	readonly graph: Rdf12Graph;
	readonly document: AbundantDocument;
	readonly baseIri: string;
	readonly documentKey: string;
	readonly sourceDocumentIri: Rdf12IriTerm;
};

export function projectSourceFiles(input: ProjectSourceFilesInput): void {
	const sourceFiles = input.document.sourceFiles ?? [];

	for (const sourceFile of sourceFiles) {
		const iri = makeResourceIri({
			baseIri: input.baseIri,
			documentKey: input.documentKey,
			localId: sourceFileLocalId(sourceFile.relativePath),
		});

		input.graph.add(
			rdf12Triple(
				input.sourceDocumentIri,
				iriTerm(`${namespaces.aat}sourceFile`),
				iri,
			),
		);
		input.graph.add(
			rdf12Triple(
				iri,
				iriTerm(`${namespaces.rdf}type`),
				iriTerm(`${namespaces.aat}SourceFile`),
			),
		);
		input.graph.add(
			rdf12Triple(
				iri,
				iriTerm(`${namespaces.aat}relativePath`),
				stringLiteral(sourceFile.relativePath),
			),
		);
		input.graph.add(
			rdf12Triple(
				iri,
				iriTerm(`${namespaces.aat}raw`),
				stringLiteral(sourceFile.raw),
			),
		);
	}
}

function sourceFileLocalId(relativePath: string): string {
	return `source-file-${encodeURIComponent(relativePath)}`;
}
