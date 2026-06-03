import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LogicalSource } from "../../src/book-entry/model";
import {
	logicalSourceForLineTable,
	recoverOriginPointSourceLayer,
	recoverOriginSourceLayer,
	recoverSectionSourceLayer,
	recoverTitleSpan,
	registerLogicalSourceForRecovery,
	sourceFileForOrigin,
} from "../../src/book-entry/origin-coordinate";
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
import { buildLineTable } from "../../src/source-lines";
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
	it("maps entry, chapter, and nested heading source layers to their origin relativePath", () => {
		const document = parseBookEntryFixture();

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

	it("recovers heading raw from origin files instead of slicing logical text", () => {
		const document = parseBookEntryFixture();
		const chapterSection = sectionByTitle(document, "Xref Origin");
		const nestedSection = sectionByTitle(document, "Nested Origin");
		const targetSection = sectionByTitle(document, "Target Origin");

		expect(chapterSection.source?.raw).toBe(`[#xref-origin]
== Xref Origin

This chapter points to xref:target-origin[Target Origin].

This chapter owns anchor:chapter-anchor[Chapter Anchor] for scope recovery.

include::nested/section.adoc[]

`);
		expect(chapterSection.source?.raw).not.toContain("=== Nested Origin");
		expect(chapterSection.source?.raw).not.toContain("[#chapter-listing]");
		expect(nestedSection.source?.raw).toContain("=== Nested Origin");
		expect(targetSection.source?.raw).toBe(`[#target-origin]
== Target Origin

This chapter owns the target section.

`);
		expect(targetSection.source?.raw).not.toContain("[#chapter-table]");
	});

	it("maps xref, anchor, and target source coordinates to their origin files", () => {
		const document = parseBookEntryFixture();
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
		expect(target.sourceSpan?.start.line).toBe(3);
		expect(paragraph.source?.relativePath).toBe(chapterRelativePath);
	});

	it("recovers listing raw, contentSpan, and source span from the origin file", () => {
		const document = parseBookEntryFixture();
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

	it("maps table source span to its origin file", () => {
		const document = parseBookEntryFixture();
		const table = findNode(document.children, "table") as TableNode;

		expect(table.source?.relativePath).toBe(targetRelativePath);
		expect(table.span).toEqual({ startLine: 8, endLine: 13 });
		expect(table.source?.sourceSpan?.start).toEqual({ line: 8, column: 1 });
	});

	it("does not output fake raw or precise coordinates for cross-origin block spans", () => {
		const document = parseAbundantTree({
			sourcePath: crossOriginEntryPath,
			mode: "book-entry",
			documentRoot: fixtureRoot,
		});
		const listing = findNode(document.children, "listing") as ListingNode;

		expect(document.toolDiagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "source-recovery.cross-origin-block",
					level: "warning",
				}),
			]),
		);
		expect(listing.source).toBeUndefined();
		expect(listing.span).toBeUndefined();
		expect(listing.contentSpan).toBeUndefined();
		expect(listing.source?.raw).toBeUndefined();
	});

	it("does not reuse book-entry recovery context for later same-text single-file parses", () => {
		const bookEntryDocument = parseBookEntryFixture();
		if (!bookEntryDocument.sourceText) {
			throw new Error("Book-entry document sourceText is required.");
		}
		const singleFilePath = writeFixture(
			"same-text-after-book-entry.adoc",
			bookEntryDocument.sourceText,
		);

		const singleFileDocument = parseAbundantTree({
			sourcePath: singleFilePath,
		});
		const singleFileSection = sectionByTitle(singleFileDocument, "Xref Origin");

		expect(singleFileDocument.mode).toBe("single-file");
		expect(singleFileSection.source?.relativePath).toBeUndefined();
		expect(singleFileSection.source?.sourceSpan?.start.line).toBe(26);
	});
});

