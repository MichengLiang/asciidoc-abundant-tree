import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";

describe("cli", () => {
	it("shows help text", () => {
		const result = runCli(["--help"]);

		expect(result.code).toBe(0);
		expect(result.output).toMatch(/asciidoc-abundant-tree <file\.adoc>/);
		expect(result.output).toMatch(/--format tree\|json/);
	});

	it("rejects missing input files", () => {
		const result = runCli(["samples/missing.adoc"]);

		expect(result.code).toBe(1);
		expect(result.output).toMatch(/Input file not found/);
	});

	it("reports the parse boundary explicitly", () => {
		const result = runCli(["samples/reference-links.adoc"]);

		expect(result.code).toBe(1);
		expect(result.output).toMatch(/parseAbundantTree is not implemented yet/);
	});
});
