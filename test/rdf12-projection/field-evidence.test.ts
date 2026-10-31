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

[preface]
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
			// [preface] 写在 book.adoc 里，修饰 include 进来的标题：证据指向它写下的那一行。
			{
				fieldName: "style",
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
