import { nameInIri } from "./iri-name";
import { namespaces } from "./namespaces";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export function fieldPredicate(fieldName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.field}${nameInIri(fieldName)}`);
}
