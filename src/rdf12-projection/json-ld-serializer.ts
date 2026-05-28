import { namespaces } from "./namespaces";
import type { Rdf12Projection } from "./projector";
import type {
	Rdf12IriTerm,
	Rdf12LiteralTerm,
	Rdf12Term,
	Rdf12Triple,
	Rdf12TripleTerm,
} from "./terms";

const rdf12JsonLdNamespace =
	"https://micheng.dev/ns/asciidoc-abundant-tree/rdf12-json-ld#";

type JsonLdDocument = {
	readonly "@context": Record<string, string>;
	readonly "@graph": JsonLdTriple[];
};

type JsonLdTriple = {
	readonly "@id": string;
	readonly "@type": "rdf12:Triple";
	readonly subject: JsonLdIriTerm;
	readonly predicate: JsonLdIriTerm;
	readonly object: JsonLdTerm;
};

type JsonLdIriTerm = {
	readonly "@id": string;
	readonly "@type": "rdf12:IriTerm";
};

type JsonLdLiteralTerm = {
	readonly "@type": "rdf12:LiteralTerm";
	readonly "@value": string;
	readonly datatype: JsonLdIriTerm;
	readonly "@language"?: string;
};

type JsonLdTripleTerm = {
	readonly "@type": "rdf12:TripleTerm";
	readonly triple: Omit<JsonLdTriple, "@id" | "@type">;
};

type JsonLdTerm = JsonLdIriTerm | JsonLdLiteralTerm | JsonLdTripleTerm;

export function serializeRdf12ProjectionToJsonLd(
	projection: Rdf12Projection,
): string {
	const document: JsonLdDocument = {
		"@context": {
			...projection.prefixes,
			rdf12: rdf12JsonLdNamespace,
		},
		"@graph": projection.graph
			.toArray()
			.map((triple, index) => tripleToJsonLd(triple, index)),
	};

	return `${JSON.stringify(document, null, 2)}\n`;
}

function tripleToJsonLd(triple: Rdf12Triple, index: number): JsonLdTriple {
	return {
		"@id": `${projectionStatementBase(triple.subject)}statement-${index}`,
		"@type": "rdf12:Triple",
		...embeddedTripleToJsonLd(triple),
	};
}

function projectionStatementBase(subject: Rdf12IriTerm): string {
	const hashIndex = subject.value.lastIndexOf("#");
	if (hashIndex === -1) {
		return `${subject.value}#`;
	}

	return subject.value.slice(0, hashIndex + 1);
}

function embeddedTripleToJsonLd(
	triple: Rdf12Triple,
): Omit<JsonLdTriple, "@id" | "@type"> {
	return {
		subject: iriTermToJsonLd(triple.subject),
		predicate: iriTermToJsonLd(triple.predicate),
		object: termToJsonLd(triple.object),
	};
}

function termToJsonLd(term: Rdf12Term): JsonLdTerm {
	switch (term.termType) {
		case "iri":
			return iriTermToJsonLd(term);
		case "literal":
			return literalTermToJsonLd(term);
		case "triple":
			return tripleTermToJsonLd(term);
	}
}

function iriTermToJsonLd(term: Rdf12IriTerm): JsonLdIriTerm {
	return {
		"@id": term.value,
		"@type": "rdf12:IriTerm",
	};
}

function literalTermToJsonLd(term: Rdf12LiteralTerm): JsonLdLiteralTerm {
	const literal: JsonLdLiteralTerm = {
		"@type": "rdf12:LiteralTerm",
		"@value": term.value,
		datatype: iriTermToJsonLd(term.datatype),
	};

	if (term.language !== undefined) {
		return {
			...literal,
			"@language": term.language,
		};
	}

	return literal;
}

function tripleTermToJsonLd(term: Rdf12TripleTerm): JsonLdTripleTerm {
	return {
		"@type": "rdf12:TripleTerm",
		triple: embeddedTripleToJsonLd(term.value),
	};
}

export const rdf12JsonLdContext = {
	...namespaces,
	rdf12: rdf12JsonLdNamespace,
} as const;
