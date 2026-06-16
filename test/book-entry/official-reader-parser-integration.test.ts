import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	AbundantDocument,
	AbundantNode,
	ListingNode,
	SectionNode,
} from "../../src/model";
import { parseAbundantTree } from "../../src/parser";

const fixtureRoot = join(
	process.cwd(),
	"test/book-entry/fixtures/official-reader-book",
);
const entryPath = join(fixtureRoot, "book.adoc");

describe("book-entry official Reader parser integration", () => {
	it("routes book-entry parsing through official Reader include preprocessing", () => {
		const document = parseOfficialReaderBook();
		const titles = collectSections(document.children).map(
			(section) => section.title,
		);

		expect(titles).toEqual(
			expect.arrayContaining([
				"Preface",
				"Main Chapter",
				"Nested Section",
				"Snippet Chapter",
			]),
		);
		expect(titles).not.toContain("Escaped Target");
		expect(
			document.sourceFiles?.map((sourceFile) => sourceFile.relativePath),
		).toEqual(
			expect.arrayContaining([
				"book.adoc",
				"frontmatter/preface.adoc",
				"chapters/01-main.adoc",
				"chapters/nested/section.adoc",
				"chapters/02-snippet-include.adoc",
				"examples/minimal-tool.mjs",
				"snippets/lines.adoc",
				"snippets/indented.adoc",
				"snippets/tagged-xref.adoc",
			]),
		);
		expect(
			document.sourceFiles?.map((sourceFile) => sourceFile.relativePath),
		).not.toContain("missing-optional.adoc");
	});

	it("recovers heading source files and leveloffset hierarchy from physical origins", () => {
		const document = parseOfficialReaderBook();
		const main = sectionByTitle(document, "Main Chapter");
		const nested = sectionByTitle(document, "Nested Section");

		expect(document.title?.source?.relativePath).toBe("book.adoc");
		expect(sectionByTitle(document, "Preface").source?.relativePath).toBe(
			"frontmatter/preface.adoc",
		);
		expect(main.source?.relativePath).toBe("chapters/01-main.adoc");
		expect(nested.source?.relativePath).toBe("chapters/nested/section.adoc");
		expect(nested.source?.raw).toContain("=== Nested Section");
		expect(main.children?.some((child) => child.kind === "section")).toBe(true);
		expect(main.source?.raw).not.toContain(":leveloffset");
	});

	it("parses tagged source block content and keeps escaped includes parser-safe", () => {
		const document = parseOfficialReaderBook();
		const listings = collectNodes(
			document.children,
			"listing",
		) as ListingNode[];
		const taggedListing = listings.find((listing) =>
			listing.content?.includes("describeBook"),
		);

		expect(taggedListing?.content).toContain("export function describeBook");
		expect(taggedListing?.content).not.toContain("outsideAgain");
		expect(document.sourceText).toContain("\\include::escaped-target.adoc[]");
		expect(document.sourceText).not.toContain(
			"This section must not be parsed.",
		);
	});
});

function parseOfficialReaderBook(): AbundantDocument {
	return parseAbundantTree({
		sourcePath: entryPath,
		mode: "book-entry",
		documentRoot: fixtureRoot,
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

function collectSections(nodes: readonly AbundantNode[]): SectionNode[] {
	return collectNodes(nodes, "section") as SectionNode[];
}

function collectNodes(
	nodes: readonly AbundantNode[],
	kind: string,
): AbundantNode[] {
	const result: AbundantNode[] = [];
	for (const node of nodes) {
		if (node.kind === kind) {
			result.push(node);
		}
		result.push(...collectNodes(node.children ?? [], kind));
	}
	return result;
}
