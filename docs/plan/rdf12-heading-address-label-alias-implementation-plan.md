# RDF12 Heading Address Label Alias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RDF12 heading projection bind local non-heading AsciiDoc target IDs to their owning heading node as `aat:addressLabel`, so xrefs to listings, tables, blocks, inline anchors, and payload listings produce heading-to-heading relation edges without creating non-heading RDF structure nodes.

**Architecture:** Keep the RDF12 public graph as a heading projection graph. Extend the heading label catalog so it contains both native heading labels and local non-heading target aliases resolved by source location to the innermost heading slice. Leave xref projection bound through the label catalog; once aliases are present, existing xref edge projection can emit `aat:targetHeading`, relation triples, and `rdf:reifies` for these selectors.

**Tech Stack:** TypeScript, Vitest, RDF12 projection modules under `src/rdf12-projection`, Asciidoctor-derived `AbundantDocument` and `TargetNode` facts.

---

## Source Of Truth

The long-term contract lives in `docs/bookshelf/books/06-rdf12-line-projection`. Implement this plan against that book, not against older test assumptions.

The book defines these object facts:

- Heading nodes are the only RDF structure nodes in the heading projection graph.
- Local non-heading AsciiDoc targets do not become RDF structure nodes.
- A local non-heading target ID belongs to the innermost heading slice covering the target source position.
- That ID is emitted as the owning heading node's `aat:addressLabel`.
- Xref target binding still uses the heading projection label space: `aat:addressLabel`, `aat:generatedAddressLabel`, and `aat:headline`.
- Edge evidence keeps raw selector and official Asciidoctor facts; those facts do not change the relation triple endpoints.

## Current Facts

The parser already recovers target facts beyond headings:

- `src/model.ts` defines `TargetType` as `section | listing | table | inline-anchor | block | unknown`.
- `AbundantDocument.targets` contains `TargetNode` entries for local AsciiDoc targets.
- `test/parser.test.ts` verifies target catalog entries such as `engine-code:listing`, `perf-table:table`, `warning-text:inline-anchor`, `para-target:block`, and `block-para:block`.

The RDF12 projection currently narrows selector binding too far:

- `src/rdf12-projection/labels.ts` only adds heading-native labels to the label catalog.
- `src/rdf12-projection/selector-binding.ts` binds selectors only through label catalog owners.
- `src/rdf12-projection/xref-projector.ts` already emits `aat:targetHeading`, main relation triples, and `rdf:reifies` when selector binding returns one heading.
- Xrefs to listing/table/block/inline-anchor IDs currently keep `aat:XrefEdge` evidence and official facts, but have no `aat:targetHeading` and no main relation triple.
- `test/rdf12-projection/selector-binding.test.ts` currently asserts that listing IDs, table IDs, inline anchor IDs, and payload IDs do not bind. Those assertions are obsolete under the revised book contract.

## Expected Behavior

After implementation:

- `aat:addressLabel` on a heading includes native heading IDs and local non-heading target IDs owned by that heading.
- `bindSelector(labelCatalog, "engine-code")` returns the heading containing the `engine-code` listing.
- `bindSelector(labelCatalog, "perf-table")` returns the heading containing the `perf-table` table.
- `bindSelector(labelCatalog, "warning-text")` returns the heading containing the inline anchor.
- `bindSelector(labelCatalog, "para-target")` returns the heading containing the paragraph block ID.
- `bindSelector(labelCatalog, "block-para")` returns the heading containing the block anchor target.
- Xref edges to those selectors emit `aat:targetHeading`, the main relation triple, and `rdf:reifies`.
- Edge evidence preserves `aat:targetSelector`, `aat:officialResolvedId`, `aat:officialResolvedType`, and `aat:officialHref` when the parser supplies them.
- The public RDF graph still contains no `aat:ListingBlock`, `aat:TableBlock`, `aat:AnchorTarget`, `aat:PayloadBlock`, or `aat:XrefOccurrence`.

