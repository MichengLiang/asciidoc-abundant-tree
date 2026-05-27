import type { Rdf12Graph } from "./graph";
import { rdf12Triple } from "./graph";
import { stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type AddDocumentResourceTriplesInput = {
	readonly graph: Rdf12Graph;
	readonly documentIri: Rdf12IriTerm;
	readonly relativePath: string;
};

export function addDocumentResourceTriples(
	input: AddDocumentResourceTriplesInput,
): void {
	input.graph.add(
		rdf12Triple(
			input.documentIri,
			iriTerm(`${namespaces.rdf}type`),
			iriTerm(`${namespaces.aat}AsciiDocDocument`),
		),
	);
	input.graph.add(
		rdf12Triple(
			input.documentIri,
			iriTerm(`${namespaces.aat}relativePath`),
			stringLiteral(input.relativePath),
		),
	);
}
