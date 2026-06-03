import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";

const projectRoot = process.cwd();
const fixtureRoot = join(projectRoot, "test/book-entry/fixtures");
const negativeRoot = join(fixtureRoot, "negative");

// Batch 00 migration expected-fail registry.
// Remove diagnostics and negative contract failures in Batch 07.
// Remove this migration gate entirely in Batch 08.
const itBookEntryNegativeContract = it.fails;

describe("book-entry negative construction contracts", () => {
	itBookEntryNegativeContract("fails when an include target is missing", () => {
		expect(() => parseNegativeFixture("missing-include.adoc")).toThrow(
			/include.*missing|missing.*include/i,
		);
	});

	itBookEntryNegativeContract(
		"fails when the include graph is circular",
		() => {
			expect(() => parseNegativeFixture("circular-a.adoc")).toThrow(
				/circular|cycle/i,
			);
		},
	);

	itBookEntryNegativeContract(
		"fails when an include directive uses an unsupported tag attrlist",
		() => {
			expect(() => parseNegativeFixture("unsupported-tag.adoc")).toThrow(
				/include.*unsupported|unsupported.*tag|tag/i,
			);
		},
	);

	itBookEntryNegativeContract(
		"fails when an include directive uses an unsupported lines attrlist",
		() => {
			expect(() => parseNegativeFixture("unsupported-lines.adoc")).toThrow(
				/include.*unsupported|unsupported.*lines|lines/i,
			);
		},
	);

	itBookEntryNegativeContract(
		"fails before reading an include path outside documentRoot",
		() => {
			expect(() => parseNegativeFixture("outside-root.adoc")).toThrow(
				/outside.*documentRoot|documentRoot.*outside|outside root/i,
			);
		},
	);

	itBookEntryNegativeContract(
		"fails when logical line count and line origin count diverge",
		async () => {
			const { assertLogicalDocumentInvariants } =
				await importFutureLogicalDocumentModule();

			expect(() =>
				assertLogicalDocumentInvariants({
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
				}),
			).toThrow(/logical line count|line origin count/i);
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

type LineOriginProbe = {
	logicalLine: number;
	absolutePath: string;
	relativePath: string;
	sourceLine: number;
};

type LogicalDocumentInvariantProbe = {
	logicalText: string;
	lineOrigins: LineOriginProbe[];
	sourceFiles: unknown[];
};

type LogicalDocumentModule = {
	assertLogicalDocumentInvariants(input: LogicalDocumentInvariantProbe): void;
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

async function importFutureLogicalDocumentModule(): Promise<LogicalDocumentModule> {
	const modulePath: string = "../../src/book-entry/logical-document";
	const imported: unknown = await import(modulePath);
	return imported as LogicalDocumentModule;
}