## Non-Goals

- Do not create RDF resources for listing, table, block, inline anchor, or payload block targets.
- Do not restore the old RDF12 structural block graph.
- Do not parse payload raw into RDF.
- Do not read external `.adoc` files for interdocument xrefs.
- Do not add xref display labels, official reftext, roles, direct field predicates, raw text, or heading IRIs to selector binding.
- Do not treat the xref `payload=` control field as an xref target selector.
- Do not remove self-referential xref relation triples merely because source heading and target heading are the same.

## File Map

Modify documentation:

- `docs/bookshelf/books/06-rdf12-line-projection/frontmatter/preface.adoc`
- `docs/bookshelf/books/06-rdf12-line-projection/chapters/01-projection-object.adoc`
- `docs/bookshelf/books/06-rdf12-line-projection/chapters/02-heading-node.adoc`
- `docs/bookshelf/books/06-rdf12-line-projection/chapters/05-xref-edge.adoc`
- `docs/bookshelf/books/06-rdf12-line-projection/chapters/06-payload-and-attribute.adoc`
- `docs/bookshelf/books/06-rdf12-line-projection/chapters/07-query-contract.adoc`
- `docs/bookshelf/books/06-rdf12-line-projection/chapters/08-worked-example.adoc`
- `docs/bookshelf/books/06-rdf12-line-projection/backmatter/glossary.adoc`

Modify implementation:

- `src/rdf12-projection/labels.ts`: add local non-heading target IDs to heading label catalog and graph as `aat:addressLabel`.
- `src/rdf12-projection/label-catalog.ts`: leave unchanged unless graph-level duplicate writes require a catalog-level insertion guard. The current `owners()` method already deduplicates owner terms for binding.
- `src/rdf12-projection/selector-binding.ts`: leave selector binding catalog-driven.
- `src/rdf12-projection/xref-projector.ts`: leave xref projection catalog-driven; bound aliases must flow through the existing `targetHeading`, relation triple, and `rdf:reifies` path.
- Parser files: leave unchanged. Parser target recovery already exists.

Modify tests:

- `test/rdf12-projection/selector-binding.test.ts`
- `test/rdf12-projection/xref-projector.test.ts`
- `test/rdf12-projection/reference-links.acceptance.test.ts`
- `test/rdf12-projection/query-contracts.test.ts`
- `test/rdf12-projection/heading-projection.acceptance.test.ts`: modify only if existing acceptance expectations enumerate the label set affected by target aliases.

## Task 1: Update Selector Binding Tests For Target Aliases

**Files:**

- Modify: `test/rdf12-projection/selector-binding.test.ts`
- Use fixtures: `samples/reference-links.adoc`, `test/fixtures/block-anchor-audit.adoc`, `test/fixtures/paragraph-id-audit.adoc`

- [ ] **Step 1: Replace obsolete negative assertions**

In `test/rdf12-projection/selector-binding.test.ts`, replace the current test named:

```ts
it("does not bind listing ids, table ids, inline anchor ids, roles, payload ids, raw text, or heading IRIs", () => {
```

with two tests: one positive alias binding test and one remaining negative binding test.

Use this structure:

```ts
it("binds local non-heading target ids to their owning heading", () => {
	const reference = referenceProjection();
	const engineCode = bindSelector(reference.labelCatalog, "engine-code");
	const perfTable = bindSelector(reference.labelCatalog, "perf-table");
	const warningText = bindSelector(reference.labelCatalog, "warning-text");

	expect(engineCode.status).toBe("bound");
	if (engineCode.status === "bound") {
		expect(engineCode.target.value).toContain("#heading-l25-o0");
	}
	expect(perfTable.status).toBe("bound");
	if (perfTable.status === "bound") {
		expect(perfTable.target.value).toContain("#heading-l40-o0");
	}
	expect(warningText.status).toBe("bound");
	if (warningText.status === "bound") {
		expect(warningText.target.value).toContain("#heading-l40-o0");
	}
});

it("keeps non-address surfaces out of selector binding", () => {
	const payloadProjection = projectAbundantDocumentToRdf12(
		parseAbundantTree({
			sourcePath: join(projectRoot, "samples/structural-payload.adoc"),
		}),
		{ documentRoot: projectRoot },
	);
	const [deliveryHeading] =
		payloadProjection.labelCatalog.owners("delivery-policy");

	for (const selector of [
		"section",
		"payload",
		"配送策略依赖 xref:capacity-rule[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery-capacity]。",
		deliveryHeading?.value ?? "",
	]) {
		expect(bindSelector(payloadProjection.labelCatalog, selector)).toEqual({
			status: "unresolved",
			selector,
			selectorLiteral: selector,
		});
	}
});
```

