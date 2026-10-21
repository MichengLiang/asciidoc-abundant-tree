import { describe, expect, it } from "vitest";
import type { AbundantDocument, AbundantNode } from "../src/model";
import { officialDelimiter } from "../src/official-delimiter";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

type OfficialMatch = {
	context: string;
	masq: Set<string>;
	terminator: string;
} | null;

// 官方没有导出 Parser；按文件路径取它，正是包入口 src/index.js 用的同一份模块。
const { Parser } = (await import(
	new URL("../node_modules/@asciidoctor/core/src/parser.js", import.meta.url)
		.href
)) as {
	Parser: { isDelimitedBlock(line: string, match: true): OfficialMatch };
};

describe("official delimiters", () => {
	it("recognizes exactly the lines Asciidoctor's isDelimitedBlock recognizes", () => {
		const heads = ["-", ".", "=", "*", "_", "+", "|", ",", ":", "!", "~", "/"];
		const candidates = [
			...heads.flatMap((head) =>
				[1, 2, 3, 4, 5, 6, 8].map((length) => head.repeat(length)),
			),
			...["|", ",", ":", "!"].flatMap((head) =>
				[3, 4, 6].map((length) => `${head}${"=".repeat(length)}`),
			),
			"|==-",
			"----=",
			"---- x",
			"--x",
			" ----",
			"`",
			"``",
			"```",
			"````",
			"`````",
			"```ruby",
			"```ruby,linenums",
			"```,linenums",
			"``x",
			"",
			"text",
		];

		for (const line of candidates) {
			const official = Parser.isDelimitedBlock(line, true);
			const ported = officialDelimiter(line);
			expect(
				ported && {
					context: ported.context,
					masq: [...ported.masq].sort(),
					terminator: ported.terminator,
				},
				JSON.stringify(line),
			).toEqual(
				official
					? {
							context: official.context,
							masq: [...official.masq].sort(),
							terminator: official.terminator,
						}
					: undefined,
			);
		}
	});
});

describe("part introductions built by Asciidoctor", () => {
	it("locates a one-paragraph [partintro] at its paragraph", async () => {
		const document = await parseBook(
			"partintro-paragraph.adoc",
			"[partintro]\n导言只有一段。\n第二行。\n",
		);

		expect(document.toolDiagnostics).toEqual([]);
		expect(spans(document, "paragraph")).toEqual([
			{ startLine: 7, endLine: 8 },
			{ startLine: 12, endLine: 12 },
		]);
	});

	it("keeps plain paragraphs that Asciidoctor wraps in a synthesized intro", async () => {
		const two = await parseBook(
			"partintro-synthesized-two.adoc",
			"第一段。\n\n第二段。\n",
		);
		const one = await parseBook(
			"partintro-synthesized-one.adoc",
			"只有一段。\n",
		);

		expect(two.toolDiagnostics).toEqual([]);
		expect(spans(two, "paragraph")).toEqual([
			{ startLine: 6, endLine: 6 },
			{ startLine: 8, endLine: 8 },
			{ startLine: 12, endLine: 12 },
		]);
		expect(one.toolDiagnostics).toEqual([]);
		expect(spans(one, "paragraph")).toEqual([
			{ startLine: 6, endLine: 6 },
			{ startLine: 10, endLine: 10 },
		]);
	});

	it("leaves the attribute lines of a wrapped paragraph with that paragraph", async () => {
		const document = await parseBook(
			"partintro-synthesized-with-id.adoc",
			"[#first-paragraph]\n第一段。\n",
		);

		expect(document.toolDiagnostics).toEqual([]);
		expect(spans(document, "paragraph")).toEqual([
			{ startLine: 6, endLine: 7 },
			{ startLine: 11, endLine: 11 },
		]);
		expect(document.targets.map((target) => target.id)).toContain(
			"first-paragraph",
		);
	});
});

describe("cloaked paragraphs", () => {
	it.each([
		"[source,ts]\nconst x = 1;\nconst y = 2;\n",
		"[listing]\n清单。\n",
		"[literal]\n字面。\n",
		"[pass]\n<b>原样</b>\n",
		"[quote, 某人]\n一句话。\n",
		"[verse]\n诗一行\n诗二行\n",
		"[example]\n例子。\n",
		"[sidebar]\n旁注。\n",
		"[open]\n开放。\n",
		"[abstract]\n摘要。\n",
	])("does not look for a delimiter in %j", async (body) => {
		const document = await parseArticle(
			`cloaked-${body.slice(1, body.indexOf("]")).replace(/\W/gu, "-")}.adoc`,
			body,
		);

		expect(document.toolDiagnostics).toEqual([]);
	});

	it("ends a cloaked listing at its last line", async () => {
		const document = await parseArticle(
			"cloaked-listing-span.adoc",
			"[source,ts]\nconst x = 1;\nconst y = 2;\n",
		);

		expect(spans(document, "listing")).toEqual([{ startLine: 5, endLine: 7 }]);
	});

	it.each([
		"[sidebar]",
		"[quote]",
		"[example]",
		"[open]",
		"****",
	])("finds the xref inside %s once", async (opening) => {
		const closing = opening === "****" ? "\n****" : "";
		const document = await parseArticle(
			`cloaked-xref-${opening.replace(/\W/gu, "-")}.adoc`,
			`${opening}\n见 xref:target[目标]。${closing}\n\n[#target]\n=== 目标\n`,
		);

		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([["target", 6]]);
	});
});

describe("delimiters written the long or masqueraded way", () => {
	it.each([
		{
			name: "lengthened-listing",
			body: "[source,asciidoc]\n------\n----\n里面\n----\n------\n",
			kind: "listing",
			span: { startLine: 5, endLine: 10 },
		},
		{
			name: "literal-delimiter-as-source",
			body: "[source,ts]\n....\nconst x = 1;\n....\n",
			kind: "listing",
			span: { startLine: 5, endLine: 8 },
		},
		{
			name: "fenced-with-language",
			body: "```ruby\nputs 1\n```\n",
			kind: "listing",
			span: { startLine: 5, endLine: 7 },
		},
		{
			name: "lengthened-table",
			body: "|=====\n|a |b\n|=====\n",
			kind: "table",
			span: { startLine: 5, endLine: 7 },
		},
	])("spans $name to its closing line", async ({ name, body, kind, span }) => {
		const document = await parseArticle(`delimiter-${name}.adoc`, body);

		expect(document.toolDiagnostics).toEqual([]);
		expect(spans(document, kind)).toEqual([span]);
	});
});

async function parseBook(
	name: string,
	introduction: string,
): Promise<AbundantDocument> {
	return parseAbundantTree({
		sourcePath: writeFixture(
			name,
			`= 书\n:doctype: book\n\n= 第一部\n\n${introduction}\n== 第一章\n\n正文。\n`,
		),
	});
}

async function parseArticle(
	name: string,
	body: string,
): Promise<AbundantDocument> {
	return parseAbundantTree({
		sourcePath: writeFixture(name, `= 文\n\n== 节\n\n${body}\n后文。\n`),
	});
}

function spans(document: AbundantDocument, kind: string) {
	const found: unknown[] = [];
	const visit = (node: AbundantNode) => {
		if (node.kind === kind) {
			found.push(node.source?.span);
		}
		for (const child of "children" in node ? (node.children ?? []) : []) {
			visit(child as AbundantNode);
		}
	};
	for (const child of document.children) {
		visit(child);
	}
	return found;
}
