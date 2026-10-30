import { describe, expect, it } from "vitest";
import type { SectionNode } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { fieldPredicate } from "../../src/rdf12-projection/field-predicate";
import type { Rdf12Graph } from "../../src/rdf12-projection/graph";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { writeFixture } from "../helpers";
import {
	aatTerm,
	expectLiteralValue,
	labelOwners,
	literalValues,
	resourcesOfType,
} from "./helpers/graph-matchers";

const projectRoot = process.cwd();

// 06 号书第 2 章「身份」「地址与 Label 空间」：标题的 IRI 由投影器按 documentOrder 起，作者写的地址都是图上的标签，
// selector 按整串相等绑定到拥有这个标签的标题。
const cookbook = `= 家常菜谱
:dish: 红烧肉

== {dish}

=== 火候

== 清蒸鲈鱼

=== 火候

== It's A & B -- C

== \`book.adoc\` 的职责

== Source

== 附录

[#关闭对象甲]
=== 关闭对象

=== 关闭对象

=== 关闭对象

== std::vector

== 引用

见 xref:红烧肉::火候[]、xref:火候[]、<<It's A & B -- C>>、xref:Source[]、xref:std::vector[] 与 xref:\`book.adoc\` 的职责[]。

[.temperature-profile, for=红烧肉::火候]
[source,json]
----
{"temperature": "low"}
----
`;

async function project(name: string, source: string) {
	const path = writeFixture(name, source);
	const document = await parseAbundantTree({ sourcePath: path });
	return {
		document,
		projection: projectAbundantDocumentToRdf12(document, {
			documentRoot: projectRoot,
		}),
	};
}

function cookbookProjection() {
	return project("rdf12-heading-address.adoc", cookbook);
}

function owners(projection: { graph: Rdf12Graph }, selector: string) {
	return labelOwners(projection.graph, selector)
		.map((owner) => owner.value)
		.toSorted();
}

function only(projection: { graph: Rdf12Graph }, selector: string) {
	const [owner, ...rest] = labelOwners(projection.graph, selector);
	if (owner === undefined || rest.length > 0) {
		throw new Error(`expected exactly one owner of ${selector}`);
	}
	return owner;
}

describe("rdf12 heading identity and labels", () => {
	it("names every heading <document IRI>#heading-<documentOrder> and writes no aat:name", async () => {
		const { projection } = await cookbookProjection();
		const headings = resourcesOfType(projection.graph, aatTerm("Heading"));

		expect(headings).toHaveLength(14);
		for (const node of headings) {
			const [order] = literalValues(
				projection.graph,
				node,
				aatTerm("documentOrder"),
			);
			expect(node.value).toBe(`${projection.documentIri}#heading-${order}`);
		}
		expect(projection.graph.match({ predicate: aatTerm("name") })).toEqual([]);
	});

	it("writes every address path of two or more segments as aat:addressPath", async () => {
		const { projection } = await cookbookProjection();
		const porkHeat = only(projection, "红烧肉::火候");

		expect(
			literalValues(
				projection.graph,
				porkHeat,
				aatTerm("addressPath"),
			).toSorted(),
		).toEqual(["家常菜谱::红烧肉::火候", "红烧肉::火候"].toSorted());
		expect(owners(projection, "火候")).toEqual(
			[porkHeat.value, only(projection, "清蒸鲈鱼::火候").value].toSorted(),
		);
	});

	it("takes headlines from the source text, with attribute references expanded", async () => {
		const { document, projection } = await cookbookProjection();
		const titles = document.children
			.filter((node): node is SectionNode => node.kind === "section")
			.map((section) => section.title);

		expect(titles).toContain("红烧肉");
		expect(titles).toContain("It's A & B -- C");
		expect(titles).toContain("`book.adoc` 的职责");
		expect(document.title?.text).toBe("家常菜谱");
		expectLiteralValue(
			projection.graph,
			only(projection, "It's A & B -- C"),
			aatTerm("headline"),
			"It's A & B -- C",
		);
	});

	it("binds selectors to the heading that owns the same label on the graph", async () => {
		const { projection } = await cookbookProjection();
		const targets = new Map(
			projection.graph
				.match({ predicate: aatTerm("targetHeading") })
				.map((triple) => [
					literalValues(
						projection.graph,
						triple.subject,
						aatTerm("targetSelector"),
					)[0],
					triple.object.termType === "iri" ? triple.object.value : "",
				]),
		);

		for (const selector of [
			"红烧肉::火候",
			"It's A & B -- C",
			"Source",
			"std::vector",
		]) {
			expect(targets.get(selector)).toBe(only(projection, selector).value);
		}
	});

	it("keeps a heading called Source apart from the projection's source resource", async () => {
		const { projection } = await cookbookProjection();

		expect(only(projection, "Source").value).not.toBe(
			projection.sourceDocumentIri,
		);
		expect(projection.sourceDocumentIri).toBe(
			`${projection.documentIri}#source`,
		);
	});

	it("binds a heading complex property selector written as a qualified path", async () => {
		const { projection } = await cookbookProjection();

		const [value] = projection.graph.match({
			subject: only(projection, "红烧肉::火候"),
			predicate: fieldPredicate("temperature-profile"),
		});

		expect(value?.object.termType).toBe("iri");
		if (value?.object.termType === "iri") {
			expectLiteralValue(
				projection.graph,
				value.object,
				aatTerm("forSelector"),
				"红烧肉::火候",
			);
		}
	});

	it("names the document by its readable relative path", async () => {
		const { projection } = await cookbookProjection();

		expect(projection.documentIri).toBe(
			"urn:aat:doc:tmp/test-fixtures/rdf12-heading-address.adoc",
		);
	});

	it("keeps a heading whose headline is empty, together with the xrefs it contains", async () => {
		// 标题原文展开后为空时，它没有 headline 标签，但仍是一个标题节点；按地址起名时它曾因取不到名字而整节消失。
		const { projection } = await project(
			"rdf12-empty-headline.adoc",
			`= 书
:empty:

== {empty}

见 xref:另一节[]。

== 另一节
`,
		);
		const empty = `${projection.documentIri}#heading-2`;
		const headingIris = resourcesOfType(
			projection.graph,
			aatTerm("Heading"),
		).map((node) => node.value);

		expect(headingIris).toContain(empty);
		expect(
			literalValues(
				projection.graph,
				{ termType: "iri", value: empty },
				aatTerm("headline"),
			),
		).toEqual([""]);
		const [edge] = projection.graph.match({
			predicate: aatTerm("sourceHeading"),
		});
		expect(edge?.object.value).toBe(empty);
	});
});