describe("book-entry origin coordinate mapper diagnostics", () => {
	it("binds logical source context only to the next matching line table instance", () => {
		const logicalSource = syntheticLogicalSource();

		registerLogicalSourceForRecovery(logicalSource);
		const lineTable = buildLineTable(logicalSource.logicalText);
		const sameTextLineTable = buildLineTable(logicalSource.logicalText);

		expect(logicalSourceForLineTable(lineTable)).toBe(logicalSource);
		expect(logicalSourceForLineTable(sameTextLineTable)).toBeUndefined();
		expect(logicalSourceForLineTable(buildLineTable("other"))).toBeUndefined();
	});

	it("keeps identical logical texts isolated by line table identity", () => {
		const first = syntheticLogicalSource({
			lineOrigins: [
				{
					logicalLine: 1,
					absolutePath: "/first.adoc",
					relativePath: "first.adoc",
					sourceLine: 1,
				},
			],
			sourceFiles: [
				{
					absolutePath: "/first.adoc",
					relativePath: "first.adoc",
					text: "same",
					lineTable: buildLineTable("same"),
				},
			],
			logicalText: "same",
		});
		const second = syntheticLogicalSource({
			lineOrigins: [
				{
					logicalLine: 1,
					absolutePath: "/second.adoc",
					relativePath: "second.adoc",
					sourceLine: 1,
				},
			],
			sourceFiles: [
				{
					absolutePath: "/second.adoc",
					relativePath: "second.adoc",
					text: "same",
					lineTable: buildLineTable("same"),
				},
			],
			logicalText: "same",
		});

		registerLogicalSourceForRecovery(first);
		const firstLineTable = buildLineTable("same");
		registerLogicalSourceForRecovery(second);
		const secondLineTable = buildLineTable("same");

		expect(logicalSourceForLineTable(firstLineTable)).toBe(first);
		expect(logicalSourceForLineTable(secondLineTable)).toBe(second);
	});

	it("recovers same-origin source layers without raw when raw is not requested", () => {
		const logicalSource = syntheticLogicalSource();
		const recovered = recoverOriginSourceLayer(
			logicalSource,
			{ startLine: 1, endLine: 2 },
			{ diagnosticContext: "paragraph block" },
		);

		expect(recovered).toEqual(
			expect.objectContaining({
				ok: true,
				relativePath: "a.adoc",
				lineSpan: { startLine: 1, endLine: 2 },
				sourceSpan: {
					start: { line: 1, column: 1 },
					end: { line: 2, column: 6 },
				},
			}),
		);
		if (recovered.ok) {
			expect(recovered.sourceLayer).not.toHaveProperty("raw");
		}
	});

	it("diagnoses unmapped logical intervals without inventing coordinates", () => {
		const recovered = recoverOriginSourceLayer(
			syntheticLogicalSource(),
			{ startLine: 1, endLine: 99 },
			{
				diagnosticContext: "paragraph block",
				logicalSourceSpan: {
					start: { line: 1, column: 1 },
					end: { line: 99, column: 1 },
				},
			},
		);

		expect(recovered).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-recovery.logical-interval-unmapped",
					source: {
						start: { line: 1, column: 1 },
						end: { line: 99, column: 1 },
					},
				}),
			}),
		);
	});

	it("diagnoses empty and cross-origin intervals without fake source layers", () => {
		const logicalSource = syntheticLogicalSource();

		expect(
			recoverOriginSourceLayer(
				logicalSource,
				{ startLine: 2, endLine: 1 },
				{ diagnosticContext: "empty block" },
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-recovery.cross-origin-block",
				}),
			}),
		);
		expect(
			recoverOriginSourceLayer(
				logicalSource,
				{ startLine: 2, endLine: 3 },
				{ diagnosticContext: "listing block" },
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-recovery.cross-origin-block",
				}),
			}),
		);
	});

	it("diagnoses missing origin source files and out-of-range origin lines", () => {
		const missingFile = syntheticLogicalSource({
			lineOrigins: [
				{
					logicalLine: 1,
					absolutePath: "/missing.adoc",
					relativePath: "missing.adoc",
					sourceLine: 1,
				},
			],
			sourceFiles: [],
		});
		const outOfRange = syntheticLogicalSource({
			lineOrigins: [
				{
					logicalLine: 1,
					absolutePath: "/a.adoc",
					relativePath: "a.adoc",
					sourceLine: 99,
				},
			],
		});

		expect(
			sourceFileForOrigin(missingFile, firstOrigin(missingFile)),
		).toBeUndefined();
		expect(
			recoverOriginSourceLayer(
				missingFile,
				{ startLine: 1, endLine: 1 },
				{ diagnosticContext: "paragraph block" },
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-recovery.origin-line-missing",
				}),
			}),
		);
		expect(
			recoverOriginSourceLayer(
				outOfRange,
				{ startLine: 1, endLine: 1 },
				{ diagnosticContext: "paragraph block" },
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-recovery.origin-line-missing",
				}),
			}),
		);
	});

	it("diagnoses inline origin recovery failures and preserves successful point coordinates", () => {
		const logicalSource = syntheticLogicalSource();
		const successful = recoverOriginPointSourceLayer(
			logicalSource,
			{
				start: { line: 1, column: 2 },
				end: { line: 1, column: 5 },
			},
			"raw",
		);

		expect(successful).toEqual(
			expect.objectContaining({
				ok: true,
				sourceSpan: {
					start: { line: 1, column: 2 },
					end: { line: 1, column: 5 },
				},
			}),
		);
		expect(
			recoverOriginPointSourceLayer(
				logicalSource,
				{
					start: { line: 99, column: 1 },
					end: { line: 99, column: 2 },
				},
				"raw",
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-recovery.logical-interval-unmapped",
				}),
			}),
		);
		expect(
			recoverOriginPointSourceLayer(
				logicalSource,
				{
					start: { line: 1, column: 1 },
					end: { line: 99, column: 2 },
				},
				"raw",
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-recovery.logical-interval-unmapped",
				}),
			}),
		);
		expect(
			recoverOriginPointSourceLayer(
				logicalSource,
				{
					start: { line: 2, column: 1 },
					end: { line: 3, column: 2 },
				},
				"raw",
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-recovery.cross-origin-block",
				}),
			}),
		);
	});

	it("recovers section raw from heading origin and handles section recovery failures", () => {
		const logicalSource = syntheticLogicalSource();
		const recovered = recoverSectionSourceLayer(logicalSource, 3, 2, {
			start: { line: 3, column: 4 },
			end: { line: 3, column: 11 },
		});

		expect(recovered).toEqual(
			expect.objectContaining({
				ok: true,
				relativePath: "b.adoc",
			}),
		);
		if (recovered.ok) {
			expect(recovered.sourceLayer.raw).toContain("b heading");
			expect(recovered.sourceLayer.span).toEqual({ startLine: 1, endLine: 2 });
		}
		expect(recoverSectionSourceLayer(logicalSource, 99, 99, undefined)).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-recovery.logical-interval-unmapped",
				}),
			}),
		);
		expect(
			recoverSectionSourceLayer(
				syntheticLogicalSource({
					lineOrigins: [
						{
							logicalLine: 1,
							absolutePath: "/missing.adoc",
							relativePath: "missing.adoc",
							sourceLine: 1,
						},
					],
					sourceFiles: [],
				}),
				1,
				1,
				undefined,
			),
		).toEqual(
			expect.objectContaining({
				ok: false,
				diagnostic: expect.objectContaining({
					code: "source-recovery.origin-line-missing",
				}),
			}),
		);
	});

	it("recovers title spans only when both endpoints map to one origin file", () => {
		const logicalSource = syntheticLogicalSource();

		expect(recoverTitleSpan(logicalSource, undefined)).toBeUndefined();
		expect(
			recoverTitleSpan(logicalSource, {
				start: { line: 1, column: 1 },
				end: { line: 1, column: 4 },
			}),
		).toEqual({
			start: { line: 1, column: 1 },
			end: { line: 1, column: 4 },
		});
		expect(
			recoverTitleSpan(logicalSource, {
				start: { line: 99, column: 1 },
				end: { line: 99, column: 4 },
			}),
		).toBeUndefined();
		expect(
			recoverTitleSpan(logicalSource, {
				start: { line: 2, column: 1 },
				end: { line: 3, column: 4 },
			}),
		).toBeUndefined();
	});
});

