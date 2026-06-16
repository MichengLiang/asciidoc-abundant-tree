import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAsciidoctorAdapter } from "../../src/asciidoctor-adapter";
import { preprocessBookEntryWithOfficialReader } from "../../src/book-entry/official-reader-preprocessor";
import { classifyReaderBoundaryDiagnostic } from "../../src/book-entry/reader-boundary-policy";

const fixtureRoot = join(process.cwd(), "tmp/book-entry-reader-policy");

describe("book-entry reader boundary policy", () => {
	it("expands a local include inside documentRoot in safe mode", () => {
		const entryPath = writePolicyFixture(
			"inside/book.adoc",
			"include::chapter.adoc[]\n",
		);
		writePolicyFixture("inside/chapter.adoc", "included\n");

		const document = preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorAdapter(),
			sourcePath: entryPath,
			documentRoot: join(fixtureRoot, "inside"),
		});

		expect(document.logicalText).toContain("included");
		expect(document.sourceFiles.map((file) => file.relativePath)).toContain(
			"chapter.adoc",
		);
	});

	it("classifies include targets outside documentRoot", () => {
		expect(
			classifyReaderBoundaryDiagnostic({
				target: "../outside.adoc",
				attrlist: "",
				containingFilePath: join(fixtureRoot, "inside/book.adoc"),
				documentRoot: join(fixtureRoot, "inside"),
				missing: false,
			}),
		).toEqual(
			expect.objectContaining({ code: "include.outside-document-root" }),
		);
	});

	it("classifies URI include targets as unsupported", () => {
		expect(
			classifyReaderBoundaryDiagnostic({
				target: "https://example.com/file.adoc",
				attrlist: "",
				containingFilePath: join(fixtureRoot, "book.adoc"),
				documentRoot: fixtureRoot,
				missing: false,
			}),
		).toEqual(
			expect.objectContaining({ code: "include.uri-target-unsupported" }),
		);
	});

	it("classifies missing required and optional include targets", () => {
		const required = classifyReaderBoundaryDiagnostic({
			target: "missing.adoc",
			attrlist: "",
			containingFilePath: join(fixtureRoot, "book.adoc"),
			documentRoot: fixtureRoot,
			missing: true,
		});
		const optional = classifyReaderBoundaryDiagnostic({
			target: "missing.adoc",
			attrlist: "opts=optional",
			containingFilePath: join(fixtureRoot, "book.adoc"),
			documentRoot: fixtureRoot,
			missing: true,
		});

		expect(required).toEqual(
			expect.objectContaining({ code: "include.missing-target" }),
		);
		expect(optional).toEqual(
			expect.objectContaining({ code: "include.optional-target-missing" }),
		);
	});

	it("classifies unresolved attribute targets and generic official errors", () => {
		expect(
			classifyReaderBoundaryDiagnostic({
				target: "{chapter}.adoc",
				attrlist: "",
				containingFilePath: join(fixtureRoot, "book.adoc"),
				documentRoot: fixtureRoot,
				missing: false,
			}),
		).toEqual(
			expect.objectContaining({ code: "include.target-unresolved-attribute" }),
		);
		expect(
			classifyReaderBoundaryDiagnostic({
				target: "chapter.adoc",
				attrlist: "unknown=value",
				containingFilePath: join(fixtureRoot, "book.adoc"),
				documentRoot: fixtureRoot,
				missing: false,
			}),
		).toEqual(
			expect.objectContaining({ code: "include.official-reader-error" }),
		);
	});
});

function writePolicyFixture(relativePath: string, source: string): string {
	const path = join(fixtureRoot, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source, "utf8");
	return path;
}
