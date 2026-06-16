import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAsciidoctorAdapter } from "../../src/asciidoctor-adapter";
import type { AbundantNode, SectionNode } from "../../src/model";
import { childBlocksOf } from "../../src/official-block-utils";
import { parseAbundantTree } from "../../src/parser";

const projectRoot = process.cwd();
const documentRoot = join(projectRoot, "test/book-entry/fixtures");
const simpleBookRoot = join(documentRoot, "simple-book");
const entryPath = join(simpleBookRoot, "book.adoc");

describe("book-entry parser integration", () => {
	it("parses book-entry logical text into a standard AbundantDocument", () => {
		const document = parseAbundantTree({
			sourcePath: entryPath,
			mode: "book-entry",
			documentRoot,
		});
		const sectionTitles = collectSections(document.children).map(
			(section) => section.title,
		);

		expect(document.kind).toBe("document");
		expect(document.mode).toBe("book-entry");
		expect(document.sourcePath).toBe(entryPath);
		expect(document.sourceText).toContain(
			":book-entry-shared-attribute: shared attribute value from include",
		);
		expect(document.sourceText).not.toContain(
			"include::chapters/01-entry-origin.adoc[]",
		);
		expect(sectionTitles).toEqual(
			expect.arrayContaining([
				"Preface Origin",
				"Xref Origin",
				"Target Origin",
				"Nested Origin",
				"Glossary Origin",
			]),
		);
	});

	it("uses logical text rather than Asciidoctor include sourcemap for book-entry mode", () => {
		const singleFileDocument = parseAbundantTree({
			sourcePath: entryPath,
			mode: "single-file",
		});
		const bookEntryDocument = parseAbundantTree({
			sourcePath: entryPath,
			mode: "book-entry",
			documentRoot,
		});

		expect(
			collectSections(singleFileDocument.children).map(
				(section) => section.title,
			),
		).not.toContain("Xref Origin");
		expect(
			collectSections(bookEntryDocument.children).map(
				(section) => section.title,
			),
		).toContain("Xref Origin");
		expect(
			bookEntryDocument.toolDiagnostics.map((diagnostic) => diagnostic.code),
		).not.toContain("source-location.external-file");
	});

	it("keeps Asciidoctor memory parse source lines aligned to logical lines", () => {
		const logicalText = [
			"= Memory Probe",
			"",
			"Intro paragraph.",
			"",
			"[#logical-heading]",
			"== Logical Heading",
			"",
			"Logical paragraph.",
		].join("\n");
		const officialDocument = createAsciidoctorAdapter().loadSource(logicalText);
		const logicalHeading = childBlocksOf(officialDocument).find(
			(block) => block.getTitle?.() === "Logical Heading",
		);

		expect(logicalHeading?.getSourceLocation?.()?.getLineNumber?.()).toBe(6);
	});

	it("recovers description list source layers from included origin files", () => {
		const document = parseAbundantTree({
			sourcePath: entryPath,
			mode: "book-entry",
			documentRoot,
		});
		const glossary = collectSections(document.children).find(
			(section) => section.title === "Glossary Origin",
		);
		const list = glossary?.children?.find(
			(node) => node.kind === "descriptionList",
		) as DescriptionListView | undefined;

		expect(list?.source?.relativePath).toBe(
			"simple-book/backmatter/glossary.adoc",
		);
		expect(list?.items[0]?.terms[0]?.source?.relativePath).toBe(
			"simple-book/backmatter/glossary.adoc",
		);
		expect(list?.items[0]?.description?.source?.relativePath).toBe(
			"simple-book/backmatter/glossary.adoc",
		);
	});
});

type DescriptionListView = AbundantNode & {
	kind: "descriptionList";
	items: Array<{
		description?: {
			source?: { relativePath?: string };
		};
		terms: Array<{
			source?: { relativePath?: string };
		}>;
	}>;
};

function collectSections(nodes: readonly AbundantNode[]): SectionNode[] {
	const result: SectionNode[] = [];
	for (const node of nodes) {
		if (node.kind === "section") {
			result.push(node);
		}
		result.push(...collectSections(node.children ?? []));
	}
	return result;
}
