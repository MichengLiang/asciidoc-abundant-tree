import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli";
import * as parserModule from "../src/parser";

const projectRoot = process.cwd();
const bookEntryFixtureRoot = join(projectRoot, "test/book-entry/fixtures");
const bookEntryPath = join(bookEntryFixtureRoot, "simple-book/book.adoc");

describe("cli error handling", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("reports parser errors", async () => {
		vi.spyOn(parserModule, "parseAbundantTree").mockImplementation(() => {
			throw new Error("parser boom");
		});

		const result = await runCli(["samples/reference-links.adoc"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("parser boom");
	});

	it("reports unknown parser failures", async () => {
		vi.spyOn(parserModule, "parseAbundantTree").mockImplementation(() => {
			throw "boom";
		});

		const result = await runCli(["samples/reference-links.adoc"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("Unknown error");
	});

	it("rejects unsupported modes", async () => {
		const result = await runCli([
			"samples/reference-links.adoc",
			"--mode",
			"workspace",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("Unsupported mode: workspace");
	});

	it("rejects missing mode values", async () => {
		const result = await runCli(["samples/reference-links.adoc", "--mode"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("--mode requires a value");
	});

	it("rejects mode values that are another flag", async () => {
		const result = await runCli([
			"samples/reference-links.adoc",
			"--mode",
			"--format",
			"json",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("--mode requires a value");
	});

	it("rejects missing documentRoot values", async () => {
		const result = await runCli([
			"samples/reference-links.adoc",
			"--document-root",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("--document-root requires a value");
	});

	it("rejects documentRoot values that are another flag", async () => {
		const result = await runCli([
			"samples/reference-links.adoc",
			"--document-root",
			"--format",
			"json",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("--document-root requires a value");
	});

	it("rejects format values that are another flag", async () => {
		const result = await runCli([
			"samples/reference-links.adoc",
			"--format",
			"--mode",
			"book-entry",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("--format requires a value");
	});

	it("throws from the library API when book-entry mode omits documentRoot", async () => {
		await expect(
			parserModule.parseAbundantTree({
				sourcePath: bookEntryPath,
				mode: "book-entry",
			} as Parameters<typeof parserModule.parseAbundantTree>[0]),
		).rejects.toThrow(/documentRoot/);
	});

	it("throws from the library API for unsupported modes", async () => {
		await expect(
			parserModule.parseAbundantTree({
				sourcePath: bookEntryPath,
				mode: "bogus",
			} as unknown as Parameters<typeof parserModule.parseAbundantTree>[0]),
		).rejects.toThrow(/Unsupported mode: bogus/);
	});

	it("reports book-entry input files outside documentRoot", async () => {
		const result = await runCli([
			bookEntryPath,
			"--mode",
			"book-entry",
			"--document-root",
			join(bookEntryFixtureRoot, "negative"),
			"--format",
			"json",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("outside documentRoot");
	});

	it("reports missing book-entry entry files as construction errors", async () => {
		const result = await runCli([
			join(bookEntryFixtureRoot, "negative/missing-entry.adoc"),
			"--mode",
			"book-entry",
			"--document-root",
			bookEntryFixtureRoot,
			"--format",
			"json",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("entry.missing-source");
		expect(result.stderr).toContain("Entry source file does not exist");
	});

	it("reports include targets outside documentRoot", async () => {
		const result = await runCli([
			join(bookEntryFixtureRoot, "negative/outside-root.adoc"),
			"--mode",
			"book-entry",
			"--document-root",
			join(bookEntryFixtureRoot, "negative"),
			"--format",
			"json",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("include.outside-document-root");
		expect(result.stderr).toContain(
			"Resolved include path is outside documentRoot",
		);
	});

	it("reports missing book-entry include targets on stderr only", async () => {
		const result = await runCli([
			join(bookEntryFixtureRoot, "negative/missing-include.adoc"),
			"--mode",
			"book-entry",
			"--document-root",
			bookEntryFixtureRoot,
			"--format",
			"json",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("include.missing-target");
		expect(result.stderr).toContain("Include target file does not exist");
	});

	it("reports unmapped book-entry include attrlists on stderr only", async () => {
		const result = await runCli([
			join(bookEntryFixtureRoot, "negative/unmapped-attr.adoc"),
			"--mode",
			"book-entry",
			"--document-root",
			bookEntryFixtureRoot,
			"--format",
			"json",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("include.attrlist-unmapped");
		expect(result.stderr).toContain("foo");
	});

	it("does not accept rdf, ttl, or turtle aliases", async () => {
		for (const format of ["rdf", "ttl", "turtle"]) {
			const result = await runCli([
				"samples/reference-links.adoc",
				"--format",
				format,
			]);

			expect(result.code).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(`Unsupported format: ${format}`);
		}
	});
});
