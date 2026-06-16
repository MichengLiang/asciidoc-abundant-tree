# Book-Entry Official Reader Include Preprocessing Coordination State

Last updated: 2026-06-17 00:27:00 CST.

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

Status: ready for dispatch.

### Batch 4: Full Regression, Workspace Fixture, and Final Hardening

Goal: run the full acceptance command set, verify the workspace page-map failure class, remove transitional dead code if appropriate, and close any design gaps.

## Current Dispatch

Batch 1 and Batch 2 are accepted. Batch 3 is the next dispatch.
