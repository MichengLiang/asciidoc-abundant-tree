import { describe, expect, it } from "vitest";
import { createAsciidoctorFileAdapter } from "../src/asciidoctor-file-adapter";
import type { AbundantNode, DescriptionListNode } from "../src/model";
import { walkOfficialBlocks } from "../src/official-block-walker";
import { completeOfficialSourceLocations } from "../src/official-source-location";
import { parseAbundantTree } from "../src/parser";
import { resolveSourceInterval } from "../src/source-interval-resolver";
import { buildLineTable, lineText } from "../src/source-lines";
import { writeFixture } from "./helpers";

// 条目的文字由官方并好，存在 ListItem 的 _text 里（list.js 196 行 foldFirst）。它是 @internal，生产代码不读，测试拿它当裁判。
type OfficialItem = { _text: string | null };

describe("list item text", () => {
	it.each([
		["a continuation line", "* 一\n接着写\n* 二"],
		["a line comment inside", "* 一\n// 注\n接着写\n* 二"],
		[
			"a continuation then an attached block",
			"* 一\n接着写\n+\n----\nx\n----\n* 二",
		],
		["a continuation then a nested list", "* 一\n接着写\n** 子\n* 二"],
		["an adjacent delimited block", "* 一\n****\n旁注\n****\n* 二"],
		["an adjacent attribute line", "* 一\n[.role]\n接着写\n* 二"],
		["an adjacent anchor line", "* 一\n[[k]]\n接着写\n* 二"],
		["an adjacent title-like line", "* 一\n.标题\n接着写\n* 二"],
		["an indented continuation", "* 一\n  缩进的续行\n* 二"],
		["a blank line before the next item", "* 一\n\n* 二"],
		["an adjacent term", "* 一\n术语:: 解释\n* 二"],
		["an ordered list", ". 一\n接着写\n第三行\n. 二"],
		["callouts", "----\nx // <1>\ny // <2>\n----\n<1> 一\n接着写\n<2> 二"],
	])("covers the lines Asciidoctor folds into an item: %s", async (name, body) => {
		const source = `= 文\n\n== 节\n\n${body}\n\n后文。\n`;
		const lineTable = buildLineTable(source);
		const official = await createAsciidoctorFileAdapter().loadFile(
			writeFixture(`list-item-${name.replaceAll(" ", "-")}.adoc`, source),
		);
		completeOfficialSourceLocations(official, lineTable);
		const items = walkOfficialBlocks(official).filter(
			(surface) =>
				surface.context === "list_item" && surface.parent?.context !== "dlist",
		);

		expect(items.length).toBeGreaterThan(1);
		for (const item of items) {
			const span = resolveSourceInterval(item, lineTable)?.contentSpan;
			const read: string[] = [];
			for (
				let line = span?.startLine ?? 0;
				line <= (span?.endLine ?? -1);
				line += 1
			) {
				const text = lineText(lineTable, line);
				// 行注释与紧挨着的锚点行、属性行，官方读掉而不并进条目。
				if (
					!(text.startsWith("//") && !text.startsWith("///")) &&
					!/^\[.*\]$/u.test(text)
				) {
					read.push(text.trim());
				}
			}
			read[0] = read[0]?.replace(/^(?:\*+|\.+|<\d+>)\s+/u, "") ?? "";
			const folded = ((item.block as unknown as OfficialItem)._text ?? "")
				.split("\n")
				.map((line) => line.trim());

			expect(read).toEqual(folded);
		}
	});

	it("leaves the terms and descriptions of a description list on the term line", async () => {
		const document = await parseAbundantTree({
			sourcePath: writeFixture(
				"list-item-dlist.adoc",
				"= 文\n\n== 节\n\n正文。\n\n术语:: 解释\n续行 xref:x[X]\n下一个:: 二\n",
			),
		});
		const lists: AbundantNode[] = [];
		const visit = (node: AbundantNode) => {
			if (node.kind === "descriptionList") {
				lists.push(node);
			}
			for (const child of "children" in node ? (node.children ?? []) : []) {
				visit(child as AbundantNode);
			}
		};
		document.children.forEach(visit);
		const [list] = lists as DescriptionListNode[];

		expect(
			list?.items.map((item) => [
				item.terms[0]?.source?.span,
				item.description?.source?.span,
			]),
		).toEqual([
			[
				{ startLine: 7, endLine: 7 },
				{ startLine: 7, endLine: 7 },
			],
			[
				{ startLine: 9, endLine: 9 },
				{ startLine: 9, endLine: 9 },
			],
		]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([["x", 8]]);
	});

	it("scans the continuation lines of an item", async () => {
		const document = await parseAbundantTree({
			sourcePath: writeFixture(
				"list-item-continuation-xref.adoc",
				"= 文\n\n== 节\n\n. 第一条\n接着写 xref:target[目标]。\n. 第二条\n\n[#target]\n== 目标\n",
			),
		});

		expect(document.toolDiagnostics).toEqual([]);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.sourceSpan?.start.line,
				xref.scope,
			]),
		).toEqual([["target", 6, "local"]]);
	});
});
