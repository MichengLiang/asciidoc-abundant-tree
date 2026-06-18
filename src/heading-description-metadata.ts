import type {
	AbundantDocument,
	AbundantNode,
	DescriptionListNode,
	HeadingDescriptionMetadataEntry,
	HeadingDescriptionMetadataNode,
	SectionNode,
	SourceLayer,
	SourceSpan,
} from "./model";
import { definedObject } from "./object-utils";

export function attachHeadingDescriptionMetadata(
	document: AbundantDocument,
): AbundantDocument {
	attachInNodes(document.children);
	return document;
}

function attachInNodes(nodes: readonly AbundantNode[] | undefined): void {
	for (const node of nodes ?? []) {
		if (node.kind === "section") {
			attachInSection(node);
		}
	}
}

function attachInSection(section: SectionNode): void {
	const children = section.children ?? [];
	const run = leadingDescriptionListRun(children);

	if (
		run.length > 0 &&
		!run.some((list) =>
			(list.items ?? []).some((item) => containsNestedDescriptionList(item)),
		)
	) {
		section.descriptionMetadata = buildHeadingDescriptionMetadata(run);
		section.children = children.slice(run.length);
	}

	attachInNodes(section.children);
}

function leadingDescriptionListRun(
	children: readonly AbundantNode[],
): DescriptionListNode[] {
	const run: DescriptionListNode[] = [];
	for (const child of children) {
		if (child.kind !== "descriptionList") {
			break;
		}
		run.push(child);
	}
	return run;
}

function containsNestedDescriptionList(node: AbundantNode): boolean {
	if (node.kind === "descriptionList") {
		return true;
	}
	if (node.kind === "descriptionListItem") {
		return node.description
			? containsNestedDescriptionList(node.description)
			: false;
	}
	return (node.children ?? []).some((child) =>
		containsNestedDescriptionList(child),
	);
}

function buildHeadingDescriptionMetadata(
	run: readonly DescriptionListNode[],
): HeadingDescriptionMetadataNode {
	const entries = entriesFromRun(run);
	const fields: Record<string, string> = {};
	for (const entry of entries) {
		fields[entry.key] = entry.value;
	}

	return definedObject({
		kind: "headingDescriptionMetadata",
		fields,
		entries,
		source: mergeRunSource(run),
	}) as HeadingDescriptionMetadataNode;
}

function entriesFromRun(
	run: readonly DescriptionListNode[],
): HeadingDescriptionMetadataEntry[] {
	const entries: HeadingDescriptionMetadataEntry[] = [];
	for (const list of run) {
		for (const item of list.items) {
			const value = item.description?.text ?? "";
			for (const term of item.terms) {
				entries.push(
					definedObject({
						key: term.text,
						value,
						term,
						description: item.description,
					}) as HeadingDescriptionMetadataEntry,
				);
			}
		}
	}
	return entries;
}

function mergeRunSource(
	run: readonly DescriptionListNode[],
): SourceLayer | undefined {
	const sources = run.map((list) => list.source);
	if (sources.some((source) => source === undefined)) {
		return undefined;
	}

	const presentSources = sources.filter(
		(source): source is SourceLayer => source !== undefined,
	);
	const spans = presentSources.map((source) => source.span);
	if (spans.some((span) => span === undefined)) {
		return undefined;
	}

	const presentSpans = spans.filter(
		(span): span is NonNullable<SourceLayer["span"]> => span !== undefined,
	);
	const relativePath = commonRelativePath(presentSources);
	const sourceSpan = hasConflictingRelativePaths(presentSources)
		? undefined
		: mergeSourceSpans(presentSources);
	const raw = mergeRawSource(presentSources);

	return definedObject({
		span: {
			startLine: Math.min(...presentSpans.map((span) => span.startLine)),
			endLine: Math.max(...presentSpans.map((span) => span.endLine)),
		},
		relativePath,
		sourceSpan,
		raw,
	}) as SourceLayer;
}

function commonRelativePath(
	sources: readonly SourceLayer[],
): string | undefined {
	const relativePaths = sources
		.map((source) => source.relativePath)
		.filter((path): path is string => path !== undefined && path.length > 0);
	if (relativePaths.length === 0) {
		return undefined;
	}
	const [firstPath] = relativePaths;
	return relativePaths.every((path) => path === firstPath)
		? firstPath
		: undefined;
}

function hasConflictingRelativePaths(sources: readonly SourceLayer[]): boolean {
	const relativePaths = sources
		.map((source) => source.relativePath)
		.filter((path): path is string => path !== undefined && path.length > 0);
	return new Set(relativePaths).size > 1;
}

function mergeSourceSpans(
	sources: readonly SourceLayer[],
): SourceSpan | undefined {
	const sourceSpans = sources.map((source) => source.sourceSpan);
	if (sourceSpans.some((span) => span === undefined)) {
		return undefined;
	}
	const presentSourceSpans = sourceSpans.filter(
		(span): span is SourceSpan => span !== undefined,
	);
	return {
		start: earliestPosition(presentSourceSpans.map((span) => span.start)),
		end: latestPosition(presentSourceSpans.map((span) => span.end)),
	};
}

function mergeRawSource(sources: readonly SourceLayer[]): string | undefined {
	if (!sourcesHaveContiguousLineSpans(sources)) {
		return undefined;
	}
	const rawValues = sources.map((source) => source.raw);
	if (rawValues.some((raw) => raw === undefined)) {
		return undefined;
	}
	return rawValues.join("");
}

function sourcesHaveContiguousLineSpans(
	sources: readonly SourceLayer[],
): boolean {
	for (let index = 1; index < sources.length; index += 1) {
		const previous = sources[index - 1]?.span;
		const current = sources[index]?.span;
		if (!previous || !current || current.startLine !== previous.endLine + 1) {
			return false;
		}
	}
	return true;
}

function earliestPosition(
	positions: readonly SourceSpan["start"][],
): SourceSpan["start"] {
	return positions.reduce((earliest, position) =>
		comparePositions(position, earliest) < 0 ? position : earliest,
	);
}

function latestPosition(
	positions: readonly SourceSpan["end"][],
): SourceSpan["end"] {
	return positions.reduce((latest, position) =>
		comparePositions(position, latest) > 0 ? position : latest,
	);
}

function comparePositions(
	left: SourceSpan["start"],
	right: SourceSpan["start"],
): number {
	return left.line - right.line || left.column - right.column;
}
