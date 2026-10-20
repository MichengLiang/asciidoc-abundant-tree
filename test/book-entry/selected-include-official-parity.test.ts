import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import createAsciidoctor from "@asciidoctor/core";
import { describe, expect, it } from "vitest";
import { createAsciidoctorAdapter } from "../../src/asciidoctor-adapter";
import {
	firstSelectionSurface,
	parseIncludeAttributes,
} from "../../src/book-entry/include-attribute-model";
import { mapIncludeSelection } from "../../src/book-entry/include-selection-mapper";
import { parseAbundantTree } from "../../src/index";
import type { SectionNode } from "../../src/model";

// 选取引入的行集以 Asciidoctor 官方 Reader 的输出为准（10 号书「选取引入」），所以这里的预期都取自官方：
// 不手写“应该选中第几行”，而是让 aat 算出的行与官方为同一次 include 吐出的行逐行相同。

const fixtureRoot = join(process.cwd(), "tmp/selected-include-official-parity");

function writeFixture(relativePath: string, content: string): string {
	const path = join(fixtureRoot, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
	return path;
}

function taggedSource(
	open: (tag: string) => string,
	close: (tag: string) => string,
) {
	return [
		"a = 0",
		open("x"),
		"x1",
		open("y"),
		"y1",
		close("y"),
		"x2",
		close("x"),
		"between",
		open("z"),
		"z1",
		close("z"),
		"c = 0",
	].join("\n");
}

const markers = {
	"//": [(t: string) => `// tag::${t}[]`, (t: string) => `// end::${t}[]`],
	"#": [(t: string) => `# tag::${t}[]`, (t: string) => `# end::${t}[]`],
	"--": [(t: string) => `-- tag::${t}[]`, (t: string) => `-- end::${t}[]`],
	"<!--": [
		(t: string) => `<!-- tag::${t}[] -->`,
		(t: string) => `<!-- end::${t}[] -->`,
	],
} as const;

const selectors = [
	"tag=x",
	"tag=y",
	"tag=**",
	"tag=*",
	"tag=!x",
	"tags=x;z",
	"tags=x,z",
	'tags="x,z"',
	"tags=**;!y",
	"tags=*;!y",
	"tags=!y",
	"tags=x;!y",
	"tags=**;*",
	"lines=3..5",
	"lines=8..",
	"lines=2..-1",
	"lines=1;3;5",
	'lines="1,3"',
	"lines=3..1",
];

describe("selected include parity with the official Reader", () => {
	for (const [marker, [open, close]] of Object.entries(markers)) {
		it(`selects the same lines as Asciidoctor for ${marker} tag markers`, () => {
			const source = taggedSource(open, close);
			const sourcePath = writeFixture(
				`markers/${encodeURIComponent(marker)}/code.txt`,
				`${source}\n`,
			);
			const mismatches: string[] = [];
			for (const surface of selectors) {
				const entry = writeFixture(
					`markers/${encodeURIComponent(marker)}/book.adoc`,
					`----\ninclude::code.txt[${surface}]\n----\n`,
				);
				const official = createAsciidoctorAdapter()
					.readPreprocessedLines({ sourcePath: entry, baseDir: dirname(entry) })
					.filter((line) => line.cursor.file === sourcePath)
					.map((line) => line.text);
				// 走与预处理器相同的 attrlist 解析：`tags=x,z` 里的逗号先分开属性，官方只拿到 `tags=x`。
				const selector = firstSelectionSurface(parseIncludeAttributes(surface));
				if (!selector) {
					throw new Error(`not a selection surface: ${surface}`);
				}
				const mapping = mapIncludeSelection(`${source}\n`, selector);
				const lines = source.split("\n");
				const ours = mapping.ok
					? mapping.lines.map((line) => lines[line - 1])
					: [];
				if (JSON.stringify(ours) !== JSON.stringify(official)) {
					mismatches.push(
						`${surface}: ours ${JSON.stringify(ours)} official ${JSON.stringify(official)}`,
					);
				}
			}
			expect(mismatches).toEqual([]);
		});
	}
});

describe("source coordinates after a selected include", () => {
	function headings(document: { children: readonly unknown[] }): SectionNode[] {
		const found: SectionNode[] = [];
		const walk = (nodes: readonly unknown[]) => {
			for (const node of nodes as SectionNode[]) {
				if (node.kind === "section") {
					found.push(node);
					walk(node.children ?? []);
				}
			}
		};
		walk(document.children);
		return found;
	}

	function officialHeadingLine(entry: string, title: string) {
		const document = createAsciidoctor().loadFile(entry, {
			safe: "unsafe",
			sourcemap: true,
		});
		const section = document
			.findBy({ context: "section" })
			.find((candidate) => candidate.getTitle() === title);
		const location = section?.getSourceLocation();
		return [location?.getPath(), location?.getLineNumber()];
	}

	it("keeps headings after a # tag include where Asciidoctor puts them", () => {
		const root = join(fixtureRoot, "hash-tag-book");
		rmSync(root, { recursive: true, force: true });
		const entry = writeFixture(
			"hash-tag-book/book.adoc",
			"= 复现\n:doctype: book\n\ninclude::ch2.adoc[]\n\ninclude::ch3.adoc[]\n",
		);
		writeFixture(
			"hash-tag-book/ch2.adoc",
			"[#target]\n== 代码\n\n----\ninclude::code.py[tag=x]\n----\n",
		);
		writeFixture(
			"hash-tag-book/code.py",
			`a = 0\n# tag::x[]\n${Array.from({ length: 7 }, (_, i) => `line${i}`).join("\n")}\n# end::x[]\nc = 0\n`,
		);
		writeFixture("hash-tag-book/ch3.adoc", "== 乙\n\n见 xref:target[]。\n");

		const document = parseAbundantTree({
			sourcePath: entry,
			mode: "book-entry",
			documentRoot: root,
		});
		const yi = headings(document).find((heading) => heading.title === "乙");

		expect([yi?.source?.relativePath, yi?.line]).toEqual(["ch3.adoc", 1]);
		expect(officialHeadingLine(entry, "乙")).toEqual(["ch3.adoc", 1]);
		expect(
			document.toolDiagnostics.map((diagnostic) => diagnostic.code),
		).not.toContain("origin-map.selection-mismatch");
	});

	it("maps lines of an include nested inside a tag region to their own file", () => {
		const root = join(fixtureRoot, "nested-in-tag");
		const entry = writeFixture(
			"nested-in-tag/book.adoc",
			"= T\n\ninclude::part.adoc[tag=x]\n\n== 乙\n",
		);
		writeFixture(
			"nested-in-tag/part.adoc",
			"intro\n// tag::x[]\nx1\ninclude::nested.adoc[]\nx2\n// end::x[]\n",
		);
		writeFixture("nested-in-tag/nested.adoc", "n1\n");

		const document = parseAbundantTree({
			sourcePath: entry,
			mode: "book-entry",
			documentRoot: root,
		});
		const yi = headings(document).find((heading) => heading.title === "乙");

		expect([yi?.source?.relativePath, yi?.line]).toEqual(["book.adoc", 5]);
		expect(
			document.toolDiagnostics.map((diagnostic) => diagnostic.code),
		).not.toContain("origin-map.selection-mismatch");
	});

	it("degrades only the include that does not line up, reports it, and keeps later headings aligned", () => {
		const root = join(fixtureRoot, "conditional-in-tag");
		const entry = writeFixture(
			"conditional-in-tag/book.adoc",
			"= T\n:doctype: book\n\ninclude::cond.adoc[tag=x]\n\n== 乙\n\n正文。\n",
		);
		// 选中区域里的条件块被官方 Reader 吃掉，aat 的行集里还有它：这一次 include 对不上。
		writeFixture(
			"conditional-in-tag/cond.adoc",
			"// tag::x[]\nbefore\nifdef::never[]\nhidden\nendif::[]\nshown\n// end::x[]\n",
		);

		const document = parseAbundantTree({
			sourcePath: entry,
			mode: "book-entry",
			documentRoot: root,
		});
		const yi = headings(document).find((heading) => heading.title === "乙");

		expect([yi?.source?.relativePath, yi?.line]).toEqual(["book.adoc", 6]);
		expect(document.toolDiagnostics[0]).toEqual(
			expect.objectContaining({
				level: "warning",
				code: "origin-map.selection-mismatch",
				message: expect.stringContaining(
					"Include 'cond.adoc' at book.adoc:4 with tag=x",
				),
			}),
		);
	});
});
