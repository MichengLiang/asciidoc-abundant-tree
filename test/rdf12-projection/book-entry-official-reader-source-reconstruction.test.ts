import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree, rdf12 } from "../../src/index";
import type { Rdf12Graph } from "../../src/rdf12-projection/graph";
import type { Rdf12IriTerm } from "../../src/rdf12-projection/terms";
import {
	aatTerm,
	literalValues,
	resourcesOfType,
} from "./helpers/graph-matchers";

const fixtureRoot = join(
	process.cwd(),
	"test/book-entry/fixtures/official-reader-book",
);
const entryPath = join(fixtureRoot, "book.adoc");

describe("rdf12 official Reader book-entry source reconstruction", () => {
	it("emits entry raw with authored include directives and escaped include syntax", () => {
		const { sourceFiles } = projectOfficialReaderBook();

		expect(sourceFiles.get("book.adoc")).toBe(readFixture("book.adoc"));
		expect(sourceFiles.get("book.adoc")).toContain(
			"include::frontmatter/preface.adoc[]",
		);
		expect(sourceFiles.get("book.adoc")).toContain(
			"include::chapters/01-main.adoc[leveloffset=+1]",
		);
		expect(sourceFiles.get("book.adoc")).toContain(
			"include::missing-optional.adoc[opts=optional]",
		);
		expect(sourceFiles.get("book.adoc")).toContain(
			"\\include::escaped-target.adoc[]",
		);
	});

	it("emits full raw for full-file include targets", () => {
		const { sourceFiles } = projectOfficialReaderBook();

		expect(sourceFiles.get("frontmatter/preface.adoc")).toBe(
			readFixture("frontmatter/preface.adoc"),
		);
		expect(sourceFiles.get("chapters/02-snippet-include.adoc")).toBe(
			readFixture("chapters/02-snippet-include.adoc"),
		);
	});

	it("emits full raw for tagged snippet targets, including tag directives and non-selected lines", () => {
		const { sourceFiles } = projectOfficialReaderBook();
		const raw = sourceFiles.get("examples/minimal-tool.mjs");

		expect(raw).toBe(readFixture("examples/minimal-tool.mjs"));
		expect(raw).toContain("outside();");
		expect(raw).toContain("// tag::main[]");
		expect(raw).toContain("export function describeBook");
		expect(raw).toContain("// end::main[]");
		expect(raw).toContain("outsideAgain();");
	});

	it("emits full raw for line-range targets, including non-selected lines", () => {
		const { sourceFiles } = projectOfficialReaderBook();
		const raw = sourceFiles.get("snippets/lines.adoc");

		expect(raw).toBe(readFixture("snippets/lines.adoc"));
		expect(raw).toContain("Line three.");
		expect(raw).toContain("Line four.");
	});

	it("excludes optional missing targets, escaped targets, generated control lines, and parser-safe logical text", () => {
		const { document, sourceFiles } = projectOfficialReaderBook();
		const sourceRaws = [...sourceFiles.values()];

		expect(sourceFiles.has("missing-optional.adoc")).toBe(false);
		expect(sourceFiles.has("escaped-target.adoc")).toBe(false);
		expect(sourceRaws).not.toContain(readFixture("escaped-target.adoc"));
		expect(sourceRaws).not.toContain(document.sourceText);
		expect(sourceRaws.some((raw) => raw.includes("\n:leveloffset:"))).toBe(
			false,
		);
		expect(sourceRaws.some((raw) => raw.startsWith(":leveloffset:"))).toBe(
			false,
		);
	});
});

function projectOfficialReaderBook(): {
	readonly document: ReturnType<typeof parseAbundantTree>;
	readonly sourceFiles: Map<string, string>;
} {
	const document = parseAbundantTree({
		sourcePath: entryPath,
		mode: "book-entry",
		documentRoot: fixtureRoot,
	});
	const projection = rdf12(document, { documentRoot: fixtureRoot });

	return {
		document,
		sourceFiles: sourceFileRawByRelativePath(projection.graph),
	};
}

function readFixture(relativePath: string): string {
	return readFileSync(join(fixtureRoot, relativePath), "utf8");
}

function sourceFileRawByRelativePath(graph: Rdf12Graph): Map<string, string> {
	const files = new Map<string, string>();

	for (const subject of sourceFileResources(graph)) {
		const relativePath = onlyLiteralValue(
			graph,
			subject,
			aatTerm("relativePath"),
		);
		const raw = onlyLiteralValue(graph, subject, aatTerm("raw"));
		files.set(relativePath, raw);
	}

	return files;
}

function sourceFileResources(graph: Rdf12Graph): Rdf12IriTerm[] {
	return resourcesOfType(graph, aatTerm("SourceFile"));
}

function onlyLiteralValue(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
): string {
	const values = literalValues(graph, subject, predicate);

	expect(values).toHaveLength(1);
	return values[0] ?? "";
}
