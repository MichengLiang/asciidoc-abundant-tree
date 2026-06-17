# Book-Entry Official Reader Include Preprocessing Coordination State

Last updated: 2026-06-17 10:10:00 CST.

## Role Boundary

The principal coordinator owns batching, review, acceptance evidence, and task dispatch.
The implementation worker owns code changes, tests, self-review, and commits for each assigned batch.
The coordinator does not implement production code for this effort.

## Baseline

Project path:

```text
/home/t103o/workbench/micheng-ts/projects/asciidoc-abundant-tree
```

Implementation design:

```text
docs/plan/book-entry include 设计文档/book-entry-official-reader-include-preprocessing-design.md
```

Initial git state observed before dispatch:

```text
branch: main
tracking: origin/main
ahead: 1
working tree: clean
HEAD: 8ef7c14 000
```

The existing ahead commit contains the design document and unrelated sample README edits.
Batch commits for this implementation must be separate and must not include unrelated worktree changes.

## Acceptance Commands

The design declares completion only when these commands pass from the project root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:coverage
pnpm smoke:cli
node dist/cli.mjs test/book-entry/fixtures/official-reader-book/book.adoc --mode book-entry --document-root test/book-entry/fixtures/official-reader-book --format json
```

Final acceptance also requires evidence that `asciidoc-multi-book-workspace` can build reader page-map data for a book containing a source-block tagged include.

## WBS Batches

### Batch 1: Official Reader Preprocessing Foundation

Goal: establish the new model and preprocessing foundation without wiring every downstream recovery surface.

Status: accepted after coordinator review.

Implementation commits:

```text
2e482690f0296e76439ca6a79fdbe709e2a025b3 Add official Reader preprocessing foundation
d097fd4f638bae858b575f3c199c0330e04ff176 Fix official Reader cursor evidence capture
35e75c5dc7d47250bc31ee4d2234f57ae8626a33 Reject unmapped include attributes before source registration
```

Coordinator review findings resolved:

- `readPreprocessedLines()` originally captured Reader cursor evidence after `readLine()`. The worker added adapter characterization tests and corrected the evidence capture.
- `include::target[foo=bar]` originally emitted target content and registered the target source despite `include.attrlist-unmapped`. The worker added a rejection test and stopped processing before target registration.
- `include.optional-target-missing` was an invented public diagnostic code. The worker removed it from the construction code union and modeled optional missing include as preprocessor evidence.

Coordinator verification on current HEAD after the fixes:

```bash
pnpm vitest run test/book-entry/official-reader-adapter.test.ts test/book-entry/official-reader-preprocessor.test.ts test/book-entry/reader-boundary-policy.test.ts test/book-entry/include-selection-mapper.test.ts test/book-entry/column-map.test.ts test/book-entry/source-aware-logical-document.test.ts test/book-entry/parser-safe-logical-text.test.ts
# 7 files / 33 tests passed

pnpm typecheck
# passed

