import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	AbundantDocument,
	AbundantNode,
	AnchorOccurrenceNode,
	ListingNode,
	ParagraphNode,
	SectionNode,
	TableNode,
	TargetNode,
	XrefOccurrenceNode,
} from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { writeFixture } from "../helpers";

const projectRoot = process.cwd();
const fixtureRoot = join(projectRoot, "test/book-entry/fixtures");
const simpleBookRoot = join(fixtureRoot, "simple-book");
const entryPath = join(simpleBookRoot, "book.adoc");
const crossOriginEntryPath = join(simpleBookRoot, "cross-origin-book.adoc");

const entryRelativePath = "simple-book/book.adoc";
const chapterRelativePath = "simple-book/chapters/01-entry-origin.adoc";
const targetRelativePath = "simple-book/chapters/02-target-origin.adoc";
const nestedRelativePath = "simple-book/chapters/nested/section.adoc";

describe("book-entry origin source coordinate recovery", () => {
	it("maps entry, chapter, and nested heading source layers to their origin relativePath", async () => {
		const document = await parseBookEntryFixture();

		expect(sectionByTitle(document, "Part One").source?.relativePath).toBe(
			entryRelativePath,
		);
		expect(sectionByTitle(document, "Xref Origin").source?.relativePath).toBe(
			chapterRelativePath,
		);
		expect(sectionByTitle(document, "Nested Origin").source?.relativePath).toBe(
			nestedRelativePath,
		);
	});

	it("recovers heading raw from origin files instead of slicing logical text", async () => {
		const document = await parseBookEntryFixture();
		const chapterSection = sectionByTitle(document, "Xref Origin");
		const nestedSection = sectionByTitle(document, "Nested Origin");
		const targetSection = sectionByTitle(document, "Target Origin");

		expect(chapterSection.source?.raw).toBe(`[#xref-origin]
== Xref Origin

This chapter points to xref:target-origin[Target Origin].

This chapter owns anchor:chapter-anchor[Chapter Anchor] for scope recovery.

include::nested/section.adoc[]

[#chapter-listing]
.Chapter Listing
[source,js]
----
console.log("chapter");
----

Late section text after listing keeps xref:target-origin[Late Target] and anchor:late-chapter-anchor[Late Chapter Anchor] in the same source scope.
`);
		expect(chapterSection.source?.raw).not.toContain("=== Nested Origin");
		expect(chapterSection.source?.raw).toContain("[#chapter-listing]");
		expect(chapterSection.source?.raw).toContain('console.log("chapter");');
		expect(chapterSection.source?.raw).toContain("Late section text");
		expect(nestedSection.source?.raw).toContain("=== Nested Origin");
		expect(targetSection.source?.raw).toBe(`[#target-origin]
== Target Origin

This chapter owns the target section.

[#chapter-table]
|===
| Column

| Value
|===
`);
		expect(targetSection.source?.raw).toContain("[#chapter-table]");
		expect(targetSection.source?.raw).toContain("| Value");
	});

	it("maps xref, anchor, and target source coordinates to their origin files", async () => {
		const document = await parseBookEntryFixture();
		const xref = onlyXref(document);
		const anchor = anchorById(document, "chapter-anchor");
		const target = targetById(document, "target-origin");
		const paragraph = paragraphContaining(document, "xref:target-origin");

		expect(xref.source?.relativePath).toBe(chapterRelativePath);
		expect(xref.sourceSpan).toEqual({
			start: { line: 6, column: 24 },
			end: { line: 6, column: 57 },
		});
		expect(anchor.source?.relativePath).toBe(chapterRelativePath);
		expect(anchor.sourceSpan?.start.line).toBe(8);
		expect(target.source?.relativePath).toBe(targetRelativePath);
		expect(target.sourceSpan?.start.line).toBe(4);
		expect(paragraph.source?.relativePath).toBe(chapterRelativePath);
	});

	it("assigns occurrences written after an included subsection to that subsection, as Asciidoctor nests them", async () => {
		const document = await parseBookEntryFixture();
		const lateXref = xrefByLabel(document, "Late Target");
		const lateAnchor = anchorById(document, "late-chapter-anchor");

		// 章节文件第 10 行 include 了一个 === 小节；AsciiDoc 的 section 延续到下一个标题，所以第 19 行的段落在官方
		// AST 里是 Nested Origin 的子块（节点树里也挂在那里），尽管它写在章节文件里。
		expect(lateXref.source?.relativePath).toBe(chapterRelativePath);
		expect(lateXref.sourceSpan?.start.line).toBe(19);
		expect(lateXref.containingSectionId).toBe("nested-origin");
		expect(lateAnchor.source?.relativePath).toBe(chapterRelativePath);
		expect(lateAnchor.sourceSpan?.start.line).toBe(19);
		expect(lateAnchor.containingSectionId).toBe("nested-origin");
		expect(
			sectionByTitle(document, "Nested Origin").children?.some(
				(child) =>
					child.kind === "paragraph" &&
					(child.text ?? "").includes("Late section"),
			),
		).toBe(true);
	});

	it("recovers listing raw, contentSpan, and source span from the origin file", async () => {
		const document = await parseBookEntryFixture();
		const listing = findNode(document.children, "listing") as ListingNode;

		expect(listing.source?.relativePath).toBe(chapterRelativePath);
		expect(listing.source?.raw).toContain("[#chapter-listing]");
		expect(listing.source?.raw).toContain('console.log("chapter");');
		expect(listing.span).toEqual({ startLine: 12, endLine: 17 });
		expect(listing.contentSpan).toEqual({ startLine: 16, endLine: 16 });
		expect(listing.source?.sourceSpan).toEqual({
			start: { line: 12, column: 1 },
			end: { line: 17, column: 5 },
		});
	});

	it("maps table source span to its origin file", async () => {
		const document = await parseBookEntryFixture();
		const table = findNode(document.children, "table") as TableNode;

		expect(table.source?.relativePath).toBe(targetRelativePath);
		expect(table.span).toEqual({ startLine: 8, endLine: 13 });
		expect(table.source?.sourceSpan?.start).toEqual({ line: 8, column: 1 });
	});

	it("does not output fake raw or precise coordinates for cross-origin block spans", async () => {
		const document = await parseAbundantTree({
			sourcePath: crossOriginEntryPath,
			mode: "book-entry",
			documentRoot: fixtureRoot,
		});
		const listing = findNode(document.children, "listing") as ListingNode;

		expect(document.toolDiagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "block-origin.multi-source-span",
					level: "warning",
					message: expect.stringContaining(
						"starts at simple-book/cross-origin-book.adoc:5 and ends at simple-book/chapters/cross-origin-listing.adoc:2",
					),
				}),
			]),
		);
		expect(listing.source).toBeUndefined();
		expect(listing.span).toBeUndefined();
		expect(listing.contentSpan).toBeUndefined();
		expect(listing.source?.raw).toBeUndefined();
	});

	it("does not reuse book-entry recovery context for later same-text single-file parses", async () => {
		const bookEntryDocument = await parseBookEntryFixture();
		if (!bookEntryDocument.sourceText) {
			throw new Error("Book-entry document sourceText is required.");
		}
		const singleFilePath = writeFixture(
			"same-text-after-book-entry.adoc",
			bookEntryDocument.sourceText,
		);

		const singleFileDocument = await parseAbundantTree({
			sourcePath: singleFilePath,
		});
		const singleFileSection = sectionByTitle(singleFileDocument, "Xref Origin");

		expect(singleFileDocument.mode).toBe("single-file");
		expect(singleFileSection.source?.relativePath).toBeUndefined();
		expect(singleFileSection.source?.sourceSpan?.start.line).toBe(24);
	});
});

