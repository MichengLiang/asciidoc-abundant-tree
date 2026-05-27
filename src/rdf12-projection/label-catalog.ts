import { rdf12TermKey } from "./graph";
import type { Rdf12IriTerm } from "./terms";

export type Rdf12LabelClass =
	| "TitleLabel"
	| "BlockTitleLabel"
	| "AddressLabel"
	| "GeneratedAddressLabel"
	| "AnchorLabel"
	| "ReftextLabel"
	| "XrefDisplayLabel"
	| "RoleLabel";

export type Rdf12LabelCatalogEntry = {
	readonly value: string;
	readonly owner: Rdf12IriTerm;
	readonly labelClass: Rdf12LabelClass;
	readonly label?: Rdf12IriTerm;
};

export type Rdf12LabelCatalog = {
	add(entry: Rdf12LabelCatalogEntry): void;
	find(value: string): readonly Rdf12LabelCatalogEntry[];
	owners(value: string): readonly Rdf12IriTerm[];
	entries(): readonly Rdf12LabelCatalogEntry[];
};

export function createRdf12LabelCatalog(): Rdf12LabelCatalog {
	return new Rdf12LabelCatalogMap();
}

class Rdf12LabelCatalogMap implements Rdf12LabelCatalog {
	readonly #entries: Rdf12LabelCatalogEntry[] = [];
	readonly #entriesByValue = new Map<string, Rdf12LabelCatalogEntry[]>();

	add(entry: Rdf12LabelCatalogEntry): void {
		this.#entries.push(entry);
		const entries = this.#entriesByValue.get(entry.value) ?? [];
		entries.push(entry);
		this.#entriesByValue.set(entry.value, entries);
	}

	find(value: string): readonly Rdf12LabelCatalogEntry[] {
		return [...(this.#entriesByValue.get(value) ?? [])];
	}

	owners(value: string): readonly Rdf12IriTerm[] {
		const ownersByKey = new Map<string, Rdf12IriTerm>();

		for (const entry of this.find(value)) {
			ownersByKey.set(rdf12TermKey(entry.owner), entry.owner);
		}

		return [...ownersByKey.values()];
	}

	entries(): readonly Rdf12LabelCatalogEntry[] {
		return [...this.#entries];
	}
}
