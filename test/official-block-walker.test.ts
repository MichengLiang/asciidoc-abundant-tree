import { describe, expect, it } from "vitest";
import type { AsciidoctorBlock } from "../src/asciidoctor-adapter";
import { createAsciidoctorAdapter } from "../src/asciidoctor-adapter";
import { walkOfficialBlocks } from "../src/official-block-walker";
import { writeFixture } from "./helpers";

describe("walkOfficialBlocks", () => {
	it("walks official block contexts without discovering source-looking content", () => {
		const path = writeFixture(
			"official-block-walker.adoc",
			`= Probe

== Before

\`\`\`
== Not A Section
\`\`\`

++++
<<not-scanned>>
++++

|===
a|
== Not A Section Either
|===
`,
		);
		const officialDocument = createAsciidoctorAdapter().loadFile(path);

		const surfaces = walkOfficialBlocks(officialDocument);
		const contexts = surfaces.map((surface) => surface.context);
		const sectionTitles = surfaces
			.filter((surface) => surface.context === "section")
			.map((surface) => surface.title);

		expect(contexts).toEqual(
			expect.arrayContaining(["section", "listing", "pass", "table"]),
		);
		expect(sectionTitles).toEqual(["Before"]);
		expect(
			surfaces.filter((surface) => surface.context === "listing")[0]?.parent
				?.context,
		).toBe("section");
		expect(
			surfaces.filter((surface) => surface.context === "table")[0]
				?.indexInParent,
		).toBeGreaterThanOrEqual(0);
	});

	it("handles missing block APIs and preserves root sibling identity", () => {
		const first = {
			getBlocks: () => [
				{
					getContext: () => "paragraph",
					getNodeName: () => "paragraph",
				},
			],
			getContext: () => "open",
			getNodeName: () => "open",
			getSourceLocation: () => ({
				getDirectory: () => "/virtual",
				getFile: () => "main.adoc",
				getLineNumber: () => 1,
				getPath: () => "main.adoc",
			}),
		} satisfies AsciidoctorBlock;
		const second = {
			getContext: () => "paragraph",
			getNodeName: () => "paragraph",
		} satisfies AsciidoctorBlock;

		const surfaces = walkOfficialBlocks({
			getBlocks: () => [first, second],
		});

		expect(surfaces).toEqual([
			expect.objectContaining({
				context: "open",
				indexInParent: 0,
				sourceLine: 1,
				sourceDirectory: "/virtual",
				sourceFile: "main.adoc",
				sourcePath: "main.adoc",
				siblings: expect.any(Array),
			}),
			expect.objectContaining({
				context: "paragraph",
				parent: expect.objectContaining({ context: "open" }),
				sourceLine: undefined,
			}),
			expect.objectContaining({
				context: "paragraph",
				indexInParent: 1,
				sourceLine: undefined,
				siblings: expect.any(Array),
			}),
		]);
		expect(surfaces[0]?.siblings).toBe(surfaces[2]?.siblings);
	});

	it("returns no surfaces when the official document has no child block API", () => {
		expect(walkOfficialBlocks({})).toEqual([]);
	});
});
