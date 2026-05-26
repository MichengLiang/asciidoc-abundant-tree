import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../src/parser";
import {
	formatAbundantTree,
	serializeAbundantTreeToJson,
} from "../src/serializers";

const projectRoot = new URL("..", import.meta.url).pathname;
const referencePath = join(projectRoot, "samples/reference-links.adoc");
const interdocumentPath = join(projectRoot, "samples/interdocument-xref.adoc");
const codeSurfaceAuditPath = join(
	projectRoot,
	"test/fixtures/code-surface-audit.adoc",
);
const generatedIdAuditPath = join(
	projectRoot,
	"test/fixtures/generated-id-audit.adoc",
);
const tableXrefAuditPath = join(
	projectRoot,
	"test/fixtures/table-xref-audit.adoc",
);
const blockAnchorAuditPath = join(
	projectRoot,
	"test/fixtures/block-anchor-audit.adoc",
);
const attrlistComplexAuditPath = join(
	projectRoot,
	"test/fixtures/attrlist-complex-audit.adoc",
);
const missingLocalXrefAuditPath = join(
	projectRoot,
	"test/fixtures/missing-local-xref-audit.adoc",
);
const tableSectionPollutionAuditPath = join(
	projectRoot,
	"test/fixtures/table-section-pollution-audit.adoc",
);
const paragraphIdAuditPath = join(
	projectRoot,
	"test/fixtures/paragraph-id-audit.adoc",
);

