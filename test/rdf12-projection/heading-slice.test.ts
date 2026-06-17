import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	AbundantDocument,
	ListingNode,
	ParagraphNode,
	SectionNode,
	TableNode,
} from "../../src/model";
import { parseAbundantTree } from "../../src/parser";
import { type Rdf12Graph, rdf12Triple } from "../../src/rdf12-projection/graph";
import {
	resolveDocumentTitleHeadingSlice,
	resolveHeadingSlice,
} from "../../src/rdf12-projection/heading-slice";
import {
	integerLiteral,
	stringLiteral,
} from "../../src/rdf12-projection/literals";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { projectAbundantDocumentToRdf12 } from "../../src/rdf12-projection/projector";
import { iriTerm } from "../../src/rdf12-projection/terms";
import { writeFixture } from "../helpers";

const projectRoot = process.cwd();
const structuralPayloadPath = join(
	projectRoot,
	"samples/structural-payload.adoc",
);

describe("rdf12 heading slices", () => {
	it("projects document title raw as lines 1 through 4 with preamble content span", () => {
		const projection = structuralPayloadProjection();
		const root = resourceIri(projection.documentIri, "heading-l1-o0");

		expectStringTriple(
			projection.graph,
			root,
			"raw",
			`= root

一段摘要

`,
		);
		expectNumberTriple(projection.graph, root, "startLine", 1);
		expectNumberTriple(projection.graph, root, "endLine", 4);
		expectNumberTriple(projection.graph, root, "headingLine", 1);
		expectNumberTriple(projection.graph, root, "contentStartLine", 3);
		expectNumberTriple(projection.graph, root, "contentEndLine", 3);
		expectNoNumberTriple(projection.graph, root, "metadataStartLine");
		expectNoNumberTriple(projection.graph, root, "metadataEndLine");
	});

	it("projects delivery policy raw as lines 5 through 38", () => {
		const projection = structuralPayloadProjection();
		const deliveryPolicy = resourceIri(projection.documentIri, "heading-l5-o0");

		expectStringTriple(
			projection.graph,
			deliveryPolicy,
			"raw",
			`[#delivery.policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery]。

[.banana, for=delivery]
[source,json]
----
{
  "owner": {
    "team": "ops",
    "fallback": "manual-review"
  },
  "risk": {
    "level": "high",
    "signals": ["weather", "capacity"]
  }
}
----

[#rel-delivery.pear]
[source,yaml]
----
reason:
  type: risk-control
  signals:
    - weather
    - capacity
  description: 配送策略需要读取运力规则来决定是否降级。
edge:
  direction: outbound
  required: true
----

`,
		);
		expectNumberTriple(projection.graph, deliveryPolicy, "startLine", 5);
		expectNumberTriple(projection.graph, deliveryPolicy, "endLine", 38);
	});

	it("projects capacity rule raw as lines 39 through 43 without nested heading text", () => {
		const projection = structuralPayloadProjection();
		const capacityRule = resourceIri(projection.documentIri, "heading-l39-o0");
		const raw = onlyLiteralValue(projection.graph, capacityRule, "raw");

		expect(raw).toBe(`[#capacity.rule, status=active]
== 运力规则

运力规则描述系统在不同运力条件下如何判断配送策略是否需要降级。

`);
		expect(raw).not.toContain("=== 我是3级标题");
		expect(raw).not.toContain("123");
		expectNumberTriple(projection.graph, capacityRule, "startLine", 39);
		expectNumberTriple(projection.graph, capacityRule, "endLine", 43);
	});

	it("projects the nested heading level as 2", () => {
		const projection = structuralPayloadProjection();
		const nestedHeading = resourceIri(projection.documentIri, "heading-l44-o0");

		expectNumberTriple(projection.graph, nestedHeading, "headingLevel", 2);
	});

	it("preserves rich block source text in heading raw slices", () => {
		const source = `= Probe

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
`;
		const projection = projectFixture("heading-rich-raw.adoc", source);
		const rich = resourceIri(projection.documentIri, "heading-l3-o0");

		expectStringTriple(
			projection.graph,
			rich,
			"raw",
			`== Rich Raw

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

`,
		);
		expectNumberTriple(projection.graph, rich, "contentStartLine", 5);
		expectNumberTriple(projection.graph, rich, "contentEndLine", 25);
	});

	it("preserves table-only heading raw instead of replacing table rows with blanks", () => {
		const source = `= Probe

== Table Section

[cols="1,1", options="header"]
|===
|Name |Value

|alpha |1
|beta |2
|===

== Next
`;
		const projection = projectFixture("heading-table-raw.adoc", source);
		const tableSection = resourceIri(projection.documentIri, "heading-l3-o0");
		const raw = onlyLiteralValue(projection.graph, tableSection, "raw");

		expect(raw).toContain("|Name |Value");
		expect(raw).toContain("|alpha |1");
		expect(raw).toContain("|beta |2");
		expect(raw).not.toMatch(/\|===\n\n\n\n\n\|===/u);
		expectNumberTriple(projection.graph, tableSection, "contentStartLine", 5);
		expectNumberTriple(projection.graph, tableSection, "contentEndLine", 11);
	});

	it("returns no heading slice when a section has no line or title span", () => {
		expect(
			resolveHeadingSlice({
				kind: "section",
				level: 1,
				ids: [],
				title: "Unlocated",
				idOrigin: "unknown",
				children: [],
			}),
		).toBeUndefined();
	});

	it("uses titleSpan fallback and omits invalid child-only content spans before heading content", () => {
		const paragraph: ParagraphNode = {
			kind: "paragraph",
			text: "before",
			source: {
				span: { startLine: 1, endLine: 1 },
			},
		};
		const section: SectionNode = {
			kind: "section",
			level: 1,
			ids: [],
			title: "Fallback",
			titleSpan: {
				start: { line: 4, column: 4 },
				end: { line: 4, column: 12 },
			},
			span: { startLine: 4, endLine: 4 },
			idOrigin: "unknown",
			children: [paragraph],
		};

		expect(resolveHeadingSlice(section)).toEqual({
			span: { startLine: 4, endLine: 4 },
			headingLine: 4,
			raw: "== Fallback\n",
		});
	});

	it("builds fallback heading raw from metadata, paragraph, listing, and ignores nested sections", () => {
		const listing: ListingNode = {
			kind: "listing",
			ids: [],
			metadata: [
				{
					kind: "metadata",
					metadataKind: "attrlist",
					raw: "[source,js]",
					line: 6,
				},
			],
			span: { startLine: 6, endLine: 10 },
			contentSpan: { startLine: 8, endLine: 9 },
			content: "console.log(1);\nconsole.log(2);",
		};
		const paragraph: ParagraphNode = {
			kind: "paragraph",
			text: "Body text",
			source: {
				span: { startLine: 4, endLine: 4 },
			},
		};
		const table: TableNode = {
			kind: "table",
			ids: [],
			span: { startLine: 12, endLine: 14 },
		};
		const childSection: SectionNode = {
			kind: "section",
			level: 2,
			ids: [],
			title: "Nested",
			line: 16,
			span: { startLine: 16, endLine: 17 },
			idOrigin: "unknown",
			children: [],
		};
		const section: SectionNode = {
			kind: "section",
			level: 1,
			ids: [],
			title: "Fallback Raw",
			line: 3,
			span: { startLine: 2, endLine: 17 },
			metadata: [
				{
					kind: "metadata",
					metadataKind: "id",
					raw: "[#fallback]",
					line: 2,
				},
			],
			idOrigin: "source",
			children: [paragraph, listing, table, childSection],
		};

		const slice = resolveHeadingSlice(section);

		expect(slice).toEqual({
			span: { startLine: 2, endLine: 15 },
			headingLine: 3,
			metadataSpan: { startLine: 2, endLine: 2 },
			contentSpan: { startLine: 4, endLine: 14 },
			raw: [
				"[#fallback]",
				"== Fallback Raw",
				"Body text",
				"",
				"[source,js]",
				"----",
				"console.log(1);",
				"console.log(2);",
				"----",
				"",
				"",
				"",
				"",
				"",
				"",
			].join("\n"),
		});
	});

	it("uses origin source raw slices and derives content span from nonblank raw lines", () => {
		const section: SectionNode = {
			kind: "section",
			level: 1,
			ids: [],
			title: "Origin Raw",
			line: 5,
			idOrigin: "source",
			source: {
				relativePath: "chapter.adoc",
				span: { startLine: 4, endLine: 8 },
				raw: "[#origin]\n== Origin Raw\n\nbody\n\n",
			},
			children: [],
		};

		expect(resolveHeadingSlice(section)).toEqual({
			span: { startLine: 4, endLine: 8 },
			headingLine: 5,
			metadataSpan: { startLine: 4, endLine: 4 },
			contentSpan: { startLine: 7, endLine: 7 },
			raw: "[#origin]\n== Origin Raw\n\nbody\n\n",
		});
	});

	it("falls back to synthetic document title raw when source text is unavailable and handles missing titles", () => {
		const titled: AbundantDocument = {
			kind: "document",
			sourcePath: "book.adoc",
			parser: { name: "@asciidoctor/core", version: "test" },
			mode: "single-file",
			title: {
				kind: "title",
				text: "Book",
				source: { line: 1 },
			},
			children: [],
			targets: [],
			xrefOccurrences: [],
			anchorOccurrences: [],
			toolDiagnostics: [],
		};
		const { title: _title, ...untitled } = titled;

		expect(resolveDocumentTitleHeadingSlice(titled, {})).toEqual({
			span: { startLine: 1, endLine: 1 },
			headingLine: 1,
			raw: "= Book\n",
		});
		expect(
			resolveDocumentTitleHeadingSlice(untitled, {
				sourceText: "= Book\n",
			}),
		).toBeUndefined();
	});

	it("uses child section metadata to stop document title raw before the first section", () => {
		const document: AbundantDocument = {
			kind: "document",
			sourcePath: "book.adoc",
			parser: { name: "@asciidoctor/core", version: "test" },
			mode: "single-file",
			title: {
				kind: "title",
				text: "Book",
				source: { line: 1 },
			},
			children: [
				{
					kind: "section",
					level: 1,
					ids: [],
					title: "First",
					titleSpan: {
						start: { line: 5, column: 4 },
						end: { line: 5, column: 9 },
					},
					metadata: [
						{
							kind: "metadata",
							metadataKind: "id",
							raw: "[#first]",
							line: 4,
						},
					],
					idOrigin: "source",
					children: [],
				},
			],
			targets: [],
			xrefOccurrences: [],
			anchorOccurrences: [],
			toolDiagnostics: [],
		};

		expect(
			resolveDocumentTitleHeadingSlice(document, {
				sourceText: "= Book\n\npreamble\n\n[#first]\n== First\n",
			}),
		).toEqual({
			span: { startLine: 1, endLine: 3 },
			headingLine: 1,
			contentSpan: { startLine: 3, endLine: 3 },
			raw: "= Book\n\npreamble\n",
		});
	});
});

