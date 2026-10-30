import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Html5Converter, load } from "@asciidoctor/core";
import { describe, expect, it } from "vitest";
import { parseAbundantTreeFromSource } from "../src/browser-parser";
import type { AbundantDocument, XrefOccurrenceNode } from "../src/model";
import { parseAbundantTree } from "../src/parser";
import { namespaces } from "../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../src/rdf12-projection/projector";
import { iriTerm } from "../src/rdf12-projection/terms";
import { writeFixture } from "./helpers";

// xref 由官方认定（09 号书第 7 章《Xref 由官方认定》）：每个样例都与官方完整转换时接到的 xref 条数对照。
describe("xrefs recognized by the official conversion", () => {
	it("collects xref macros whose target has spaces, as Asciidoctor does (issue 018)", async () => {
		const source = [
			"= T",
			"",
			"== role 的作用域",
			"",
			"== 另一节",
			"",
			"见 xref:role 的作用域[]。",
			"",
			"也见 xref:role 的作用域[作用域一节]。",
			"",
			"还有 <<role 的作用域>>。",
		].join("\n");
		const document = await parse(source);

		expect(document.xrefOccurrences.map(summary)).toEqual([
			["xref:role 的作用域[]", 7, "role 的作用域", "#_role_的作用域"],
			["xref:role 的作用域[作用域一节]", 9, "role 的作用域", "#_role_的作用域"],
			["<<role 的作用域>>", 11, "role 的作用域", "#_role_的作用域"],
		]);
		expect(document.xrefOccurrences[1]?.sourceSpan).toEqual({
			start: { line: 9, column: 4 },
			end: { line: 9, column: 25 },
		});
		expect(document.xrefOccurrences).toHaveLength(
			await officialXrefCount(source),
		);
	});

	it("does not collect xrefs inside passthroughs, and keeps the ones beside them (issue 020)", async () => {
		const source = [
			"= T",
			"",
			"== 标题",
			"",
			"写法：`pass:[xref:标题[显示文本]]` 与 pass:q[xref:标题[q]] 之后 xref:标题[真的]。",
			"",
			"+++xref:标题[三加号]+++ 与 $$xref:标题[美元]$$ 与 `+xref:标题[加号]+` 与 +xref:标题[单加号]+。",
			"",
			"|===",
			"|写法",
			"|`pass:[xref:标题[显示文本, rel=depends-on]]`",
			"|===",
		].join("\n");
		const document = await parse(source);

		expect(document.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"xref:标题[真的]",
		]);
		expect(document.xrefOccurrences).toHaveLength(
			await officialXrefCount(source),
		);
	});

	it("reads a leading # as a fragment of this document (issue 021)", async () => {
		const source = [
			"= T",
			"",
			"[#body-map]",
			"== 正文结构地图",
			"",
			"见 xref:#body-map[正文结构地图] 与 <<#body-map>>，另见 xref:other.adoc#body-map[别处]。",
		].join("\n");
		const document = await parse(source);

		expect(document.xrefOccurrences.map(summary)).toEqual([
			["xref:#body-map[正文结构地图]", 6, "body-map", "#body-map"],
			["<<#body-map>>", 6, "body-map", "#body-map"],
			["xref:other.adoc#body-map[别处]", 6, "body-map", "other.html#body-map"],
		]);
		expect(document.xrefOccurrences.map((xref) => xref.document)).toEqual([
			undefined,
			undefined,
			"other.adoc",
		]);
		const projection = projectAbundantDocumentToRdf12(document, {
			documentRoot: process.cwd(),
		});
		expect(
			projection.graph.match({
				predicate: iriTerm(`${namespaces.aat}targetHeading`),
			}),
		).toHaveLength(2);
	});

	it("expands attribute references in targets with the value at that position (issue 022)", async () => {
		const source = [
			"= T",
			":other: other.adoc",
			":sec: 早先",
			"",
			"== 目标节",
			"",
			"见 xref:{other}#目标章节[] 与 xref:{nope}[]。",
			"",
			":sec: 目标节",
			"再见 xref:{sec}[]。",
		].join("\n");
		const document = await parse(source);

		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.document,
				xref.selector,
				xref.asciidoctor?.href,
			]),
		).toEqual([
			["{other}#目标章节", "other.adoc", "目标章节", "other.html#目标章节"],
			// 属性没有定义时按 attribute-missing: skip 原样留下，与官方相同。
			["{nope}", undefined, "{nope}", "#{nope}"],
			["{sec}", undefined, "目标节", "#目标节"],
		]);
		expect(document.xrefOccurrences).toHaveLength(
			await officialXrefCount(source),
		);
	});

	it("follows the official reading of escapes, extensionless documents and the single-plus passthrough", async () => {
		const source = [
			"= T",
			"",
			"[#a]",
			"== A",
			"",
			"转义 \\xref:a[] 与 \\<<a>>，无后缀 xref:other#x[别处]，单加号 +xref:a[]+。",
		].join("\n");
		const document = await parse(source);

		expect(
			document.xrefOccurrences.map((xref) => [
				xref.raw,
				xref.scope,
				xref.document,
				xref.selector,
			]),
		).toEqual([["xref:other#x[别处]", "external", "other", "x"]]);
		expect(document.xrefOccurrences).toHaveLength(
			await officialXrefCount(source),
		);
	});

	it("keeps a constrained passthrough from forming across a probed xref", async () => {
		// 闭合的 + 后面原本是 x（单词字符），官方不认这段透传，两个 xref 都是链接。
		const source =
			"= T\n\n[#a]\n== A\n\n前 +xref:a[] b+xref:a[] 后 *粗*xref:a[]。\n";
		const document = await parse(source);

		expect(document.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"xref:a[]",
			"xref:a[]",
			"xref:a[]",
		]);
		expect(document.xrefOccurrences).toHaveLength(
			await officialXrefCount(source),
		);
	});

	it("reports an xref expanded from an attribute value instead of inventing a source position", async () => {
		const document = await parse(
			"= T\n:ref: xref:a[]\n\n[#a]\n== A\n\n见 {ref}。\n",
		);

		expect(document.xrefOccurrences).toEqual([]);
		expect(document.toolDiagnostics).toEqual([
			expect.objectContaining({
				level: "warning",
				code: "xref.without-source",
				source: expect.objectContaining({ start: { line: 7, column: 1 } }),
			}),
		]);
	});

	it("splits labels and named attributes the way Asciidoctor does, keeping the written values", async () => {
		const document = await parse(
			[
				"= T",
				"",
				"[#a]",
				"== A",
				"",
				"见 xref:a[Label,,flag,empty=] 与 xref:a[label with = sign] 与 xref:a[rel=is, weight=0.8, 改动=a--b] 与 <<a, Trimmed >>。",
			].join("\n"),
		);

		expect(
			document.xrefOccurrences.map((xref) => [xref.label, xref.attributes]),
		).toEqual([
			["Label", { empty: "" }],
			["label with = sign", undefined],
			[undefined, { rel: "is", weight: "0.8", 改动: "a--b" }],
			["Trimmed ", undefined],
		]);
	});

	it("collects xrefs only from cells whose text Asciidoctor substitutes, and from the document title", async () => {
		const source = [
			"= 书 xref:a[封面]",
			"",
			"[#a]",
			"== A",
			"",
			'[cols="1,1l"]',
			"|===",
			"|xref:a[普通] |xref:a[字面]",
			"|===",
		].join("\n");
		const document = await parse(source);

		expect(document.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"xref:a[封面]",
			"xref:a[普通]",
		]);
		expect(document.xrefOccurrences).toHaveLength(
			await officialXrefCount(source),
		);
	});

	it("reads a reference to the document itself as local, as Asciidoctor does for the file", async () => {
		const document = await parseAbundantTreeFromSource({
			sourceText: "= T\n\n[#a]\n== A\n\n见 xref:self.adoc#a[自己]。\n",
			sourcePath: "docs/self.adoc",
		});

		expect(
			document.xrefOccurrences.map((xref) => [
				xref.scope,
				xref.document,
				xref.selector,
				xref.asciidoctor?.href,
			]),
		).toEqual([["local", undefined, "a", "#a"]]);
	});

	it("keeps identical xrefs written at the same place in different included files", async () => {
		const book = writeBook("same-place", {
			"book.adoc": [
				"= 书",
				"",
				"[#ledger]",
				"== 台账",
				"",
				"include::a.adoc[]",
				"",
				"include::b.adoc[]",
				"",
			].join("\n"),
			"a.adoc": "== 甲\n\n* 已写入 xref:ledger[台账]。\n",
			"b.adoc": "== 乙\n\n* 已写入 xref:ledger[台账]。\n",
		});
		const document = await parseAbundantTree({
			sourcePath: book,
			mode: "book-entry",
			documentRoot: dirname(book),
		});

		expect(
			document.xrefOccurrences.map((xref) => [
				xref.source?.relativePath,
				xref.sourceSpan?.start.line,
			]),
		).toEqual([
			["a.adoc", 3],
			["b.adoc", 3],
		]);
	});
});

function parse(sourceText: string): Promise<AbundantDocument> {
	return parseAbundantTreeFromSource({ sourceText });
}

function summary(xref: XrefOccurrenceNode) {
	return [
		xref.raw,
		xref.sourceSpan?.start.line,
		xref.selector,
		xref.asciidoctor?.href,
	];
}

async function officialXrefCount(sourceText: string): Promise<number> {
	let count = 0;
	class Counting extends Html5Converter {
		override async convert_inline_anchor(node: { getType(): string | null }) {
			if (node.getType() === "xref") {
				count += 1;
			}
			return super.convert_inline_anchor(node);
		}
	}
	const document = await load(sourceText, {
		safe: "secure",
		converter: Counting,
	});
	await document.convert();
	return count;
}

function writeBook(name: string, files: Record<string, string>): string {
	const root = join(
		dirname(writeFixture(`xref-${name}.marker`, "")),
		`xref-${name}`,
	);
	mkdirSync(root, { recursive: true });
	for (const [file, text] of Object.entries(files)) {
		writeFileSync(join(root, file), text, "utf8");
	}
	return join(root, "book.adoc");
}
