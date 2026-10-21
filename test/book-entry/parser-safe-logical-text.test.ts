import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadFile } from "@asciidoctor/core";
import { describe, expect, it } from "vitest";
import type { AsciidoctorBlock } from "../../src/asciidoctor-adapter";
import { createAsciidoctorFileAdapter } from "../../src/asciidoctor-file-adapter";
import type { LogicalLineRecord } from "../../src/book-entry/line-origin-model";
import { preprocessBookEntryWithOfficialReader } from "../../src/book-entry/official-reader-preprocessor";
import { buildParserSafeLogicalText } from "../../src/book-entry/parser-safe-logical-text";
import { parseAbundantTree } from "../../src/index";
import type { AbundantNode, ListingNode } from "../../src/model";

describe("book-entry parser-safe logical text", () => {
	it("writes include and conditional directive lines with a leading backslash", () => {
		const safe = buildParserSafeLogicalText([
			sourceRecord(1, "include::target.adoc[]"),
			sourceRecord(2, "ifdef::never[]"),
			sourceRecord(3, "endif::[]"),
			sourceRecord(4, "ifeval::[1 > 0]"),
			sourceRecord(5, "normal include::x[] in the middle"),
			sourceRecord(6, "  include::indented.adoc[]"),
		]);

		expect(safe.text.split("\n")).toEqual([
			"\\include::target.adoc[]",
			"\\ifdef::never[]",
			"\\endif::[]",
			"\\ifeval::[1 > 0]",
			"normal include::x[] in the middle",
			"  include::indented.adoc[]",
		]);
		expect(safe.lineRecords).toHaveLength(6);
	});

	it("does not expand an include line again during parser load", async () => {
		const safe = buildParserSafeLogicalText([
			sourceRecord(1, "include::target.adoc[]"),
		]);
		const document = await createAsciidoctorFileAdapter().loadSource(safe.text);
		const [block] = (document.getBlocks?.() ?? []) as AsciidoctorBlock[];

		expect(document.getBlocks?.().length).toBe(1);
		expect(block?.getSource?.()).toBe("include::target.adoc[]");
	});

	it("keeps generated control lines in parser-safe text", () => {
		const safe = buildParserSafeLogicalText([
			{
				kind: "generated-control",
				logicalLine: 1,
				text: ":leveloffset: +1",
				generatedKind: "leveloffset-push",
			},
		]);

		expect(safe.text).toBe(":leveloffset: +1");
	});

	it("keeps parser-safe line count equal to record count", () => {
		const safe = buildParserSafeLogicalText([
			sourceRecord(1, "include::target.adoc[]"),
			sourceRecord(2, "normal"),
		]);

		expect(safe.text.split(/\r?\n/u)).toHaveLength(safe.lineRecords.length);
	});
});

