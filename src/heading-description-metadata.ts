import type {
	AbundantDocument,
	AbundantNode,
	DescriptionListItemNode,
	DescriptionListNode,
	HeadingDescriptionMetadataEntry,
	HeadingDescriptionMetadataNode,
	SectionNode,
	SourceLayer,
	SourceSpan,
} from "./model";
import { definedObject } from "./object-utils";

// 字段值是描述的源文档表面值（06 号规约「标题下描述列表字段」）。DescriptionNode.text 经过 Asciidoctor 的
// 行内替换，反引号、xref 宏会被换掉，也表达不了挂上来的块，所以值从源文件原文截取：AST 给出有哪些条目、
// 描述从哪一行哪一列开始、下一个 term 在哪一行；条目在哪里结束按 AsciiDoc 的列表续接读原文。
// 结束处不取自块的 span：book-entry 里内容来自 include 的块（8 号书的出处代码就是这样）映射不回来源坐标，
// span 缺失，而 include 指令行本身正是要保留的表面。
type SurfaceLines = (relativePath: string | undefined) => readonly string[];

const CONTINUATION_LINE = /^[ \t]*\+[ \t]*$/u;
const BLOCK_DELIMITER =
	/^(?:-{2}|-{4,}|={4,}|\*{4,}|_{4,}|\.{4,}|\+{4,}|\/{4,}|`{3,}.*|\|={3,})$/u;
// 块标题、块属性行与行注释写在块之前，同属挂上来的这个块。
const BLOCK_PREAMBLE_LINE = /^(?:\[.*\]|\.[^\s.].*|\/\/(?!\/\/).*)$/u;
// 空行之后的列表项或缩进行仍附着在条目上（AsciiDoc 的列表跨空行附着）；其他内容开始新的块。
const ATTACHED_AFTER_BLANK = /^(?:[ \t]+\S|[ \t]*(?:[*-]+|\.+|\d+\.)[ \t]+\S)/u;

export function attachHeadingDescriptionMetadata(
	document: AbundantDocument,
): AbundantDocument {
	attachInNodes(document.children, surfaceLinesOf(document));
	return document;
}

// book-entry 中节点的 source 层携带来源文件坐标，原文在 sourceFiles；单文件模式的 source 层没有 relativePath，
// 坐标就是 sourceText 的行号。
function surfaceLinesOf(document: AbundantDocument): SurfaceLines {
	const cache = new Map<string | undefined, readonly string[]>();
	return (relativePath) => {
		const cached = cache.get(relativePath);
		if (cached) {
			return cached;
		}
		const raw =
			(relativePath === undefined
				? undefined
				: document.sourceFiles?.find(
						(file) => file.relativePath === relativePath,
					)?.raw) ??
			document.sourceText ??
			"";
		const lines = raw.split(/\r?\n/u);
		cache.set(relativePath, lines);
		return lines;
	};
}

function attachInNodes(
	nodes: readonly AbundantNode[] | undefined,
	surfaceLines: SurfaceLines,
): void {
	for (const node of nodes ?? []) {
		if (node.kind === "section") {
			attachInSection(node, surfaceLines);
		}
	}
}

function attachInSection(
	section: SectionNode,
	surfaceLines: SurfaceLines,
): void {
	const children = section.children ?? [];
	const run = leadingDescriptionListRun(children);

	if (
		run.length > 0 &&
		run.every(isUndecoratedList) &&
		!run.some((list) =>
			(list.items ?? []).some((item) => containsNestedDescriptionList(item)),
		)
	) {
		section.descriptionMetadata = buildHeadingDescriptionMetadata(
			run,
			surfaceLines,
		);
		section.children = children.slice(run.length);
	}

	attachInNodes(section.children, surfaceLines);
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

// 带 ID、块标题、style 或块 metadata 的描述列表是作者排版的正文，不是字段。
function isUndecoratedList(list: DescriptionListNode): boolean {
	return (
		list.ids.length === 0 &&
		list.title === undefined &&
		list.style === undefined &&
		(list.metadata?.length ?? 0) === 0
	);
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
	surfaceLines: SurfaceLines,
): HeadingDescriptionMetadataNode {
	const entries = entriesFromRun(run, surfaceLines);
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
	surfaceLines: SurfaceLines,
): HeadingDescriptionMetadataEntry[] {
	const entries: HeadingDescriptionMetadataEntry[] = [];
	const items = run.flatMap((list) => list.items);
	items.forEach((item, index) => {
		const value = surfaceValue(item, items[index + 1], surfaceLines);
		for (const term of item.terms) {
			entries.push(
				definedObject({
					key: descriptionMetadataTermKey(term),
					value,
					term,
					description: item.description,
				}) as HeadingDescriptionMetadataEntry,
			);
		}
	});
	return entries;
}

function surfaceValue(
	item: DescriptionListItemNode,
	nextItem: DescriptionListItemNode | undefined,
	surfaceLines: SurfaceLines,
): string {
	const description = item.description;
	if (description === undefined) {
		return "";
	}
	// 只有列表、没有文字的描述在 book-entry 里只恢复出行范围、没有列；它独占一行，从行首开始。
	const startLine = description.source?.span?.startLine;
	const start =
		description.source?.sourceSpan?.start ??
		(startLine === undefined ? undefined : { line: startLine, column: 1 });
	// 起点恢复不出来时没有原文可取，退回 Asciidoctor 的文本，总比丢掉这个字段好。
	if (start === undefined) {
		return description.text ?? "";
	}

	const relativePath = description.source?.relativePath;
	const lines = surfaceLines(relativePath);
	const first = start.line - 1;
	const firstLine = Array.from(lines[first] ?? "")
		.slice(start.column - 1)
		.join("");
	const nextTerm = nextItem?.terms[0]?.source;
	const bound =
		nextTerm?.span !== undefined && nextTerm.relativePath === relativePath
			? nextTerm.span.startLine - 1
			: lines.length;
	const window = [firstLine, ...lines.slice(first + 1, bound)];
	const { end, continuations } = scanDescription(window);
	const valueLines = window
		.slice(0, end)
		// 外层续接行只把块挂到条目上，不属于值；留一个空行，块与块之间的分隔不丢。
		.map((text, index) => (continuations.has(index) ? "" : text.trimEnd()));
	return trimBlankEdges(dedent(valueLines)).join("\n");
}

// 从描述的第一行起，按 AsciiDoc 列表续接找出条目的结束处，并记下外层续接行的位置。
function scanDescription(lines: readonly string[]): {
	end: number;
	continuations: Set<number>;
} {
	const continuations = new Set<number>();
	let index = 0;
	let afterBlock = false;
	while (index < lines.length) {
		const line = lines[index] ?? "";
		if (CONTINUATION_LINE.test(line)) {
			continuations.add(index);
			index = attachedBlockEnd(lines, index + 1);
			afterBlock = true;
		} else if (line.trim() === "") {
			let next = index;
			while (next < lines.length && lines[next]?.trim() === "") {
				next += 1;
			}
			if (
				next >= lines.length ||
				!ATTACHED_AFTER_BLANK.test(lines[next] ?? "")
			) {
				break;
			}
			index = next;
			afterBlock = false;
		} else if (afterBlock) {
			break;
		} else {
			index += 1;
		}
	}
	return { end: index, continuations };
}

function attachedBlockEnd(lines: readonly string[], from: number): number {
	let index = from;
	while (index < lines.length && BLOCK_PREAMBLE_LINE.test(lines[index] ?? "")) {
		index += 1;
	}
	const delimiter = lines[index]?.trimEnd();
	if (delimiter !== undefined && BLOCK_DELIMITER.test(delimiter)) {
		index += 1;
		while (index < lines.length && lines[index]?.trimEnd() !== delimiter) {
			index += 1;
		}
		return Math.min(index + 1, lines.length);
	}
	while (
		index < lines.length &&
		lines[index]?.trim() !== "" &&
		!CONTINUATION_LINE.test(lines[index] ?? "")
	) {
		index += 1;
	}
	return index;
}

function dedent(lines: readonly string[]): string[] {
	const indents = lines
		.filter((line) => line.trim() !== "")
		.map((line) => line.length - line.trimStart().length);
	const indent = indents.length > 0 ? Math.min(...indents) : 0;
	return lines.map((line) => line.slice(indent));
}

function trimBlankEdges(lines: readonly string[]): readonly string[] {
	let first = 0;
	let last = lines.length;
	while (first < last && lines[first]?.trim() === "") {
		first += 1;
	}
	while (last > first && lines[last - 1]?.trim() === "") {
		last -= 1;
	}
	return lines.slice(first, last);
}

function descriptionMetadataTermKey(
	term: HeadingDescriptionMetadataEntry["term"],
) {
	// 术语的 raw 就是它在源文件里的表面（文件模式与 book-entry 都按列切出）；回源失败没有 raw 时退回官方文字。
	return term.source?.raw || term.text;
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
