import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAsciidoctorAdapter } from "../../src/asciidoctor-adapter";
import { preprocessBookEntryWithOfficialReader } from "../../src/book-entry/official-reader-preprocessor";
import {
	classifyReaderBoundaryDiagnostic,
	readerPreprocessingOptions,
} from "../../src/book-entry/reader-boundary-policy";

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

	it("uses the source directory as Reader base and documentRoot as jail directory", () => {
		const documentRoot = join(fixtureRoot, "workspace");
		const sourcePath = join(documentRoot, "books/example/book.adoc");
		const options = readerPreprocessingOptions({
			sourcePath,
			documentRoot,
		});

		expect(options.baseDir).toBe(join(documentRoot, "books/example"));
		expect(options.jailDir).toBe(documentRoot);
	});

	it("expands legal ancestor includes inside documentRoot without stderr noise", () => {
		const documentRoot = join(fixtureRoot, "ancestor-include");
		const entryPath = writePolicyFixture(
			"ancestor-include/books/example/book.adoc",
			"include::../../shared/attributes.adoc[]\n\ninclude::chapter.adoc[]\n",
		);
		writePolicyFixture(
			"ancestor-include/shared/attributes.adoc",
			":series-name: fixture\n",
		);
		writePolicyFixture(
			"ancestor-include/books/example/chapter.adoc",
			"chapter\n",
		);
		const stderr = captureStderr(() => {
			const document = preprocessBookEntryWithOfficialReader({
				adapter: createAsciidoctorAdapter(),
				sourcePath: entryPath,
				documentRoot,
			});

			expect(document.logicalText).toContain(":series-name: fixture");
			expect(document.logicalText).toContain("chapter");
		});

		expect(stderr).toBe("");
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

	it("classifies missing required include targets", () => {
		const required = classifyReaderBoundaryDiagnostic({
			target: "missing.adoc",
			attrlist: "",
			containingFilePath: join(fixtureRoot, "book.adoc"),
			documentRoot: fixtureRoot,
			missing: true,
		});

		expect(required).toEqual(
			expect.objectContaining({ code: "include.missing-target" }),
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

function captureStderr(action: () => void): string {
	const originalWrite = process.stderr.write;
	let stderr = "";
	process.stderr.write = ((chunk: string | Uint8Array) => {
		stderr += chunk.toString();
		return true;
	}) as typeof process.stderr.write;
	try {
		action();
	} finally {
		process.stderr.write = originalWrite;
	}
	return stderr;
}
