import { type Rdf12Graph, rdf12TripleKey } from "./graph";

export function canonicalRdf12GraphKeys(graph: Rdf12Graph): readonly string[] {
	return graph.toArray().map(rdf12TripleKey);
}

export function rdf12GraphsEquivalent(
	left: Rdf12Graph,
	right: Rdf12Graph,
): boolean {
	const leftKeys = canonicalRdf12GraphKeys(left);
	const rightKeys = canonicalRdf12GraphKeys(right);

	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every((key, index) => key === rightKeys[index])
	);
}

export function assertRdf12GraphsEquivalent(
	left: Rdf12Graph,
	right: Rdf12Graph,
): void {
	if (rdf12GraphsEquivalent(left, right)) {
		return;
	}

	throw new Error(
		`RDF graphs differ:\nleft=${JSON.stringify(canonicalRdf12GraphKeys(left))}\nright=${JSON.stringify(canonicalRdf12GraphKeys(right))}`,
	);
}
