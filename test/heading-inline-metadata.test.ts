import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

describe("heading inline metadata scanner", () => {
	it("catalogs paragraph occurrences with source evidence", () => {
		const path = writeFixture(
			"heading-inline-metadata-basic.adoc",
			`= Probe

[#rule]
== Rule

Status is hmeta:status[active, label=生效].
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const occurrence = document.headingInlineMetadataOccurrences[0];

		expect(document.headingInlineMetadataOccurrences).toHaveLength(1);
		expect(occurrence).toEqual(
			expect.objectContaining({
				kind: "headingInlineMetadata",
				syntax: "macro",
				raw: "hmeta:status[active, label=生效]",
				field: "status",
				value: "active",
				label: "生效",
				containingSectionId: "rule",
				sourceSpan: {
					start: { line: 6, column: 11 },
					end: { line: 6, column: 41 },
				},
			}),
		);
		const section = document.children.find((node) => node.kind === "section");
		const paragraph = section?.children?.find(
			(node) => node.kind === "paragraph",
		);
		expect(paragraph?.children).toEqual([occurrence]);
	});

	it("omits fallback labels when label is absent", () => {
		const path = writeFixture(
			"heading-inline-metadata-no-label.adoc",
			`= Probe

== Rule

Owner is hmeta:owner[docs-team].
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const occurrence = document.headingInlineMetadataOccurrences[0];

		expect(occurrence).toEqual(
			expect.objectContaining({
				field: "owner",
				value: "docs-team",
			}),
		);
		expect(occurrence).not.toHaveProperty("label");
	});

	it("supports named value attributes", () => {
		const path = writeFixture(
			"heading-inline-metadata-named-value.adoc",
			`= Probe

== Rule

Status is hmeta:status[value=active, label=生效].
`,
		);

		const document = parseAbundantTree({ sourcePath: path });

		expect(document.headingInlineMetadataOccurrences[0]).toEqual(
			expect.objectContaining({
				field: "status",
				value: "active",
				label: "生效",
			}),
		);
	});

	it("supports quoted comma values and labels", () => {
		const path = writeFixture(
			"heading-inline-metadata-quoted-comma.adoc",
			`= Probe

== Rule

Summary is hmeta:summary["hello, world", label="你好，世界"].
`,
		);

		const document = parseAbundantTree({ sourcePath: path });

		expect(document.headingInlineMetadataOccurrences[0]).toEqual(
			expect.objectContaining({
				field: "summary",
				value: "hello, world",
				label: "你好，世界",
			}),
		);
	});

	it("diagnoses complete macros with missing values without creating a node", () => {
		const path = writeFixture(
			"heading-inline-metadata-missing-value.adoc",
			`= Probe

== Rule

Status is hmeta:status[label=生效].
Incomplete hmeta:status text is left alone.
`,
		);

		const document = parseAbundantTree({ sourcePath: path });

		expect(document.headingInlineMetadataOccurrences).toEqual([]);
		expect(document.toolDiagnostics).toEqual([
			expect.objectContaining({
				level: "warning",
				code: "heading-inline-metadata.missing-value",
				source: {
					start: { line: 5, column: 11 },
					end: { line: 5, column: 33 },
				},
			}),
		]);
	});

	it("keeps same-line occurrence columns distinct", () => {
		const path = writeFixture(
			"heading-inline-metadata-same-line.adoc",
			`= Probe

== Rule

hmeta:status[active] and hmeta:priority[normal].
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const starts = document.headingInlineMetadataOccurrences.map(
			(occurrence) => occurrence.sourceSpan?.start,
		);

		expect(starts).toEqual([
			{ line: 5, column: 1 },
			{ line: 5, column: 26 },
		]);
	});

	it("records actual source lines inside multiline paragraphs", () => {
		const path = writeFixture(
			"heading-inline-metadata-multiline-paragraph.adoc",
			`= Probe

== Rule

First hmeta:status[active]
second hmeta:priority[normal].
`,
		);

		const document = parseAbundantTree({ sourcePath: path });

		expect(
			document.headingInlineMetadataOccurrences.map(
				(occurrence) => occurrence.sourceSpan?.start,
			),
		).toEqual([
			{ line: 5, column: 7 },
			{ line: 6, column: 8 },
		]);
	});

	it("does not scan listing, literal, pass, or stem blocks", () => {
		const path = writeFixture(
			"heading-inline-metadata-skipped-blocks.adoc",
			`= Probe

== Rule

----
hmeta:status[listing]
----

....
hmeta:status[literal]
....

++++
hmeta:status[pass]
++++

[stem]
++++
hmeta:status[stem]
++++

Visible hmeta:status[active].
`,
		);

		const document = parseAbundantTree({ sourcePath: path });

		expect(
			document.headingInlineMetadataOccurrences.map((item) => item.value),
		).toEqual(["active"]);
	});

	it("does not scan block titles or metadata ranges as hmeta surfaces", () => {
		const path = writeFixture(
			"heading-inline-metadata-metadata-ranges.adoc",
			`= Probe

.Block title hmeta:status[title]
Paragraph hmeta:status[body].

[#s.hmeta:role[metadata]]
== S
`,
		);

		const document = parseAbundantTree({ sourcePath: path });

		expect(
			document.headingInlineMetadataOccurrences.map((item) => item.raw),
		).toEqual(["hmeta:status[body]"]);
	});
});
