import type { LineSpan, SourceLayer, SourceSpan } from "../model";
import type { Rdf12Graph } from "./graph";
import { rdf12Triple } from "./graph";
import { integerLiteral, stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type AddLineSpanTriplesInput = {
	readonly graph: Rdf12Graph;
	readonly subject: Rdf12IriTerm;
	readonly relativePath: string;
	readonly span: LineSpan;
};

export type AddSourceSpanTriplesInput = {
	readonly graph: Rdf12Graph;
	readonly subject: Rdf12IriTerm;
	readonly relativePath: string;
	readonly sourceSpan: SourceSpan;
};

export function sourceRelativePathOrFallback(
	source: SourceLayer | undefined,
	fallbackRelativePath: string,
): string {
	return source?.relativePath ?? fallbackRelativePath;
}

export function addLineSpanTriples(input: AddLineSpanTriplesInput): void {
	input.graph.add(
		rdf12Triple(
			input.subject,
			iriTerm(`${namespaces.aat}relativePath`),
			stringLiteral(input.relativePath),
		),
	);
	input.graph.add(
		rdf12Triple(
			input.subject,
			iriTerm(`${namespaces.aat}startLine`),
			integerLiteral(input.span.startLine),
		),
	);
	input.graph.add(
		rdf12Triple(
			input.subject,
			iriTerm(`${namespaces.aat}endLine`),
			integerLiteral(input.span.endLine),
		),
	);
}

export function addSourceSpanTriples(input: AddSourceSpanTriplesInput): void {
	addLineSpanTriples({
		graph: input.graph,
		subject: input.subject,
		relativePath: input.relativePath,
		span: {
			startLine: input.sourceSpan.start.line,
			endLine: input.sourceSpan.end.line,
		},
	});
	input.graph.add(
		rdf12Triple(
			input.subject,
			iriTerm(`${namespaces.aat}startColumn`),
			integerLiteral(input.sourceSpan.start.column),
		),
	);
	input.graph.add(
		rdf12Triple(
			input.subject,
			iriTerm(`${namespaces.aat}endColumn`),
			integerLiteral(input.sourceSpan.end.column),
		),
	);
}