describe("parseAbundantTree", () => {
	it("recovers the reference sample document, targets, xrefs, anchors, listings, and tables", () => {
		const document = parseAbundantTree({ sourcePath: referencePath });

		expect(document.kind).toBe("document");
		expect(document.mode).toBe("single-file");
		expect(document.parser.name).toBe("@asciidoctor/core");
		expect(document.title?.text).toBe("宇宙探索器：AsciiDoc 交叉引用演示指南");

		expect(
			document.targets.map((target) => [
				target.id,
				target.targetType,
				target.idOrigin,
			]),
		).toEqual(
			expect.arrayContaining([
				["_1_引言", "section", "asciidoctor-generated"],
				["section-basics", "section", "source"],
				["_3_核心引擎设计", "section", "asciidoctor-generated"],
				["engine-code", "listing", "source"],
				["troubleshooting", "section", "source"],
				["perf-table", "table", "source"],
				["warning-text", "inline-anchor", "source"],
				["conclusion-section", "section", "source"],
			]),
		);

		expect(document.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"<<3. 核心引擎设计>>",
			"<<conclusion-section, 最终结论>>",
			"<<1. 引言>>",
			"<<engine-code, 代码清单 3-1>>",
			"<<perf-table>>",
			"<<section-basics>>",
			"xref:engine-code[查看 Python 脚本]",
			"<<warning-text, 重力井的危险性>>",
		]);

		for (const xref of document.xrefOccurrences) {
			expect(xref.sourceSpan?.start.line).toBeGreaterThan(0);
			expect(xref.sourceSpan?.start.column).toBeGreaterThan(0);
			if (!xref.target.includes(".adoc#")) {
				expect(xref.asciidoctor?.href).toBeTruthy();
				expect(xref.asciidoctor?.resolvedId).toBeTruthy();
			}
		}

		expect(document.anchorOccurrences).toEqual([
			expect.objectContaining({
				raw: "[[warning-text]]",
				ids: ["warning-text"],
				sourceSpan: expect.objectContaining({
					start: { line: 56, column: 27 },
				}),
			}),
		]);

		const listing = findNode(document.children, "listing");
		expect(listing).toEqual(
			expect.objectContaining({
				ids: ["engine-code"],
				title: "曲率引擎启动序列",
				language: "python",
				metadataSpan: { startLine: 29, endLine: 31 },
				contentSpan: { startLine: 33, endLine: 35 },
				span: { startLine: 29, endLine: 36 },
				content:
					'def start_warp_drive():\n    print("Engaging warp drive...")\n    return True',
			}),
		);

		const table = findNode(document.children, "table");
		expect(table).toEqual(
			expect.objectContaining({
				ids: ["perf-table"],
				title: "引擎性能指标对比",
				span: { startLine: 45, endLine: 52 },
			}),
		);
		expect((table as { rows?: unknown[] }).rows?.length).toBeGreaterThan(0);

		const json = serializeAbundantTreeToJson(document);
		expect(JSON.stringify(json)).not.toContain(":undefined");
		expect(formatAbundantTree(document)).toContain("<xref");
	});

	it("keeps interdocument xrefs external without reading the other document", () => {
		expect(existsSync(join(projectRoot, "samples/other.adoc"))).toBe(false);

		const document = parseAbundantTree({ sourcePath: interdocumentPath });
		const local = document.xrefOccurrences.find(
			(xref) => xref.target === "local-target",
		);
		const macroExternal = document.xrefOccurrences.find(
			(xref) =>
				xref.syntax === "macro" && xref.target === "other.adoc#remote-target",
		);
		const shorthandExternal = document.xrefOccurrences.find(
			(xref) =>
				xref.syntax === "shorthand" &&
				xref.target === "other.adoc#remote-target",
		);

		expect(local?.asciidoctor?.resolvedId).toBe("local-target");
		expect(macroExternal).toEqual(
			expect.objectContaining({
				target: "other.adoc#remote-target",
				scope: "external",
				asciidoctor: expect.objectContaining({
					href: "other.html#remote-target",
				}),
			}),
		);
		expect(shorthandExternal).toEqual(
			expect.objectContaining({
				target: "other.adoc#remote-target",
				scope: "external",
				asciidoctor: expect.objectContaining({
					href: "other.html#remote-target",
				}),
			}),
		);
		expect(document.targets.map((target) => target.id)).not.toContain(
			"remote-target",
		);
	});

	it("does not scan listing content as sections, xrefs, anchors, or targets", () => {
		const document = parseAbundantTree({ sourcePath: codeSurfaceAuditPath });

		expect(
			document.targets.map((target) => [target.id, target.targetType]),
		).toEqual(
			expect.arrayContaining([
				["_real_section", "section"],
				["code", "listing"],
				["real-target", "section"],
			]),
		);
		expect(document.targets.map((target) => target.id)).not.toContain(
			"_Not_A_Section",
		);
		expect(document.targets.map((target) => target.id)).not.toContain(
			"not-anchor",
		);
		expect(document.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"<<real-target>>",
		]);
		expect(document.xrefOccurrences[0]?.containingSectionId).toBe(
			"_real_section",
		);
		expect(document.anchorOccurrences).toEqual([]);
	});

	it("uses official generated section ids and preserves official xref bindings", () => {
		const document = parseAbundantTree({ sourcePath: generatedIdAuditPath });
		const sectionTarget = document.targets.find(
			(target) => target.targetType === "section",
		);
		const xref = document.xrefOccurrences[0];

		expect(sectionTarget).toEqual(
			expect.objectContaining({
				id: "_real_section",
				idOrigin: "asciidoctor-generated",
				asciidoctor: expect.objectContaining({
					resolvedId: "_real_section",
				}),
			}),
		);
		expect(xref).toEqual(
			expect.objectContaining({
				raw: "<<Real Section>>",
				target: "Real Section",
				scope: "local",
				asciidoctor: expect.objectContaining({
					href: "#_real_section",
					resolvedId: "_real_section",
					resolvedType: "section",
				}),
			}),
		);
	});

	it("recovers table cell xref occurrences without treating code listings as prose", () => {
		const document = parseAbundantTree({ sourcePath: tableXrefAuditPath });
		const xref = document.xrefOccurrences[0];

		expect(document.xrefOccurrences).toHaveLength(1);
		expect(xref).toEqual(
			expect.objectContaining({
				raw: "<<target-section, target label>>",
				target: "target-section",
				label: "target label",
				containingSectionId: "target-section",
				scope: "local",
				sourceSpan: expect.objectContaining({
					start: { line: 11, column: 9 },
				}),
				asciidoctor: expect.objectContaining({
					href: "#target-section",
					resolvedId: "target-section",
					resolvedType: "section",
					reftext: "target label",
				}),
			}),
		);
	});

	it("keeps block anchors as occurrences and target catalog entries", () => {
		const document = parseAbundantTree({ sourcePath: blockAnchorAuditPath });

		expect(document.anchorOccurrences).toEqual([
			expect.objectContaining({
				raw: "[[block-sec,Block Section Ref]]",
				ids: ["block-sec"],
				reftext: "Block Section Ref",
				containingSectionId: "block-sec",
				sourceSpan: expect.objectContaining({
					start: { line: 3, column: 1 },
				}),
			}),
			expect.objectContaining({
				raw: "[[block-para]]",
				ids: ["block-para"],
				containingSectionId: "block-sec",
				sourceSpan: expect.objectContaining({
					start: { line: 6, column: 1 },
				}),
			}),
		]);
		expect(
			document.targets.map((target) => [target.id, target.targetType]),
		).toEqual(
			expect.arrayContaining([
				["block-sec", "section"],
				["block-para", "block"],
			]),
		);
		expect(
			document.xrefOccurrences.map((xref) => [
				xref.target,
				xref.scope,
				xref.asciidoctor?.resolvedType,
			]),
		).toEqual(
			expect.arrayContaining([
				["block-sec", "local", "section"],
				["block-para", "local", "block"],
			]),
		);
	});

	it("parses complex attrlist style, id, roles, and attributes separately", () => {
		const document = parseAbundantTree({
			sourcePath: attrlistComplexAuditPath,
		});
		const listing = findNode(document.children, "listing") as {
			style?: string;
			metadata?: Array<{
				metadataKind: string;
				ids?: string[];
				roles?: string[];
				attributes?: Record<string, string | number | boolean>;
			}>;
		};
		const attrlist = listing.metadata?.find(
			(metadata) => metadata.metadataKind === "attrlist",
		);

		expect(listing.style).toBe("sidebar");
		expect(attrlist).toEqual(
			expect.objectContaining({
				ids: ["box-id"],
				roles: ["role-a", "role-b"],
				attributes: {
					style: "sidebar",
					key: "value",
				},
			}),
		);
	});

	it("keeps missing local hrefs unresolved when no target catalog entry exists", () => {
		const document = parseAbundantTree({
			sourcePath: missingLocalXrefAuditPath,
		});
		const xref = document.xrefOccurrences[0];

		expect(document.targets.map((target) => target.id)).not.toContain(
			"missing-target",
		);
		expect(xref).toEqual(
			expect.objectContaining({
				raw: "<<missing-target>>",
				target: "missing-target",
				scope: "unresolved",
				sourceSpan: expect.objectContaining({
					start: { line: 5, column: 5 },
				}),
				asciidoctor: expect.objectContaining({
					href: "#missing-target",
					resolvedId: "missing-target",
					reftext: "[missing-target]",
				}),
			}),
		);
		expect(xref?.asciidoctor?.resolvedType).toBeUndefined();
	});

	it("does not fallback-bind table cell xrefs to generated section ids", () => {
		const document = parseAbundantTree({
			sourcePath: tableSectionPollutionAuditPath,
		});
		const xref = document.xrefOccurrences[0];

		expect(document.targets.map((target) => target.id)).toEqual(
			expect.arrayContaining(["_before", "t", "after"]),
		);
		expect(document.targets.map((target) => target.id)).not.toContain(
			"before",
		);
		expect(document.targets.map((target) => target.id)).not.toContain(
			"_not_a_section",
		);
		expect(xref).toEqual(
			expect.objectContaining({
				raw: "<<before>>",
				target: "before",
				containingSectionId: "_before",
				scope: "unresolved",
				asciidoctor: expect.objectContaining({
					href: "#before",
					resolvedId: "before",
				}),
			}),
		);
		expect(xref?.asciidoctor?.resolvedType).toBeUndefined();
	});

	it("uses official paragraph block ids as target catalog entries", () => {
		const document = parseAbundantTree({ sourcePath: paragraphIdAuditPath });
		const paragraph = findNode(document.children, "paragraph") as {
			asciidoctor?: { resolvedId?: string };
		};
		const target = document.targets.find(
			(candidate) => candidate.id === "para-target",
		);
		const xref = document.xrefOccurrences[0];

		expect(paragraph.asciidoctor?.resolvedId).toBe("para-target");
		expect(target).toEqual(
			expect.objectContaining({
				id: "para-target",
				targetType: "block",
				idOrigin: "source",
				sourceSpan: expect.objectContaining({
					start: { line: 5, column: 1 },
				}),
				asciidoctor: expect.objectContaining({
					context: "paragraph",
					resolvedId: "para-target",
					resolvedType: "block",
				}),
			}),
		);
		expect(xref).toEqual(
			expect.objectContaining({
				raw: "<<para-target>>",
				target: "para-target",
				scope: "local",
				sourceSpan: expect.objectContaining({
					start: { line: 8, column: 5 },
				}),
				asciidoctor: expect.objectContaining({
					href: "#para-target",
					resolvedId: "para-target",
					resolvedType: "block",
				}),
			}),
		);
	});
});

function findNode(nodes: unknown[], kind: string): unknown {
	for (const node of nodes as Array<{ kind?: string; children?: unknown[] }>) {
		if (node.kind === kind) {
			return node;
		}
		const found = findNode(node.children ?? [], kind);
		if (found) {
			return found;
		}
	}
	return undefined;
}
