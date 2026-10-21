import { Reader } from "@asciidoctor/core";
import { describe, expect, it } from "vitest";
import { paragraphEndLine } from "../src/official-paragraph";
import { parseAbundantTree } from "../src/parser";
import { buildLineTable } from "../src/source-lines";
import { writeFixture } from "./helpers";

// 官方没有导出 Parser；按文件路径取它，正是包入口 src/index.js 用的同一份模块。
const { Parser } = (await import(
	new URL("../node_modules/@asciidoctor/core/src/parser.js", import.meta.url)
		.href
)) as {
	Parser: {
		readParagraphLines(
			reader: Reader,
			breakAtList: string | false,
			options: { skip_line_comments: boolean },
		): Promise<string[]>;
	};
};

describe("paragraphEndLine", () => {
	it.each([
		["ends at a blank line", "一\n二\n\n三"],
		["skips line comments without ending", "一\n// 注\n二\n\n三"],
		["ends before trailing line comments", "一\n二\n// 注\n\n三"],
		["keeps a block comment delimiter out", "一\n////\n注\n////"],
		["stops at a list continuation", "一\n+\n----"],
		["stops at a block attribute line", "一\n[source]\n----"],
		["stops at an anchor line", "一\n[[a]]\n二"],
		["stops at a delimiter", "一\n----\nx\n----"],
		["stops at a lengthened delimiter", "一\n------"],
		["reads a list marker as text outside lists", "一\n* 二\n. 三"],
		["reads a term-like line as text outside lists", "一\n术语:: 解释"],
		["ends at the end of the file", "一\n二"],
		["ends at a line of only spaces", "一\n   \n二"],
		["keeps a triple-slash line", "一\n/// 不是注释\n二"],
	])("reads what Asciidoctor reads outside a list: %s", async (_, text) => {
		await expectParity(text, false);
	});

	it.each([
		["stops at the next item", "一\n二\n* 三"],
		["stops at an ordered marker", "一\n. 二"],
		["stops at a callout item", "一\n<1> 二"],
		["stops at a description term", "一\n术语:: 解释"],
		["does not take a comment for a term", "一\n// 注:: 不是术语\n二"],
	])("reads what Asciidoctor reads inside a list: %s", async (_, text) => {
		await expectParity(text, "olist");
	});
});

describe("markdown quotes", () => {
	it.each([
		["an unordered list", ["> 引语。", ">", "> * 一 xref:a[A]", "> * 二"]],
		["only a list", ["> * 一 xref:a[A]", "> * 二"]],
		[
			"an ordered list and a credit line",
			["> . 一 xref:a[A]", "> . 二", ">", "> -- 某人"],
		],
	])("parses a quote ending in %s", async (name, lines) => {
		const document = await parseAbundantTree({
			sourcePath: writeFixture(
				`markdown-quote-${name.replaceAll(" ", "-")}.adoc`,
				["= 文", "", "== 节", "", ...lines, "", "后文。", ""].join("\n"),
			),
		});

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([["a", lines.findIndex((line) => line.includes("xref")) + 5]]);
	});
});

async function expectParity(text: string, breakAtList: string | false) {
	const lines = text.split("\n");
	// 文档的读取器去掉行尾空白（PreprocessorReader 以 normalize 建行，reader.js 953 行）。
	const official = await Parser.readParagraphLines(
		new Reader(lines, null, { normalize: true }),
		breakAtList,
		{ skip_line_comments: true },
	);
	const endLine = paragraphEndLine(
		buildLineTable(text),
		1,
		breakAtList !== false,
	);
	const read = lines
		.slice(0, endLine)
		.filter((line) => !(line.startsWith("//") && !line.startsWith("///")));

	expect(read).toEqual(official);
	expect(lines[endLine - 1]).toBe(official.at(-1));
}
