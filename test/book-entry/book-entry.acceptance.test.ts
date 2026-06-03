import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	AbundantDocument,
	AbundantNode,
	SectionNode,
	TargetNode,
	XrefOccurrenceNode,
} from "../../src/model";
import { parseAbundantTree } from "../../src/parser";

const projectRoot = process.cwd();
const fixtureRoot = join(projectRoot, "test/book-entry/fixtures/simple-book");
const entryPath = join(fixtureRoot, "book.adoc");
const documentRoot = join(projectRoot, "test/book-entry/fixtures");

const expectedEntryRelativePath = "simple-book/book.adoc";
const expectedChapterRelativePath = "simple-book/chapters/01-entry-origin.adoc";
const expectedTargetRelativePath = "simple-book/chapters/02-target-origin.adoc";
const expectedNestedRelativePath = "simple-book/chapters/nested/section.adoc";

// Batch 00 migration expected-fail registry.
// Remove public model and coordinate identity failures in Batch 01.
// Remove logical source builder failures in Batch 02.
// Remove parser core memory entry failures in Batch 03.
// Remove origin-aware recovery failures in Batch 04.
// Remove public API/CLI failures in Batch 05.
// Remove downstream coordinate failures in Batch 06.
// Remove diagnostics and negative contract failures in Batch 07.
// Remove this migration gate entirely in Batch 08.
const itBookEntryContract = it.fails;

describe("book-entry source-mapped logical document contract", () => {
	itBookEntryContract(
		"returns a book-entry document whose sourcePath remains the entry file",
		() => {
			const document = parseBookEntryFixture();

			expect(document.mode).toBe("book-entry");
			expect(document.sourcePath).toBe(entryPath);
		},
	);

	itBookEntryContract(
		"projects entry, included, nested, and backmatter headings into one section tree",
		() => {
			const document = parseBookEntryFixture();
			const sectionTitles = collectSections(document.children).map(
				(section) => section.title,
			);

			expect(sectionTitles).toEqual(
				expect.arrayContaining([
					"Part One",
					"Preface Origin",
					"Xref Origin",
					"Target Origin",
					"Nested Origin",
					"Glossary Origin",
				]),
			);
		},
	);

	itBookEntryContract(
		"keeps heading source coordinates on the origin files that authored them",
		() => {
			const document = parseBookEntryFixture();
			const entrySection = sectionByTitle(document, "Part One");
			const chapterSection = sectionByTitle(document, "Xref Origin");
			const nestedSection = sectionByTitle(document, "Nested Origin");

			expect(sourceRelativePath(entrySection)).toBe(expectedEntryRelativePath);
			expect(sourceRelativePath(chapterSection)).toBe(
				expectedChapterRelativePath,
			);
			expect(sourceRelativePath(nestedSection)).toBe(
				expectedNestedRelativePath,
			);
		},
	);

	itBookEntryContract(
		"recovers heading raw from the origin file instead of slicing logical text",
		() => {
			const document = parseBookEntryFixture();
			const chapterSection = sectionByTitle(document, "Xref Origin");
			const nestedSection = sectionByTitle(document, "Nested Origin");

			expect(chapterSection.source?.raw).toContain("== Xref Origin");
			expect(chapterSection.source?.raw).toContain(
				"include::nested/section.adoc[]",
			);
			expect(chapterSection.source?.raw).not.toContain("=== Nested Origin");
			expect(nestedSection.source?.raw).toContain("=== Nested Origin");
		},
	);

	itBookEntryContract(
		"maps xref occurrences and their targets to their own origin files",
		() => {
			const document = parseBookEntryFixture();
			const xref = onlyXref(document);
			const target = targetById(document, "target-origin");

			expect(xref.raw).toBe("xref:target-origin[Target Origin]");
			expect(sourceRelativePath(xref)).toBe(expectedChapterRelativePath);
			expect(sourceRelativePath(target)).toBe(expectedTargetRelativePath);
		},
	);

	itBookEntryContract(
		"preserves escaped include as an ordinary source line without expansion",
		() => {
			const document = parseBookEntryFixture();
			const sectionTitles = collectSections(document.children).map(
				(section) => section.title,
			);

			expect(document.mode).toBe("book-entry");
			expect(document.sourceText).toContain(
				"\\include::chapters/escaped.adoc[]",
			);
			expect(sectionTitles).not.toContain("Escaped Include");
		},
	);

	itBookEntryContract(
		"does not let same line numbers in different origin files pollute section scope",
		() => {
			const document = parseBookEntryFixture();
			const xref = onlyXref(document);
			const chapterSection = sectionByTitle(document, "Xref Origin");
			const targetSection = sectionByTitle(document, "Target Origin");

			expect(chapterSection.line).toBe(3);
			expect(targetSection.line).toBe(3);
			expect(xref.containingSectionId).toBe("xref-origin");
		},
	);
});

type BookEntryParseOptions = {
	sourcePath: string;
	mode: "book-entry";
	documentRoot: string;
};

type BookEntryDocument = Omit<AbundantDocument, "mode"> & {
	mode: "book-entry";
};

function parseBookEntryFixture(): BookEntryDocument {
	const parseBookEntry = parseAbundantTree as unknown as (
		options: BookEntryParseOptions,
	) => BookEntryDocument;
	return parseBookEntry({
		sourcePath: entryPath,
		mode: "book-entry",
		documentRoot,
	});
}

function sectionByTitle(
	document: BookEntryDocument,
	title: string,
): SectionNode {
	const section = collectSections(document.children).find(
		(candidate) => candidate.title === title,
	);
	if (!section) {
		throw new Error(`Missing section: ${title}`);
	}
	return section;
}

function targetById(document: BookEntryDocument, id: string): TargetNode {
	const target = document.targets.find((candidate) => candidate.id === id);
	if (!target) {
		throw new Error(`Missing target: ${id}`);
	}
	return target;
}

function onlyXref(document: BookEntryDocument): XrefOccurrenceNode {
	const [xref] = document.xrefOccurrences;
	if (!xref) {
		throw new Error("Missing xref occurrence");
	}
	return xref;
}

function collectSections(nodes: AbundantNode[]): SectionNode[] {
	const result: SectionNode[] = [];
	for (const node of nodes) {
		if (node.kind === "section") {
			result.push(node);
		}
		result.push(...collectSections(node.children ?? []));
	}
	return result;
}

function sourceRelativePath(node: unknown): string | undefined {
	if (!isRecord(node)) {
		return undefined;
	}
	const source = isRecord(node.source) ? node.source : undefined;
	const sourceSpan = isRecord(node.sourceSpan) ? node.sourceSpan : undefined;
	const sourceSourceSpan = isRecord(source?.sourceSpan)
		? source?.sourceSpan
		: undefined;
	const relativePath =
		stringValue(source?.relativePath) ??
		stringValue(sourceSourceSpan?.relativePath) ??
		stringValue(sourceSpan?.relativePath);
	if (!relativePath) {
		return undefined;
	}
	return relativePathFromDocumentRoot(relativePath);
}

function relativePathFromDocumentRoot(value: string): string {
	return value.startsWith(projectRoot) ? relative(documentRoot, value) : value;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}
