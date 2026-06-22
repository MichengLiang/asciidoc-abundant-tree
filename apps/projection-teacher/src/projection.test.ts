import { parseAbundantTreeFromSource } from "asciidoc-abundant-tree/browser";
import { describe, expect, it } from "vitest";
import {
	projectTeachingGraph,
	projectTeachingGraphFromDocument,
} from "./projection";
import { SAMPLE_SOURCE } from "./sample";

const fixture = `= 浏览器解析夹具

[#source.policy, status=active, owner=docs]
== 来源节点

priority:: high
summary::
来源节点说明第一行。
来源节点说明第二行。

来源节点引用 xref:target.rule[目标节点, rel=requires, weight=0.7]。

[#target.rule, status=draft]
== 目标节点

[#target-json]
[source,json]
----
{"kind":"rule","status":"draft"}
----
`;

describe("projection teacher document projection", () => {
	it("projects AbundantDocument sections, metadata, xrefs, and source spans", () => {
		const document = parseAbundantTreeFromSource({
			sourceText: fixture,
			sourcePath: "fixture.adoc",
		});

		const projection = projectTeachingGraphFromDocument(document);
		const sourceNode = projection.nodes.find(
			(node) => node.title === "来源节点",
		);
		const targetNode = projection.nodes.find(
			(node) => node.title === "目标节点",
		);
		const edge = projection.edges.find(
			(edge) =>
				edge.source === sourceNode?.id && edge.target === targetNode?.id,
		);

		expect(projection.diagnostics).toEqual([]);
		expect(sourceNode).toEqual(
			expect.objectContaining({
				id: "source",
				role: "policy",
				fields: expect.arrayContaining([
					{ key: "status", value: "active" },
					{ key: "owner", value: "docs" },
					{ key: "priority", value: "high" },
					{
						key: "summary",
						value: "来源节点说明第一行。\n来源节点说明第二行。",
					},
				]),
			}),
		);
		expect(targetNode).toEqual(
			expect.objectContaining({
				id: "target",
				role: "rule",
			}),
		);
		expect(edge).toEqual(
			expect.objectContaining({
				rel: "requires",
				title: "要求",
				sourceSpan: expect.objectContaining({
					start: expect.objectContaining({ line: 11 }),
				}),
				fields: expect.arrayContaining([{ key: "weight", value: "0.7" }]),
			}),
		);
		expect(edge?.fields).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "rel" }),
				expect.objectContaining({ key: "sourceLine" }),
				expect.objectContaining({ key: "sourceColumn" }),
			]),
		);
	});

	it("keeps the sourceText convenience wrapper on the main parser path", () => {
		const projection = projectTeachingGraph(fixture);

		expect(projection.nodes.map((node) => node.title)).toEqual(
			expect.arrayContaining(["来源节点", "目标节点"]),
		);
		expect(projection.edges).toEqual([
			expect.objectContaining({
				source: "source",
				target: "target",
				rel: "requires",
			}),
		]);
		expect(projection.diagnostics).toEqual([]);
	});

	it("keeps internal parser warnings out of the user-visible diagnostic strip", () => {
		const projection = projectTeachingGraph(SAMPLE_SOURCE);

		expect(projection.internalDiagnostics).toEqual(
			expect.arrayContaining([
				expect.stringContaining("official-block-context.unknown"),
			]),
		);
		expect(projection.diagnostics).not.toEqual(
			expect.arrayContaining([
				expect.stringContaining("official-block-context.unknown"),
			]),
		);
	});
});
