import { describe, expect, it } from "vitest";
import type { ListingNode, ParagraphNode, SectionNode } from "../src/model";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

describe("parser input edges", () => {
	it("keeps source spans stable for CRLF input", () => {
		const path = writeFixture(
			"crlf-input.adoc",
			[
				"= Probe",
				"",
				"== Before",
				"",
				"See <<target>> in CRLF input.",
				"",
				"[#target]",
				"== Target",
				"",
			].join("\r\n"),
		);

		const document = parseAbundantTree({ sourcePath: path });
		const before = findNode(
			document.children,
			"section",
			"Before",
		) as SectionNode;
		const xref = document.xrefOccurrences[0];
		const target = findNode(
			document.children,
			"section",
			"Target",
		) as SectionNode;

		expect(document.title?.source?.sourceSpan).toEqual({
			start: { line: 1, column: 1 },
			end: { line: 1, column: 8 },
		});
		expect(before.titleSpan).toEqual({
			start: { line: 3, column: 4 },
			end: { line: 3, column: 10 },
		});
		expect(xref).toEqual(
			expect.objectContaining({
				raw: "<<target>>",
				sourceSpan: {
					start: { line: 5, column: 5 },
					end: { line: 5, column: 15 },
				},
				containingSectionId: "_before",
			}),
		);
		expect(target.titleSpan).toEqual({
			start: { line: 8, column: 4 },
			end: { line: 8, column: 10 },
		});
	});

	it("counts Unicode columns by code point for inline occurrences", () => {
		const path = writeFixture(
			"unicode-columns.adoc",
			`= Probe

== Before

中文🙂 before [[锚点]] and <<目标🙂>>.

[#目标🙂]
== Target
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const anchor = document.anchorOccurrences[0];
		const xref = document.xrefOccurrences[0];

		expect(anchor).toEqual(
			expect.objectContaining({
				raw: "[[锚点]]",
				sourceSpan: {
					start: { line: 5, column: 12 },
					end: { line: 5, column: 18 },
				},
			}),
		);
		expect(xref).toEqual(
			expect.objectContaining({
				raw: "<<目标🙂>>",
				sourceSpan: {
					start: { line: 5, column: 23 },
					end: { line: 5, column: 30 },
				},
			}),
		);
	});

	it("does not extend no-trailing-newline paragraph spans past EOF", () => {
		const path = writeFixture(
			"no-trailing-newline-paragraph.adoc",
			"= Probe\n\n== Before\n\nFinal paragraph without trailing newline.",
		);

		const document = parseAbundantTree({ sourcePath: path });
		const before = findNode(
			document.children,
			"section",
			"Before",
		) as SectionNode;
		const paragraph = findNode(document.children, "paragraph") as ParagraphNode;

		expect(before.span).toEqual({ startLine: 3, endLine: 5 });
		expect(paragraph.text).toBe("Final paragraph without trailing newline.");
		expect(paragraph.source?.span).toEqual({ startLine: 5, endLine: 5 });
	});

	it("does not extend no-trailing-newline listing spans past EOF", () => {
		const path = writeFixture(
			"no-trailing-newline-listing.adoc",
			"= Probe\n\n== Before\n\n----\ncode\n----",
		);

		const document = parseAbundantTree({ sourcePath: path });
		const listing = findNode(document.children, "listing") as ListingNode;

		expect(listing.span).toEqual({ startLine: 5, endLine: 7 });
		expect(listing.contentSpan).toEqual({ startLine: 6, endLine: 6 });
		expect(listing.content).toBe("code");
	});

	it("parses a document title only without manufacturing sections", () => {
		const path = writeFixture("title-only.adoc", "= Only Title");

		const document = parseAbundantTree({ sourcePath: path });

		expect(document.title).toEqual(
			expect.objectContaining({
				text: "Only Title",
				source: expect.objectContaining({
					line: 1,
					sourceSpan: {
						start: { line: 1, column: 1 },
						end: { line: 1, column: 13 },
					},
				}),
			}),
		);
		expect(document.children).toEqual([]);
		expect(document.targets).toEqual([]);
		expect(document.xrefOccurrences).toEqual([]);
		expect(document.anchorOccurrences).toEqual([]);
	});

	it("parses an empty document without manufacturing a title or structure", () => {
		const path = writeFixture("empty-document.adoc", "");

		const document = parseAbundantTree({ sourcePath: path });

		expect(document.title).toEqual(
			expect.objectContaining({
				text: "",
				source: expect.objectContaining({
					line: 1,
					sourceSpan: {
						start: { line: 1, column: 1 },
						end: { line: 1, column: 1 },
					},
				}),
			}),
		);
		expect(document.children).toEqual([]);
		expect(document.targets).toEqual([]);
		expect(document.xrefOccurrences).toEqual([]);
		expect(document.anchorOccurrences).toEqual([]);
	});

	it("preserves attrlist edge metadata on blocks without inventing structure", () => {
		const path = writeFixture(
			"metadata-attrlist-edges.adoc",
			`= Probe

[source,ts,#late-id,.late-role,flag=,key=value=with=equals]
----
const value = 1;
----

[[anchored-listing,Anchored Listing]]
[quote]
----
quoted
----
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const listings = collectNodes(
			document.children,
			"listing",
		) as ListingNode[];

		expect(listings[0]).toEqual(
			expect.objectContaining({
				ids: ["late-id"],
				style: "source",
				language: "ts",
				metadata: [
					expect.objectContaining({
						metadataKind: "attrlist",
						ids: ["late-id"],
						roles: ["late-role"],
						attributes: {
							style: "source",
							language: "ts",
							flag: "",
							key: "value=with=equals",
						},
					}),
				],
			}),
		);
		expect(listings[1]).toEqual(
			expect.objectContaining({
				ids: ["anchored-listing"],
				style: "quote",
				metadata: [
					expect.objectContaining({
						metadataKind: "anchor",
						ids: ["anchored-listing"],
					}),
					expect.objectContaining({
						metadataKind: "attrlist",
						attributes: {
							style: "quote",
						},
					}),
				],
			}),
		);
	});

	it("preserves id and role attrlists that intentionally omit style and language", () => {
		const path = writeFixture(
			"metadata-id-role-only.adoc",
			`= Probe

[.role-only]
----
content
----
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const listing = findNode(document.children, "listing") as ListingNode;
		const attrlist = listing.metadata?.find(
			(metadata) => metadata.metadataKind === "attrlist",
		);

		expect(listing).toEqual(
			expect.objectContaining({
				ids: [],
				style: "listing",
			}),
		);
		expect(listing).not.toHaveProperty("language");
		expect(attrlist).toEqual(
			expect.objectContaining({
				ids: [],
				roles: ["role-only"],
				attributes: {},
			}),
		);
		expect(attrlist).not.toHaveProperty("style");
		expect(attrlist?.attributes).not.toHaveProperty("style");
		expect(attrlist?.attributes).not.toHaveProperty("language");
	});

	it("parses section shorthand id roles and named attributes as one attrlist", () => {
		const path = writeFixture(
			"metadata-section-id-role-attributes.adoc",
			`= Probe

[#abc.section, kind=policy, status=active, owner=ops]
== 西红柿
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = findNode(
			document.children,
			"section",
			"西红柿",
		) as SectionNode;
		const attrlist = section.metadata?.find(
			(metadata) => metadata.metadataKind === "attrlist",
		);

		expect(section).toEqual(
			expect.objectContaining({
				ids: ["abc"],
				title: "西红柿",
			}),
		);
		expect(attrlist).toEqual(
			expect.objectContaining({
				metadataKind: "attrlist",
				ids: ["abc"],
				roles: ["section"],
				attributes: {
					kind: "policy",
					status: "active",
					owner: "ops",
				},
			}),
		);
	});
});

function findNode(
	nodes: unknown[],
	kind: string,
	title?: string,
): unknown | undefined {
	for (const node of nodes as Array<{
		kind?: string;
		title?: string;
		children?: unknown[];
	}>) {
		if (node.kind === kind && (title === undefined || node.title === title)) {
			return node;
		}
		const found = findNode(node.children ?? [], kind, title);
		if (found) {
			return found;
		}
	}
	return undefined;
}

function collectNodes(nodes: unknown[], kind: string): unknown[] {
	const result: unknown[] = [];
	for (const node of nodes as Array<{ kind?: string; children?: unknown[] }>) {
		if (node.kind === kind) {
			result.push(node);
		}
		result.push(...collectNodes(node.children ?? [], kind));
	}
	return result;
}
