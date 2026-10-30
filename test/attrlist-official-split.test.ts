import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { rdf12 } from "../src/index";
import type { MetadataNode, SectionNode } from "../src/model";
import { parseAbundantTree } from "../src/parser";
import { namespaces } from "../src/rdf12-projection/namespaces";
import { writeFixture } from "./helpers";

// attrlist 怎样拆由官方定（09 号书第 8 章 Metadata Attachment；asciidoc-abundant-tree#028）：名字不合官方属性名规则
// 的整段是位置属性，不是命名属性，也就不成为字段；引号里的逗号不切开值。
describe("attrlist split by Asciidoctor", () => {
	it("makes only the attributes Asciidoctor names into fields", async () => {
		const path = writeFixture(
			"attrlist-official-split.adoc",
			`= T

[.dish, 难度=中, 葱、姜=多, a.b=1, 用-时=4, 备注="先焯水, 再炖"]
== 糖醋排骨

正文
`,
		);
		const document = await parseAbundantTree({ sourcePath: path });
		const section = document.children.find(
			(node): node is SectionNode => node.kind === "section",
		);
		const attrlist = section?.metadata?.find(
			(item): item is MetadataNode => item.metadataKind === "attrlist",
		);

		expect(attrlist?.roles).toEqual(["dish"]);
		expect(attrlist?.attributes).toEqual({
			难度: "中",
			"用-时": "4",
			备注: "先焯水, 再炖",
		});

		const { graph } = rdf12(document, { documentRoot: dirname(path) });
		const fields = graph
			.toArray()
			.filter((triple) => triple.predicate.value.startsWith(namespaces.field))
			.map((triple) => [
				decodeURIComponent(
					triple.predicate.value.slice(namespaces.field.length),
				),
				triple.object.value,
			]);
		expect(fields.toSorted()).toEqual(
			[
				["难度", "中"],
				["用-时", "4"],
				["备注", "先焯水, 再炖"],
			].toSorted(),
		);
	});
});