pnpm lint
# passed
```

Required deliverables:

- Add the model modules named by the design where they are needed for this batch.
- Add official Reader line reading through the adapter or a narrowly scoped preprocessor boundary.
- Add source-set registration for author-owned local files under `documentRoot`.
- Add include attribute parsing/classification for supported vs unmapped surfaces.
- Add include selection mapping for `tag`, `tags`, and `lines`.
- Add column map primitives for identity, indent offset, and unmapped columns.
- Add parser-safe logical text handling for escaped include records.
- Cover the batch with focused tests for the required cases in:
  - `test/book-entry/official-reader-preprocessor.test.ts`
  - `test/book-entry/reader-boundary-policy.test.ts`
  - `test/book-entry/include-selection-mapper.test.ts`
  - `test/book-entry/column-map.test.ts`
  - `test/book-entry/source-aware-logical-document.test.ts`
  - `test/book-entry/parser-safe-logical-text.test.ts`
- Preserve existing full-file book-entry behavior while the parser is not yet fully migrated.
- Commit the batch.

Quality gates:

- No second include expansion in parser-safe escaped include handling.
- No ad hoc string-only source ownership model where a typed source-set or line-origin abstraction is required.
- No silent acceptance of unsupported include attributes.
- Diagnostics must use explicit design codes where this batch can detect them.
- Tests must prove behavior rather than only snapshotting internal structure.

### Batch 2: Parser Integration and Source Coordinate Recovery

Goal: route book-entry parsing through the official Reader source-aware document and recover precise coordinates for supported line classes.

Required deliverables include parser integration tests, source-coordinate tests, generated/degraded line behavior, block multi-source diagnostics, and compatibility with existing source surfaces.

Status: accepted after coordinator review.

Implementation commits:

```text
89d899a0483d7dc33faaab685886cac27f5b27ed Route book-entry parser through official Reader recovery
59c1cb206b4679dc37f22b1b08449410669df60e Add source-aware recovery diagnostic contract tests
```

Coordinator review findings resolved:

- The first Batch 2 submission lacked explicit recovery tests for parser positions on generated control lines. The worker added a fixture-backed `source-coordinate.generated-line` recovery test.
- The first Batch 2 submission lacked degraded-line coordinate recovery coverage. The worker added a minimal `SourceAwareLogicalDocument` recovery test for `source-coordinate.degraded-line`.
- The inserted-indentation column test now states that direct point recovery is used because parser xref occurrences start at macro tokens, not generated whitespace.

Coordinator verification on current HEAD after the fixes:

```bash
pnpm vitest run test/book-entry/official-reader-parser-integration.test.ts test/book-entry/official-reader-source-coordinate.test.ts test/book-entry test/parser-include-source-map.test.ts test/rdf12-projection/book-entry-coordinate.test.ts test/rdf12-projection/public-api.test.ts
# 21 files / 133 tests passed before the follow-up; 21 files / 135 tests passed after the follow-up per worker report

pnpm vitest run test/book-entry/official-reader-source-coordinate.test.ts
# 1 file / 7 tests passed

pnpm typecheck
# passed

pnpm lint
# passed

pnpm test
# 60 files / 442 tests passed
```

Known hardening risk:

- Full and affected tests pass, but negative fixtures currently emit official Asciidoctor stderr warning/error lines before construction errors are asserted. Batch 4 must decide whether to suppress/capture this noise for CI signal quality.

### Batch 3: RDF12 Reconstruction and CLI Acceptance

Goal: prove source reconstruction and CLI behavior for the official-reader fixture, including full raw source files and no parser-safe logical text reconstruction leakage.

Status: accepted after coordinator review.

Implementation commit:

```text
65568a879ec528f28dbac2fed912ef2ba6364fad Prove official Reader RDF12 source reconstruction
```

Coordinator verification on current HEAD:

```bash
pnpm vitest run test/rdf12-projection/book-entry-official-reader-source-reconstruction.test.ts test/rdf12-projection/book-entry-coordinate.test.ts test/rdf12-projection/public-api.test.ts test/cli.test.ts
# 4 files / 46 tests passed

pnpm typecheck
# passed

pnpm lint
# passed

pnpm build
# passed

node dist/cli.mjs test/book-entry/fixtures/official-reader-book/book.adoc --mode book-entry --document-root test/book-entry/fixtures/official-reader-book --format json
# passed with JSON checks for included chapters, tagged listing, sourceFiles, and absence of include.unsupported-attrlist

