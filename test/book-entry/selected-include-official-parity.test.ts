import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import createAsciidoctor from "@asciidoctor/core";
import { describe, expect, it } from "vitest";
import { createAsciidoctorAdapter } from "../../src/asciidoctor-adapter";
import {
	parseIncludeAttributes,
	selectionSurface,
} from "../../src/book-entry/include-attribute-model";
import { mapIncludeSelection } from "../../src/book-entry/include-selection-mapper";
import { preprocessBookEntryWithOfficialReader } from "../../src/book-entry/official-reader-preprocessor";
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
	"lines=",
	"lines=1;3;",
	"lines=1_0",
	"tag=x,lines=1..2",
	"tag=x,tag=y",
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
				const selector = selectionSurface(parseIncludeAttributes(surface));
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

	it("keeps a nested include after a dropped conditional out of the coordinates", () => {
		const root = join(fixtureRoot, "conditional-then-nested");
		const entry = writeFixture(
			"conditional-then-nested/book.adoc",
			"= T\n:doctype: book\n\ninclude::part.adoc[tag=x]\n\n== B\n\nbody\n",
		);
		writeFixture(
			"conditional-then-nested/part.adoc",
			"// tag::x[]\nbefore\nifdef::never[]\nhidden\nendif::[]\ninclude::nested.adoc[]\nafter\n// end::x[]\n",
		);
		writeFixture("conditional-then-nested/nested.adoc", "n1\n");

		const document = preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorAdapter(),
			sourcePath: entry,
			documentRoot: root,
		});
		const record = (text: string) =>
			document.lines.find((line) => line.text === text);

		expect(record("n1")?.kind).toBe("degraded");
		expect(record("after")?.kind).toBe("degraded");
		expect(record("== B")).toEqual(
			expect.objectContaining({
				origin: expect.objectContaining({
					relativePath: "book.adoc",
					sourceLine: 6,
				}),
			}),
		);
	});

	it("does not take Reader's leveloffset lines for selected lines when the selection has gaps", () => {
		const root = join(fixtureRoot, "leveloffset-gap");
		const entry = writeFixture(
			"leveloffset-gap/book.adoc",
			"= T\n\ninclude::part.adoc[tag=x,leveloffset=+1]\n\n== After\n\nbody\n",
		);
		writeFixture(
			"leveloffset-gap/part.adoc",
			"intro\n// tag::x[]\n== X1\nx1\n// tag::y[]\ny1\n// end::y[]\nx2\n// end::x[]\ntail\n",
		);

		const document = preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorAdapter(),
			sourcePath: entry,
			documentRoot: root,
		});
		const origins = document.lines.flatMap((line) =>
			"origin" in line
				? [`${line.text}@${line.origin.relativePath}:${line.origin.sourceLine}`]
				: [],
		);

		expect(origins).toEqual(
			expect.arrayContaining([
				"== X1@part.adoc:3",
				"x2@part.adoc:8",
				"== After@book.adoc:5",
				"body@book.adoc:7",
			]),
		);
		expect(document.lines.filter((line) => line.text === "body")).toHaveLength(
			1,
		);
		expect(document.diagnostics).toEqual([]);
	});

	it("keeps a selection that starts with a blank line under leveloffset", () => {
		const root = join(fixtureRoot, "leveloffset-blank");
		const entry = writeFixture(
			"leveloffset-blank/book.adoc",
			"= T\n\ninclude::part.adoc[tag=x,leveloffset=+1]\n\n== After\n",
		);
		writeFixture(
			"leveloffset-blank/part.adoc",
			"// tag::x[]\n\n== X\n// end::x[]\n",
		);

		const document = parseAbundantTree({
			sourcePath: entry,
			mode: "book-entry",
			documentRoot: root,
		});
		const titles = headings(document).map((heading) => [
			heading.title,
			heading.source?.relativePath,
			heading.line,
		]);

		expect(titles).toEqual([
			["X", "part.adoc", 3],
			["After", "book.adoc", 5],
		]);
	});
});