async function parseBookEntryFixture(): Promise<AbundantDocument> {
	return await parseAbundantTree({
		sourcePath: entryPath,
		mode: "book-entry",
		documentRoot: fixtureRoot,
	});
}

function sectionByTitle(
	document: AbundantDocument,
	title: string,
): SectionNode {
	const section = collectNodes(document.children, "section").find(
		(candidate): candidate is SectionNode =>
			(candidate as SectionNode).title === title,
	);
	if (!section) {
		throw new Error(`Missing section: ${title}`);
	}
	return section;
}

function onlyXref(document: AbundantDocument): XrefOccurrenceNode {
	const [xref] = document.xrefOccurrences;
	if (!xref) {
		throw new Error("Missing xref occurrence");
	}
	return xref;
}

function xrefByLabel(
	document: AbundantDocument,
	label: string,
): XrefOccurrenceNode {
	const xref = document.xrefOccurrences.find(
		(candidate) => candidate.label === label,
	);
	if (!xref) {
		throw new Error(`Missing xref occurrence: ${label}`);
	}
	return xref;
}

function anchorById(
	document: AbundantDocument,
	id: string,
): AnchorOccurrenceNode {
	const anchor = document.anchorOccurrences.find((candidate) =>
		candidate.ids.includes(id),
	);
	if (!anchor) {
		throw new Error(`Missing anchor occurrence: ${id}`);
	}
	return anchor;
}

function targetById(document: AbundantDocument, id: string): TargetNode {
	const target = document.targets.find((candidate) => candidate.id === id);
	if (!target) {
		throw new Error(`Missing target: ${id}`);
	}
	return target;
}

function paragraphContaining(
	document: AbundantDocument,
	text: string,
): ParagraphNode {
	const paragraph = collectNodes(document.children, "paragraph").find(
		(candidate): candidate is ParagraphNode =>
			(candidate as ParagraphNode).text?.includes(text) ?? false,
	);
	if (!paragraph) {
		throw new Error(`Missing paragraph containing: ${text}`);
	}
	return paragraph;
}

function findNode(nodes: AbundantNode[], kind: string): AbundantNode {
	const found = collectNodes(nodes, kind)[0];
	if (!found) {
		throw new Error(`Missing node kind: ${kind}`);
	}
	return found;
}

function collectNodes(nodes: AbundantNode[], kind: string): AbundantNode[] {
	const result: AbundantNode[] = [];
	for (const node of nodes) {
		if (node.kind === kind) {
			result.push(node);
		}
		result.push(...collectNodes(node.children ?? [], kind));
	}
	return result;
}
