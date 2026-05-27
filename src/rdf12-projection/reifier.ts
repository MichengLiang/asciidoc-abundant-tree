import type { Rdf12Graph, Rdf12Triple } from "./graph";
import { rdf12Triple } from "./graph";
import { namespaces } from "./namespaces";
import { iriTerm, type Rdf12IriTerm, rdf12TripleTerm } from "./terms";

export function addReifierTriple(
	graph: Rdf12Graph,
	reifier: Rdf12IriTerm,
	reifiedTriple: Rdf12Triple,
): void {
	graph.add(
		rdf12Triple(
			reifier,
			iriTerm(`${namespaces.rdf}reifies`),
			rdf12TripleTerm(reifiedTriple),
		),
	);
}
