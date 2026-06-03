import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	BookEntryConstructionError,
	type BookEntryConstructionErrorCode,
} from "../../src/book-entry/diagnostics";
import {
	assertLogicalDocumentInvariants,
	buildLogicalSource,
	originForLogicalLine,
} from "../../src/book-entry/logical-source-builder";
import type { LogicalSource } from "../../src/book-entry/model";
import { buildLineTable } from "../../src/source-lines";

const projectRoot = process.cwd();
const fixtureRoot = join(projectRoot, "test/book-entry/fixtures");
const simpleBookRoot = join(fixtureRoot, "simple-book");
const entryPath = join(simpleBookRoot, "book.adoc");

describe("book-entry logical source builder", () => {
	it("expands simple, nested, and shared book includes into logical text", () => {
		const logicalSource = buildLogicalSource({
			sourcePath: entryPath,
			documentRoot: fixtureRoot,
		});

		expect(logicalSource.logicalText).toContain("== Preface Origin");
		expect(logicalSource.logicalText).toContain("== Xref Origin");
		expect(logicalSource.logicalText).toContain("=== Nested Origin");
		expect(logicalSource.logicalText).toContain("== Glossary Origin");
		expect(logicalSource.logicalText).toContain(
			":book-entry-shared-attribute: shared attribute value from include",
		);
		expect(logicalSource.logicalText).not.toContain(
			"include::frontmatter/preface.adoc[]",
		);
		expect(logicalSource.logicalText).not.toContain(
			"include::shared/attributes.adoc[]",
		);
		expect(logicalSource.logicalText).not.toContain(
			"include::nested/section.adoc[]",
		);
	});

	it("records shared attributes include as its own source file and line origin", () => {
		const logicalSource = buildLogicalSource({
			sourcePath: entryPath,
			documentRoot: fixtureRoot,
		});
		const attributeLine =
			":book-entry-shared-attribute: shared attribute value from include";
		const attributeLogicalLine =
			logicalSource.logicalText.split(/\r?\n/u).indexOf(attributeLine) + 1;
		const attributeOrigin = originForLogicalLine(
			logicalSource,
			attributeLogicalLine,
		);

		expect(attributeLogicalLine).toBeGreaterThan(0);
		expect(
			logicalSource.sourceFiles.map((file) => file.relativePath),
		).toContain("simple-book/shared/attributes.adoc");
		expect(attributeOrigin).toEqual(
			expect.objectContaining({
				relativePath: "simple-book/shared/attributes.adoc",
				sourceLine: 1,
			}),
		);
	});

	it("preserves escaped include lines without expansion", () => {
		const logicalSource = buildLogicalSource({
			sourcePath: entryPath,
			documentRoot: fixtureRoot,
		});

		expect(logicalSource.logicalText).toContain(
			"\\include::chapters/escaped.adoc[]",
		);
		expect(
			logicalSource.sourceFiles.map((file) => file.relativePath),
		).not.toContain("simple-book/chapters/escaped.adoc");
	});

	it("resolves relative include targets from the containing file directory", () => {
		const logicalSource = buildLogicalSource({
			sourcePath: entryPath,
			documentRoot: fixtureRoot,
		});
		const nestedHeadingOrigin = logicalSource.lineOrigins.find((origin) => {
			const file = logicalSource.sourceFiles.find(
				(candidate) => candidate.absolutePath === origin.absolutePath,
			);
			return (
				file?.lineTable.lines[origin.sourceLine - 1]?.text ===
				"=== Nested Origin"
			);
		});

		expect(nestedHeadingOrigin).toEqual(
			expect.objectContaining({
				relativePath: "simple-book/chapters/nested/section.adoc",
			}),
		);
	});

	it("deduplicates source file records while preserving repeated include output", () => {
		const repeatedPath = join(simpleBookRoot, "repeated-entry.adoc");
		const chapterPath = join(simpleBookRoot, "chapters/01-entry-origin.adoc");
		const readCounts = new Map<string, number>();
		const sources = new Map([
			[
				repeatedPath,
				[
					"= Repeated",
					"",
					"include::chapters/01-entry-origin.adoc[]",
					"",
					"include::chapters/01-entry-origin.adoc[]",
					"",
				].join("\n"),
			],
			[
				chapterPath,
				[
					"// Same-line heading fixture: the section surface is on line 3 in both chapter files.",
					"",
					"[#xref-origin]",
					"== Xref Origin",
					"",
				].join("\n"),
			],
		]);

		const logicalSource = buildLogicalSource({
			sourcePath: repeatedPath,
			documentRoot: fixtureRoot,
			readFile: (absolutePath) => {
				readCounts.set(absolutePath, (readCounts.get(absolutePath) ?? 0) + 1);
				const source = sources.get(absolutePath);
				if (source === undefined) {
					throw Object.assign(new Error(`Missing fixture: ${absolutePath}`), {
						code: "ENOENT",
					});
				}
				return source;
			},
		});

		expect(matchCount(logicalSource.logicalText, "== Xref Origin")).toBe(2);
		expect(
			logicalSource.sourceFiles.filter(
				(file) => file.absolutePath === chapterPath,
			),
		).toHaveLength(1);
		expect(readCounts.get(chapterPath)).toBe(1);
	});

	it("keeps line origins contiguous and validates source file invariants", () => {
		const logicalSource = buildLogicalSource({
			sourcePath: entryPath,
			documentRoot: fixtureRoot,
		});
		const logicalLines = logicalSource.logicalText.split(/\r?\n/u);
		const sourceFilesByPath = new Map(
			logicalSource.sourceFiles.map((file) => [file.absolutePath, file]),
		);

		expect(
			logicalSource.lineOrigins.map((origin) => origin.logicalLine),
		).toEqual(logicalLines.map((_, index) => index + 1));
		expect(logicalSource.lineOrigins).toHaveLength(logicalLines.length);
		for (const origin of logicalSource.lineOrigins) {
			const file = sourceFilesByPath.get(origin.absolutePath);
			expect(file).toBeDefined();
			expect(origin.sourceLine).toBeGreaterThanOrEqual(1);
			expect(origin.sourceLine).toBeLessThanOrEqual(
				file?.lineTable.lines.length ?? 0,
			);
		}
		expect(() => assertLogicalDocumentInvariants(logicalSource)).not.toThrow();
	});

	it("fails invariants when a line origin references a missing source file", () => {
		expectConstructionError(
			() =>
				assertLogicalDocumentInvariants({
					entryPath,
					documentRoot: fixtureRoot,
					logicalText: "= Probe",
					lineOrigins: [
						{
							logicalLine: 1,
							absolutePath: join(simpleBookRoot, "missing.adoc"),
							relativePath: "simple-book/missing.adoc",
							sourceLine: 1,
						},
					],
					sourceFiles: [],
				} satisfies LogicalSource),
			"line-origin.source-file-missing",
		);
	});

	it("fails invariants when a line origin sourceLine is outside its source file", () => {
		const sourceFilePath = join(simpleBookRoot, "book.adoc");

		expectConstructionError(
			() =>
				assertLogicalDocumentInvariants({
					entryPath,
					documentRoot: fixtureRoot,
					logicalText: "= Probe",
					lineOrigins: [
						{
							logicalLine: 1,
							absolutePath: sourceFilePath,
							relativePath: "simple-book/book.adoc",
							sourceLine: 2,
						},
					],
					sourceFiles: [
						{
							absolutePath: sourceFilePath,
							relativePath: "simple-book/book.adoc",
							text: "= Probe",
							lineTable: buildLineTable("= Probe"),
						},
					],
				} satisfies LogicalSource),
			"line-origin.source-line-out-of-range",
		);
	});

	it("provides direct logical-line origin lookup", () => {
		const logicalSource = buildLogicalSource({
			sourcePath: entryPath,
			documentRoot: fixtureRoot,
		});
		const nestedLine = logicalSource.logicalText
			.split(/\r?\n/u)
			.indexOf("=== Nested Origin");
		const origin = originForLogicalLine(logicalSource, nestedLine + 1);

		expect(origin).toEqual(
			expect.objectContaining({
				logicalLine: nestedLine + 1,
				relativePath: "simple-book/chapters/nested/section.adoc",
				sourceLine: 2,
			}),
		);
	});
});

function matchCount(value: string, needle: string): number {
	return value.split(needle).length - 1;
}

function expectConstructionError(
	action: () => void,
	code: BookEntryConstructionErrorCode,
): void {
	try {
		action();
		throw new Error(`Expected construction error: ${code}`);
	} catch (error) {
		expect(error).toBeInstanceOf(BookEntryConstructionError);
		expect((error as BookEntryConstructionError).code).toBe(code);
	}
}