- [ ] **Step 2: Add fixture-based block alias tests**

Add tests for paragraph and block targets:

```ts
it("binds paragraph block ids to the containing heading", () => {
	const projection = projectAbundantDocumentToRdf12(
		parseAbundantTree({
			sourcePath: join(projectRoot, "test/fixtures/paragraph-id-audit.adoc"),
		}),
		{ documentRoot: projectRoot },
	);
	const result = bindSelector(projection.labelCatalog, "para-target");

	expect(result.status).toBe("bound");
	if (result.status === "bound") {
		expect(result.target.value).toContain("#heading-l3-o0");
	}
});

it("binds block anchor ids to the containing heading", () => {
	const projection = projectAbundantDocumentToRdf12(
		parseAbundantTree({
			sourcePath: join(projectRoot, "test/fixtures/block-anchor-audit.adoc"),
		}),
		{ documentRoot: projectRoot },
	);
	const result = bindSelector(projection.labelCatalog, "block-para");

	expect(result.status).toBe("bound");
	if (result.status === "bound") {
		expect(result.target.value).toContain("#heading-l3-o0");
	}
});
```

- [ ] **Step 3: Add ambiguous alias test**

Add a synthetic document test where the same selector is a heading ID in one heading and a block target ID in another heading:

```ts
it("keeps local target aliases ambiguous when they belong to multiple headings", () => {
	const projection = projectAbundantDocumentToRdf12(ambiguousTargetAliasDocument(), {
		documentRoot: projectRoot,
	});
	const result = bindSelector(projection.labelCatalog, "shared");

	expect(result.status).toBe("ambiguous");
	if (result.status === "ambiguous") {
		expect(result.candidates.map((candidate) => candidate.value)).toEqual([
			expect.stringContaining("#heading-l1-o0"),
			expect.stringContaining("#heading-l5-o0"),
		]);
	}
});
```

Add this helper to the file:

```ts
function ambiguousTargetAliasDocument(): AbundantDocument {
	return {
		kind: "document",
		sourcePath: referencePath,
		mode: "single-file",
		parser: { name: "@asciidoctor/core", version: "test" },
		children: [
			{
				kind: "section",
				level: 1,
				ids: ["shared"],
				title: "First",
				idOrigin: "source",
				span: { startLine: 1, endLine: 4 },
				metadata: [
					{
						kind: "metadata",
						metadataKind: "id",
						raw: "[#shared]",
						line: 1,
						ids: ["shared"],
					},
				],
				titleSpan: {
					start: { line: 2, column: 4 },
					end: { line: 2, column: 9 },
				},
			},
			{
				kind: "section",
				level: 1,
				ids: ["second"],
				title: "Second",
				idOrigin: "source",
				span: { startLine: 5, endLine: 9 },
				metadata: [
					{
						kind: "metadata",
						metadataKind: "id",
						raw: "[#second]",
						line: 5,
						ids: ["second"],
					},
				],
				titleSpan: {
					start: { line: 6, column: 4 },
					end: { line: 6, column: 10 },
				},
			},
		],
		targets: [
			{
				kind: "target",
				id: "shared",
				targetType: "block",
				idOrigin: "source",
				sourceSpan: {
					start: { line: 8, column: 1 },
					end: { line: 8, column: 9 },
				},
			},
		],
		xrefOccurrences: [],
		anchorOccurrences: [],
		toolDiagnostics: [],
	};
}
```

