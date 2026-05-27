import type { AbundantNode } from "../model";
import type { Rdf12IriTerm } from "./terms";

export type Rdf12NodeIndexEntry = {
	readonly node: AbundantNode;
	readonly iri: Rdf12IriTerm;
	readonly localId: string;
	readonly kind: AbundantNode["kind"];
	readonly startLine: number;
	readonly startColumn?: number;
};

export type Rdf12NodeIndex = {
	get(node: AbundantNode): Rdf12IriTerm | undefined;
	entries(): readonly Rdf12NodeIndexEntry[];
};

export type MutableRdf12NodeIndex = Rdf12NodeIndex & {
	set(entry: Rdf12NodeIndexEntry): void;
};

export function createRdf12NodeIndex(): MutableRdf12NodeIndex {
	return new Rdf12NodeIndexMap();
}

class Rdf12NodeIndexMap implements MutableRdf12NodeIndex {
	readonly #entryByNode = new WeakMap<AbundantNode, Rdf12NodeIndexEntry>();
	readonly #entries: Rdf12NodeIndexEntry[] = [];

	get(node: AbundantNode): Rdf12IriTerm | undefined {
		return this.#entryByNode.get(node)?.iri;
	}

	set(entry: Rdf12NodeIndexEntry): void {
		this.#entryByNode.set(entry.node, entry);
		this.#entries.push(entry);
	}

	entries(): readonly Rdf12NodeIndexEntry[] {
		return [...this.#entries];
	}
}
