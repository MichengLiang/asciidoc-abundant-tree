import { describe, expect, it } from "vitest";
import { createAsciidoctorFileAdapter } from "../src/asciidoctor-file-adapter";
import type { AbundantNode, DescriptionListNode } from "../src/model";
import { descriptionListItemsFromBlock } from "../src/official-block-utils";
import { walkOfficialBlocks } from "../src/official-block-walker";
import { completeOfficialSourceLocations } from "../src/official-source-location";
import { parseAbundantTree } from "../src/parser";
import { resolveSourceInterval } from "../src/source-interval-resolver";
import { buildLineTable, isLineComment, lineText } from "../src/source-lines";
import { writeFixture } from "./helpers";

// 描述的文字由官方并好，存在 ListItem 的 _text 里（list.js 202 行 foldFirst）。它是 @internal，生产代码不读，测试拿它当裁判。
type OfficialItem = { _text: string | null };

async function parse(name: string, body: string) {
	return parseAbundantTree({
		sourcePath: writeFixture(
			`description-${name}.adoc`,
			`= 文\n\n== 节\n\n正文。\n\n${body}\n`,
		),
	});
}

function descriptionLists(nodes: AbundantNode[]): DescriptionListNode[] {
	const lists: DescriptionListNode[] = [];
	const visit = (node: AbundantNode) => {
		if (node.kind === "descriptionList") {
			lists.push(node);
		}
		for (const child of "children" in node ? (node.children ?? []) : []) {
			visit(child as AbundantNode);
		}
	};
	nodes.forEach(visit);
	return lists;
}

function childTargets(node: { children?: AbundantNode[] } | undefined) {
	return (node?.children ?? []).flatMap((child) =>
		child.kind === "xref" ? [child.target] : [],
	);
}

