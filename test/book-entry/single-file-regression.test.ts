import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbundantDocument } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";

const projectRoot = process.cwd();
const simpleBookPath = join(
	projectRoot,
	"test/book-entry/fixtures/simple-book/book.adoc",
);

describe("single-file regression around book-entry fixtures", () => {
	it("does not expand include directives in explicit single-file mode", () => {
		const document = parseSingleFile(simpleBookPath);

		expect(document.mode).toBe("single-file");
		expect(document.targets.map((target) => target.id)).not.toEqual(
			expect.arrayContaining([
				"preface-origin",
				"xref-origin",
				"target-origin",
				"nested-origin",
				"glossary-origin",
			]),
		);
		expect(document.xrefOccurrences).toEqual([]);
	});

	it("does not let doctype book trigger book-entry mode", () => {
		const document = parseAbundantTree({ sourcePath: simpleBookPath });

		expect(document.mode).toBe("single-file");
		expect(document.sourceText).toContain(":doctype: book");
		expect(document.targets.map((target) => target.id)).not.toContain(
			"xref-origin",
		);
	});

	it("keeps the default mode as single-file when mode is omitted", () => {
		const document = parseAbundantTree({ sourcePath: simpleBookPath });

		expect(document.mode).toBe("single-file");
		expect(document.sourcePath).toBe(simpleBookPath);
	});
});

type SingleFileParseOptions = {
	sourcePath: string;
	mode: "single-file";
};

function parseSingleFile(sourcePath: string): AbundantDocument {
	const parse = parseAbundantTree as (
		options: SingleFileParseOptions,
	) => AbundantDocument;
	return parse({ sourcePath, mode: "single-file" });
}
