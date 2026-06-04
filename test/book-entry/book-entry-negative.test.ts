import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	BookEntryConstructionError,
	type BookEntryConstructionErrorCode,
} from "../../src/book-entry/diagnostics";
import { assertLogicalDocumentInvariants } from "../../src/book-entry/logical-source-builder";
import type { LogicalSource } from "../../src/book-entry/model";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { buildLineTable } from "../../src/source-lines";

const projectRoot = process.cwd();
const fixtureRoot = join(projectRoot, "test/book-entry/fixtures");
const negativeRoot = join(fixtureRoot, "negative");

describe("book-entry negative construction contracts", () => {
	it("fails when the entry file is missing", () => {
		expectConstructionError(
			() => parseNegativeFixture("missing-entry.adoc"),
			"entry.missing-source",
			[/Entry source file does not exist:/, /missing-entry\.adoc/],
		);
	});

	it("fails when an include target is missing", () => {
		expectConstructionError(
			() => parseNegativeFixture("missing-include.adoc"),
			"include.missing-target",
			[/Include target file does not exist:/, /missing-target\.adoc/],
		);
	});

	it("fails when the include graph is circular", () => {
		expectConstructionError(
			() => parseNegativeFixture("circular-a.adoc"),
			"include.cycle",
			[
				/Include graph contains a cycle:/,
				/circular-a\.adoc/,
				/circular-b\.adoc/,
			],
		);
	});

	it("fails when an include directive uses an unsupported tag attrlist", () => {
		expectConstructionError(
			() => parseNegativeFixture("unsupported-tag.adoc"),
			"include.unsupported-attrlist",
			[/Include directive uses unsupported attrlist 'tag=main'\./],
		);
	});

	it("fails when an include directive uses an unsupported lines attrlist", () => {
		expectConstructionError(
			() => parseNegativeFixture("unsupported-lines.adoc"),
			"include.unsupported-attrlist",
			[/Include directive uses unsupported attrlist 'lines=1\.\.4'\./],
		);
	});

	it("fails before reading an include path outside documentRoot", () => {
		expectConstructionError(
			() => parseNegativeFixture("outside-root.adoc"),
			"include.outside-document-root",
			[/Resolved include path is outside documentRoot:/, /README\.md/],
		);
	});

	it("fails when logical line count and line origin count diverge", () => {
		expectConstructionError(
			() =>
				assertLogicalDocumentInvariants({
					entryPath: join(negativeRoot, "missing-include.adoc"),
					documentRoot: fixtureRoot,
					logicalText: "= Probe\n\n== Origin\n",
					lineOrigins: [
						{
							logicalLine: 1,
							absolutePath: join(negativeRoot, "missing-include.adoc"),
							relativePath: "negative/missing-include.adoc",
							sourceLine: 1,
						},
					],
					sourceFiles: [],
				} satisfies LogicalSource),
			"logical-line-origin.count-mismatch",
			[/Logical line count \d+ does not match line origin count 1\./],
		);
	});

	it("fails when a line origin references a source file absent from the source file table", () => {
		expectConstructionError(
			() =>
				assertLogicalDocumentInvariants({
					entryPath: join(negativeRoot, "missing-include.adoc"),
					documentRoot: fixtureRoot,
					logicalText: "= Probe",
					lineOrigins: [
						{
							logicalLine: 1,
							absolutePath: join(negativeRoot, "missing-source-file.adoc"),
							relativePath: "negative/missing-source-file.adoc",
							sourceLine: 1,
						},
					],
					sourceFiles: [],
				} satisfies LogicalSource),
			"line-origin.source-file-missing",
			[
				/Line origin references a source file missing from source file table:/,
				/missing-source-file\.adoc/,
			],
		);
	});

	it("fails when a line origin sourceLine is outside the origin file line table", () => {
		const sourcePath = join(negativeRoot, "missing-include.adoc");
		expectConstructionError(
			() =>
				assertLogicalDocumentInvariants({
					entryPath: sourcePath,
					documentRoot: fixtureRoot,
					logicalText: "= Probe",
					lineOrigins: [
						{
							logicalLine: 1,
							absolutePath: sourcePath,
							relativePath: "negative/missing-include.adoc",
							sourceLine: 99,
						},
					],
					sourceFiles: [
						{
							absolutePath: sourcePath,
							relativePath: "negative/missing-include.adoc",
							text: "= Probe",
							lineTable: buildLineTable("= Probe"),
						},
					],
				} satisfies LogicalSource),
			"line-origin.source-line-out-of-range",
			[
				/Line origin sourceLine 99 is outside origin file line table for negative\/missing-include\.adoc\./,
			],
		);
	});

	it("does not emit construction errors as successful document diagnostics", () => {
		const document = parseAbundantTree({
			sourcePath: join(fixtureRoot, "simple-book/book.adoc"),
			mode: "book-entry",
			documentRoot: fixtureRoot,
		});
		const constructionCodes: BookEntryConstructionErrorCode[] = [
			"entry.missing-source",
			"include.missing-target",
			"include.outside-document-root",
			"include.cycle",
			"include.unsupported-attrlist",
			"logical-line-origin.count-mismatch",
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

function expectConstructionError(
	action: () => void,
	code: BookEntryConstructionErrorCode,
	messagePatterns: readonly RegExp[],
): void {
	try {
		action();
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
