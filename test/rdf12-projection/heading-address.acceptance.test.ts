import { describe, expect, it } from "vitest";
import type { SectionNode } from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { fieldPredicate } from "../../src/rdf12-projection/field-predicate";
import { nameInIri } from "../../src/rdf12-projection/iri-name";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";
import { writeFixture } from "../helpers";
import {
	aatTerm,
	expectLiteralValue,
	literalValues,
	resourcesOfType,
} from "./helpers/graph-matchers";

const projectRoot = process.cwd();

// 06 号书第 2 章「身份」「地址与 Label 空间」：标题以地址命名，selector 按整串相等绑定到地址。
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

async function cookbookProjection() {
	const path = writeFixture("rdf12-heading-address.adoc", cookbook);
	const document = await parseAbundantTree({ sourcePath: path });
	return {
		document,
		projection: projectAbundantDocumentToRdf12(document, {
			documentRoot: projectRoot,
		}),
	};
}

function heading(namespace: string, name: string) {
	return iriTerm(`${namespace}${nameInIri(name)}`);
}

describe("rdf12 heading addresses and names", () => {
	it("names every heading after its shortest address and keeps the names distinct", async () => {
		const { projection } = await cookbookProjection();
		const names = resourcesOfType(projection.graph, aatTerm("Heading")).flatMap(
			(node) => literalValues(projection.graph, node, aatTerm("name")),
		);

		expect(names.toSorted()).toEqual(
			[
				"家常菜谱",
				"红烧肉",
				"红烧肉::火候",
				"清蒸鲈鱼",
				"清蒸鲈鱼::火候",
				"It's A & B -- C",
				"`book.adoc` 的职责",
				"Source",
				"附录",
				"关闭对象甲",
				"关闭对象-2",
				"关闭对象-3",
				"std::vector",
				"引用",
			].toSorted(),
		);
		for (const name of names) {
			expectLiteralValue(
				projection.graph,
				heading(projection.headingNamespace, name),
				aatTerm("name"),
				name,
			);
		}
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
			heading(projection.headingNamespace, "It's A & B -- C"),
			aatTerm("headline"),
			"It's A & B -- C",
		);
	});

	it("binds selectors written as headlines, qualified paths, and headlines that contain ::", async () => {
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
		const namespace = projection.headingNamespace;

		expect(targets.get("红烧肉::火候")).toBe(
			heading(namespace, "红烧肉::火候").value,
		);
		expect(targets.get("It's A & B -- C")).toBe(
			heading(namespace, "It's A & B -- C").value,
		);
		expect(targets.get("Source")).toBe(heading(namespace, "Source").value);
		expect(targets.get("std::vector")).toBe(
			heading(namespace, "std::vector").value,
		);
		expect(targets.has("火候")).toBe(false);
		const [bare] = projection.graph
			.match({ predicate: aatTerm("targetSelector") })
			.filter((triple) => triple.object.value === "火候");
		if (bare === undefined) {
			throw new Error("expected the bare xref:火候[] edge evidence");
		}
		expect(
			projection.graph
				.match({
					subject: bare.subject,
					predicate: aatTerm("candidateHeading"),
				})
				.map((triple) => triple.object.value)
				.toSorted(),
		).toEqual(
			[
				heading(namespace, "红烧肉::火候").value,
				heading(namespace, "清蒸鲈鱼::火候").value,
			].toSorted(),
		);
	});

	it("keeps a heading called Source apart from the projection's source resource", async () => {
		const { projection } = await cookbookProjection();

		expect(heading(projection.headingNamespace, "Source").value).not.toBe(
			projection.sourceDocumentIri,
		);
		expect(projection.sourceDocumentIri).toBe(
			`${projection.documentIri}/projection#source`,
		);
	});

	it("binds a heading complex property selector written as a qualified path", async () => {
		const { projection } = await cookbookProjection();

		const [value] = projection.graph.match({
			subject: heading(projection.headingNamespace, "红烧肉::火候"),
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
		expect(projection.headingNamespace).toBe(`${projection.documentIri}#`);
	});
});
