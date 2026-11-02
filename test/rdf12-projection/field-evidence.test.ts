import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../../src/parser";
import { fieldPredicate } from "../../src/rdf12-projection/field-predicate";
import type {
	Rdf12Graph,
	Rdf12IriTerm,
	Rdf12Triple,
} from "../../src/rdf12-projection/graph";
import { stringLiteral } from "../../src/rdf12-projection/literals";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { writeFixture } from "../helpers";
import {
	aatTerm,
	literalValues,
	rdfTerm,
	resourcesOfType,
} from "./helpers/graph-matchers";

// 06 号书第 6 章「字段证据」：每个标题字段一个证据，reify 字段三元组，交出原名、写法、标题内的顺序与回源坐标。
// 文档标题也是一个 aat:Heading（documentOrder 1），所以第一节是 heading-2。

type Evidence = {
	readonly local: string;
	readonly triple: Rdf12Triple;
	readonly fieldName: string;
	readonly surface: string;
	readonly fieldOrder: number;
	readonly relativePath?: string;
	readonly startLine?: number;
};

describe("rdf12 field evidence", () => {
	it("gives each heading field written in attrlist, description list or hmeta its own evidence", async () => {
		const { graph, documentIri } = await projectSingle(`= Probe

[.dish, 难度=中]
== 红烧肉

主料:: 五花肉一斤
用时:: 一个半小时

收汁 hmeta:火候[大火].
`);
		const heading = headingIri(documentIri, 2);

		expect(evidenceOf(graph)).toEqual([
			{
				local: "field-evidence-2-0",
				triple: fieldTriple(heading, "难度", "中"),
				fieldName: "难度",
				surface: "attrlist",
				fieldOrder: 0,
				relativePath: expect.any(String),
				startLine: 3,
			},
			{
				local: "field-evidence-2-1",
				triple: fieldTriple(heading, "主料", "五花肉一斤"),
				fieldName: "主料",
				surface: "description-list",
				fieldOrder: 1,
				relativePath: expect.any(String),
				startLine: 6,
			},
			{
				local: "field-evidence-2-2",
				triple: fieldTriple(heading, "用时", "一个半小时"),
				fieldName: "用时",
				surface: "description-list",
				fieldOrder: 2,
				relativePath: expect.any(String),
				startLine: 7,
			},
			{
				local: "field-evidence-2-3",
				triple: fieldTriple(heading, "火候", "大火"),
				fieldName: "火候",
				surface: "heading-inline",
				fieldOrder: 3,
				relativePath: expect.any(String),
				startLine: 9,
			},
		]);
	});

	it("keeps the name as written while the predicate is its transliteration", async () => {
		const { graph, documentIri } = await projectSingle(`= Probe

== 面板

dockview 适配:: 照旧
`);

		const [evidence] = evidenceOf(graph);
		expect(evidence?.fieldName).toBe("dockview 适配");
		expect(evidence?.triple).toEqual(
			fieldTriple(headingIri(documentIri, 2), "dockview 适配", "照旧"),
		);
		expect(fieldPredicate("dockview 适配").value).toContain("dockview%20");
	});

	it("gives a name and value written twice one triple and two evidences", async () => {
		const { graph, documentIri } = await projectSingle(`= Probe

[.dish, 难度=中]
== 红烧肉

难度:: 中
`);
		const triple = fieldTriple(headingIri(documentIri, 2), "难度", "中");

		expect(graph.match(triple)).toHaveLength(1);
		expect(
			evidenceOf(graph).map(({ local, surface, triple }) => ({
				local,
				surface,
				triple,
			})),
		).toEqual([
			{ local: "field-evidence-2-0", surface: "attrlist", triple },
			{ local: "field-evidence-2-1", surface: "description-list", triple },
		]);
	});

	it("gives role, complex properties and xref fields no evidence", async () => {
		const { graph } = await projectSingle(`= Probe

[#target]
== 目标

[.dish]
== 红烧肉

见 xref:target[目标, rel=depends-on, weight=0.8]。

[.risk-profile, for]
[source,yaml]
----
level: high
----
`);

		expect(evidenceOf(graph)).toEqual([]);
	});

	it("points evidence at the file each field is written in under book-entry", async () => {
		const root = mkdtempSync(join(tmpdir(), "aat-field-evidence-"));
		write(
			root,
			"book.adoc",
			`= 菜谱
:doctype: book

[preface, 来源=自序]
include::front.adoc[]

include::chapters/dishes.adoc[]
`,
		);
		write(root, "front.adoc", "== 前言\n\n写在前面。\n");
		write(
			root,
			"chapters/dishes.adoc",
			`= 菜

[.dish, 难度=中]
== 红烧肉

主料:: 五花肉一斤
`,
		);
		const document = await parseAbundantTree({
			sourcePath: join(root, "book.adoc"),
			mode: "book-entry",
			documentRoot: root,
		});
		const projection = projectAbundantDocumentToRdf12(document, {
			documentRoot: root,
		});

		expect(
			evidenceOf(projection.graph).map(
				({ fieldName, surface, relativePath, startLine }) => ({
					fieldName,
					surface,
					relativePath,
					startLine,
				}),
			),
		).toEqual([
			// [preface, 来源=自序] 写在 book.adoc 里，修饰 include 进来的标题：证据指向它写下的那一行。preface 是位置属性，
			// 不是字段，没有证据（#031）。
			{
				fieldName: "来源",
				surface: "attrlist",
				relativePath: "book.adoc",
				startLine: 4,
			},
			{
				fieldName: "难度",
				surface: "attrlist",
				relativePath: "chapters/dishes.adoc",
				startLine: 3,
			},
			{
				fieldName: "主料",
				surface: "description-list",
				relativePath: "chapters/dishes.adoc",
				startLine: 6,
			},
		]);
	});

	it("does not turn positional attributes into fields (#031)", async () => {
		const { graph, documentIri } = await projectSingle(`= Probe
:doctype: book

[preface]
== 前言

[.dish, style=炖]
== 红烧肉

[.dish, for]
== 甲

== 乙

[source.配方,json,for]
----
{"a": 1}
----
`);
		const fieldsOf = (documentOrder: number) =>
			graph
				.match({ subject: headingIri(documentIri, documentOrder) })
				.filter((triple) =>
					triple.predicate.value.startsWith(fieldPredicate("").value),
				)
				.map((triple) =>
					triple.predicate.value.slice(fieldPredicate("").value.length),
				);

		// [preface] 的 preface、[.dish, for] 的 for 是位置属性，作者没写 style、for 这样的名字；style=炖 是命名属性。
		expect(fieldsOf(2)).toEqual([]);
		expect(fieldsOf(3)).toEqual(["style"]);
		expect(fieldsOf(4)).toEqual([]);
		expect(evidenceOf(graph).map(({ fieldName }) => fieldName)).toEqual([
			"style",
		]);
		// 无值 for 照旧让 source value block 成为它所在标题的 complex property，格式取位置属性推出的 language。
		expect(fieldsOf(5)).toEqual(["配方"]);
		const [rawValue] = graph.match({
			subject: headingIri(documentIri, 5),
			predicate: fieldPredicate("配方"),
		});
		expect(
			rawValue?.object.termType === "iri"
				? literalValues(graph, rawValue.object, aatTerm("format"))
				: [],
		).toEqual(["json"]);
	});
});

