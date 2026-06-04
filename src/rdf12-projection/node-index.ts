import type {
	AbundantNode,
	SectionNode,
	TargetType,
	TitleNode,
} from "../model";
import type { Rdf12IriTerm } from "./terms";

type Rdf12HeadingIndexBase = {
	readonly node: SectionNode;
	readonly iri: Rdf12IriTerm;
	readonly localId: string;
	readonly kind: "section";
	readonly relativePath?: string;
	readonly sourceStartLine?: number;
	readonly sourceEndLine?: number;
	readonly startLine: number;
	readonly endLine: number;
	readonly targetType: "section";
};

export type Rdf12NodeIndexEntry =
	| Rdf12HeadingIndexBase
	| {
			readonly node: TitleNode;
			readonly iri: Rdf12IriTerm;
			readonly localId: string;
			readonly kind: "document-title";
			readonly relativePath?: string;
			readonly sourceStartLine?: number;
			readonly sourceEndLine?: number;
			readonly startLine: number;
			readonly endLine: number;
			readonly targetType: "section";
	  };

export type Rdf12NodeIndex = {
	get(node: AbundantNode): Rdf12IriTerm | undefined;
	findByTarget(input: {
		readonly targetType: TargetType;
		readonly startLine: number;
		readonly endLine?: number;
	}): Rdf12IriTerm | undefined;
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

	findByTarget(input: {
		readonly targetType: TargetType;
		readonly startLine: number;
		readonly endLine?: number;
	}): Rdf12IriTerm | undefined {
		if (input.targetType !== "section") {
			return undefined;
		}

		return this.#entries.find(
			(entry) =>
				entry.targetType === input.targetType &&
				entry.startLine === input.startLine &&
				(input.endLine === undefined || entry.endLine === input.endLine),
		)?.iri;
	}

	set(entry: Rdf12NodeIndexEntry): void {
		this.#entryByNode.set(entry.node, entry);
		this.#entries.push(entry);
	}

	entries(): readonly Rdf12NodeIndexEntry[] {
		return [...this.#entries];
	}
}
