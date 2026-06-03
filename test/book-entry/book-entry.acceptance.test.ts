import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLogicalSource } from "../../src/book-entry/logical-source-builder";
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

// Batch 01+ migration expected-fail registry.
// Remove parser core memory entry failures in Batch 03.
// Remove origin-aware recovery failures in Batch 04.
// Remove public API/CLI failures in Batch 05.
// Remove downstream coordinate failures in Batch 06.
// Remove diagnostics and negative contract failures in Batch 07.
// Remove this migration gate entirely in Batch 08.
const itBookEntryContract = it.fails;

describe("book-entry source-mapped logical document contract", () => {
	it("expresses book-entry mode and origin file identity through public model fields", () => {
		const document: AbundantDocument = {
			kind: "document",
			sourcePath: entryPath,
			mode: "book-entry",
			parser: { name: "@asciidoctor/core", version: "test" },
			children: [
				sectionFixture("Part One", expectedEntryRelativePath),
				sectionFixture("Xref Origin", expectedChapterRelativePath),
				sectionFixture("Nested Origin", expectedNestedRelativePath),
			],
			targets: [
				{
					kind: "target",
					id: "target-origin",
					targetType: "section",
					idOrigin: "source",
					source: { relativePath: expectedTargetRelativePath },
				},
			],
			xrefOccurrences: [
				{
					kind: "xref",
					syntax: "macro",
					raw: "xref:target-origin[Target Origin]",
					target: "target-origin",
					source: { relativePath: expectedChapterRelativePath },
				},
			],
			anchorOccurrences: [],
			toolDiagnostics: [],
		};

		expect(document.mode).toBe("book-entry");
		expect(sourceRelativePath(sectionByTitle(document, "Part One"))).toBe(
			expectedEntryRelativePath,
		);
		expect(sourceRelativePath(sectionByTitle(document, "Xref Origin"))).toBe(
			expectedChapterRelativePath,
		);
		expect(sourceRelativePath(sectionByTitle(document, "Nested Origin"))).toBe(
			expectedNestedRelativePath,
		);
		expect(sourceRelativePath(onlyXref(document))).toBe(
			expectedChapterRelativePath,
		);
		expect(sourceRelativePath(targetById(document, "target-origin"))).toBe(
			expectedTargetRelativePath,
		);
	});

	it("constructs simple-book logical text with line origins before parser integration", () => {
		const logicalSource = buildLogicalSource({
			sourcePath: entryPath,
			documentRoot,
		});

		expect(logicalSource.logicalText).toContain("== Preface Origin");
		expect(logicalSource.logicalText).toContain("== Xref Origin");
		expect(logicalSource.logicalText).toContain("=== Nested Origin");
		expect(logicalSource.logicalText).toContain("== Glossary Origin");
		expect(logicalSource.logicalText).toContain(
			"\\include::chapters/escaped.adoc[]",
		);
		expect(logicalSource.lineOrigins).toHaveLength(
			logicalSource.logicalText.split(/\r?\n/u).length,
		);
		expect(
			logicalSource.sourceFiles.map((sourceFile) => sourceFile.relativePath),
		).toEqual(
			expect.arrayContaining([
				expectedEntryRelativePath,
				"simple-book/frontmatter/preface.adoc",
				expectedChapterRelativePath,
				expectedTargetRelativePath,
				expectedNestedRelativePath,
				"simple-book/backmatter/glossary.adoc",
			]),
		);
	});

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

function parseBookEntryFixture(): AbundantDocument {
	return parseAbundantTree({
		sourcePath: entryPath,
		mode: "book-entry",
		documentRoot,
	});
}

function sectionByTitle(
	document: AbundantDocument,
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

function targetById(document: AbundantDocument, id: string): TargetNode {
	const target = document.targets.find((candidate) => candidate.id === id);
	if (!target) {
		throw new Error(`Missing target: ${id}`);
	}
	return target;
}

function onlyXref(document: AbundantDocument): XrefOccurrenceNode {
	const [xref] = document.xrefOccurrences;
	if (!xref) {
		throw new Error("Missing xref occurrence");
	}
	return xref;
}

function sectionFixture(title: string, relativePath: string): SectionNode {
	return {
		kind: "section",
		level: title === "Part One" ? 0 : 1,
		ids: [title.toLowerCase().replaceAll(" ", "-")],
		title,
		idOrigin: "source",
		source: { relativePath },
		children: [],
	};
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
	const relativePath = stringValue(source?.relativePath);
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