describe("adjacent selected includes of the same file", () => {
	// 紧挨着的几条 include（中间没有外层文件的行）只能靠官方 Reader 的推入身份分界。期望的来源序列就是每条
	// include 的选中行依次拼接：选行本身已由上面的逐行对照表与官方核对过。小棉复核时用行号启发式在这种
	// 写法上随机撞出过 0.75% 的假坐标（空行与 `}` 的文本巧合），所以这里随机组合、逐条比对来源。
	const code = ["first", "", "}", "", "}", "m", "", "}", "e", "", "}", "z"];
	const choices = [
		"lines=1;9",
		"lines=4..12",
		"lines=2..3",
		"lines=5;7;11",
		"lines=12",
		"lines=1..",
		"lines=3..1",
		"lines=6;8",
	];

	function random(seed: number) {
		let state = seed;
		return () => {
			state = (state + 0x6d2b79f5) | 0;
			let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
			mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
			return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
		};
	}

	it("maps every line to the include it came from", () => {
		const root = join(fixtureRoot, "adjacent");
		writeFixture("adjacent/code.txt", `${code.join("\n")}\n`);
		const next = random(20261021);
		const failures: string[] = [];
		for (let round = 0; round < 300; round += 1) {
			const picked = Array.from(
				{ length: 2 + Math.floor(next() * 3) },
				() => choices[Math.floor(next() * choices.length)] ?? "lines=1",
			);
			const entry = writeFixture(
				"adjacent/book.adoc",
				`= T\n\n----\n${picked.map((surface) => `include::code.txt[${surface}]`).join("\n")}\n----\n\n== After\n`,
			);
			const expected = picked.flatMap((surface) => {
				const selector = selectionSurface(parseIncludeAttributes(surface));
				const mapping = selector
					? mapIncludeSelection(`${code.join("\n")}\n`, selector)
					: undefined;
				return mapping?.ok ? mapping.lines : [];
			});
			const document = preprocessBookEntryWithOfficialReader({
				adapter: createAsciidoctorAdapter(),
				sourcePath: entry,
				documentRoot: root,
			});
			const actual = document.lines.flatMap((line) =>
				"origin" in line && line.origin.relativePath === "code.txt"
					? [line.origin.sourceLine]
					: [],
			);
			const after = document.lines.find((line) => line.text === "== After");
			const afterLine =
				after && "origin" in after ? after.origin.sourceLine : undefined;
			if (
				JSON.stringify(actual) !== JSON.stringify(expected) ||
				afterLine !== picked.length + 6
			) {
				failures.push(
					`${picked.join(" + ")}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}, After at ${afterLine}`,
				);
			}
		}
		expect(failures).toEqual([]);
	});

	function preprocess(root: string, entry: string) {
		return preprocessBookEntryWithOfficialReader({
			adapter: createAsciidoctorAdapter(),
			sourcePath: entry,
			documentRoot: root,
		});
	}
	const originsIn = (document: ReturnType<typeof preprocess>, file: string) =>
		document.lines.flatMap((line) =>
			"origin" in line && line.origin.relativePath === file
				? [line.origin.sourceLine]
				: [],
		);

	it("does not take the next include's push for an include that selects nothing", () => {
		// 小棉复核 a30b738 的反例：选取为空的 include 曾把紧挨着的下一次推入认成自己的，再下一条 include
		// 又拿到别人的推入，靠空行与 `}` 的文本巧合配出假坐标。
		const root = join(fixtureRoot, "empty-then-adjacent");
		writeFixture("empty-then-adjacent/code.txt", "\n}\nm\n\n}\nz\n");
		const entry = writeFixture(
			"empty-then-adjacent/book.adoc",
			"= T\n\n----\ninclude::code.txt[tag=nope]\ninclude::code.txt[lines=1..2]\ninclude::code.txt[lines=4..6]\n----\n",
		);
		const document = preprocess(root, entry);

		expect(originsIn(document, "code.txt")).toEqual([1, 2, 4, 5, 6]);
		expect(
			document.diagnostics.map((diagnostic) => diagnostic.message),
		).toEqual([
			"Include 'code.txt' at book.adoc:4 with tag=nope selects no source lines.",
		]);
	});

	it("leaves the parent's blank lines alone when a leveloffset include pushes nothing", () => {
		const root = join(fixtureRoot, "leveloffset-empty");
		writeFixture(
			"leveloffset-empty/part.adoc",
			"// tag::x[]\nx\n// end::x[]\n",
		);
		const entry = writeFixture(
			"leveloffset-empty/book.adoc",
			"= T\n\ninclude::part.adoc[tag=nope,leveloffset=+1]\n\n\n== After\n\nbody\n",
		);
		const document = preprocess(root, entry);

		expect(originsIn(document, "book.adoc")).toEqual([1, 2, 4, 5, 6, 7, 8]);
		expect(document.lines.filter((line) => line.text === "body")).toHaveLength(
			1,
		);
	});

	it("keeps a literal include line inside a selected non-AsciiDoc file", () => {
		// Reader 只对 AsciiDoc 文件处理 include；.py 里写着的 include:: 是普通的一行，nested.adoc 也不必存在。
		const root = join(fixtureRoot, "literal-include-in-py");
		writeFixture(
			"literal-include-in-py/code.py",
			"# tag::x[]\nbefore\ninclude::nested.adoc[]\nafter\n# end::x[]\n",
		);
		const entry = writeFixture(
			"literal-include-in-py/book.adoc",
			"= T\n\n----\ninclude::code.py[tag=x]\n----\n",
		);
		const document = preprocess(root, entry);

		expect(originsIn(document, "code.py")).toEqual([2, 3, 4]);
		expect(document.diagnostics).toEqual([]);
	});
});
