import { describe, expect, it } from "vitest";
import type { AsciidoctorBlock } from "../src/asciidoctor-adapter";
import type { AbundantDocument, AbundantNode } from "../src/model";
import { officialBlockPolicy } from "../src/official-block-policy";
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

// 官方块 context 的全集：HTML5 转换器为每种块写一个 convert_* 方法。
const { default: Html5Converter } = (await import(
	new URL(
		"../node_modules/@asciidoctor/core/src/converter/html5.js",
		import.meta.url,
	).href
)) as { default: { prototype: object } };

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

	it.each([
		{ name: "list", introduction: "* 列表项\n" },
		{
			name: "listing",
			introduction: "[source]\n----\ncode\n----\n",
		},
		{ name: "example", introduction: "====\n例子。\n====\n" },
	])("takes the span of a wrapped $name without checking a first line", async ({
		name,
		introduction,
	}) => {
		const document = await parseBook(
			`partintro-synthesized-${name}.adoc`,
			introduction,
		);

		expect(document.toolDiagnostics).toEqual([]);
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
		"[source,indent=0,tabsize=4]\n\tx\ty\n",
		"[source,indent=2]\nconst x = 1;\n",
	])("accepts a verbatim first line Asciidoctor reshaped in %j", async (body) => {
		const document = await parseArticle(
			`cloaked-reshaped-${body.length}.adoc`,
			body,
		);

		expect(document.toolDiagnostics).toEqual([]);
	});

	it.each([
		{ name: "paragraph", opening: "" },
		{ name: "sidebar", opening: "[sidebar]\n" },
	])("spans a $name past the line comments Asciidoctor skips", async ({
		name,
		opening,
	}) => {
		const document = await parseArticle(
			`line-comment-${name}.adoc`,
			`${opening}第一行。\n// 注释\n第二行 xref:target[目标]。\n\n[#target]\n=== 目标\n`,
		);
		const last = opening === "" ? 7 : 8;

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.xrefOccurrences.map((xref) => xref.sourceSpan?.start.line),
		).toEqual([last]);
		if (name === "paragraph") {
			expect(spans(document, "paragraph")).toContainEqual({
				startLine: 5,
				endLine: 7,
			});
		}
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

describe("the preamble Asciidoctor builds before the first section", () => {
	it.each([
		{ name: "article", header: "= 文\n", line: 3 },
		{ name: "book", header: "= 书\n:doctype: book\n", line: 4 },
	])("projects and scans the $name preamble", async ({
		name,
		header,
		line,
	}) => {
		const document = await parseAbundantTree({
			sourcePath: writeFixture(
				`preamble-${name}.adoc`,
				`${header}\n前言 xref:first[第一节]。\n\n[#first]\n== 第一节\n\n正文。\n`,
			),
		});

		expect(document.toolDiagnostics).toEqual([]);
		expect(document.children.map((child) => child.kind)).toEqual([
			"paragraph",
			"section",
		]);
		expect(spans(document, "paragraph")[0]).toEqual({
			startLine: line,
			endLine: line,
		});
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([["first", line]]);
	});
});

describe("quotes written as paragraphs", () => {
	it.each([
		{
			name: "air-multiline",
			body: '"空气 xref:a[A]。\n// 注\n末行。"\n-- 某人 xref:credit[出处], 某书\n',
		},
		{
			name: "air-one-line",
			body: '"一句话 xref:a[A]。"\n-- 某人 xref:credit[出处]\n',
		},
	])("finds the xref of an $name quote and leaves its credit line alone", async ({
		name,
		body,
	}) => {
		const document = await parseArticle(`quote-${name}.adoc`, body);

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([["a", 5]]);
	});

	it("relocates the blocks of a markdown quote onto its source lines", async () => {
		const document = await parseArticle(
			"quote-markdown.adoc",
			"> 引语一 xref:a[A]。\n> 引语二。\n>\n> 第二段 xref:b[B]。\n> -- 某人\n",
		);

		expect(document.toolDiagnostics).toEqual([]);
		expect(spans(document, "paragraph")).toEqual([
			{ startLine: 5, endLine: 6 },
			{ startLine: 8, endLine: 8 },
			{ startLine: 11, endLine: 11 },
		]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([
			["a", 5],
			["b", 8],
		]);
	});

	it("reads blocks inside a markdown quote the way Asciidoctor reads them", async () => {
		const document = await parseArticle(
			"quote-markdown-nested.adoc",
			[
				"> 开头 xref:a[A]。",
				"// 注释",
				"> 接着。",
				">",
				"> ====",
				"> 例 xref:b[B]。",
				"> ====",
				">",
				"> [sidebar]",
				"> 侧 xref:c[C]。",
				">",
				"> * 项 xref:d[D]。",
				">",
				"> ____",
				"> 内引 xref:e[E]。",
				"> ____",
				">",
				"> > 内层 xref:f[F]。",
				">",
				"> -- 某人 xref:credit[出处]",
				"",
			].join("\n"),
		);

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([
			["a", 5],
			["b", 10],
			["c", 14],
			["d", 16],
			["e", 19],
			["f", 22],
		]);
	});
});

describe("table cells", () => {
	it("scans the blocks of an a| cell by the same policy as the body", async () => {
		const document = await parseArticle(
			"cell-blocks.adoc",
			[
				'[cols="1a,1"]',
				"|===",
				"a|",
				"====",
				"例 xref:a[A]。",
				"====",
				"",
				"* 项 xref:b[B]。",
				"",
				"NOTE: 注 xref:c[C]。",
				"",
				"[sidebar]",
				"侧 xref:d[D]。",
				"",
				"----",
				"代码 xref:listing[不扫]",
				"----",
				"|普通 xref:e[E]",
				"",
				"a|单元段 xref:f[F]。",
				"|二 xref:g[G]",
				"|===",
				"",
			].join("\n"),
		);

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([
			["a", 9],
			["b", 12],
			["c", 14],
			["d", 17],
			["e", 22],
			["f", 24],
			["g", 25],
		]);
	});

	it("scans every line of a plain cell", async () => {
		const document = await parseArticle(
			"cell-multiline.adoc",
			"|===\n|第一行\n第二行 xref:a[A]\n|单行 xref:b[B]\n|===\n",
		);

		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([
			["a", 7],
			["b", 8],
		]);
	});

	it("relocates the cells of a table inside a markdown quote", async () => {
		const document = await parseArticle(
			"cell-in-markdown-quote.adoc",
			[
				"> 引语。",
				">",
				"> |===",
				"> a|",
				"> ====",
				"> 例 xref:a[A]。",
				"> ====",
				"> |普通 xref:b[B]",
				"> |===",
				"",
			].join("\n"),
		);

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([
			["a", 10],
			["b", 12],
		]);
	});
});

describe("block contexts", () => {
	it("classifies every block context Asciidoctor converts", () => {
		const contexts = Object.getOwnPropertyNames(Html5Converter.prototype)
			.filter(
				(name) =>
					name.startsWith("convert_") && !name.startsWith("convert_inline_"),
			)
			.map((name) => name.slice("convert_".length))
			.filter(
				(context) => !["document", "embedded", "outline"].includes(context),
			);
		const unclassified = contexts.filter(
			(context) =>
				officialBlockPolicy({
					getContext: () => context,
					getContentModel: () => "compound",
				} as AsciidoctorBlock) === "diagnostic",
		);

		expect(contexts).toContain("thematic_break");
		expect(unclassified).toEqual([]);
	});

	it("scans callout items and the titles of empty blocks, and targets their IDs", async () => {
		const document = await parseAbundantTree({
			sourcePath: writeFixture(
				"empty-blocks.adoc",
				[
					"= 文",
					":toc: macro",
					"",
					"toc::[]",
					"",
					"== 节",
					"",
					"[source,ts]",
					"----",
					"const x = 1; // <1>",
					"const y = 2; // <2>",
					"----",
					"<1> 见 xref:a[A]。",
					"<2> 第二条 [[co-anchor]]锚。",
					"",
					"'''",
					"",
					"<<<",
					"",
					".图 xref:b[B]",
					"[#fig]",
					"image::a.png[替代文字]",
					"",
					".音频 xref:c[C]",
					"audio::a.mp3[]",
					"",
					".视频 xref:d[D]",
					"video::a.mp4[]",
					"",
					"[discrete#loose]",
					"=== 散标题",
					"",
					"引用 xref:fig[图] 与 xref:loose[散标题]。",
					"",
				].join("\n"),
			),
		});

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([
			["a", 13],
			["b", 20],
			["c", 24],
			["d", 27],
			["fig", 33],
			["loose", 33],
		]);
		expect(
			document.xrefOccurrences
				.filter((xref) => ["fig", "loose"].includes(xref.target))
				.map((xref) => [xref.scope, xref.asciidoctor?.resolvedType]),
		).toEqual([
			["local", "block"],
			["local", "block"],
		]);
		expect(
			document.anchorOccurrences.map((anchor) => [
				anchor.ids,
				anchor.sourceSpan?.start.line,
			]),
		).toEqual([[["co-anchor"], 14]]);
	});

	it("locates a callout list at its first item", async () => {
		const document = await parseArticle(
			"colist-location.adoc",
			[
				"----",
				"x // <1>",
				"y // <2>",
				"----",
				".说明 xref:a[A]",
				"[#calls]",
				"<1> 一",
				"<2> 二",
				"",
			].join("\n"),
		);

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.targets.find((target) => target.id === "calls")?.sourceSpan
				?.start.line,
		).toBe(9);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([["a", 9]]);
	});

	it("relocates a callout list inside a markdown quote", async () => {
		const document = await parseArticle(
			"colist-in-markdown-quote.adoc",
			[
				"> ----",
				"> x // <1>",
				"> y // <2>",
				"> ----",
				"> <1> 一 xref:a[A]。",
				"> <2> 二 xref:b[B]。",
				"",
			].join("\n"),
		);

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([
			["a", 9],
			["b", 10],
		]);
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
