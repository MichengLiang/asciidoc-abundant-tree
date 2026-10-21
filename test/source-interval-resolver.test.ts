import { describe, expect, it } from "vitest";
import { createAsciidoctorFileAdapter } from "../src/asciidoctor-file-adapter";
import type { OfficialBlockSurface } from "../src/official-block-walker";
import { walkOfficialBlocks } from "../src/official-block-walker";
import { completeOfficialSourceLocations } from "../src/official-source-location";
import { resolveSourceInterval } from "../src/source-interval-resolver";
import { buildLineTable } from "../src/source-lines";
import { writeFixture } from "./helpers";

describe("resolveSourceInterval", () => {
	it("extends section spans from metadata to the next official sibling", async () => {
		const { lineTable, surfaces } = await parseFixture(
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

	it("resolves fenced and dashed listing spans with content spans", async () => {
		const { lineTable, surfaces } = await parseFixture(
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

	it("resolves table and pass spans without treating inner delimiter text as global structure", async () => {
		const { lineTable, surfaces } = await parseFixture(
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

	it("keeps paragraph intervals to paragraph source content instead of sibling separators", async () => {
		const { lineTable, surfaces } = await parseFixture(
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

	it("resolves literal and open blocks from their official source lines", async () => {
		const { lineTable, surfaces } = await parseFixture(
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

	it.each([
		{
			name: "multi-line",
			body: '"第一行。\n// 注\n末行。"\n-- 某人\n',
			span: { startLine: 5, endLine: 8 },
			contentSpan: { startLine: 5, endLine: 7 },
		},
		{
			name: "one-line",
			body: '"一句话。"\n-- 某人\n',
			span: { startLine: 5, endLine: 6 },
			contentSpan: { startLine: 5, endLine: 5 },
		},
	])("spans an $name air quote to its credit line", async ({
		name,
		body,
		span,
		contentSpan,
	}) => {
		const { lineTable, surfaces } = await parseCompletedFixture(
			`resolver-air-quote-${name}.adoc`,
			`= Probe\n\n== 节\n\n${body}`,
		);

		expect(
			resolveSourceInterval(findSurface(surfaces, "quote"), lineTable),
		).toEqual(expect.objectContaining({ span, contentSpan, diagnostics: [] }));
	});

	it("spans a markdown quote over its bare > lines and credit line", async () => {
		const { lineTable, surfaces } = await parseCompletedFixture(
			"resolver-markdown-quote.adoc",
			[
				"= Probe",
				"",
				"== 节",
				"",
				"[#outer]",
				"> 外层。",
				">",
				"> > 内层一。",
				"> > 内层二。",
				"> >",
				">",
				"> -- 某人",
				"",
				"后文。",
				"",
			].join("\n"),
		);
		const [outer, inner] = surfaces.filter(
			(surface) => surface.context === "quote",
		) as [OfficialBlockSurface, OfficialBlockSurface];

		expect(resolveSourceInterval(outer, lineTable)).toEqual(
			expect.objectContaining({
				metadataSpan: { startLine: 5, endLine: 5 },
				span: { startLine: 5, endLine: 12 },
				contentSpan: { startLine: 6, endLine: 10 },
				diagnostics: [],
			}),
		);
		// 外层只有 > 的行对内层是空行，内层的段落在那里结束。
		expect(resolveSourceInterval(inner, lineTable)).toEqual(
			expect.objectContaining({
				span: { startLine: 8, endLine: 10 },
				contentSpan: { startLine: 8, endLine: 9 },
				diagnostics: [],
			}),
		);
	});
});

async function parseFixture(name: string, source: string) {
	const path = writeFixture(name, source);
	return {
		lineTable: buildLineTable(source),
		surfaces: walkOfficialBlocks(
			await createAsciidoctorFileAdapter().loadFile(path),
		),
	};
}

async function parseCompletedFixture(name: string, source: string) {
	const lineTable = buildLineTable(source);
	const official = await createAsciidoctorFileAdapter().loadFile(
		writeFixture(name, source),
	);
	completeOfficialSourceLocations(official, lineTable);
	return { lineTable, surfaces: walkOfficialBlocks(official) };
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
