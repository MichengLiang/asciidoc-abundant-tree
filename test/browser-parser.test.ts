import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAbundantTreeFromSource } from "../src/browser";

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

describe("browser source parser", () => {
	it("parses sourceText into an AbundantDocument with core consumer fields", () => {
		const document = parseAbundantTreeFromSource({
			sourceText: fixture,
			sourcePath: "fixture.adoc",
		});
		const sections = document.children.filter(
			(node) => node.kind === "section",
		);
		const sourceSection = sections.find(
			(section) => section.title === "来源节点",
		);
		const targetSection = sections.find(
			(section) => section.title === "目标节点",
		);
		const xref = document.xrefOccurrences[0];

		expect(document.kind).toBe("document");
		expect(document.mode).toBe("single-file");
		expect(document.sourcePath).toBe("fixture.adoc");
		expect(document.sourceText).toBe(fixture);
		expect(document.title?.text).toBe("浏览器解析夹具");
		expect(document.parser).toEqual({
			name: "@asciidoctor/core",
			version: expect.any(String),
		});
		expect(document.parser.version.length).toBeGreaterThan(0);
		expect(sections.length).toBeGreaterThanOrEqual(2);
		expect(sourceSection).toEqual(
			expect.objectContaining({
				ids: ["source"],
				idOrigin: "source",
				title: "来源节点",
				source: expect.objectContaining({
					sourceSpan: expect.objectContaining({
						start: expect.objectContaining({ line: 3 }),
					}),
				}),
			}),
		);
		expect(sourceSection?.metadata).toEqual([
			expect.objectContaining({
				ids: ["source"],
				roles: ["policy"],
				attributes: { status: "active", owner: "docs" },
			}),
		]);
		expect(sourceSection?.descriptionMetadata?.fields).toEqual({
			priority: "high",
			summary: "来源节点说明第一行。\n来源节点说明第二行。",
		});
		expect(targetSection).toEqual(
			expect.objectContaining({
				ids: ["target"],
				metadata: [
					expect.objectContaining({
						ids: ["target"],
						roles: ["rule"],
						attributes: { status: "draft" },
					}),
				],
			}),
		);
		expect(xref).toEqual(
			expect.objectContaining({
				raw: "xref:target.rule[目标节点, rel=requires, weight=0.7]",
				target: "target.rule",
				label: "目标节点",
				attributes: { rel: "requires", weight: "0.7" },
				containingSectionId: "source",
				sourceSpan: expect.objectContaining({
					start: expect.objectContaining({ line: 11 }),
				}),
			}),
		);
		expect(document.targets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "source",
					targetType: "section",
					sourceSpan: expect.any(Object),
				}),
				expect.objectContaining({
					id: "target",
					targetType: "section",
					sourceSpan: expect.any(Object),
				}),
				expect.objectContaining({
					id: "target-json",
					targetType: "listing",
					sourceSpan: expect.any(Object),
				}),
			]),
		);
	});

	it("uses a stable virtual source identity by default", () => {
		const document = parseAbundantTreeFromSource({ sourceText: fixture });

		expect(document.sourcePath).toBe("document.adoc");
	});

	it("keeps the browser entry and browser identity source free of node imports", () => {
		const browserSources = [
			"src/browser.ts",
			"src/browser-parser.ts",
			"src/source-identity-browser.ts",
		].map((path) => readFileSync(path, "utf8"));

		for (const source of browserSources) {
			expect(source).not.toMatch(/from\s+["']node:/u);
			expect(source).not.toMatch(/import\s+["']node:/u);
		}
	});
});
