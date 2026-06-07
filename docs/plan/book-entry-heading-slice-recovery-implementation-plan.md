已经完成，0.1.12
# Book-entry Heading Slice Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make book-entry section source layers and RDF12 heading resources obey the bookshelf heading-slice contract: a heading raw slice runs from that heading's metadata or heading line through the line before the next real heading slice in the same origin source file, never through a table/listing/block delimiter heuristic.

**Architecture:** Keep the RDF12 graph as a heading projection graph. Replace book-entry section raw recovery's block-boundary scan with an origin heading boundary index built from official section surfaces and line-origin mappings. Leave block, xref, payload, and source-scope recovery source-aware, but make public `section.source.raw/span` and RDF `aat:raw/startLine/endLine/content*Line` derive from the corrected origin heading slice.

**Tech Stack:** TypeScript, Vitest, `@asciidoctor/core`, book-entry logical source recovery under `src/book-entry`, source-surface projection under `src/source-surfaces.ts`, RDF12 projection under `src/rdf12-projection`.

---

## Source Of Truth

The long-term rule source is `docs/bookshelf/books/06-rdf12-line-projection`.

Use these object facts as normative:

- A heading node is created from an AsciiDoc equals heading.
- A heading slice is the continuous source-text region owned by one heading node.
- A heading slice starts at the first metadata line that belongs to the heading; if no metadata belongs to the heading, it starts at the heading line.
- A heading slice ends at the line before the next heading slice starts.
- If no next heading slice exists in the relevant source file, the slice ends at that source file's final line.
- `aat:raw` is the exact source text of the heading slice.
- Paragraphs, listings, tables, payload blocks, labels, surface attributes, and inline anchors do not become RDF structure nodes.
- Non-heading blocks may still appear inside heading raw, provide address labels, provide payloads, provide xref evidence, and carry source coordinates.
- A parent heading raw excludes child heading raw because the child heading has its own heading slice. Full subtree text is a recursive query result, not one node field.

Use `docs/bookshelf/books/10-book-entry-source-mapped-logical-document` as the book-entry raw-recovery supplement:

- Logical text is an in-memory parse input, not an authored source file.
- Include directive lines are replaced by included file lines in logical text.
- Include directive lines remain in their origin source files and can appear in entry-file heading raw.
- Heading raw must be recovered from origin source file line tables.
- Logical document structure supplies section relations and line-origin mappings; logical text must not be emitted as heading raw.

Current tests and implementation notes are evidence of current behavior. They do not override the books. Tests that assert a contrary boundary must be updated.

## Object Rules

### Heading Slice Identity

A heading slice is an origin-file line span. Its `relativePath`, `startLine`, `endLine`, `headingLine`, `metadata*Line`, `content*Line`, and `raw` all describe one authored source file.

For book-entry mode, the origin file is the file that authored the heading line.

### Heading Slice Start

The slice start is:

1. the first contiguous metadata line immediately preceding the heading, when that metadata belongs to the heading and maps to the same origin file as the heading;
2. otherwise the heading line.

Metadata from a different origin file must not become the slice start for this origin-file raw slice.

### Heading Slice End

The slice end is:

1. the line before the next real heading slice start in the same origin source file;
2. otherwise the origin source file's final line.

A real heading slice start is derived from an official section surface, not from a regex scan over arbitrary source text.

### Non-Boundaries

These source surfaces do not end a heading slice:

- a paragraph start line;
- an unordered or ordered list line;
- an AsciiDoc table delimiter such as `|===`;
- a listing/source delimiter such as `----`;
- ordinary block metadata such as `[source,json]`, `[cols="1,2"]`, `[#payload]`, `[id=...]`, or `.Block Title`;
- payload listing metadata;
- inline anchors;
- table cell text that looks like a heading but is not an official section surface.

Block metadata becomes a heading slice start only when it is the contiguous metadata immediately preceding a real official heading surface.

### Book-entry Include Rule

Book-entry raw recovery never emits raw from the logical text. It emits raw from one origin source file.

If an entry-file heading contains an include directive, that directive can appear in the entry-file heading raw because it is authored text in that origin file. The included heading's own raw is recovered from the included file and is connected through heading structure edges.

### Source Scope Rule

Source scope for containment and heading slice for public RDF raw are separate concepts, but they must not contradict the heading-slice contract.

