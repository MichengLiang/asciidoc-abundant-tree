export type Rdf12IriTerm = {
	readonly termType: "iri";
	readonly value: string;
};

export type Rdf12LiteralTerm = {
	readonly termType: "literal";
	readonly value: string;
	readonly datatype: Rdf12IriTerm;
	readonly language?: string;
};

export type Rdf12TripleTerm = {
	readonly termType: "triple";
	readonly value: Rdf12Triple;
};

export type Rdf12Term = Rdf12IriTerm | Rdf12LiteralTerm | Rdf12TripleTerm;

export type Rdf12Triple = {
	readonly subject: Rdf12IriTerm;
	readonly predicate: Rdf12IriTerm;
	readonly object: Rdf12Term;
};

export function iriTerm(value: string): Rdf12IriTerm {
	return {
		termType: "iri",
		value,
	};
}

export function literalTerm(input: {
	value: string;
	datatype: Rdf12IriTerm;
	language?: string;
}): Rdf12LiteralTerm {
	const literal: Rdf12LiteralTerm = {
		termType: "literal",
		value: input.value,
		datatype: input.datatype,
	};

	if (input.language !== undefined) {
		return {
			...literal,
			language: input.language,
		};
	}

	return literal;
}

export function rdf12Triple(
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
	object: Rdf12Term,
): Rdf12Triple {
	return {
		subject,
		predicate,
		object,
	};
}

export function rdf12TripleTerm(value: Rdf12Triple): Rdf12TripleTerm {
	return {
		termType: "triple",
		value,
	};
}

export function rdf12TermKey(term: Rdf12Term): string {
	switch (term.termType) {
		case "iri":
			return `iri:${JSON.stringify(term.value)}`;
		case "literal":
			return `literal:${JSON.stringify({
				value: term.value,
				datatype: term.datatype.value,
				language: term.language ?? "",
			})}`;
		case "triple":
			return `triple:${rdf12TripleKey(term.value)}`;
	}
}

export function rdf12TripleKey(triple: Rdf12Triple): string {
	return JSON.stringify({
		subject: rdf12TermKey(triple.subject),
		predicate: rdf12TermKey(triple.predicate),
		object: rdf12TermKey(triple.object),
	});
}
