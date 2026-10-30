import { nameInIri } from "./iri-name";
import { namespaces } from "./namespaces";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type RelationPredicateMapping = {
	readonly rawRel?: string;
	readonly predicate?: Rdf12IriTerm;
};

const absoluteIriPattern = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/u;
const curiePattern = /^([A-Za-z][A-Za-z0-9_-]*):([^\s]+)$/u;

export function mapRelationPredicate(
	rawRel: string | undefined,
	relationPrefixMap: Readonly<Record<string, string>>,
): RelationPredicateMapping {
	if (rawRel === undefined) {
		return {
			predicate: iriTerm(`${namespaces.aat}references`),
		};
	}

	if (rawRel === "") {
		return { rawRel };
	}

	const curie = curiePattern.exec(rawRel);
	if (curie?.[1] !== undefined && curie[2] !== undefined) {
		const prefix = relationPrefixMap[curie[1]];
		if (prefix !== undefined) {
			return {
				rawRel,
				predicate: iriTerm(`${prefix}${nameInIri(curie[2])}`),
			};
		}
	}

	if (absoluteIriPattern.test(rawRel)) {
		return {
			rawRel,
			predicate: iriTerm(rawRel),
		};
	}

	return {
		rawRel,
		predicate: iriTerm(`${namespaces.rel}${nameInIri(rawRel)}`),
	};
}
