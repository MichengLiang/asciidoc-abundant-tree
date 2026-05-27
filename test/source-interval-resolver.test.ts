import { describe, expect, it } from "vitest";
import { createAsciidoctorAdapter } from "../src/asciidoctor-adapter";
import type { OfficialBlockSurface } from "../src/official-block-walker";
import { walkOfficialBlocks } from "../src/official-block-walker";
import { resolveSourceInterval } from "../src/source-interval-resolver";
import { buildLineTable } from "../src/source-lines";
import { writeFixture } from "./helpers";

describe("resolveSourceInterval", () => {
	it("extends section spans from metadata to the next official sibling", () => {
		const { lineTable, surfaces } = parseFixture(
			"resolver-section.adoc",
			`= Probe

[#before]
== Before

paragraph

[#after]
== After
`,
		);
		const before = findSurface(surfaces, "section", "Before");

		expect(resolveSourceInterval(before, lineTable)).toEqual(
			expect.objectContaining({
				blockStartLine: 4,
				metadataSpan: { startLine: 3, endLine: 3 },
				span: { startLine: 3, endLine: 7 },
			}),
		);
	});

	it("resolves fenced and dashed listing spans with content spans", () => {
		const { lineTable, surfaces } = parseFixture(
			"resolver-listings.adoc",
			`= Probe

== Before

\`\`\`
fenced
\`\`\`

[source,js]
----
dashed
----
`,
		);
		const listings = surfaces.filter(
			(surface) => surface.context === "listing",
		);

		expect(
			resolveSourceInterval(listings[0] as OfficialBlockSurface, lineTable),
		).toEqual(
			expect.objectContaining({
				blockStartLine: 5,
				contentSpan: { startLine: 6, endLine: 6 },
				span: { startLine: 5, endLine: 7 },
			}),
		);
		expect(
			resolveSourceInterval(listings[1] as OfficialBlockSurface, lineTable),
		).toEqual(
			expect.objectContaining({
				blockStartLine: 10,
				metadataSpan: { startLine: 9, endLine: 9 },
				contentSpan: { startLine: 11, endLine: 11 },
				span: { startLine: 9, endLine: 12 },
			}),
		);
	});

	it("resolves table and pass spans without treating inner delimiter text as global structure", () => {
		const { lineTable, surfaces } = parseFixture(
			"resolver-table-pass.adoc",
			`= Probe

== Before

++++
pass
++++

[#t]
.Table
|===
a|
This prose mentions ---- as text.
|===
`,
		);
		const pass = findSurface(surfaces, "pass");
		const table = findSurface(surfaces, "table");

		expect(resolveSourceInterval(pass, lineTable)).toEqual(
			expect.objectContaining({
				blockStartLine: 5,
				contentSpan: { startLine: 6, endLine: 6 },
				span: { startLine: 5, endLine: 7 },
			}),
		);
		expect(resolveSourceInterval(table, lineTable)).toEqual(
			expect.objectContaining({
				blockStartLine: 11,
				metadataSpan: { startLine: 9, endLine: 10 },
				contentSpan: { startLine: 12, endLine: 13 },
				span: { startLine: 9, endLine: 14 },
			}),
		);
	});

	it("keeps paragraph intervals to paragraph source content instead of sibling separators", () => {
		const { lineTable, surfaces } = parseFixture(
			"resolver-paragraph-boundary.adoc",
			`= Probe

== Before

First paragraph.

[#code]
----
code
----
`,
		);
		const paragraph = findSurface(surfaces, "paragraph");

		expect(resolveSourceInterval(paragraph, lineTable)).toEqual(
			expect.objectContaining({
				blockStartLine: 5,
				contentSpan: { startLine: 5, endLine: 5 },
				span: { startLine: 5, endLine: 5 },
			}),
		);
	});

	it("resolves literal and open blocks from their official source lines", () => {
		const { lineTable, surfaces } = parseFixture(
			"resolver-literal-open.adoc",
			`= Probe

....
literal
....

--
open
--
`,
		);
		const literal = findSurface(surfaces, "literal");
		const open = findSurface(surfaces, "open");

		expect(resolveSourceInterval(literal, lineTable)).toEqual(
			expect.objectContaining({
				blockStartLine: 3,
				contentSpan: { startLine: 4, endLine: 4 },
				span: { startLine: 3, endLine: 5 },
			}),
		);
		expect(resolveSourceInterval(open, lineTable)).toEqual(
			expect.objectContaining({
				blockStartLine: 7,
				contentSpan: { startLine: 8, endLine: 8 },
				span: { startLine: 7, endLine: 9 },
			}),
		);
	});

	it("returns undefined when official source location is missing", () => {
		const surface = {
			block: {},
			context: "paragraph",
			nodeName: "paragraph",
			level: undefined,
			title: undefined,
			id: undefined,
			sourceLine: undefined,
			children: [],
			indexInParent: 0,
		} satisfies OfficialBlockSurface;
		const lineTable = buildLineTable("= Probe\n\ntext\n");

		expect(resolveSourceInterval(surface, lineTable)).toBeUndefined();
	});

	it("reports delimiter and title-span fallbacks for malformed official anchors", () => {
		const lineTable = buildLineTable("plain text\nmore text\n");
		const listing = {
			block: {},
			context: "listing",
			nodeName: "listing",
			level: undefined,
			title: undefined,
			id: undefined,
			sourceLine: 1,
			children: [],
			indexInParent: 0,
		} satisfies OfficialBlockSurface;
		const section = {
			block: {},
			context: "section",
			nodeName: "section",
			level: 1,
			title: "Plain",
			id: undefined,
			sourceLine: 1,
			children: [],
			indexInParent: 0,
		} satisfies OfficialBlockSurface;

		expect(resolveSourceInterval(listing, lineTable)?.diagnostics).toHaveLength(
			1,
		);
		expect(
			resolveSourceInterval(section, lineTable)?.titleSpan,
		).toBeUndefined();
	});

	it("handles missing sibling anchors and missing closing delimiters", () => {
		const lineTable = buildLineTable(`= Probe

----
content
`);
		const current = {
			block: {},
			context: "section",
			nodeName: "section",
			level: 1,
			title: "One",
			id: undefined,
			sourceLine: 1,
			children: [],
			indexInParent: 0,
			siblings: [] as OfficialBlockSurface[],
		} satisfies OfficialBlockSurface;
		const next = {
			block: {},
			context: "section",
			nodeName: "section",
			level: 1,
			title: "Two",
			id: undefined,
			sourceLine: undefined,
			children: [],
			indexInParent: 1,
		} satisfies OfficialBlockSurface;
		current.siblings = [current, next];
		const listing = {
			block: {},
			context: "listing",
			nodeName: "listing",
			level: undefined,
			title: undefined,
			id: undefined,
			sourceLine: 3,
			children: [],
			indexInParent: 0,
		} satisfies OfficialBlockSurface;

		expect(resolveSourceInterval(current, lineTable)?.span).toEqual({
			startLine: 1,
			endLine: 5,
		});
		expect(resolveSourceInterval(listing, lineTable)?.diagnostics).toHaveLength(
			1,
		);
	});

	it("falls back to file bounds for nonparagraph blocks without child or sibling anchors", () => {
		const lineTable = buildLineTable("= Probe\n\nordinary block\n");
		const block = {
			block: {},
			context: "admonition",
			nodeName: "admonition",
			level: undefined,
			title: undefined,
			id: undefined,
			sourceLine: 3,
			children: [],
			indexInParent: 0,
			siblings: [],
		} satisfies OfficialBlockSurface;

		expect(resolveSourceInterval(block, lineTable)).toEqual(
			expect.objectContaining({
				blockStartLine: 3,
				span: { startLine: 3, endLine: 4 },
				sourceSpan: expect.objectContaining({
					start: { line: 3, column: 1 },
				}),
			}),
		);
		expect(resolveSourceInterval(block, lineTable)).not.toHaveProperty(
			"contentSpan",
		);
	});

	it("keeps intervals source-addressable when official source lines exceed the file", () => {
		const lineTable = buildLineTable("= Probe\n");
		const paragraph = {
			block: {
				getSource: () => "external paragraph",
			},
			context: "paragraph",
			nodeName: "paragraph",
			level: undefined,
			title: undefined,
			id: undefined,
			sourceLine: 5,
			children: [],
			indexInParent: 0,
		} satisfies OfficialBlockSurface;
		const listing = {
			block: {},
			context: "listing",
			nodeName: "listing",
			level: undefined,
			title: undefined,
			id: undefined,
			sourceLine: 5,
			children: [],
			indexInParent: 0,
		} satisfies OfficialBlockSurface;

		expect(resolveSourceInterval(paragraph, lineTable)).toEqual(
			expect.objectContaining({
				span: { startLine: 5, endLine: 5 },
				contentSpan: { startLine: 5, endLine: 5 },
				sourceSpan: {
					start: { line: 5, column: 1 },
					end: { line: 5, column: 1 },
				},
				diagnostics: [],
			}),
		);
		expect(resolveSourceInterval(listing, lineTable)).toEqual(
			expect.objectContaining({
				span: { startLine: 5, endLine: 5 },
				sourceSpan: {
					start: { line: 5, column: 1 },
					end: { line: 5, column: 1 },
				},
				diagnostics: [],
			}),
		);
	});
});

function parseFixture(name: string, source: string) {
	const path = writeFixture(name, source);
	return {
		lineTable: buildLineTable(source),
		surfaces: walkOfficialBlocks(createAsciidoctorAdapter().loadFile(path)),
	};
}

function findSurface(
	surfaces: OfficialBlockSurface[],
	context: string,
	title?: string,
): OfficialBlockSurface {
	const surface = surfaces.find(
		(candidate) =>
			candidate.context === context &&
			(title === undefined || candidate.title === title),
	);
	if (!surface) {
		throw new Error(`Missing ${context} surface`);
	}
	return surface;
}
