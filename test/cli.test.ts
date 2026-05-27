import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";

describe("cli", () => {
	it("shows help text", () => {
		const result = runCli(["--help"]);

		expect(result.code).toBe(0);
		expect(result.stdout).toMatch(/asciidoc-abundant-tree <file\.adoc>/);
		expect(result.stdout).toMatch(/--json/);
		expect(result.stdout).toMatch(/--format tree\|json/);
		expect(result.stderr).toBe("");
	});

	it("rejects missing input files", () => {
		const result = runCli(["samples/missing.adoc"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toMatch(/Input file not found/);
	});

	it("prints the parsed document as pretty text by default", () => {
		const result = runCli(["samples/reference-links.adoc"]);

		expect(result.code).toBe(0);
		expect(result.stdout).toMatch(/^<document/);
		expect(result.stdout).toContain("<title");
		expect(result.stdout).toContain("<section");
		expect(result.stdout).toContain("<xref");
		expect(result.stdout).not.toMatch(/^\{/);
		expect(result.stderr).toBe("");
	});

	it("prints the parsed document as JSON through both JSON options", () => {
		const shortcut = runCli(["samples/reference-links.adoc", "--json"]);
		const explicit = runCli([
			"samples/reference-links.adoc",
			"--format",
			"json",
		]);

		expect(shortcut.code).toBe(0);
		expect(explicit.code).toBe(0);
		expect(JSON.parse(shortcut.stdout)).toMatchObject({
			kind: "document",
			mode: "single-file",
			children: expect.any(Array),
			targets: expect.any(Array),
			xrefOccurrences: expect.any(Array),
			anchorOccurrences: expect.any(Array),
		});
		expect(JSON.parse(explicit.stdout)).toEqual(JSON.parse(shortcut.stdout));
		expect(shortcut.stderr).toBe("");
		expect(explicit.stderr).toBe("");
	});

	it("prints the same pretty tree through explicit tree format", () => {
		const defaultTree = runCli(["samples/reference-links.adoc"]);
		const explicitTree = runCli([
			"samples/reference-links.adoc",
			"--format",
			"tree",
		]);

		expect(explicitTree).toEqual(defaultTree);
	});

	it("rejects unsupported formats with the accepted values", () => {
		const result = runCli(["samples/reference-links.adoc", "--format", "xml"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toMatch(/tree.*json|json.*tree/);
	});

	it("rejects missing format values", () => {
		const result = runCli(["samples/reference-links.adoc", "--format"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toMatch(/--format requires a value/);
	});

	it("rejects unknown arguments", () => {
		const result = runCli(["--unknown"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toMatch(/Unknown argument: --unknown/);
	});

	it("rejects extra positional arguments", () => {
		const result = runCli(["samples/reference-links.adoc", "extra.adoc"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toMatch(/Unexpected extra argument: extra\.adoc/);
	});

	it("rejects missing input files when no source path is provided", () => {
		const result = runCli([]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toMatch(/Missing input file/);
	});

	it("skips undefined arguments", () => {
		const result = runCli([undefined as unknown as string, "--help"]);

		expect(result.code).toBe(0);
		expect(result.stdout).toMatch(/asciidoc-abundant-tree <file\.adoc>/);
		expect(result.stderr).toBe("");
	});
});
