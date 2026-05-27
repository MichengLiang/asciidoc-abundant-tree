import type { Rdf12LabelCatalog } from "./label-catalog";
import type { Rdf12IriTerm } from "./terms";

export type Rdf12SelectorBindingResult =
	| {
			readonly status: "bound";
			readonly selector: string;
			readonly target: Rdf12IriTerm;
	  }
	| {
			readonly status: "unresolved";
			readonly selector: string;
			readonly selectorLiteral: string;
	  }
	| {
			readonly status: "ambiguous";
			readonly selector: string;
			readonly selectorLiteral: string;
			readonly candidates: readonly Rdf12IriTerm[];
	  };

export function bindSelector(
	catalog: Rdf12LabelCatalog,
	selector: string,
): Rdf12SelectorBindingResult {
	const candidates = catalog.owners(selector);

	if (candidates.length === 1) {
		const [target] = candidates;
		if (target === undefined) {
			throw new Error("selector binding candidate list was unexpectedly empty");
		}
		return {
			status: "bound",
			selector,
			target,
		};
	}

	if (candidates.length === 0) {
		return {
			status: "unresolved",
			selector,
			selectorLiteral: selector,
		};
	}

	return {
		status: "ambiguous",
		selector,
		selectorLiteral: selector,
		candidates,
	};
}

export function candidateNodesForSelector(
	catalog: Rdf12LabelCatalog,
	selector: string,
): readonly Rdf12IriTerm[] {
	return catalog.owners(selector);
}
