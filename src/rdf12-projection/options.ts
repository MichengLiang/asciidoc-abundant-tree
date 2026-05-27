export const DEFAULT_RDF12_BASE_IRI = "urn:aat:doc:";

export type Rdf12Options = {
	readonly documentRoot: string;
	readonly baseIri?: string;
	readonly relationPrefixMap?: Record<string, string>;
	readonly sourceText?: string;
	readonly sourceDigest?: string;
};

export type NormalizedRdf12Options = {
	readonly documentRoot: string;
	readonly baseIri: string;
	readonly relationPrefixMap: Readonly<Record<string, string>>;
	readonly sourceText?: string;
	readonly sourceDigest?: string;
};

export function normalizeRdf12Options(
	options: Rdf12Options,
): NormalizedRdf12Options {
	if (options.documentRoot.trim() === "") {
		throw new Error("RDF 1.2 projection requires documentRoot.");
	}

	const normalized: NormalizedRdf12Options = {
		documentRoot: options.documentRoot,
		baseIri: options.baseIri ?? DEFAULT_RDF12_BASE_IRI,
		relationPrefixMap: { ...(options.relationPrefixMap ?? {}) },
	};

	return {
		...normalized,
		...(options.sourceText !== undefined
			? { sourceText: options.sourceText }
			: {}),
		...(options.sourceDigest !== undefined
			? { sourceDigest: options.sourceDigest }
			: {}),
	};
}