Source scope can remain an internal relativePath-aware containment index. It must not be used to justify truncating public `section.source.raw/span` before non-heading body blocks.

## Current Deviation

The current book-entry source layer uses this path:

- `src/parser.ts` builds `LogicalSource` and parses `logicalText`.
- `src/parser-core.ts` calls `projectSourceSurfaces()`.
- `src/source-surfaces.ts` builds section source layers before RDF projection.
- `buildSectionSurfaces()` calls `recoverSectionSourceLayer()`.
- `recoverSectionSourceLayer()` calls `sectionHeadingSliceEndLine()`.
- `sectionHeadingSliceEndLine()` treats `isBlockMetadataLine(trimmed)`, `trimmed === "----"`, and `trimmed === "|==="` as heading slice boundaries.

That predicate is too broad. It recognizes block surfaces, not heading slice starts.

Concrete failures:

- A book-entry appendix include whose included file starts with a heading followed by `[cols=...]` table metadata is truncated to heading line plus blank line.
- The same included file with a bare `|===` table is truncated to heading line plus blank line.
- A book-entry included heading followed by `----` listing/source block is truncated to heading line plus blank line.
- RDF12 heading projection inherits the truncated public source layer and emits the same short `aat:endLine` and `aat:raw`.

Single-file projection already obeys the bookshelf rule for `samples/structural-payload.adoc`: `配送策略` spans lines 5-40 and includes payload source blocks in `aat:raw`.

## Architecture

### New Internal Object: Origin Heading Boundary

Add an internal boundary record:

```ts
type OriginHeadingBoundary = {
	readonly relativePath: string;
	readonly headingLine: number;
	readonly sliceStartLine: number;
};
```

`headingLine` is the origin source line that authored the official section heading.

`sliceStartLine` is the origin source line where this heading slice starts. It is the same-origin metadata start line when available; otherwise it is `headingLine`.

### New Internal Index: Origin Heading Boundary Index

Build an index before recovering section source layers:

```ts
type OriginHeadingBoundaryIndex = Map<string, readonly OriginHeadingBoundary[]>;
```

Construction rules:

1. Traverse only official section surfaces.
2. Resolve each section surface's logical heading line through `LogicalSource.lineOrigins`.
3. Resolve the section interval's logical metadata start through `LogicalSource.lineOrigins`.
4. Use the metadata origin as `sliceStartLine` only when it maps to the same `relativePath` as the heading origin.
5. Group by `relativePath`.
6. Sort each group by `sliceStartLine`, then `headingLine`.

Do not scan source text for heading-looking lines when building this index.

### Source Layer Recovery Rule

For a section with origin boundary `current`:

```ts
const next = nextBoundaryInSameOriginFile(index, current);
const endLine = next ? next.sliceStartLine - 1 : sourceFile.lineTable.lines.length;
```

Then recover:

```ts
const lineSpan = {
	startLine: current.sliceStartLine,
	endLine,
};
```

`raw` is `sourceLines(sourceFile.lineTable, lineSpan.startLine, lineSpan.endLine).join("\n") + "\n"`.

The old block delimiter boundary predicate must not participate in section source layer recovery.

### Cross-Origin Behavior

The boundary lookup is same-origin only.

If the next logical heading in document order comes from an included file, it creates a heading node and structure edge, but it is not a raw boundary inside the current origin file.

If the current origin file has no later official heading boundary, the current origin-file heading raw extends to that origin file's final line.

### RDF Behavior

Do not change `src/rdf12-projection/heading-slice.ts` unless tests reveal a projection-only defect.

That module already trusts origin-aware `node.source.raw/span`. After book-entry source layer recovery is corrected, RDF12 `aat:raw`, `aat:startLine`, `aat:endLine`, `aat:contentStartLine`, and `aat:contentEndLine` should update through the existing path.

## File Map

Modify implementation:

- `src/source-surfaces.ts`
  - Build the origin heading boundary index from official section surfaces.
  - Pass the current section's boundary and next same-origin boundary into source layer recovery.
  - Keep source-scope registration separate from public heading slice recovery.

- `src/book-entry/origin-coordinate.ts`
  - Replace `sectionHeadingSliceEndLine()` usage with explicit next-origin-boundary recovery.
  - Keep raw recovery from origin source file line tables.
  - Preserve existing diagnostics for missing heading origin, missing source file, and missing line spans.

