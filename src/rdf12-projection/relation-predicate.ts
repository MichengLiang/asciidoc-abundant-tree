import { namespaces } from "./namespaces";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type RelationPredicateMapping = {
	readonly rawRel?: string;
	readonly predicate?: Rdf12IriTerm;
};

const absoluteIriPattern = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/u;
const curiePattern = /^([A-Za-z][A-Za-z0-9_-]*):([^\s]+)$/u;
const ordinaryTokenPattern = /^[A-Za-z][A-Za-z0-9._~-]*$/u;

export function mapRelationPredicate(
	rawRel: string | undefined,
	relationPrefixMap: Readonly<Record<string, string>>,
): RelationPredicateMapping {
	if (rawRel === undefined) {
		return {
			predicate: iriTerm(`${namespaces.aat}references`),
		};
	}

	if (rawRel.trim() !== rawRel || rawRel === "") {
		return { rawRel };
	}

	const curie = curiePattern.exec(rawRel);
	if (curie?.[1] !== undefined && curie[2] !== undefined) {
		const prefix = relationPrefixMap[curie[1]];
		if (prefix !== undefined) {
			return {
				rawRel,
				predicate: iriTerm(`${prefix}${encodeIriComponent(curie[2])}`),
			};
		}
	}

	if (absoluteIriPattern.test(rawRel)) {
		return {
			rawRel,
			predicate: iriTerm(rawRel),
		};
	}

	if (ordinaryTokenPattern.test(rawRel)) {
		return {
			rawRel,
			predicate: iriTerm(`${namespaces.rel}${encodeIriComponent(rawRel)}`),
		};
	}

	return { rawRel };
}

function encodeIriComponent(value: string): string {
	return encodeURIComponent(value).replaceAll("%2D", "-");
}