// 第一次读取输出的行里像指令的都是字面内容，第二次解析不能再处理它们。预期取自官方 Asciidoctor 对同一本书的解析。
describe("directive-shaped lines the official Reader emits literally", () => {
	const fixtureRoot = join(process.cwd(), "tmp/parser-safe-logical-text");

	function writeFixture(relativePath: string, content: string): string {
		const path = join(fixtureRoot, relativePath);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
		return path;
	}

	async function officialListing(entry: string): Promise<string | undefined> {
		const document = await loadFile(entry, {
			safe: "unsafe",
		});
		const [listing] = document.findBy({
			context: "listing",
		}) as AsciidoctorBlock[];
		return listing?.getSource?.();
	}

	function listings(nodes: readonly AbundantNode[]): ListingNode[] {
		return nodes.flatMap((node) => [
			...(node.kind === "listing" ? [node] : []),
			...listings(node.children ?? []),
		]);
	}

	async function parse(root: string, entry: string) {
		return await parseAbundantTree({
			sourcePath: entry,
			mode: "book-entry",
			documentRoot: root,
		});
	}

	// .py 里字面写着的指令行：Reader 不处理非 AsciiDoc 文件的指令，missing.adoc 也不必存在。
	const pySource =
		"x = 1\ninclude::missing.adoc[]\nifdef::never[]\ny = 2\nendif::[]\n";

	it("keeps the lines of a fully included non-AsciiDoc file", async () => {
		const root = join(fixtureRoot, "full-py");
		rmSync(root, { recursive: true, force: true });
		writeFixture("full-py/code.py", pySource);
		const entry = writeFixture(
			"full-py/book.adoc",
			"= T\n\n== 甲\n\n----\ninclude::code.py[]\n----\n\n== 乙\n",
		);

		const document = await parse(root, entry);
		const [listing] = listings(document.children ?? []);

		expect(await officialListing(entry)).toBe(pySource.trimEnd());
		expect(listing?.content).toBe(pySource.trimEnd());
		const yi = document.children?.find(
			(node) => node.kind === "section" && node.title === "乙",
		);
		expect(yi?.source?.line).toBe(9);
		const lines = (
			await preprocessBookEntryWithOfficialReader({
				adapter: createAsciidoctorFileAdapter(),
				sourcePath: entry,
				documentRoot: root,
			})
		).lines.flatMap((line) =>
			"origin" in line && line.origin.relativePath === "code.py"
				? [line.origin.sourceLine]
				: [],
		);
		expect(lines).toEqual([1, 2, 3, 4, 5]);
	});

	it("keeps the lines of a selected non-AsciiDoc file", async () => {
		const root = join(fixtureRoot, "selected-py");
		rmSync(root, { recursive: true, force: true });
		writeFixture("selected-py/code.py", `# tag::x[]\n${pySource}# end::x[]\n`);
		const entry = writeFixture(
			"selected-py/book.adoc",
			"= T\n\n== 甲\n\n----\ninclude::code.py[tag=x]\n----\n",
		);

		const [listing] = listings((await parse(root, entry)).children ?? []);

		expect(await officialListing(entry)).toBe(pySource.trimEnd());
		expect(listing?.content).toBe(pySource.trimEnd());
	});

	it("keeps indented directive lines as ordinary text", async () => {
		// Asciidoctor 的指令从第 1 列匹配：代码清单里一段 diff 的上下文行 `     include::…[*]` 是普通文字。
		const root = join(fixtureRoot, "indented-directives");
		rmSync(root, { recursive: true, force: true });
		const body =
			"     include::missing.adoc#handoff[*]\n  ifdef::never[]\n中间\n  endif::[]";
		const entry = writeFixture(
			"indented-directives/book.adoc",
			`= T\n\n== 甲\n\n----\n${body}\n----\n`,
		);

		const document = await parse(root, entry);
		const [listing] = listings(document.children ?? []);

		expect(await officialListing(entry)).toBe(body);
		expect(listing?.content).toBe(body);
		expect(document.toolDiagnostics).toEqual([]);
	});

	it("keeps escaped conditional directives as their unescaped text", async () => {
		const root = join(fixtureRoot, "escaped-conditional");
		rmSync(root, { recursive: true, force: true });
		const entry = writeFixture(
			"escaped-conditional/book.adoc",
			"= T\n\n== 甲\n\n----\n\\ifdef::never[]\n中间\n\\endif::[]\n----\n",
		);

		const [listing] = listings((await parse(root, entry)).children ?? []);

		expect(await officialListing(entry)).toBe(
			"ifdef::never[]\n中间\nendif::[]",
		);
		expect(listing?.content).toBe("ifdef::never[]\n中间\nendif::[]");
		expect(listing?.source?.line).toBe(5);
	});
});

function sourceRecord(logicalLine: number, text: string): LogicalLineRecord {
	return {
		kind: "source-preserving",
		logicalLine,
		text,
		origin: {
			absolutePath: "/book.adoc",
			relativePath: "book.adoc",
			sourceLine: logicalLine,
		},
		columnMap: { kind: "identity" },
	};
}
