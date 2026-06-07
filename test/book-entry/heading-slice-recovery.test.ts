import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	AbundantDocument,
	AbundantNode,
	SectionNode,
} from "../../src/model";
import { parseAbundantTree } from "../../src/parser";

const projectRoot = process.cwd();
const headingSliceFixtureRoot = join(
	projectRoot,
	"test/book-entry/fixtures/heading-slice-book",
);
const headingSliceBookPath = join(headingSliceFixtureRoot, "book.adoc");
const sameOriginBookPath = join(
	headingSliceFixtureRoot,
	"same-origin-book.adoc",
);

describe("book-entry heading slice recovery", () => {
	it("recovers book-entry included heading raw through a table body", () => {
		const document = parseHeadingSliceBook();
		const section = sectionByTitle(document, "Appendix Table");

		expect(section.source?.relativePath).toBe("backmatter/appendix-table.adoc");
		expect(section.source?.span).toEqual({ startLine: 1, endLine: 11 });
		expect(section.span).toEqual({ startLine: 1, endLine: 11 });
		expect(section.source?.raw).toContain('[cols="1,2", options="header"]');
		expect(section.source?.raw).toContain("|`== Chapter`");
		expect(section.source?.raw).toContain("|===");
	});

	it("recovers book-entry included heading raw through a listing body", () => {
		const document = parseHeadingSliceBook();
		const section = sectionByTitle(document, "Appendix Listing");

		expect(section.source?.relativePath).toBe(
			"backmatter/appendix-listing.adoc",
		);
		expect(section.source?.span).toEqual({ startLine: 1, endLine: 6 });
		expect(section.span).toEqual({ startLine: 1, endLine: 6 });
		expect(section.source?.raw).toContain("[source,js]");
		expect(section.source?.raw).toContain('console.log("appendix");');
		expect(section.source?.raw).toContain("----");
	});

	it("uses contiguous metadata before the next real heading as a same-origin boundary", () => {
		const document = parseAbundantTree({
			sourcePath: sameOriginBookPath,
			mode: "book-entry",
			documentRoot: headingSliceFixtureRoot,
		});
		const first = sectionByTitle(document, "First Heading");
		const second = sectionByTitle(document, "Second Heading");

		expect(first.source?.relativePath).toBe("same-origin-next-heading.adoc");
		expect(first.source?.span).toEqual({ startLine: 1, endLine: 4 });
		expect(first.span).toEqual({ startLine: 1, endLine: 4 });
		expect(first.source?.raw).not.toContain("[#second-heading.rule]");
		expect(second.source?.relativePath).toBe("same-origin-next-heading.adoc");
		expect(second.source?.span).toEqual({ startLine: 5, endLine: 9 });
		expect(second.span).toEqual({ startLine: 5, endLine: 9 });
		expect(second.source?.raw).toContain("[#second-heading.rule]");
	});

	it("does not treat table cell text that looks like a heading as a slice boundary", () => {
		const document = parseAbundantTree({
			sourcePath: join(headingSliceFixtureRoot, "fake-table-heading.adoc"),
			mode: "book-entry",
			documentRoot: headingSliceFixtureRoot,
		});
		const section = sectionByTitle(document, "Table Cell Heading Text");

		expect(section.source?.relativePath).toBe("fake-table-heading.adoc");
		expect(section.source?.span).toEqual({ startLine: 3, endLine: 11 });
		expect(section.span).toEqual({ startLine: 3, endLine: 11 });
		expect(section.source?.raw).toContain("|`== Not A Heading`");
		expect(section.source?.raw).toContain("|plain table cell text.");
		expect(section.source?.raw).toContain("|===");
		expect(section.source?.raw).not.toContain("== Real Next Heading");
	});
});

function parseHeadingSliceBook(): AbundantDocument {
	return parseAbundantTree({
		sourcePath: headingSliceBookPath,
		mode: "book-entry",
		documentRoot: headingSliceFixtureRoot,
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