- [ ] **Step 4: Run the selector binding tests and verify failure**

Run:

```bash
pnpm test -- test/rdf12-projection/selector-binding.test.ts
```

Expected before implementation: tests for `engine-code`, `perf-table`, `warning-text`, `para-target`, and `block-para` fail because those selectors are unresolved.

## Task 2: Implement Heading Address Label Aliases

**Files:**

- Modify: `src/rdf12-projection/labels.ts`
- Modify: `src/rdf12-projection/label-catalog.ts` only when Task 2 exposes duplicate graph writes that cannot be contained in `labels.ts`

- [ ] **Step 1: Add target alias projection in `labels.ts`**

In `projectLabels`, keep the existing heading-native label pass, then add a second pass over `input.document.targets`.

Use this implementation shape:

```ts
export function projectLabels(input: ProjectLabelsInput): Rdf12LabelCatalog {
	const catalog = createRdf12LabelCatalog();

	for (const entry of input.nodeIndex.entries()) {
		addHeadingLabels(catalog, entry);
	}
	for (const target of input.document.targets) {
		addLocalTargetAlias(catalog, input.graph, input.nodeIndex, target);
	}

	return catalog;
}
```

- [ ] **Step 2: Add helper imports**

Add imports for `TargetNode`, graph triple writing, literals, namespaces, and terms if the file does not already have them:

```ts
import type { AbundantDocument, TargetNode } from "../model";
import { rdf12Triple, type Rdf12Graph } from "./graph";
import { stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import type { Rdf12NodeIndex, Rdf12NodeIndexEntry } from "./node-index";
import { iriTerm, type Rdf12IriTerm } from "./terms";
```

Keep existing imports that are still needed.

- [ ] **Step 3: Add local target alias helpers**

Add these helpers near the existing label helpers:

```ts
function addLocalTargetAlias(
	catalog: Rdf12LabelCatalog,
	graph: Rdf12Graph,
	nodeIndex: Rdf12NodeIndex,
	target: TargetNode,
): void {
	if (target.targetType === "section") {
		return;
	}
	if (!target.id || target.sourceSpan === undefined) {
		return;
	}

	const owner = owningHeadingForTarget(nodeIndex, target);
	if (owner === undefined) {
		return;
	}

	addCatalogEntry(catalog, owner, "addressLabel", target.id);
	addAddressLabelTriple(graph, owner.iri, target.id);
}

function owningHeadingForTarget(
	nodeIndex: Rdf12NodeIndex,
	target: TargetNode,
): Rdf12NodeIndexEntry | undefined {
	const line = target.sourceSpan?.start.line;
	if (line === undefined) {
		return undefined;
	}

	return nodeIndex
		.entries()
		.filter((entry) => entry.startLine <= line && line <= entry.endLine)
		.toSorted(compareInnermostHeading)[0];
}

function compareInnermostHeading(
	left: Rdf12NodeIndexEntry,
	right: Rdf12NodeIndexEntry,
): number {
	const leftSpan = left.endLine - left.startLine;
	const rightSpan = right.endLine - right.startLine;
	if (leftSpan !== rightSpan) {
		return leftSpan - rightSpan;
	}

	return right.startLine - left.startLine;
}

function addAddressLabelTriple(
	graph: Rdf12Graph,
	owner: Rdf12IriTerm,
	value: string,
): void {
	const triple = rdf12Triple(
		owner,
		iriTerm(`${namespaces.aat}addressLabel`),
		stringLiteral(value),
	);
	if (!graph.has(triple)) {
		graph.add(triple);
	}
}
```

- [ ] **Step 4: Run selector binding tests**

Run:

```bash
pnpm test -- test/rdf12-projection/selector-binding.test.ts
```

Expected: selector binding tests pass.

