import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	BookEntryConstructionError,
	type BookEntryConstructionErrorCode,
} from "../../src/book-entry/diagnostics";
import { parseIncludeDirective } from "../../src/book-entry/include-resolution";
import { buildLogicalSource } from "../../src/book-entry/logical-source-builder";
import { buildLineTable } from "../../src/source-lines";

const projectRoot = process.cwd();
const fixtureRoot = join(projectRoot, "test/book-entry/fixtures");
const negativeRoot = join(fixtureRoot, "negative");

describe("book-entry include resolution", () => {
	it("treats a line number outside the source table as ordinary text", () => {
		expect(parseIncludeDirective(buildLineTable("= Probe"), 99)).toEqual({
			kind: "ordinary",
		});
	});

	it("fails when an include target is missing", () => {
		expectConstructionError(
			() => buildNegativeFixture("missing-include.adoc"),
			"include.missing-target",
		);
	});

	it("fails when the include graph contains a cycle", () => {
		expectConstructionError(
			() => buildNegativeFixture("circular-a.adoc"),
			"include.cycle",
		);
	});

	it("fails when a tag attrlist would change the included line set", () => {
		expectConstructionError(
			() => buildNegativeFixture("unsupported-tag.adoc"),
			"include.unsupported-attrlist",
		);
	});

	it("fails when a lines attrlist would change the included line set", () => {
		expectConstructionError(
			() => buildNegativeFixture("unsupported-lines.adoc"),
			"include.unsupported-attrlist",
		);
	});

	it("fails when an include target resolves outside documentRoot", () => {
		expectConstructionError(
			() => buildNegativeFixture("outside-root.adoc"),
			"include.outside-document-root",
		);
	});

	it("does not read an include target outside documentRoot", () => {
		const entryPath = join(negativeRoot, "outside-root.adoc");
		const attemptedReads: string[] = [];

		expectConstructionError(
			() =>
				buildLogicalSource({
					sourcePath: entryPath,
					documentRoot: fixtureRoot,
					readFile: (absolutePath) => {
						attemptedReads.push(absolutePath);
						if (absolutePath === entryPath) {
							return "= Outside Root\n\ninclude::../../../../README.md[]\n";
						}
						throw new Error(
							`Boundary check failed before read: ${absolutePath}`,
						);
					},
				}),
			"include.outside-document-root",
		);
		expect(attemptedReads).toEqual([entryPath]);
		expect(attemptedReads).not.toContain(resolve(projectRoot, "README.md"));
	});
});

function buildNegativeFixture(name: string): void {
	buildLogicalSource({
		sourcePath: join(negativeRoot, name),
		documentRoot: fixtureRoot,
	});
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
		expect((error as BookEntryConstructionError).message).not.toMatch(
			/暂时|以后|simple support|future/i,
		);
	}
}
