import { describe, expect, it } from "vitest";
import {
	assignContainingSectionIdsFromSourceScope,
	buildSourceScopeIndex,
	lookupContainingSection,
	registerSectionSourceScope,
} from "../../src/book-entry/source-scope-index";
import type {
	AnchorOccurrenceNode,
	SectionNode,
	XrefOccurrenceNode,
} from "../../src/model";

describe("book-entry source scope index", () => {
	it("does not let same line numbers in different origin files pollute containing section lookup", () => {
		const xrefSection = section("xref-origin", "chapter-a.adoc", 3, 12);
		const targetSection = section("target-origin", "chapter-b.adoc", 3, 12);
		const index = buildSourceScopeIndex([targetSection, xrefSection]);

		expect(
			lookupContainingSection(index, {
				relativePath: "chapter-a.adoc",
				line: 6,
			}),
		).toBe(xrefSection);
		expect(
			lookupContainingSection(index, {
				relativePath: "chapter-b.adoc",
				line: 6,
			}),
		).toBe(targetSection);
	});

	it("assigns xref containingSectionId from the occurrence relativePath", () => {
		const index = buildSourceScopeIndex([
			section("xref-origin", "chapter-a.adoc", 3, 12),
			section("target-origin", "chapter-b.adoc", 3, 12),
		]);
		const occurrence: XrefOccurrenceNode = {
			kind: "xref",
			syntax: "macro",
			raw: "xref:target-origin[]",
			target: "target-origin",
			source: {
				relativePath: "chapter-a.adoc",
				line: 6,
			},
			sourceSpan: {
				start: { line: 6, column: 1 },
				end: { line: 6, column: 21 },
			},
		};

		const containingSection = lookupContainingSection(index, occurrence);

		expect(containingSection?.ids[0]).toBe("xref-origin");
	});

	it("assigns anchor containingSectionId from the occurrence relativePath", () => {
		const index = buildSourceScopeIndex([
			section("xref-origin", "chapter-a.adoc", 3, 12),
			section("target-origin", "chapter-b.adoc", 3, 12),
		]);
		const occurrence: AnchorOccurrenceNode = {
			kind: "anchor",
			syntax: "macro",
			raw: "anchor:chapter-anchor[]",
			ids: ["chapter-anchor"],
			source: {
				relativePath: "chapter-a.adoc",
				line: 8,
			},
			sourceSpan: {
				start: { line: 8, column: 1 },
				end: { line: 8, column: 24 },
			},
		};

		const containingSection = lookupContainingSection(index, occurrence);

		expect(containingSection?.ids[0]).toBe("xref-origin");
	});

	it("ignores sections and lookups without source identity", () => {
		const index = buildSourceScopeIndex([
			section("xref-origin", "chapter-a.adoc", 3, 12),
			{
				kind: "section",
				level: 1,
				ids: ["missing-source"],
				title: "missing-source",
				idOrigin: "source",
				children: [],
			},
		]);

		expect(index.candidates).toHaveLength(1);
		expect(lookupContainingSection(index, {})).toBeUndefined();
		expect(
			lookupContainingSection(index, {
				relativePath: "chapter-a.adoc",
				line: 13,
			}),
		).toBeUndefined();
	});

	it("assigns containingSectionId on xrefs and anchors in one pass", () => {
		const index = buildSourceScopeIndex([
			section("xref-origin", "chapter-a.adoc", 3, 12),
		]);
		const xref: XrefOccurrenceNode = {
			kind: "xref",
			syntax: "macro",
			raw: "xref:target-origin[]",
			target: "target-origin",
			source: {
				relativePath: "chapter-a.adoc",
				line: 6,
			},
		};
		const anchor: AnchorOccurrenceNode = {
			kind: "anchor",
			syntax: "macro",
			raw: "anchor:chapter-anchor[]",
			ids: ["chapter-anchor"],
			source: {
				relativePath: "chapter-a.adoc",
				line: 8,
			},
		};

		assignContainingSectionIdsFromSourceScope([xref], [anchor], index);

		expect(xref.containingSectionId).toBe("xref-origin");
		expect(anchor.containingSectionId).toBe("xref-origin");
	});

	it("uses registered source scope instead of the public heading raw span", () => {
		const xrefSection = section("xref-origin", "chapter-a.adoc", 3, 11);
		registerSectionSourceScope(xrefSection, {
			relativePath: "chapter-a.adoc",
			startLine: 3,
			endLine: 19,
		});
		const index = buildSourceScopeIndex([xrefSection]);

		expect(
			lookupContainingSection(index, {
				relativePath: "chapter-a.adoc",
				line: 19,
			}),
		).toBe(xrefSection);
		expect(index.candidates[0]).toEqual(
			expect.objectContaining({
				relativePath: "chapter-a.adoc",
				startLine: 3,
				endLine: 19,
				section: xrefSection,
			}),
		);
	});
});

function section(
	id: string,
	relativePath: string,
	startLine: number,
	endLine: number,
): SectionNode {
	return {
		kind: "section",
		level: 1,
		ids: [id],
		title: id,
		line: startLine,
		span: { startLine, endLine },
		idOrigin: "source",
		source: {
			relativePath,
			line: startLine,
			span: { startLine, endLine },
		},
		children: [],
	};
}
