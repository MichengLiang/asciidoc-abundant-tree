import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAsciidoctorAdapter } from "../../src/asciidoctor-adapter";

const fixtureRoot = join(process.cwd(), "tmp/book-entry-reader-adapter");

describe("Asciidoctor adapter official Reader line evidence", () => {
	it("keeps ordinary line cursor evidence on the line returned by readLine", () => {
		const entryPath = writeFixture(
			"ordinary/book.adoc",
			["first", "second"].join("\n"),
		);

		const lines = createAsciidoctorAdapter().readPreprocessedLines({
			sourcePath: entryPath,
			baseDir: join(fixtureRoot, "ordinary"),
		});

		expect(lines.map((line) => [line.text, line.cursor.lineNumber])).toEqual([
			["first", 1],
			["second", 2],
		]);
	});

	it("keeps included line cursor evidence on the included physical source line", () => {
		const root = join(fixtureRoot, "include");
		const entryPath = writeFixture(
			"include/book.adoc",
			"include::chapter.adoc[]",
		);
		const chapterPath = writeFixture(
			"include/chapter.adoc",
			["included one", "included two"].join("\n"),
		);

		const lines = createAsciidoctorAdapter().readPreprocessedLines({
			sourcePath: entryPath,
			baseDir: root,
		});

		expect(
			lines.map((line) => [
				line.text,
				line.cursor.file,
				line.cursor.lineNumber,
			]),
		).toEqual([
			["included one", chapterPath, 1],
			["included two", chapterPath, 2],
		]);
	});
});

function writeFixture(relativePath: string, source: string): string {
	const path = join(fixtureRoot, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source, "utf8");
	return path;
}
