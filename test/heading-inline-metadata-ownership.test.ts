import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

describe("heading inline metadata ownership", () => {
	it("assigns occurrences under a parent section to that section", () => {
		const path = writeFixture(
			"heading-inline-metadata-parent-owner.adoc",
			`= Probe

[#parent]
== Parent

Parent hmeta:status[parent].

[#child]
=== Child
`,
		);

		const document = parseAbundantTree({ sourcePath: path });

		expect(document.headingInlineMetadataOccurrences[0]).toEqual(
			expect.objectContaining({
				field: "status",
				value: "parent",
				containingSectionId: "parent",
			}),
		);
	});

	it("assigns occurrences under a child section to the child section", () => {
		const path = writeFixture(
			"heading-inline-metadata-child-owner.adoc",
			`= Probe

[#parent]
== Parent

[#child]
=== Child

Child hmeta:status[child].
`,
		);

		const document = parseAbundantTree({ sourcePath: path });

		expect(document.headingInlineMetadataOccurrences[0]).toEqual(
			expect.objectContaining({
				field: "status",
				value: "child",
				containingSectionId: "child",
			}),
		);
	});

	it("leaves occurrences before the first section without an owner", () => {
		const path = writeFixture(
			"heading-inline-metadata-no-owner.adoc",
			`= Probe

Prelude hmeta:status[preface].

[#first]
== First
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const occurrence = document.headingInlineMetadataOccurrences[0];

		expect(occurrence).toEqual(
			expect.objectContaining({
				field: "status",
				value: "preface",
			}),
		);
		expect(occurrence).not.toHaveProperty("containingSectionId");
	});

	it("recovers book-entry include origin and owner section", () => {
		const root = join(process.cwd(), "tmp/test-fixtures/hmeta-book");
		const entryPath = join(root, "book.adoc");
		const chapterPath = join(root, "chapters/chapter.adoc");
		mkdirSync(dirname(chapterPath), { recursive: true });
		writeFileSync(
			entryPath,
			`= Book

include::chapters/chapter.adoc[]
`,
			"utf8",
		);
		writeFileSync(
			chapterPath,
			`[#included]
== Included

Included hmeta:status[active].
`,
			"utf8",
		);

		const document = parseAbundantTree({
			sourcePath: entryPath,
			mode: "book-entry",
			documentRoot: root,
		});
		const occurrence = document.headingInlineMetadataOccurrences[0];

		expect(occurrence).toEqual(
			expect.objectContaining({
				field: "status",
				value: "active",
				containingSectionId: "included",
				source: expect.objectContaining({
					relativePath: "chapters/chapter.adoc",
					line: 4,
				}),
			}),
		);
		expect(occurrence?.sourceSpan?.start).toEqual({ line: 4, column: 10 });
	});
});
