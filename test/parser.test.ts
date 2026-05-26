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