function parseBookEntryFixture(): AbundantDocument {
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

function syntheticLogicalSource(
	overrides: Partial<LogicalSource> = {},
): LogicalSource {
	const aTable = buildLineTable("a one\na two");
	const bTable = buildLineTable("b heading\nb body");
	return {
		entryPath: "/entry.adoc",
		documentRoot: "/",
		logicalText: "a one\na two\nb heading",
		lineOrigins: [
			{
				logicalLine: 1,
				absolutePath: "/a.adoc",
				relativePath: "a.adoc",
				sourceLine: 1,
			},
			{
				logicalLine: 2,
				absolutePath: "/a.adoc",
				relativePath: "a.adoc",
				sourceLine: 2,
			},
			{
				logicalLine: 3,
				absolutePath: "/b.adoc",
				relativePath: "b.adoc",
				sourceLine: 1,
			},
		],
		sourceFiles: [
			{
				absolutePath: "/a.adoc",
				relativePath: "a.adoc",
				text: aTable.source,
				lineTable: aTable,
			},
			{
				absolutePath: "/b.adoc",
				relativePath: "b.adoc",
				text: bTable.source,
				lineTable: bTable,
			},
		],
		...overrides,
	};
}

function firstOrigin(logicalSource: LogicalSource) {
	const [origin] = logicalSource.lineOrigins;
	if (!origin) {
		throw new Error("Missing first line origin");
	}
	return origin;
}
