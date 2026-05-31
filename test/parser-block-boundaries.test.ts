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

	it("extracts xrefs from Asciidoctor inline-substituted prose contexts only", () => {
		const path = writeFixture(
			"xref-inline-substitution-contexts.adoc",
			`= Probe

[#target]
== Target

== Links

Paragraph xref:target[Paragraph, rel=paragraph].

Unordered:
* unordered xref:target[Unordered, rel=unordered]

Ordered:
. ordered xref:target[Ordered, rel=ordered]

Nested:
* parent
** nested unordered xref:target[Nested Unordered, rel=nested-unordered]
. parent
.. nested ordered xref:target[Nested Ordered, rel=nested-ordered]

Description:
term xref:target[Term, rel=term]:: desc xref:target[Desc, rel=desc]
+
continued xref:target[Continued, rel=continued]

[quote]
____
quote xref:target[Quote, rel=quote]
____

NOTE: note xref:target[Note, rel=note]

[example]
====
example xref:target[Example, rel=example]
====

[sidebar]
****
sidebar xref:target[Sidebar, rel=sidebar]
****

[verse]
____
verse xref:target[Verse, rel=verse]
____

[open]
--
open xref:target[Open, rel=open]
--

.Block title xref:target[Block Title, rel=title]
block title body xref:target[Block Body, rel=body]

----
listing xref:target[Listing, rel=listing]
----

[source]
----
source xref:target[Source, rel=source]
----

....
literal xref:target[Literal, rel=literal]
....

++++
pass xref:target[Pass, rel=pass]
++++

[stem]
++++
stem xref:target[Stem, rel=stem]
++++
`,
		);
		const document = parseAbundantTree({ sourcePath: path });

		expect(
			document.xrefOccurrences.map((xref) => xref.attributes?.rel),
		).toEqual([
			"paragraph",
			"unordered",
			"ordered",
			"nested-unordered",
			"nested-ordered",
			"term",
			"desc",
			"continued",
			"quote",
			"note",
			"example",
			"sidebar",
			"verse",
			"open",
			"title",
			"body",
		]);
		expect(
			document.xrefOccurrences.map((xref) => xref.attributes?.rel),
		).not.toEqual(
			expect.arrayContaining(["listing", "source", "literal", "pass", "stem"]),
		);
		expect(
			document.xrefOccurrences.every(
				(xref) => xref.containingSectionId === "_links",
			),
		).toBe(true);
	});

	it("stores rich section raw on the AST instead of requiring downstream file slicing", () => {
		const path = writeFixture(
			"section-rich-source-raw.adoc",
			`= Probe

== Rich Raw

Lead paragraph.

* first item
* second item

[horizontal]
term:: definition

[#sample-table]
.Table Title
|===
|A |B

|1 |2
|===

--
open block paragraph
--

NOTE: Admonition paragraph.

== Next
`,
		);
		const document = parseAbundantTree({ sourcePath: path });
		const section = document.children.find(
			(node) => node.kind === "section" && node.title === "Rich Raw",
		) as SectionNode | undefined;

		expect(section?.source?.span).toEqual({ startLine: 3, endLine: 26 });
		expect(section?.source?.raw).toBe(`== Rich Raw

Lead paragraph.

* first item
* second item

[horizontal]
term:: definition

[#sample-table]
.Table Title
|===
|A |B

|1 |2
|===

--
open block paragraph
--

NOTE: Admonition paragraph.

`);
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
