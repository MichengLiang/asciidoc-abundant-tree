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

	it("reports parser errors", () => {
		vi.spyOn(parserModule, "parseAbundantTree").mockImplementation(() => {
			throw new Error("parser boom");
		});

		const result = runCli(["samples/reference-links.adoc"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("parser boom");
	});

	it("reports unknown parser failures", () => {
		vi.spyOn(parserModule, "parseAbundantTree").mockImplementation(() => {
			throw "boom";
		});

		const result = runCli(["samples/reference-links.adoc"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("Unknown error");
	});

	it("rejects unsupported modes", () => {
		const result = runCli([
			"samples/reference-links.adoc",
			"--mode",
			"workspace",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("Unsupported mode: workspace");
	});

	it("rejects missing mode values", () => {
		const result = runCli(["samples/reference-links.adoc", "--mode"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("--mode requires a value");
	});

	it("rejects mode values that are another flag", () => {
		const result = runCli([
			"samples/reference-links.adoc",
			"--mode",
			"--format",
			"json",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("--mode requires a value");
	});

	it("rejects missing documentRoot values", () => {
		const result = runCli(["samples/reference-links.adoc", "--document-root"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("--document-root requires a value");
	});

	it("rejects documentRoot values that are another flag", () => {
		const result = runCli([
			"samples/reference-links.adoc",
			"--document-root",
			"--format",
			"json",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("--document-root requires a value");
	});

	it("rejects format values that are another flag", () => {
		const result = runCli([
			"samples/reference-links.adoc",
			"--format",
			"--mode",
			"book-entry",
		]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("--format requires a value");
	});

	it("throws from the library API when book-entry mode omits documentRoot", () => {
		expect(() =>
			parserModule.parseAbundantTree({
				sourcePath: bookEntryPath,
				mode: "book-entry",
			} as Parameters<typeof parserModule.parseAbundantTree>[0]),
		).toThrow(/documentRoot/);
	});

	it("throws from the library API for unsupported modes", () => {
		expect(() =>
			parserModule.parseAbundantTree({
				sourcePath: bookEntryPath,
				mode: "bogus",
			} as unknown as Parameters<typeof parserModule.parseAbundantTree>[0]),
		).toThrow(/Unsupported mode: bogus/);
	});

	it("reports book-entry input files outside documentRoot", () => {
		const result = runCli([
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

	it("reports include targets outside documentRoot", () => {
		const result = runCli([
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
		expect(result.stderr).toContain(
			"Book-entry logical document construction failed",
		);
	});

	it("does not accept rdf, ttl, or turtle aliases", () => {
		for (const format of ["rdf", "ttl", "turtle"]) {
			const result = runCli([
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