async function projectSingle(
	source: string,
): Promise<{ graph: Rdf12Graph; documentIri: string }> {
	const path = writeFixture("rdf12-field-evidence.adoc", source);
	const projection = projectAbundantDocumentToRdf12(
		await parseAbundantTree({ sourcePath: path }),
		{ documentRoot: dirname(path) },
	);
	return { graph: projection.graph, documentIri: projection.documentIri };
}

function write(root: string, relativePath: string, text: string): void {
	const path = join(root, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text, "utf8");
}

function headingIri(documentIri: string, documentOrder: number): Rdf12IriTerm {
	return { termType: "iri", value: `${documentIri}#heading-${documentOrder}` };
}

function fieldTriple(
	heading: Rdf12IriTerm,
	name: string,
	value: string,
): Rdf12Triple {
	return {
		subject: heading,
		predicate: fieldPredicate(name),
		object: stringLiteral(value),
	};
}

// 按 aat:fieldOrder 排的证据，每个只读出断言要的几样；坐标缺时不出现。
function evidenceOf(graph: Rdf12Graph): Evidence[] {
	return resourcesOfType(graph, aatTerm("FieldEvidence"))
		.map((evidence) => {
			const reified = graph.match({
				subject: evidence,
				predicate: rdfTerm("reifies"),
			});
			expect(reified).toHaveLength(1);
			const object = reified[0]?.object;
			if (object?.termType !== "triple") {
				throw new Error(`${evidence.value} does not reify a triple term`);
			}
			const relativePath = literalValues(
				graph,
				evidence,
				aatTerm("relativePath"),
			)[0];
			const startLine = literalValues(graph, evidence, aatTerm("startLine"))[0];
			return {
				local: evidence.value.slice(evidence.value.indexOf("#") + 1),
				triple: object.value,
				fieldName: only(literalValues(graph, evidence, aatTerm("fieldName"))),
				surface: only(literalValues(graph, evidence, aatTerm("surface"))),
				fieldOrder: Number(
					only(literalValues(graph, evidence, aatTerm("fieldOrder"))),
				),
				...(relativePath === undefined ? {} : { relativePath }),
				...(startLine === undefined ? {} : { startLine: Number(startLine) }),
			};
		})
		.toSorted((left, right) => left.local.localeCompare(right.local));
}

function only(values: string[]): string {
	expect(values).toHaveLength(1);
	return values[0] ?? "";
}