Candidate order must follow `nodeIndex.entries()` document order. If a test observes a different order, inspect the alias insertion order and fix the projection instead of weakening the assertion.

## Task 3: Add Xref Edge Tests For Non-Heading Target Aliases

**Files:**

- Modify: `test/rdf12-projection/xref-projector.test.ts`
- Use fixtures: `samples/reference-links.adoc`, `test/fixtures/paragraph-id-audit.adoc`, `test/fixtures/block-anchor-audit.adoc`

- [ ] **Step 1: Add listing/table/inline anchor xref relation assertions**

Add a test using `referenceDocument()`:

```ts
it("projects xrefs to local non-heading targets as heading relation edges", () => {
	const projection = projectAbundantDocumentToRdf12(referenceDocument(), {
		documentRoot: projectRoot,
	});
	const core = heading(projection.documentIri, "heading-l25-o0");
	const troubleshooting = heading(projection.documentIri, "heading-l40-o0");
	const conclusion = heading(projection.documentIri, "heading-l58-o0");

	const engineFromConclusion = edgeForSelector(projection.graph, "engine-code", "#xref-edge-l63-c11-o0");
	const warningFromConclusion = edgeForSelector(projection.graph, "warning-text", "#xref-edge-l64-c22-o0");
	const perfTableSelfEdge = edgeForSelector(projection.graph, "perf-table", "#xref-edge-l54-c4-o0");

	expectTriple(projection.graph, engineFromConclusion, "sourceHeading", conclusion);
	expectTriple(projection.graph, engineFromConclusion, "targetHeading", core);
	expectStringTriple(projection.graph, engineFromConclusion, "officialResolvedType", "listing");
	expectTripleTerm(
		projection.graph,
		engineFromConclusion,
		rdf12Triple(conclusion, iriTerm(`${namespaces.aat}references`), core),
	);

	expectTriple(projection.graph, warningFromConclusion, "sourceHeading", conclusion);
	expectTriple(projection.graph, warningFromConclusion, "targetHeading", troubleshooting);
	expectStringTriple(projection.graph, warningFromConclusion, "officialResolvedType", "inline-anchor");

	expectTriple(projection.graph, perfTableSelfEdge, "sourceHeading", troubleshooting);
	expectTriple(projection.graph, perfTableSelfEdge, "targetHeading", troubleshooting);
	expectStringTriple(projection.graph, perfTableSelfEdge, "officialResolvedType", "table");
});
```

Add helper:

```ts
function edgeForSelector(
	graph: Rdf12Graph,
	selector: string,
	localIdFragment: string,
): string {
	const edge = resourcesOfType(graph, `${namespaces.aat}XrefEdge`).find(
		(iri) => iri.includes(localIdFragment) && hasSelector(graph, iri, selector),
	);
	if (edge === undefined) {
		throw new Error(`expected xref edge for selector ${selector}`);
	}
	return edge;
}
```

- [ ] **Step 2: Add paragraph and block target edge assertions**

Use the existing fixtures:

```ts
it("projects paragraph block target xrefs to the containing heading", () => {
	const projection = projectAbundantDocumentToRdf12(
		parseAbundantTree({
			sourcePath: join(projectRoot, "test/fixtures/paragraph-id-audit.adoc"),
		}),
		{ documentRoot: projectRoot },
	);
	const edge = onlyXrefEdge(projection.graph);
	const section = heading(projection.documentIri, "heading-l3-o0");

	expectTriple(projection.graph, edge, "sourceHeading", section);
	expectTriple(projection.graph, edge, "targetHeading", section);
	expectStringTriple(projection.graph, edge, "targetSelector", "para-target");
	expectStringTriple(projection.graph, edge, "officialResolvedType", "block");
	expectTripleTerm(
		projection.graph,
		edge,
		rdf12Triple(section, iriTerm(`${namespaces.aat}references`), section),
	);
});

it("projects block anchor target xrefs to the containing heading", () => {
	const projection = projectAbundantDocumentToRdf12(
		parseAbundantTree({
			sourcePath: join(projectRoot, "test/fixtures/block-anchor-audit.adoc"),
		}),
		{ documentRoot: projectRoot },
	);
	const edge = edgeForSelector(projection.graph, "block-para", "#xref-edge-l9-c25-o0");
	const section = heading(projection.documentIri, "heading-l3-o0");

	expectTriple(projection.graph, edge, "sourceHeading", section);
	expectTriple(projection.graph, edge, "targetHeading", section);
	expectStringTriple(projection.graph, edge, "officialResolvedType", "block");
});
```

