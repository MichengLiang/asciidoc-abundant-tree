import {
	type Rdf12IriTerm,
	type Rdf12Term,
	type Rdf12Triple,
	type Rdf12TripleTerm,
	rdf12TermKey,
	rdf12Triple,
	rdf12TripleKey,
	rdf12TripleTerm,
} from "./terms";

export {
	type Rdf12IriTerm,
	type Rdf12Term,
	type Rdf12Triple,
	type Rdf12TripleTerm,
	rdf12TermKey,
	rdf12Triple,
	rdf12TripleKey,
	rdf12TripleTerm,
};

export type Rdf12TriplePattern = {
	readonly subject?: Rdf12IriTerm;
	readonly predicate?: Rdf12IriTerm;
	readonly object?: Rdf12Term;
};

export type Rdf12Graph = {
	readonly size: number;
	add(triple: Rdf12Triple): Rdf12Graph;
	has(triple: Rdf12Triple): boolean;
	match(pattern?: Rdf12TriplePattern): Rdf12Triple[];
	toArray(): Rdf12Triple[];
};

export function createRdf12Graph(
	triples: Iterable<Rdf12Triple> = [],
): Rdf12Graph {
	return new Rdf12GraphSet(triples);
}

class Rdf12GraphSet implements Rdf12Graph {
	readonly #triplesByKey = new Map<string, Rdf12Triple>();

	constructor(triples: Iterable<Rdf12Triple>) {
		for (const triple of triples) {
			this.add(triple);
		}
	}

	get size(): number {
		return this.#triplesByKey.size;
	}

	add(triple: Rdf12Triple): Rdf12Graph {
		this.#triplesByKey.set(rdf12TripleKey(triple), triple);
		return this;
	}

	has(triple: Rdf12Triple): boolean {
		return this.#triplesByKey.has(rdf12TripleKey(triple));
	}

	match(pattern: Rdf12TriplePattern = {}): Rdf12Triple[] {
		return this.toArray().filter((triple) => matchesPattern(triple, pattern));
	}

	toArray(): Rdf12Triple[] {
		return Array.from(this.#triplesByKey.entries())
			.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
			.map(([, triple]) => triple);
	}
}

function matchesPattern(
	triple: Rdf12Triple,
	pattern: Rdf12TriplePattern,
): boolean {
	return (
		matchesTerm(triple.subject, pattern.subject) &&
		matchesTerm(triple.predicate, pattern.predicate) &&
		matchesTerm(triple.object, pattern.object)
	);
}

function matchesTerm<T extends Rdf12Term>(
	actual: T,
	expected: T | undefined,
): boolean {
	return (
		expected === undefined || rdf12TermKey(actual) === rdf12TermKey(expected)
	);
}