describe("description text", () => {
	it.each([
		["text on the term line", "术语:: 解释\n续行\n下一个:: 二"],
		["text on the next line", "术语::\n解释\n续行\n下一个:: 二"],
		["a blank line after a bare term", "术语::\n\n隔着空行\n续行"],
		["an indented description", "术语::\n  缩进\n  再一行"],
		["a title-like line after a bare term", "术语::\n.不是标题\n续行"],
		["a block title after the term", "术语:: 解释\n.标题\n续行\n下一个:: 二"],
		["an attribute entry after the term", "术语:: 解释\n:名: 值\n续行"],
		["a line comment after the term", "术语:: 解释\n// 注\n续行"],
		["a line comment inside", "术语:: 解释\n续行\n// 注\n再续"],
		[
			"an indented continuation keeps comments",
			"术语:: 解释\n  续行\n// 注\n  再续",
		],
		["a title-like line inside", "术语:: 解释\n续行\n.不是标题\n再续"],
		[
			"a continuation then an attached block",
			"术语:: 解释\n续行\n+\n----\nx\n----",
		],
		["several terms", "一::\n二:: 解释\n续行\n下一个:: 二"],
		["an adjacent nested list", "术语:: 解释\n* 列表"],
		["an adjacent nested description list", "术语:: 解释\n子术语::: 嵌套"],
		["an adjacent admonition", "术语:: 解释\nNOTE: 提示"],
		["an adjacent block macro", "术语:: 解释\nimage::a.png[]"],
		["an adjacent markdown quote", "术语:: 解释\n> 引语"],
		["an adjacent air quote", '术语:: 解释\n"引的话"\n-- 某人'],
		["an adjacent thematic break", "术语:: 解释\n\x27\x27\x27"],
		["a literal paragraph after a blank line", "术语:: 解释\n\n  字面"],
		["a bare term over an attached block", "术语::\n+\n----\nx\n----"],
		["a term with a scoped name", "用 std::string:: 说明\n续行"],
	])("covers the lines Asciidoctor folds into a description: %s", async (name, body) => {
		const source = `= 文\n\n== 节\n\n正文。\n\n${body}\n\n后文。\n`;
		const lineTable = buildLineTable(source);
		const official = await createAsciidoctorFileAdapter().loadFile(
			writeFixture(`description-${name.replaceAll(" ", "-")}.adoc`, source),
		);
		completeOfficialSourceLocations(official, lineTable);
		const descriptions = walkOfficialBlocks(official).filter(
			(surface) =>
				surface.parent?.context === "dlist" &&
				descriptionListItemsFromBlock(surface.parent.block).some(
					(item) => item.description === surface.block,
				),
		);

		expect(descriptions.length).toBeGreaterThan(0);
		for (const description of descriptions) {
			const interval = resolveSourceInterval(description, lineTable);
			const text = (description.block as unknown as OfficialItem)._text ?? "";
			const folded =
				text === "" ? [] : text.split("\n").map((line) => line.trim());
			const start = interval?.contentSourceSpan?.start;
			if (!start || !interval?.contentSpan) {
				expect(folded).toEqual([]);
				continue;
			}
			const read: string[] = [];
			for (
				let line = interval.contentSpan.startLine;
				line <= interval.contentSpan.endLine;
				line += 1
			) {
				const discarded = interval.discardedSpan;
				if (
					discarded &&
					line >= discarded.startLine &&
					line <= discarded.endLine
				) {
					continue;
				}
				const text = lineText(lineTable, line);
				if (!interval.readsLineComments && isLineComment(text)) {
					continue;
				}
				read.push(
					(line === start.line
						? Array.from(text)
								.slice(start.column - 1)
								.join("")
						: text
					).trim(),
				);
			}

			expect(read).toEqual(folded);
		}
	});

	it("finds the xrefs in every folded line and hangs them under the description", async () => {
		const document = await parse(
			"lost-lines",
			[
				"同行:: 解释",
				"续行 xref:a[]",
				"另起::",
				"解释 xref:b[]",
				"续行 xref:c[]",
				"注释后:: 解释",
				"// 注 xref:skipped[]",
				"续行 xref:d[]",
				"属性后:: 解释",
				":名: 值",
				"续行 xref:e[]",
				"隔空行::",
				"",
				"  文字 xref:f[]",
			].join("\n"),
		);
		const [list] = descriptionLists(document.children);

		expect(list?.items.map((item) => childTargets(item.description))).toEqual([
			["a"],
			["b", "c"],
			["d"],
			["e"],
			["f"],
		]);
		expect(document.xrefOccurrences.map((xref) => xref.target)).toEqual([
			"a",
			"b",
			"c",
			"d",
			"e",
			"f",
		]);
		expect(list?.span).toEqual({ startLine: 7, endLine: 20 });
		expect(list?.items.map((item) => item.description?.source?.span)).toEqual([
			{ startLine: 7, endLine: 8 },
			{ startLine: 10, endLine: 11 },
			{ startLine: 12, endLine: 14 },
			{ startLine: 15, endLine: 17 },
			{ startLine: 20, endLine: 20 },
		]);
	});

	it("reads line comments as text in an indented continuation after a term with text", async () => {
		const document = await parse(
			"indented-comment",
			"术语:: 解释\n  续行\n  // 缩进的不是注释 xref:indented[]\n// 顶格的注释 xref:comment[]\n  再续 xref:z[]",
		);
		const [list] = descriptionLists(document.children);

		expect(childTargets(list?.items[0]?.description)).toEqual([
			"indented",
			"comment",
			"z",
		]);
	});

	it("does not scan the block title Asciidoctor discards between the term and the continuation", async () => {
		const document = await parse(
			"discarded-title",
			"术语:: 解释\n.标题 xref:discarded[]\n续行 xref:x[]\n下一个:: 二",
		);
		const [list] = descriptionLists(document.children);

		expect(document.xrefOccurrences.map((xref) => xref.target)).toEqual(["x"]);
		expect(list?.items[0]?.description?.source?.raw).toBe(
			"解释\n.标题 xref:discarded[]\n续行 xref:x[]",
		);
	});

	it("splits the term from the description where Asciidoctor does", async () => {
		const document = await parse(
			"scoped-term",
			"用 std::string:: 说明 xref:s[]\n续行",
		);
		const [item] = descriptionLists(document.children)[0]?.items ?? [];

		expect(item?.terms[0]?.source?.raw).toBe("用 std::string");
		expect(item?.description?.source?.raw).toBe("说明 xref:s[]\n续行");
		expect(childTargets(item?.description)).toEqual(["s"]);
	});

	it("maps the columns of a description inside a markdown quote back to the source", async () => {
		const document = await parse(
			"quoted",
			"> 引语正文。\n>\n> 术语:: 解释\n> 续行 xref:q[]\n> 不带字::\n>   缩进 xref:r[]",
		);
		const [first, second] = descriptionLists(document.children)[0]?.items ?? [];

		expect(first?.description?.sourceSpan).toEqual({
			start: { line: 9, column: 8 },
			end: { line: 10, column: 14 },
		});
		expect(childTargets(first?.description)).toEqual(["q"]);
		expect(second?.description?.sourceSpan?.start).toEqual({
			line: 12,
			column: 3,
		});
		expect(childTargets(second?.description)).toEqual(["r"]);
	});

	it("takes a heading field value from the first text line after a blank line", async () => {
		const document = await parseAbundantTree({
			sourcePath: writeFixture(
				"description-field.adoc",
				"= 文\n\n== 节\n\n空行后::\n\n  值 xref:x[]\n缩进::\n  三\n  四\n",
			),
		});
		const [section] = document.children;

		expect(
			section?.kind === "section" ? section.descriptionMetadata?.fields : {},
		).toEqual({ 空行后: "值 xref:x[]", 缩进: "三\n四" });
	});
});
