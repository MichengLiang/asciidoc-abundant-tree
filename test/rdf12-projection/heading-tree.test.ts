import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument, SectionNode } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { buildHeadingTreeProjection } from "../../src/rdf12-projection/heading-tree";

const fixtureRoot = join(process.cwd(), "test/book-entry/fixtures");
const orderedBookPath = join(fixtureRoot, "ordered-book/book.adoc");

describe("heading tree projection", () => {
	it("builds preorder document and child order from a book-entry logical tree with origin line collisions", () => {
		const document = parseAbundantTree({
			sourcePath: orderedBookPath,
			mode: "book-entry",
			documentRoot: fixtureRoot,
		});
		const projection = buildHeadingTreeProjection(document);
		const entriesByHeadline = new Map(
			projection.entries.map((entry) => [headlineOf(entry), entry]),
		);

		expect(projection.entries.map(headlineOf)).toEqual([
			"Ordered Book",
			"Preface",
			"Part One",
			"First",
			"Second",
			"Part Two",
			"Third",
			"Index",
		]);
		expect(projection.entries.map((entry) => entry.documentOrder)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8,
		]);
		expect(projection.roots.map(headlineOf)).toEqual(["Ordered Book"]);

		const orderedBook = requiredEntry(entriesByHeadline, "Ordered Book");
		const preface = requiredEntry(entriesByHeadline, "Preface");
		const partOne = requiredEntry(entriesByHeadline, "Part One");
		const first = requiredEntry(entriesByHeadline, "First");
		const second = requiredEntry(entriesByHeadline, "Second");
		const partTwo = requiredEntry(entriesByHeadline, "Part Two");
		const third = requiredEntry(entriesByHeadline, "Third");
		const index = requiredEntry(entriesByHeadline, "Index");

		expect(orderedBook.kind).toBe("document-title");
		expect(orderedBook.documentOrder).toBe(1);
		expect(orderedBook.childOrder).toBeUndefined();
		expect(orderedBook.children.map(headlineOf)).toEqual([
			"Preface",
			"Part One",
			"Part Two",
			"Index",
		]);

		expect(preface.parent).toBe(orderedBook);
		expect(preface.childOrder).toBe(1);
		expect(partOne.parent).toBe(orderedBook);
		expect(partOne.childOrder).toBe(2);
		expect(partTwo.parent).toBe(orderedBook);
		expect(partTwo.childOrder).toBe(3);
		expect(index.parent).toBe(orderedBook);
		expect(index.childOrder).toBe(4);

		expect(partOne.children.map(headlineOf)).toEqual(["First", "Second"]);
		expect(first.parent).toBe(partOne);
		expect(first.childOrder).toBe(1);
		expect(second.parent).toBe(partOne);
		expect(second.childOrder).toBe(2);

		expect(partTwo.children.map(headlineOf)).toEqual(["Third"]);
		expect(third.parent).toBe(partTwo);
		expect(third.childOrder).toBe(1);

		const sourceStartLines = projection.entries.flatMap((entry) =>
			entry.node.source?.span?.startLine === undefined
				? []
				: [entry.node.source.span.startLine],
		);
		expect(new Set(sourceStartLines).size).toBeLessThan(
			sourceStartLines.length,
		);
	});

	it("exposes rootless top-level sections as roots without parent child order", () => {
		const nested = section("Nested", 2);
		const firstRoot = section("First Root", 1, [nested]);
		const secondRoot = section("Second Root", 1);
		const document: AbundantDocument = {
			kind: "document",
			sourcePath: "/virtual/rootless.adoc",
			mode: "single-file",
			parser: { name: "@asciidoctor/core", version: "test" },
			children: [
				firstRoot,
				{ kind: "paragraph", text: "non-heading content" },
				secondRoot,
			],
			targets: [],
			xrefOccurrences: [],
			anchorOccurrences: [],
			toolDiagnostics: [],
		};

		const projection = buildHeadingTreeProjection(document);
		const entriesByHeadline = new Map(
			projection.entries.map((entry) => [headlineOf(entry), entry]),
		);

		expect(projection.entries.map(headlineOf)).toEqual([
			"First Root",
			"Nested",
			"Second Root",
		]);
		expect(projection.entries.map((entry) => entry.documentOrder)).toEqual([
			1, 2, 3,
		]);
		expect(projection.roots.map(headlineOf)).toEqual([
			"First Root",
			"Second Root",
		]);

		const firstRootEntry = requiredEntry(entriesByHeadline, "First Root");
		const secondRootEntry = requiredEntry(entriesByHeadline, "Second Root");
		const nestedEntry = requiredEntry(entriesByHeadline, "Nested");

		expect(firstRootEntry.parent).toBeUndefined();
		expect(firstRootEntry.childOrder).toBeUndefined();
		expect(secondRootEntry.parent).toBeUndefined();
		expect(secondRootEntry.childOrder).toBeUndefined();

		expect(firstRootEntry.children.map(headlineOf)).toEqual(["Nested"]);
		expect(nestedEntry.parent).toBe(firstRootEntry);
		expect(nestedEntry.childOrder).toBe(1);
	});
});

type HeadingTreeEntry = ReturnType<
	typeof buildHeadingTreeProjection
>["entries"][number];

function requiredEntry(
	entriesByHeadline: ReadonlyMap<string, HeadingTreeEntry>,
	headline: string,
): HeadingTreeEntry {
	const entry = entriesByHeadline.get(headline);

	if (entry === undefined) {
		throw new Error(`Missing heading tree entry for ${headline}`);
	}

	return entry;
}

function headlineOf(entry: HeadingTreeEntry): string {
	return entry.kind === "document-title" ? entry.node.text : entry.node.title;
}

function section(
	title: string,
	level: number,
	children: SectionNode["children"] = [],
): SectionNode {
	return {
		kind: "section",
		level,
		ids: [],
		title,
		idOrigin: "unknown",
		children,
	};
}