- `src/book-entry/model.ts`
  - Avoid public model changes unless implementation needs a shared internal type.
  - Prefer file-local types in `source-surfaces.ts` when possible.

Modify tests:

- `test/book-entry/heading-slice-recovery.test.ts`
  - Add focused book-entry heading slice regressions.

- `test/book-entry/source-coordinate-recovery.test.ts`
  - Update old assertions that expect book-entry heading raw to exclude same-origin table/listing/source blocks before the next heading.

- `test/rdf12-projection/book-entry-coordinate.test.ts`
  - Add RDF12 assertions for table/listing/source-block heading raw and line spans.

Modify documentation only if necessary:

- `docs/bookshelf/books/11-book-entry-source-mapped-logical-document-implementation-plan/backmatter/batch-04-review-package.adoc`
  - If touched, mark the old block-boundary note as an implementation-history note, not a current rule.

## Test Plan

### Red Test 1: Included Appendix Table Starts Body

Add a fixture-driven test. Use a temporary in-test fixture or permanent fixture files under `test/book-entry/fixtures`.

Recommended permanent fixture:

- `test/book-entry/fixtures/heading-slice-book/book.adoc`
- `test/book-entry/fixtures/heading-slice-book/backmatter/appendix-table.adoc`

`book.adoc`:

```asciidoc
= Heading Slice Book
:doctype: book

[appendix]
include::backmatter/appendix-table.adoc[]
```

`appendix-table.adoc`:

```asciidoc
= Appendix Table

[cols="1,2", options="header"]
|===
|Syntax |Meaning

|`= Book`
|document title.

|`== Chapter`
|chapter.
|===
```

Add this test:

```ts
it("recovers book-entry included heading raw through a table body", () => {
	const document = parseAbundantTree({
		sourcePath: join(headingSliceFixtureRoot, "book.adoc"),
		mode: "book-entry",
		documentRoot: headingSliceFixtureRoot,
	});
	const section = sectionByTitle(document, "Appendix Table");

	expect(section.source?.relativePath).toBe("backmatter/appendix-table.adoc");
	expect(section.source?.span).toEqual({ startLine: 1, endLine: 11 });
	expect(section.span).toEqual({ startLine: 1, endLine: 11 });
	expect(section.source?.raw).toContain('[cols="1,2", options="header"]');
	expect(section.source?.raw).toContain("|`== Chapter`");
	expect(section.source?.raw).toContain("|===");
});
```

Run:

```bash
pnpm exec vitest run test/book-entry/source-coordinate-recovery.test.ts --reporter=dot
```

Expected before implementation: FAIL because current section source span ends at line 2.

### Red Test 2: Included Heading With Listing Body

Create `test/book-entry/fixtures/heading-slice-book/backmatter/appendix-listing.adoc`:

```asciidoc
= Appendix Listing

[source,js]
----
console.log("appendix");
----
```

Add an include entry or a second entry fixture.

Assert:

```ts
expect(section.source?.span).toEqual({ startLine: 1, endLine: 6 });
expect(section.source?.raw).toContain("[source,js]");
expect(section.source?.raw).toContain('console.log("appendix");');
expect(section.source?.raw).toContain("----");
```

Expected before implementation: FAIL because current section source span ends at line 2 or before block metadata.

### Red Test 3: Metadata Before Next Real Heading Is Boundary

Create a same-origin fixture:

```asciidoc
= First Heading

First body.

[#second-heading.rule]
== Second Heading

Second body.
```

Assert:

```ts
expect(first.source?.span).toEqual({ startLine: 1, endLine: 4 });
expect(first.source?.raw).not.toContain("[#second-heading.rule]");
expect(second.source?.span).toEqual({ startLine: 5, endLine: 8 });
```

This protects the real heading metadata boundary.

### Red Test 4: Table Cell Text That Looks Like A Heading Does Not Truncate

Create a heading with a table cell that contains `== Not A Heading` as plain cell text. Assert the heading source span reaches the real next heading or EOF. This must use official section surfaces for boundary detection; a regex-only implementation will fail this test.

### Red Test 5: RDF12 Projection Inherits Correct Book-entry Slice

In `test/rdf12-projection/book-entry-coordinate.test.ts`, add:

