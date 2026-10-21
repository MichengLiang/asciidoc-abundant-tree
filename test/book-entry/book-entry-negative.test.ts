import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	BookEntryConstructionError,
	type BookEntryConstructionErrorCode,
} from "../../src/book-entry/diagnostics";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";

const projectRoot = process.cwd();
const fixtureRoot = join(projectRoot, "test/book-entry/fixtures");
const negativeRoot = join(fixtureRoot, "negative");

describe("book-entry negative construction contracts", () => {
	it("fails when the entry file is missing", async () => {
		await expectConstructionError(
			() => parseNegativeFixture("missing-entry.adoc"),
			"entry.missing-source",
			[/Entry source file does not exist:/, /missing-entry\.adoc/],
		);
	});

	it("fails when an include target is missing", async () => {
		await expectConstructionError(
			() => parseNegativeFixture("missing-include.adoc"),
			"include.missing-target",
			[/Include target file does not exist:/, /missing-target\.adoc/],
		);
	});

	it("fails when the include graph is circular", async () => {
		await expectConstructionError(
			() => parseNegativeFixture("circular-a.adoc"),
			"include.cycle",
			[
				/Include graph contains a cycle:/,
				/circular-a\.adoc/,
				/circular-b\.adoc/,
			],
		);
	});

	it.each([
		{
			fixture: "tag.adoc",
			child: {
				kind: "paragraph",
				relativePath: "selection/tagged.adoc",
				line: 4,
			},
		},
		{
			fixture: "lines.adoc",
			child: {
				kind: "section",
				relativePath: "simple-book/chapters/01-entry-origin.adoc",
				line: 4,
			},
		},
	])("parses a selected include in $fixture without diagnostics", async ({
		fixture,
		child,
	}) => {
		const document = await parseAbundantTree({
			sourcePath: join(fixtureRoot, "selection", fixture),
			mode: "book-entry",
			documentRoot: fixtureRoot,
		});

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.children.map((node) => ({
				kind: node.kind,
				relativePath: node.source?.relativePath,
				line: node.source?.line,
			})),
		).toEqual([child]);
	});

	it("fails before reading an include path outside documentRoot", async () => {
		await expectConstructionError(
			() => parseNegativeFixture("outside-root.adoc"),
			"include.outside-document-root",
			[/Resolved include path is outside documentRoot:/, /README\.md/],
		);
	});

	it("does not emit construction errors as successful document diagnostics", async () => {
		const document = await parseAbundantTree({
			sourcePath: join(fixtureRoot, "simple-book/book.adoc"),
			mode: "book-entry",
			documentRoot: fixtureRoot,
		});
		const constructionCodes: BookEntryConstructionErrorCode[] = [
			"entry.missing-source",
			"include.missing-target",
			"include.outside-document-root",
			"include.cycle",
			"logical-line-record.count-mismatch",
			"line-origin.source-file-missing",
			"line-origin.source-line-out-of-range",
		];

		expect(
			document.toolDiagnostics.map((diagnostic) => diagnostic.code),
		).not.toEqual(expect.arrayContaining(constructionCodes));
	});
});

type BookEntryParseOptions = {
	sourcePath: string;
	mode: "book-entry";
	documentRoot: string;
};

type BookEntryDocument = Omit<AbundantDocument, "mode"> & {
	mode: "book-entry";
};

function parseNegativeFixture(name: string): BookEntryDocument {
	const parseBookEntry = parseAbundantTree as unknown as (
		options: BookEntryParseOptions,
	) => BookEntryDocument;
	return parseBookEntry({
		sourcePath: join(negativeRoot, name),
		mode: "book-entry",
		documentRoot: fixtureRoot,
	});
}

async function expectConstructionError(
	action: () => unknown,
	code: BookEntryConstructionErrorCode,
	messagePatterns: readonly RegExp[],
): Promise<void> {
	try {
		await action();
		throw new Error(`Expected construction error: ${code}`);
	} catch (error) {
		expect(error).toBeInstanceOf(BookEntryConstructionError);
		const constructionError = error as BookEntryConstructionError;
		expect(constructionError.code).toBe(code);
		expect(constructionError.diagnostic.code).toBe(code);
		expect(constructionError.diagnostic.level).toBe("error");
		for (const pattern of messagePatterns) {
			expect(constructionError.message).toMatch(pattern);
		}
		expect(constructionError.message).not.toMatch(prohibitedProcessLanguage());
	}
}

function prohibitedProcessLanguage(): RegExp {
	return new RegExp(
		[
			"\\u6682\\u65f6",
			"\\u540e\\u7eed",
			"\\u76ee\\u524d",
			"curr" + "ently",
			"not " + "yet",
			"TO" + "DO",
		].join("|"),
		"i",
	);
}