- [ ] **Step 3: Run xref projector tests**

Run:

```bash
pnpm test -- test/rdf12-projection/xref-projector.test.ts
```

Expected: tests pass after Task 2.

## Task 4: Update Query And Acceptance Tests

**Files:**

- Modify: `test/rdf12-projection/reference-links.acceptance.test.ts`
- Modify: `test/rdf12-projection/query-contracts.test.ts`
- Modify: `test/rdf12-projection/heading-projection.acceptance.test.ts` when existing expectations enumerate RDF12 heading labels.

- [ ] **Step 1: Add address label lookup query for local target alias**

In `reference-links.acceptance.test.ts`, add `engine-code`, `perf-table`, and `warning-text` checks to the heading label lookup test:

```ts
const engineCodeOwner = onlyHeadingForLabel(
	projection.graph,
	"addressLabel",
	"engine-code",
);
const perfTableOwner = onlyHeadingForLabel(
	projection.graph,
	"addressLabel",
	"perf-table",
);
const warningTextOwner = onlyHeadingForLabel(
	projection.graph,
	"addressLabel",
	"warning-text",
);

expect(engineCodeOwner.value).toContain("#heading-l25-o0");
expect(perfTableOwner.value).toContain("#heading-l40-o0");
expect(warningTextOwner.value).toContain("#heading-l40-o0");
```

- [ ] **Step 2: Add relation edge query for xref to listing alias**

In `reference-links.acceptance.test.ts`, add an assertion that the `xref:engine-code[查看 Python 脚本]` edge from conclusion targets the core heading:

```ts
const conclusion = onlyHeadingForLabel(
	projection.graph,
	"addressLabel",
	"conclusion-section",
);
const engineCodeTarget = onlyHeadingForLabel(
	projection.graph,
	"addressLabel",
	"engine-code",
);
const engineCodeEdge = onlyXrefEdgeForSelectorAndSource(
	projection.graph,
	"engine-code",
	conclusion,
);

expectTriple(projection.graph, engineCodeEdge, "sourceHeading", conclusion);
expectTriple(projection.graph, engineCodeEdge, "targetHeading", engineCodeTarget);
```

Add this helper next to `onlyXrefEdgeForSelector`:

```ts
function onlyXrefEdgeForSelectorAndSource(
	graph: Rdf12Graph,
	selector: string,
	source: Rdf12IriTerm,
): Rdf12IriTerm {
	const edges = graph
		.match({
			predicate: iriTerm(`${namespaces.aat}targetSelector`),
			object: stringLiteral(selector),
		})
		.map((triple) => triple.subject)
		.filter((subject) =>
			graph.has(
				rdf12Triple(
					subject,
					iriTerm(`${namespaces.rdf}type`),
					iriTerm(`${namespaces.aat}XrefEdge`),
				),
			),
		)
		.filter((subject) =>
			graph.has(
				rdf12Triple(
					subject,
					iriTerm(`${namespaces.aat}sourceHeading`),
					source,
				),
			),
		);

	expect(edges).toHaveLength(1);
	return edges[0] ?? iriTerm("urn:missing-xref-edge");
}
```

- [ ] **Step 3: Update `query-contracts.test.ts`**

Add a query-contract test case demonstrating:

- `aat:addressLabel "engine-code"` returns a heading.
- An xref edge whose `aat:targetSelector` is `"engine-code"` has `aat:targetHeading` set to that same heading.