```ts
it("projects book-entry heading raw through an included table body", () => {
	const document = parseAbundantTree({
		sourcePath: join(headingSliceFixtureRoot, "book.adoc"),
		mode: "book-entry",
		documentRoot: headingSliceFixtureRoot,
	});
	const projection = rdf12(document, { documentRoot: headingSliceFixtureRoot });
	const heading = headingByHeadline(projection.graph, "Appendix Table");
	const raw = onlyLiteralValue(projection.graph, heading, aatTerm("raw"));

	expectLiteralValue(
		projection.graph,
		heading,
		aatTerm("relativePath"),
		"backmatter/appendix-table.adoc",
	);
	expectNumberTriple(projection.graph, heading, "startLine", 1);
	expectNumberTriple(projection.graph, heading, "endLine", 11);
	expect(raw).toContain("|`== Chapter`");
});
```

Use the existing helper style in the file. If `expectNumberTriple` is not imported there, either import it from helper matchers or use the local numeric triple assertion already present in that test file.

## Implementation Tasks

### Task 1: Add Failing Book-entry Heading Slice Tests

**Files:**

- Create or modify fixtures under `test/book-entry/fixtures/heading-slice-book/`.
- Create: `test/book-entry/heading-slice-recovery.test.ts`.
- Modify: `test/book-entry/source-coordinate-recovery.test.ts`.
- Modify: `test/rdf12-projection/book-entry-coordinate.test.ts`.

- [x] **Step 1: Add fixtures**

Create the table, listing, same-origin-next-heading, and fake-table-heading fixtures described in the Test Plan.

- [x] **Step 2: Add JSON/model tests**

Add tests that assert `section.source.span`, `section.span`, and `section.source.raw`.

- [x] **Step 3: Add RDF12 tests**

Add tests that assert `aat:raw`, `aat:startLine`, `aat:endLine`, and `aat:content*Line` when relevant.

- [x] **Step 4: Run focused tests and confirm red**

Run:

```bash
pnpm exec vitest run test/book-entry/heading-slice-recovery.test.ts test/book-entry/source-coordinate-recovery.test.ts test/rdf12-projection/book-entry-coordinate.test.ts --reporter=dot
```

Expected: FAIL on the new table/listing/source-block cases.

### Task 2: Build Origin Heading Boundary Index

**Files:**

- Modify: `src/source-surfaces.ts`.

- [x] **Step 1: Add internal types**

Add file-local types:

```ts
type OriginHeadingBoundary = {
	readonly relativePath: string;
	readonly headingLine: number;
	readonly sliceStartLine: number;
};

type OriginHeadingBoundaryIndex = Map<string, readonly OriginHeadingBoundary[]>;
```

- [x] **Step 2: Add index builder**

Create a helper near `buildSectionSurfaces()`:

```ts
function buildOriginHeadingBoundaryIndex(
	blockSurfaces: readonly OfficialBlockSurface[],
	intervalByBlock: WeakMap<AsciidoctorBlock, SourceInterval>,
	logicalSource: ReturnType<typeof logicalSourceForLineTable>,
): OriginHeadingBoundaryIndex | undefined {
	if (!logicalSource) {
		return undefined;
	}
	const grouped = new Map<string, OriginHeadingBoundary[]>();
	for (const surface of blockSurfaces) {
		if (surface.context !== "section") {
			continue;
		}
		if (hasDiagnosticPolicyAncestor(surface)) {
			continue;
		}
		const logicalHeadingLine = surface.sourceLine;
		const interval = intervalByBlock.get(surface.block);
		if (logicalHeadingLine === undefined || !interval) {
			continue;
		}
		const headingOrigin = logicalSource.lineOrigins[logicalHeadingLine - 1];
		if (!headingOrigin) {
			continue;
		}
		const metadataOrigin =
			logicalSource.lineOrigins[interval.span.startLine - 1] ?? headingOrigin;
		const sliceStartLine =
			metadataOrigin.relativePath === headingOrigin.relativePath
				? metadataOrigin.sourceLine
				: headingOrigin.sourceLine;
		const bucket = grouped.get(headingOrigin.relativePath) ?? [];
		bucket.push({
			relativePath: headingOrigin.relativePath,
			headingLine: headingOrigin.sourceLine,
			sliceStartLine,
		});
		grouped.set(headingOrigin.relativePath, bucket);
	}
	return new Map(
		[...grouped.entries()].map(([relativePath, boundaries]) => [
			relativePath,
			boundaries.toSorted(
				(left, right) =>
					left.sliceStartLine - right.sliceStartLine ||
					left.headingLine - right.headingLine,
			),
		]),
	);
}
```

