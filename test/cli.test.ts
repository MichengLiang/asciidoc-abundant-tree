import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";
import { parseTurtleToRdf12Graph } from "../src/rdf12-projection/n3-adapter";

describe("cli", () => {
	it("shows help text", () => {
		const result = runCli(["--help"]);

		expect(result.code).toBe(0);
		expect(result.stdout).toMatch(/asciidoc-abundant-tree <file\.adoc>/);
		expect(result.stdout).toMatch(/--json/);
		expect(result.stdout).toMatch(/--format tree\|json\|rdf12\|rdf12-json-ld/);
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
		expect(result.stderr).toMatch(/tree/);
		expect(result.stderr).toMatch(/json/);
		expect(result.stderr).toMatch(/rdf12/);
	});

	it("does not accept rdf, ttl, or turtle aliases", () => {
		for (const format of ["rdf", "ttl", "turtle"]) {
			const result = runCli([
				"samples/reference-links.adoc",
				"--format",
				format,
			]);

			expect(result.code).toBe(1);
			expect(result.stderr).toContain(`Unsupported format: ${format}`);
		}
	});

	it("prints RDF 1.2 Turtle through rdf12 format", () => {
		const result = runCli([
			"samples/reference-links.adoc",
			"--format",
			"rdf12",
		]);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain("@prefix aat:");
		expect(result.stdout).toContain("rdf:reifies <<(");
		expect(() => parseTurtleToRdf12Graph(result.stdout)).not.toThrow();
		expect(result.stdout.trimStart()).not.toMatch(/^\{/);
	});

	it("prints RDF 1.2 JSON-LD through rdf12-json-ld format", () => {
		const result = runCli([
			"samples/reference-links.adoc",
			"--format",
			"rdf12-json-ld",
		]);

		const jsonLd = JSON.parse(result.stdout);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(jsonLd["@context"].aat).toBe(
			"https://micheng.dev/ns/asciidoc-abundant-tree#",
		);
		expect(jsonLd["@graph"]).toEqual(expect.any(Array));
		expect(jsonLd["@graph"].length).toBeGreaterThan(0);
		expect(jsonLd["@graph"]).toContainEqual(
			expect.objectContaining({
				"@type": "rdf12:Triple",
				predicate: expect.objectContaining({
					"@id": "http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies",
				}),
				object: expect.objectContaining({
					"@type": "rdf12:TripleTerm",
					triple: expect.any(Object),
				}),
			}),
		);
	});

	it("rejects rdf12 projections when the source path is outside cwd", () => {
		for (const format of ["rdf12", "rdf12-json-ld"]) {
			const result = runCli(["/etc/hosts", "--format", format]);

			expect(result.code).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toMatch(/outside document root/);
		}
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
