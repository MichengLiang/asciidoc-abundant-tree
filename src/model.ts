export type OutputFormat = "tree" | "json";

export type SourcePosition = {
	line: number;
	column: number;
};

export type SourceSpan = {
	start: SourcePosition;
	end: SourcePosition;
};

export type LineSpan = {
	startLine: number;
	endLine: number;
};

export type TargetType =
	| "section"
	| "listing"
	| "table"
	| "inline-anchor"
	| "block"
	| "unknown";

export type ParserInfo = {
	name: "@asciidoctor/core";
	version: string;
};

export type SourceLayer = {
	raw?: string;
	relativePath?: string;
	line?: number;
	span?: LineSpan;
	sourceSpan?: SourceSpan;
};

export type SourceFileNode = {
	relativePath: string;
	raw: string;
};

export type AsciidoctorLayer = {
	context?: string;
	nodeName?: string;
	href?: string;
	resolvedId?: string;
	resolvedType?: TargetType;
	reftext?: string;
};

export type ToolDiagnostic = {
	level: "info" | "warning" | "error";
	code: string;
	message: string;
	source?: SourceSpan;
};

type NodeBase = {
	kind: string;
	source?: SourceLayer;
	asciidoctor?: AsciidoctorLayer;
	children?: AbundantNode[];
};

export type TitleNode = NodeBase & {
	kind: "title";
	text: string;
};

export type MetadataNode = NodeBase & {
	kind: "metadata";
	metadataKind: "id" | "title" | "attrlist" | "anchor" | "unknown";
	raw: string;
	line?: number;
	ids?: string[];
	roles?: string[];
	attributes?: Record<string, string | number | boolean>;
};

export type SectionNode = NodeBase & {
	kind: "section";
	level: number;
	ids: string[];
	title: string;
	line?: number;
	span?: LineSpan;
	titleSpan?: SourceSpan;
	idOrigin: "source" | "asciidoctor-generated" | "unknown";
	metadata?: MetadataNode[];
	descriptionMetadata?: HeadingDescriptionMetadataNode;
};

export type ParagraphNode = NodeBase & {
	kind: "paragraph";
	text?: string;
};

export type ListingNode = NodeBase & {
	kind: "listing";
	ids: string[];
	title?: string;
	style?: string;
	language?: string;
	metadata?: MetadataNode[];
	content?: string;
	metadataSpan?: LineSpan;
	contentSpan?: LineSpan;
	span?: LineSpan;
};

export type TableNode = NodeBase & {
	kind: "table";
	ids: string[];
	title?: string;
	metadata?: MetadataNode[];
	rows?: unknown[];
	cells?: unknown[];
	span?: LineSpan;
};

export type DescriptionListNode = NodeBase & {
	kind: "descriptionList";
	ids: string[];
	title?: string;
	style?: string;
	delimiter?: string;
	metadata?: MetadataNode[];
	metadataSpan?: LineSpan;
	contentSpan?: LineSpan;
	span?: LineSpan;
	items: DescriptionListItemNode[];
};

export type DescriptionListItemNode = NodeBase & {
	kind: "descriptionListItem";
	terms: DescriptionTermNode[];
	description?: DescriptionNode;
	span?: LineSpan;
};

export type DescriptionTermNode = NodeBase & {
	kind: "descriptionTerm";
	text: string;
	line?: number;
	sourceSpan?: SourceSpan;
};

export type DescriptionNode = NodeBase & {
	kind: "description";
	text?: string;
	line?: number;
	sourceSpan?: SourceSpan;
};

export type HeadingDescriptionMetadataNode = NodeBase & {
	kind: "headingDescriptionMetadata";
	fields: Record<string, string>;
	entries: HeadingDescriptionMetadataEntry[];
	source?: SourceLayer;
};

export type HeadingDescriptionMetadataEntry = {
	key: string;
	value: string;
	term: DescriptionTermNode;
	description?: DescriptionNode;
};

export type XrefOccurrenceNode = NodeBase & {
	kind: "xref";
	syntax: "shorthand" | "macro";
	raw: string;
	target: string;
	label?: string;
	attributes?: Record<string, string | number | boolean>;
	sourceSpan?: SourceSpan;
	containingSectionId?: string;
	scope?: "local" | "external" | "unresolved";
	targetKind?: string;
};

export type AnchorOccurrenceNode = NodeBase & {
	kind: "anchor";
	syntax: "double-bracket" | "macro";
	raw: string;
	ids: string[];
	reftext?: string;
	sourceSpan?: SourceSpan;
	containingSectionId?: string;
	anchorScope?: "inline" | "block";
};

export type TargetNode = NodeBase & {
	kind: "target";
	id: string;
	targetType: TargetType;
	title?: string;
	idOrigin: "source" | "asciidoctor-generated" | "unknown";
	sourceSpan?: SourceSpan;
};

export type TextNode = NodeBase & {
	kind: "text";
	value: string;
};

type UnknownNode = NodeBase & {
	kind: "unknown";
	raw?: string;
};

export type AbundantNode =
	| SectionNode
	| ParagraphNode
	| ListingNode
	| TableNode
	| DescriptionListNode
	| DescriptionListItemNode
	| DescriptionTermNode
	| DescriptionNode
	| HeadingDescriptionMetadataNode
	| MetadataNode
	| XrefOccurrenceNode
	| AnchorOccurrenceNode
	| TargetNode
	| TitleNode
	| TextNode
	| UnknownNode;

export type AbundantDocument = {
	kind: "document";
	sourcePath: string;
	sourceText?: string;
	sourceFiles?: SourceFileNode[];
	mode: "single-file" | "book-entry";
	parser: ParserInfo;
	title?: TitleNode;
	children: AbundantNode[];
	targets: TargetNode[];
	xrefOccurrences: XrefOccurrenceNode[];
	anchorOccurrences: AnchorOccurrenceNode[];
	toolDiagnostics: ToolDiagnostic[];
};

export type ParseAbundantTreeOptions =
	| {
			sourcePath: string;
			mode?: "single-file";
	  }
	| {
			sourcePath: string;
			mode: "book-entry";
			documentRoot: string;
	  };