- [x] **Step 3: Add lookup helper**

```ts
function nextOriginHeadingBoundary(
	index: OriginHeadingBoundaryIndex | undefined,
	current: OriginHeadingBoundary | undefined,
): OriginHeadingBoundary | undefined {
	if (!index || !current) {
		return undefined;
	}
	return index
		.get(current.relativePath)
		?.find((candidate) => candidate.sliceStartLine > current.sliceStartLine);
}
```

- [x] **Step 4: Add current boundary lookup helper**

```ts
function originHeadingBoundaryForSection(
	index: OriginHeadingBoundaryIndex | undefined,
	relativePath: string | undefined,
	sliceStartLine: number | undefined,
): OriginHeadingBoundary | undefined {
	if (!index || relativePath === undefined || sliceStartLine === undefined) {
		return undefined;
	}
	return index
		.get(relativePath)
		?.find((candidate) => candidate.sliceStartLine === sliceStartLine);
}
```

If duplicate starts are possible, use both `sliceStartLine` and `headingLine`.

### Task 3: Change Section Source Layer Recovery To Use Next Origin Heading Boundary

**Files:**

- Modify: `src/book-entry/origin-coordinate.ts`.
- Modify: `src/source-surfaces.ts`.

- [x] **Step 1: Change `recoverSectionSourceLayer` signature**

Change the function to accept an optional next boundary start:

```ts
export function recoverSectionSourceLayer(
	logicalSource: LogicalSource,
	logicalHeadingLine: number,
	logicalMetadataStartLine: number,
	logicalTitleSpan: SourceSpan | undefined,
	nextOriginHeadingSliceStartLine: number | undefined,
): OriginRecoveryResult
```

- [x] **Step 2: Replace `sectionHeadingSliceEndLine()` call**

Inside `recoverSectionSourceLayer()`, compute:

```ts
const endLine =
	nextOriginHeadingSliceStartLine !== undefined
		? Math.max(startLine, nextOriginHeadingSliceStartLine - 1)
		: sourceFile.lineTable.lines.length;
const lineSpan = { startLine, endLine };
```

Keep `originSourceSpan()` and `sourceLines()` unchanged.

- [x] **Step 3: Stop using block delimiter boundaries for section raw**

Remove `sectionHeadingSliceEndLine()`, `metadataStartBeforeBoundary()`, `isHeadingSliceBoundaryLine()`, and `isSectionHeadingLine()` if no callers remain.

Keep `isBlockMetadataLine()` only if still used elsewhere. If only the removed helpers use it, remove it too.

- [x] **Step 4: Wire boundary index in `source-surfaces.ts`**

Build the index before `buildSectionSurfaces()` or inside it before the section construction loop.

For each section:

1. recover enough information to identify the current boundary;
2. look up the next same-origin boundary;
3. pass `next?.sliceStartLine` into `recoverSectionSourceLayer()`.

Implementation should avoid recomputing the full index per section.

### Task 4: Update Existing Contrary Tests

**Files:**

- Modify: `test/book-entry/source-coordinate-recovery.test.ts`.
- Modify: `test/rdf12-projection/book-entry-coordinate.test.ts`.

- [x] **Step 1: Update `Target Origin` raw expectation**

The current test expects `targetSection.source?.raw` not to contain `[#chapter-table]`. Replace that assertion with a positive expectation:

```ts
expect(targetSection.source?.raw).toContain("[#chapter-table]");
expect(targetSection.source?.raw).toContain("| Value");
```

Also update the exact raw string if the test uses `toBe(...)`.

- [x] **Step 2: Update RDF raw expectations for `Xref Origin`**

Corrected same-origin EOF recovery includes same-origin content after `include::nested/section.adoc[]`. Update the RDF test to assert the book contract:

```ts
expect(raw).toContain("include::nested/section.adoc[]");
expect(raw).toContain("[#chapter-listing]");
expect(raw).not.toContain("=== Nested Origin");
```

The nested heading raw remains recovered from `chapters/nested/section.adoc`.

- [x] **Step 3: Keep structure-node exclusions**

Do not add RDF resources for tables/listings. Assertions that the projection graph has no `aat:TableBlock` or `aat:ListingBlock` should remain true.

### Task 5: Verify Content Span Projection

**Files:**