Use graph helper functions already present in the file. Do not add a new SPARQL engine; existing graph matching is enough.

- [ ] **Step 4: Run acceptance tests**

Run:

```bash
pnpm test -- test/rdf12-projection/reference-links.acceptance.test.ts test/rdf12-projection/query-contracts.test.ts
```

Expected: tests pass.

## Task 5: Preserve Negative Contract Tests

**Files:**

- Modify: `test/rdf12-projection/query-contracts.test.ts`
- Modify: `test/rdf12-projection/heading-projection.acceptance.test.ts` when existing expectations enumerate RDF12 heading labels.

- [ ] **Step 1: Assert no non-heading structure resources**

Add or extend a negative contract test:

```ts
for (const typeName of [
	"ListingBlock",
	"TableBlock",
	"AnchorTarget",
	"PayloadBlock",
	"XrefOccurrence",
]) {
	expect(
		projection.graph.match({
			predicate: iriTerm(`${namespaces.rdf}type`),
			object: iriTerm(`${namespaces.aat}${typeName}`),
		}),
	).toHaveLength(0);
}
```

- [ ] **Step 2: Assert non-address surfaces still do not bind**

Keep tests that display label, reftext, role, direct attributes, raw text, and heading IRI do not bind. Do not reintroduce negative assertions for listing/table/block/inline-anchor IDs.

- [ ] **Step 3: Run all RDF12 projection tests**

Run:

```bash
pnpm test -- test/rdf12-projection
```

Expected: all RDF12 projection tests pass.

## Task 6: Run Final Gates

**Files:** no code changes unless a gate exposes a real issue.

- [ ] **Step 1: Run parser tests to protect target recovery**

Run:

```bash
pnpm test -- test/parser.test.ts
```

Expected: parser tests pass. These tests prove target catalog recovery still includes section/listing/table/block/inline-anchor entries.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run Biome**

Run:

```bash
pnpm lint
```

Expected: no lint or format errors. If Biome reports formatting only, run `pnpm format` and re-run `pnpm lint`.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm build
```

Expected: build completes successfully.

- [ ] **Step 5: Run bookshelf checks when docs changed**

Run:

```bash
pnpm --dir docs/bookshelf test
pnpm --dir docs/bookshelf run build
```

Expected: bookshelf tests and build pass. If scripts are unavailable, report the missing script instead of claiming success.

## Done Definition

The task is complete only when all conditions hold:

- `docs/bookshelf/books/06-rdf12-line-projection` defines local non-heading target IDs as owning-heading `aat:addressLabel` values.
- The glossary definition of `address label` matches the chapter rules.
- `engine-code`, `perf-table`, `warning-text`, `para-target`, and `block-para` bind to owning heading nodes.
- Xrefs to those selectors emit `aat:targetHeading`, a main relation triple, and `rdf:reifies`.
- Edge evidence preserves original selector and official resolved facts when present.
- Duplicate labels across headings produce candidate headings and no main relation triple.
- Duplicate labels within the same heading do not create false ambiguity.
- External xrefs still do not read external files or bind to local headings.
- Display labels, reftext, roles, direct attributes, raw text, and heading IRIs still do not bind as selectors.
- Public RDF output still has no non-heading structure node types.
- `pnpm test -- test/rdf12-projection`, `pnpm test -- test/parser.test.ts`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass, or any unavailable command is explicitly reported.

## Commit Guidance

Commit only files touched for this task. This repository can have unrelated staged or unstaged work.

Recommended commit shape:

```bash
git add docs/bookshelf/books/06-rdf12-line-projection docs/plan src/rdf12-projection test/rdf12-projection
git commit --only -m "feat: bind rdf12 target aliases to headings" -- docs/bookshelf/books/06-rdf12-line-projection docs/plan src/rdf12-projection test/rdf12-projection
```

If new files are untracked, stage them before `git commit --only`.
