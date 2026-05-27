import { describe, expect, it } from "vitest";
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
});