- Modify: `test/rdf12-projection/book-entry-coordinate.test.ts`.
- Inspect: `src/rdf12-projection/heading-slice.ts`.

- [x] **Step 1: Add assertions for content lines**

For table-first appendix:

```ts
expectNumberTriple(projection.graph, heading, "contentStartLine", 3);
expectNumberTriple(projection.graph, heading, "contentEndLine", 11);
```

Use the actual final line numbers from the fixture.

- [x] **Step 2: Run RDF focused tests**

```bash
pnpm exec vitest run test/rdf12-projection/book-entry-coordinate.test.ts test/rdf12-projection/heading-slice.test.ts --reporter=dot
```

Expected after implementation: PASS.

If this fails while JSON source spans are correct, inspect `contentLineSpanFromSourceRaw()` in `src/rdf12-projection/heading-slice.ts`.

### Task 6: Documentation Adjustment

**Files:**

- Inspect and conditionally modify: `docs/bookshelf/books/11-book-entry-source-mapped-logical-document-implementation-plan/backmatter/batch-04-review-package.adoc`.

- [x] **Step 1: Search for obsolete block-boundary contract language**

Run:

```bash
rg -n "block metadata|listing/table boundary|heading raw/span|source scope/heading slice separation|sectionHeadingSlice" docs/bookshelf/books/11-book-entry-source-mapped-logical-document-implementation-plan docs/plan
```

- [x] **Step 2: Update only misleading current-rule language**

If a passage states that table/listing/block metadata boundaries are the current rule, rewrite it as implementation history or remove it from the current contract.

Do not rewrite the books unless a current normative chapter is wrong. The normative target already lives in book 06 and book 10.

### Task 7: Full Verification

Run:

```bash
pnpm exec vitest run test/book-entry/heading-slice-recovery.test.ts test/book-entry/source-coordinate-recovery.test.ts test/rdf12-projection/book-entry-coordinate.test.ts test/rdf12-projection/heading-slice.test.ts --reporter=dot
pnpm typecheck
pnpm lint
pnpm test
```

Expected:

- focused tests pass;
- typecheck passes;
- Biome check passes;
- full Vitest suite passes.

If full `pnpm test` reveals unrelated pre-existing failures, record the exact failing tests and verify the focused regression suite still passes.

## Non-Goals

- Do not create RDF structure nodes for paragraphs, listings, tables, payload blocks, labels, surface attributes, or inline anchors.
- Do not restore an older block graph.
- Do not parse payload raw into RDF.
- Do not use logical text as heading raw.
- Do not concatenate multiple origin files into one heading raw.
- Do not read files outside `documentRoot`.
- Do not change the public `AbundantDocument` model unless the implementation cannot remain internal.
- Do not weaken source-coordinate diagnostics for cross-origin block raw recovery.

## Acceptance Criteria

- Book-entry section source layers follow the bookshelf heading-slice rule.
- Included appendix table bodies are included in section `source.raw`, `source.span`, and public `span`.
- Included listing/source block bodies are included in section `source.raw`, `source.span`, and public `span`.
- Ordinary block metadata does not end heading raw.
- Metadata immediately before a real next heading starts the next heading slice.
- Table cell text that looks like a heading does not truncate heading raw unless Asciidoctor exposes it as an official section surface.
- RDF12 heading resources emit corrected `aat:raw`, `aat:startLine`, `aat:endLine`, and content line fields.
- RDF12 still emits only heading nodes as structure nodes.
- Existing source-file projection still emits complete `aat:SourceFile` raw.
- Existing xref, address label, payload, and source-scope behavior remains compatible with the corrected heading raw.

## Review Checklist

Before marking implementation complete:

- [x] The implementation can point to book 06 for every heading-slice boundary rule.
- [x] The implementation can point to book 10 for every book-entry origin raw rule.
- [x] No section source layer recovery code treats `|===` or `----` as a heading boundary.
- [x] No section source layer recovery code treats ordinary block metadata as a heading boundary.
- [x] Every heading raw boundary is derived from official section surfaces or origin file EOF.
- [x] Tests include at least one table-first book-entry section.
- [x] Tests include at least one listing/source-block book-entry section.
- [x] Tests include a real next heading boundary.
- [x] Tests include a fake heading-looking table cell.
- [x] RDF tests assert raw text, not only line numbers.
- [x] Obsolete tests that encoded the short-slice behavior have been updated.
