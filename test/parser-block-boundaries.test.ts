import { describe, expect, it } from "vitest";
import type { ListingNode, SectionNode } from "../src/model";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

describe("parser block boundaries", () => {
	it("does not let section-looking table cell content truncate section scope", () => {
		const path = writeFixture(
			"table-asciidoc-cell-section.adoc",
			`= Probe

== Before

[#t]
.Table
|===
a|
== Not A Section

See <<after>> inside table cell.
|===

[#after]
== After
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const before = document.children.find(
			(node) =>
				node.kind === "section" && "title" in node && node.title === "Before",
		) as SectionNode;
		const xref = document.xrefOccurrences.find(
			(item) => item.raw === "<<after>>",
		);

		expect(before.span?.endLine).toBeGreaterThanOrEqual(12);
		expect(xref?.containingSectionId).toBe("_before");
		expect(document.targets.map((target) => target.id)).not.toContain(
			"_not_a_section",
		);
	});

	it("treats fenced code as listing and does not scan its inline-looking content", () => {
		const path = writeFixture(
			"fenced-code.adoc",
			`= Probe

== Before

\`\`\`
== Not A Section
See <<after>> inside fenced code.
\`\`\`

[#after]
== After
`,
		);
		const document = parseAbundantTree({ sourcePath: path });
		const listing = findNode(document.children, "listing") as ListingNode;

		expect(listing.span).toEqual({ startLine: 5, endLine: 8 });
		expect(document.xrefOccurrences.map((xref) => xref.raw)).not.toContain(
			"<<after>>",
		);
		expect(document.targets.map((target) => target.id)).not.toContain(
			"_not_a_section",
		);
	});

	it("does not scan passthrough block content as xrefs or sections", () => {
		const path = writeFixture(
			"passthrough-block.adoc",
			`= Probe

== Before

++++
== Not A Section
See <<after>> inside passthrough.
++++

[#after]
== After
`,
		);
		const document = parseAbundantTree({ sourcePath: path });

		expect(document.xrefOccurrences.map((xref) => xref.raw)).not.toContain(
			"<<after>>",
		);
		expect(document.targets.map((target) => target.id)).not.toContain(
			"_not_a_section",
		);
	});

	it("does not treat delimiter-looking table cell text as a global listing range", () => {
		const path = writeFixture(
			"table-delimiter-text.adoc",
			`= Probe

== Before

[#t]
.Table
|===
a|
This prose mentions a delimiter-looking line.
---- token in prose.
See <<after>> after that line.
|===

[#after]
== After
`,
		);
		const document = parseAbundantTree({ sourcePath: path });

		expect(document.xrefOccurrences.map((xref) => xref.raw)).toContain(
			"<<after>>",
		);
	});

	it("does not include blank block separators in paragraph text or spans", () => {
		const path = writeFixture(
			"paragraph-boundary.adoc",
			`= Probe

== Before

First paragraph.

[#code]
----
code
----
`,
		);
		const document = parseAbundantTree({ sourcePath: path });
		const paragraph = findNode(document.children, "paragraph") as {
			text?: string;
			source?: { span?: { startLine: number; endLine: number } };
		};

		expect(paragraph.text).toBe("First paragraph.");
		expect(paragraph.source?.span).toEqual({ startLine: 5, endLine: 5 });
	});

	it("scans table asciidoc cell paragraphs without scanning nested listing content", () => {
		const path = writeFixture(
			"table-nested-listing.adoc",
			`= Probe

== Before

[#t]
.Table
|===
a|
----
See <<inside-listing>> inside literal cell.
----

Normal <<after>> prose.
|===

[#after]
== After
`,
		);
		const document = parseAbundantTree({ sourcePath: path });

		expect(document.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"<<after>>",
		]);
	});

	it("recurses through table asciidoc cell open blocks when scanning prose", () => {
		const path = writeFixture(
			"table-open-block.adoc",
			`= Probe

== Before

[#t]
.Table
|===
a|
--
Open block prose links to <<after>>.
--
|===

[#after]
== After
`,
		);
		const document = parseAbundantTree({ sourcePath: path });

		expect(document.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"<<after>>",
		]);
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
