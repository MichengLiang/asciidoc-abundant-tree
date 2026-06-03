import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";
import { rdf12Triple } from "../src/rdf12-projection/graph";
import {
	integerLiteral,
	stringLiteral,
} from "../src/rdf12-projection/literals";
import { parseTurtleToRdf12Graph } from "../src/rdf12-projection/n3-adapter";
import { namespaces } from "../src/rdf12-projection/namespaces";
import { iriTerm } from "../src/rdf12-projection/terms";

const projectRoot = process.cwd();
const bookEntryFixtureRoot = join(projectRoot, "test/book-entry/fixtures");
const bookEntryPath = join(bookEntryFixtureRoot, "simple-book/book.adoc");

describe("cli", () => {
	it("shows help text", () => {
		const result = runCli(["--help"]);

		expect(result.code).toBe(0);
		expect(result.stdout).toMatch(/asciidoc-abundant-tree <file\.adoc>/);
		expect(result.stdout).toMatch(/--json/);
		expect(result.stdout).toMatch(/--format tree\|json\|rdf12\|rdf12-json-ld/);
		expect(result.stdout).toMatch(/--mode single-file\|book-entry/);
		expect(result.stdout).toMatch(/--document-root <root>/);
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

	it("prints book-entry JSON through explicit book-entry mode", () => {
		const result = runCli([
			bookEntryPath,
			"--mode",
			"book-entry",
			"--document-root",
			bookEntryFixtureRoot,
			"--format",
			"json",
		]);
		const json = JSON.parse(result.stdout);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(json).toMatchObject({
			kind: "document",
			mode: "book-entry",
			sourcePath: bookEntryPath,
		});
		expect(sectionTitles(json)).toEqual(
			expect.arrayContaining(["Xref Origin", "Nested Origin"]),
		);
		expect(sourceRelativePath(sectionByTitle(json, "Xref Origin"))).toBe(
			"simple-book/chapters/01-entry-origin.adoc",
		);
	});

	it("prints book-entry pretty tree through explicit book-entry mode", () => {
		const result = runCli([
			bookEntryPath,
			"--mode",
			"book-entry",
			"--document-root",
			bookEntryFixtureRoot,
			"--format",
			"tree",
		]);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toMatch(/^<document mode="book-entry"/);
		expect(result.stdout).toContain('title="Xref Origin"');
		expect(result.stdout).toContain(
			'relativePath="simple-book/chapters/01-entry-origin.adoc"',
		);
	});

	it("keeps single-file behavior when mode is omitted", () => {
		const result = runCli([bookEntryPath, "--format", "json"]);
		const json = JSON.parse(result.stdout);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(json.mode).toBe("single-file");
		expect(sectionTitles(json)).not.toContain("Xref Origin");
		expect(json.sourceText).toContain(
			"include::chapters/01-entry-origin.adoc[]",
		);
	});

	it("keeps single-file behavior when mode is explicitly single-file", () => {
		const result = runCli([
			bookEntryPath,
			"--mode",
			"single-file",
			"--document-root",
			bookEntryFixtureRoot,
			"--format",
			"json",
		]);
		const json = JSON.parse(result.stdout);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(json.mode).toBe("single-file");
		expect(sectionTitles(json)).not.toContain("Xref Origin");
		expect(json.sourceText).toContain(
			"include::chapters/01-entry-origin.adoc[]",
		);
	});

	it("defaults book-entry documentRoot to the current working directory", () => {
		const previousCwd = process.cwd();
		try {
			process.chdir(bookEntryFixtureRoot);
			const result = runCli([
				"simple-book/book.adoc",
				"--mode",
				"book-entry",
				"--format",
				"json",
			]);
			const json = JSON.parse(result.stdout);

			expect(result.code).toBe(0);
			expect(result.stderr).toBe("");
			expect(sourceRelativePath(sectionByTitle(json, "Xref Origin"))).toBe(
				"simple-book/chapters/01-entry-origin.adoc",
			);
		} finally {
			process.chdir(previousCwd);
		}
	});

	it("uses explicit documentRoot for book-entry relative paths", () => {
		const result = runCli([
			bookEntryPath,
			"--mode",
			"book-entry",
			"--document-root",
			join(bookEntryFixtureRoot, "simple-book"),
			"--format",
			"json",
		]);
		const json = JSON.parse(result.stdout);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(sourceRelativePath(sectionByTitle(json, "Xref Origin"))).toBe(
			"chapters/01-entry-origin.adoc",
		);
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

	it("prints RDF 1.2 Turtle from a book-entry document", () => {
		const result = runCli([
			bookEntryPath,
			"--mode",
			"book-entry",
			"--document-root",
			bookEntryFixtureRoot,
			"--format",
			"rdf12",
		]);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain("@prefix aat:");
		expect(result.stdout).toContain('"Simple Source-Mapped Book"');
		expect(result.stdout).toContain('"Xref Origin"');
	});

	it("prints full document title raw in RDF 1.2 Turtle for the parsed source path", () => {
		const result = runCli([
			"samples/structural-payload.adoc",
			"--format",
			"rdf12",
		]);
		const graph = parseTurtleToRdf12Graph(result.stdout);
		const root = graph
			.match({
				predicate: iriTerm(`${namespaces.aat}headline`),
				object: stringLiteral("root"),
			})
			.map((triple) => triple.subject)[0];

		expect(result.code).toBe(0);
		expect(root).toBeDefined();
		expect(
			graph.has(
				rdf12Triple(
					root ?? iriTerm("urn:missing"),
					iriTerm(`${namespaces.aat}raw`),
					stringLiteral(`= root

一段摘要

`),
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					root ?? iriTerm("urn:missing"),
					iriTerm(`${namespaces.aat}contentStartLine`),
					integerLiteral(3),
				),
			),
		).toBe(true);
		expect(
			graph.has(
				rdf12Triple(
					root ?? iriTerm("urn:missing"),
					iriTerm(`${namespaces.aat}contentEndLine`),
					integerLiteral(3),
				),
			),
		).toBe(true);
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

	it("prints RDF 1.2 JSON-LD from a book-entry document", () => {
		const result = runCli([
			bookEntryPath,
			"--mode",
			"book-entry",
			"--document-root",
			bookEntryFixtureRoot,
			"--format",
			"rdf12-json-ld",
		]);
		const jsonLd = JSON.parse(result.stdout);

		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(jsonLd["@graph"]).toEqual(expect.any(Array));
		expect(JSON.stringify(jsonLd)).toContain("Simple Source-Mapped Book");
		expect(JSON.stringify(jsonLd)).toContain("Xref Origin");
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

function sectionTitles(document: {
	readonly children?: readonly Record<string, unknown>[];
}): string[] {
	return collectSections(document.children ?? []).map((section) =>
		String(section.title),
	);
}

function sectionByTitle(
	document: { readonly children?: readonly Record<string, unknown>[] },
	title: string,
): JsonSection {
	const section = collectSections(document.children ?? []).find(
		(candidate) => candidate.title === title,
	);
	if (!section) {
		throw new Error(`Missing section: ${title}`);
	}
	return section;
}

function collectSections(
	nodes: readonly Record<string, unknown>[],
): JsonSection[] {
	const result: JsonSection[] = [];
	for (const node of nodes) {
		if (node.kind === "section") {
			result.push(node as JsonSection);
		}
		const children = Array.isArray(node.children)
			? (node.children as Record<string, unknown>[])
			: [];
		result.push(...collectSections(children));
	}
	return result;
}

function sourceRelativePath(section: JsonSection): string | undefined {
	return section.source?.relativePath;
}

type JsonSection = Record<string, unknown> & {
	readonly kind: "section";
	readonly title: string;
	readonly source?: {
		readonly relativePath?: string;
	};
};