function structuralPayloadProjection() {
	return projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: structuralPayloadPath }),
		{ documentRoot: projectRoot },
	);
}

function projectFixture(name: string, source: string) {
	const path = writeFixture(name, source);
	return projectAbundantDocumentToRdf12(
		parseAbundantTree({ sourcePath: path }),
		{
			documentRoot: projectRoot,
		},
	);
}

function resourceIri(documentIri: string, localId: string): string {
	return `${documentIri.slice(0, documentIri.indexOf("#"))}#${localId}`;
}

function onlyLiteralValue(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
): string {
	const values = graph
		.match({
			subject: iriTerm(subject),
			predicate: iriTerm(`${namespaces.aat}${predicateLocalName}`),
		})
		.flatMap((triple) =>
			triple.object.termType === "literal" ? [triple.object.value] : [],
		);

	expect(values).toHaveLength(1);
	return values[0] ?? "";
}

function expectStringTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
	value: string,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				stringLiteral(value),
			),
		),
	).toBe(true);
}

function expectNumberTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
	value: number,
): void {
	expect(
		graph.has(
			rdf12Triple(
				iriTerm(subject),
				iriTerm(`${namespaces.aat}${predicateLocalName}`),
				integerLiteral(value),
			),
		),
	).toBe(true);
}

function expectNoNumberTriple(
	graph: Rdf12Graph,
	subject: string,
	predicateLocalName: string,
): void {
	expect(
		graph.match({
			subject: iriTerm(subject),
			predicate: iriTerm(`${namespaces.aat}${predicateLocalName}`),
		}),
	).toHaveLength(0);
}
