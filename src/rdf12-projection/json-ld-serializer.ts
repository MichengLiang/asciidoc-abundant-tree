import { namespaces } from "./namespaces";
import type { Rdf12Projection } from "./projector";
import { projectionResourceIri } from "./resource-identity";
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
	const writer: JsonLdWriter = {
		headingNamespace: projection.headingNamespace,
		statementBase: projectionResourceIri(projection.documentIri, "").value,
	};
	const document: JsonLdDocument = {
		"@context": {
			"@base": projection.documentIri,
			...projection.prefixes,
			rdf12: rdf12JsonLdNamespace,
		},
		"@graph": projection.graph
			.toArray()
			.map((triple, index) => tripleToJsonLd(writer, triple, index)),
	};

	return `${JSON.stringify(document, null, 2)}\n`;
}

// 以文档 IRI 为 @base，标题节点写作相对的 "#红烧肉::火候"，与 Turtle 相同（06 号书第 2 章「身份」）。
// 语句自己的 @id 是投影器起名的资源，放在 <文档 IRI>/projection# 下，不与标题的名字相撞。
type JsonLdWriter = {
	readonly headingNamespace: string;
	readonly statementBase: string;
};

function tripleToJsonLd(
	writer: JsonLdWriter,
	triple: Rdf12Triple,
	index: number,
): JsonLdTriple {
	return {
		"@id": `${writer.statementBase}statement-${index}`,
		"@type": "rdf12:Triple",
		...embeddedTripleToJsonLd(writer, triple),
	};
}

function embeddedTripleToJsonLd(
	writer: JsonLdWriter,
	triple: Rdf12Triple,
): Omit<JsonLdTriple, "@id" | "@type"> {
	return {
		subject: iriTermToJsonLd(writer, triple.subject),
		predicate: iriTermToJsonLd(writer, triple.predicate),
		object: termToJsonLd(writer, triple.object),
	};
}

function termToJsonLd(writer: JsonLdWriter, term: Rdf12Term): JsonLdTerm {
	switch (term.termType) {
		case "iri":
			return iriTermToJsonLd(writer, term);
		case "literal":
			return literalTermToJsonLd(writer, term);
		case "triple":
			return tripleTermToJsonLd(writer, term);
	}
}

function iriTermToJsonLd(
	writer: JsonLdWriter,
	term: Rdf12IriTerm,
): JsonLdIriTerm {
	return {
		"@id": term.value.startsWith(writer.headingNamespace)
			? `#${term.value.slice(writer.headingNamespace.length)}`
			: term.value,
		"@type": "rdf12:IriTerm",
	};
}

function literalTermToJsonLd(
	writer: JsonLdWriter,
	term: Rdf12LiteralTerm,
): JsonLdLiteralTerm {
	const literal: JsonLdLiteralTerm = {
		"@type": "rdf12:LiteralTerm",
		"@value": term.value,
		datatype: iriTermToJsonLd(writer, term.datatype),
	};

	if (term.language !== undefined) {
		return {
			...literal,
			"@language": term.language,
		};
	}

	return literal;
}

function tripleTermToJsonLd(
	writer: JsonLdWriter,
	term: Rdf12TripleTerm,
): JsonLdTripleTerm {
	return {
		"@type": "rdf12:TripleTerm",
		triple: embeddedTripleToJsonLd(writer, term.value),
	};
}

export const rdf12JsonLdContext = {
	...namespaces,
	rdf12: rdf12JsonLdNamespace,
} as const;
