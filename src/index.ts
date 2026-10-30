import type { AbundantDocument } from "./model";
import { serializeRdf12ProjectionToJsonLd } from "./rdf12-projection/json-ld-serializer";
import {
	normalizeRdf12Options,
	type Rdf12Options,
} from "./rdf12-projection/options";
import {
	projectAbundantDocumentToRdf12,
	type Rdf12Projection,
} from "./rdf12-projection/projector";
import { serializeRdf12ProjectionToTurtle } from "./rdf12-projection/turtle-serializer";

export type {
	AbundantDocument,
	AbundantNode,
	AnchorOccurrenceNode,
	AsciidoctorLayer,
	IncludeResolution,
	IncludeResolver,
	IncludeResolverRequest,
	LineSpan,
	ListingNode,
	MetadataNode,
	NodeBase,
	OutputFormat,
	ParagraphNode,
	ParseAbundantTreeOptions,
	ParserInfo,
	SectionNode,
	SourceFileNode,
	SourceLayer,
	SourcePosition,
	SourceSpan,
	TableNode,
	TargetNode,
	TargetType,
	TextNode,
	TitleNode,
	ToolDiagnostic,
	UnknownNode,
	XrefOccurrenceNode,
} from "./model";
export { parseAbundantTree } from "./parser";
export type {
	Rdf12Graph,
	Rdf12TriplePattern,
} from "./rdf12-projection/graph";
export type { Rdf12PrefixMap } from "./rdf12-projection/namespaces";
export type {
	Rdf12NodeIndex,
	Rdf12NodeIndexEntry,
} from "./rdf12-projection/node-index";
export type { Rdf12Options } from "./rdf12-projection/options";
export type { Rdf12Projection } from "./rdf12-projection/projector";
export type {
	Rdf12IriTerm,
	Rdf12LiteralTerm,
	Rdf12Term,
	Rdf12Triple,
	Rdf12TripleTerm,
} from "./rdf12-projection/terms";
export {
	formatAbundantTree,
	serializeAbundantTree,
	serializeAbundantTreeToJson,
} from "./serializers";

export type Rdf12Result = Rdf12Projection & {
	readonly ttl: string;
	readonly jsonLd: string;
};

export function rdf12(
	document: AbundantDocument,
	options: Rdf12Options,
): Rdf12Result {
	const normalizedOptions = normalizeRdf12Options(options);
	const projection = projectAbundantDocumentToRdf12(
		document,
		normalizedOptions,
	);

	return {
		...projection,
		ttl: serializeRdf12ProjectionToTurtle(projection),
		jsonLd: serializeRdf12ProjectionToJsonLd(projection),
	};
}