pnpm smoke:cli
# passed
```

Coordinator review notes:

- RDF12 tests inspect structured `aat:SourceFile` graph resources and verify authored raw files, full tagged target raw, full line-range target raw, and absence of optional missing/escaped target/generated control/parser-safe logical text resources.
- CLI JSON test verifies included sections, tagged listing content, source reconstruction entries, and absence of unsupported-attrlist diagnostics for supported include attributes.

### Batch 4: Full Regression, Workspace Fixture, and Final Hardening

Goal: run the full acceptance command set, verify the workspace page-map failure class, remove transitional dead code if appropriate, and close any design gaps.

Status: implemented, pending coordinator review with one explicit coverage concern.

Implementation commit: recorded by worker final response after commit creation.

Worker hardening changes:

- Removed the known official Asciidoctor stderr noise from full and RDF12 test runs.
- Root cause: `readPreprocessedLines()` executed the official Reader in safe mode after this package had already prevalidated include paths. Asciidoctor safe mode treats legal `..` includes that remain inside `documentRoot` as jail-ancestor references, so fixtures such as `docs/bookshelf/books/10-book-entry-source-mapped-logical-document/book.adoc` emitted warnings/errors before this package's source model handled the include graph.
- Fix: keep the package-owned include graph prevalidation and run the official Reader preprocessing pass in `safe: "unsafe"` so official include text semantics can expand legal ancestor includes without stderr noise. This does not suppress stderr globally and does not weaken this package's `documentRoot` boundary checks.
- Added `test/book-entry/reader-boundary-policy.test.ts` coverage for legal ancestor includes inside `documentRoot` expanding without stderr.

Workspace acceptance evidence:

```bash
fd -a 'asciidoc-multi-book-workspace|multi-book|page-map' /home/t103o/workbench --max-depth 6
# found /home/t103o/workbench/notes/关于AsciiDoc/asciidoc-multi-book-workspace/
```

The found workspace does not contain an `asciidoc-abundant-tree` dependency or page-map build script. The worker therefore used the current package's built CLI against the real workspace book that contains the original failure-class fixture:

```bash
pnpm build
node dist/cli.mjs /home/t103o/workbench/notes/关于AsciiDoc/asciidoc-multi-book-workspace/books/03-technical-book-workflow/book.adoc --mode book-entry --document-root /home/t103o/workbench/notes/关于AsciiDoc/asciidoc-multi-book-workspace --format json
# JSON checks passed:
# parseSucceeded true
# chapterWithSourceBlock true
# taggedListingContent true
# multiSourceListingContract true
# noUnsupportedAttrlist true
```

In-repo fixture evidence remains active:

- `test/book-entry/official-reader-parser-integration.test.ts` covers the section tree and tagged source block content for `test/book-entry/fixtures/official-reader-book/chapters/02-snippet-include.adoc`.
- `test/book-entry/official-reader-source-coordinate.test.ts` covers the multi-source listing raw/source contract for a source-block tagged include.
- `test/rdf12-projection/book-entry-official-reader-source-reconstruction.test.ts` covers source reconstruction for the same official-reader fixture.

Worker verification:

```bash
pnpm lint
# passed, Biome checked 159 files

pnpm typecheck
# passed

pnpm test
# passed, 61 files / 452 tests; stderr capture was empty

pnpm build
# passed, dist/cli.mjs produced

pnpm smoke:cli
# passed

node dist/cli.mjs test/book-entry/fixtures/official-reader-book/book.adoc --mode book-entry --document-root test/book-entry/fixtures/official-reader-book --format json
# passed with JSON checks for included chapter, tagged listing, sourceFiles, and absence of include.unsupported-attrlist
```

Coverage command result:

```bash
pnpm test:coverage
# tests passed, 61 files / 452 tests
# statements 92.45%, lines 92.34%, functions 97.25%, branches 83.23%
# failed because global branch coverage 83.23% is below configured threshold 90%
```

Coverage judgment:

- This is a real acceptance-command failure and is not claimed as passing.
- The branch coverage gap is global and broad: the generated JSON coverage report shows 160 additional branch slots would be needed for 90%, with the largest missing groups in pre-existing broad modules such as `src/official-projector.ts`, `src/source-surfaces.ts`, `src/rdf12-projection/heading-slice.ts`, `src/inline-occurrence-scanner.ts`, and `src/rdf12-projection/turtle-serializer.ts`.
- The gap is not specific to the official Reader include preprocessing change. The official-reader touched modules are covered by focused tests, and the stderr hardening regression is covered directly.

Transitional code review:

- Legacy `buildLogicalSource()` and `parseIncludeDirective()` remain intentionally in place for transitional unit coverage and old full-file builder contracts.
- Active `parseAbundantTree({ mode: "book-entry" })` remains routed through `preprocessBookEntryWithOfficialReader()`.
- Stale `include.unsupported-attrlist` active-parser expectations were checked. Legacy include-resolution unit tests still assert old behavior in the legacy module; active book-entry parser tests assert supported `tag` and `lines` surfaces do not emit `include.unsupported-attrlist`.

Remaining known risk:

- Final acceptance is blocked by the configured global branch coverage threshold unless the coordinator accepts the true recorded coverage failure as an out-of-scope pre-existing project-wide condition or assigns a separate coverage-focused batch.

## Current Dispatch

Batch 1, Batch 2, and Batch 3 are accepted. Batch 4 implementation is ready for coordinator review, with the coverage concern recorded above.
