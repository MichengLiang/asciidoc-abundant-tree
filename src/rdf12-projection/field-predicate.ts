import { namespaces } from "./namespaces";
import { iriTerm, type Rdf12IriTerm } from "./terms";

const safePrefixedLocalNamePattern = /^[A-Za-z_][A-Za-z0-9._-]*$/u;

export function fieldPredicate(fieldName: string): Rdf12IriTerm {
	if (safePrefixedLocalNamePattern.test(fieldName)) {
		return iriTerm(`${namespaces.aat}${fieldName}`);
	}

	return iriTerm(`${namespaces.aat}field-${encodeURIComponent(fieldName)}`);
}
