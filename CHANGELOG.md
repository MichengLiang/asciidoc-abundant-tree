# Changelog

All notable changes to this project are documented in this file.

This project uses semantic versioning after `0.1.0`.

## Unreleased

### Fixed

- Fixed book-entry source coordinates drifting after a `tag=`/`tags=` include whose tag markers are not written with `//` (Python `# tag::x[]`, SQL `-- tag::x[]`, HTML `<!-- tag::x[] -->`). Tag markers are now recognized the way Asciidoctor's `TagDirectiveRx` recognizes them, whatever comment syntax precedes them. Previously no tag was recognized, the include selected nothing, and every later heading and xref was reported that many lines too late.
- Fixed the `lines=` and `tag`/`tags` selections to follow Asciidoctor's selection algorithm line for line (ported from `reader.rb` in Asciidoctor 2.0.26 and checked against Asciidoctor.js 3.0.4): `**` and `*` wildcards, negated tags with an implied wildcard, `8..` and `2..-1` ranges, a reversed or empty `lines=` falling back to the whole file, trailing delimiters, `1_0` style numbers, a trailing newline no longer counted as an extra line, and `lines` taking precedence over `tag` over `tags` with the last repeated key winning.
- Fixed a `leveloffset` include whose selection starts with a blank line losing that line: only the two lines Reader adds are taken as the generated prelude.
- Fixed an include that selects nothing taking over the next adjacent include's lines, a `leveloffset` include that pushes nothing eating the parent's blank lines, and a literal `include::` line inside a selected non-AsciiDoc file (such as `.py`) being expanded: Reader only processes directives in AsciiDoc files.
- Fixed selected includes losing alignment with the official Reader: each selected line is now paired with the official output only when it comes from the same include push and has the same text. Pushes are told apart by the official Reader's include stack, so two adjacent includes of the same file and the two lines Reader adds around a `leveloffset` include are never taken for selected lines; line numbers are not used, because Reader counts a push's lines from its first selected line and they drift from the source when the selection has gaps. An include directive inside the selected region is expanded with its own file's coordinates. When the selection stops lining up (for example a conditional inside the region that Asciidoctor drops), the rest of that include is recorded as degraded lines without source coordinates, and later lines stay aligned instead of drifting.

### Changed

- Book-entry construction warnings, such as `origin-map.selection-mismatch`, now reach `AbundantDocument.toolDiagnostics` (ahead of parser diagnostics) instead of being dropped, and name the include site and the selection surface.

## 0.1.20 - 2026-10-21

### Changed

- Changed heading description metadata values to the authored source surface of each description, read from the origin file: inline markup such as backticks and `xref:` macros is preserved instead of being replaced by Asciidoctor inline substitutions, and multiline text keeps every line. This aligns the implementation with the RDF 1.2 projection rule that field values are source surface values.
- Changed leading description lists whose descriptions carry `+`-attached blocks (listings, paragraphs, tables) to become heading description metadata. The attached blocks are part of the field value as authored AsciiDoc; the outer continuation lines become blank lines. Previously such a list was kept as content and every field in the run silently disappeared. Decorated lists and runs with nested description lists are still kept as content.

### Fixed

- Fixed description metadata fields whose description is only a list (for example `aliases::` followed by `*` items) projecting as empty strings.
- Fixed the repository lint gate: the book 12 guide case library is formatted with Biome, and its two generated outputs are excluded from Biome.
- Fixed the book 12 guide book-workspace example losing its `include::` lines: the directives are escaped so the bookshelf build no longer reports missing include files and the example shows them as written.

### Documentation

- Specified heading description fields in book 06 (RDF 1.2 heading projection) and book 09 (parser node model), and synchronized the book 12 guide surface tables.

## 0.1.19 - 2026-06-23

### Added

- Added CLI `--format adoc` output for exporting parser input source directly, including include-expanded logical AsciiDoc source in explicit book-entry mode.
- Added CLI regression coverage for single-file ADOC passthrough, book-entry merged source export, selected include expansion, and escaped include preservation.

### Fixed

- Fixed projection-teacher Biome formatting so the repository lint gate passes without changing graph teaching behavior.

## 0.1.18 - 2026-06-18

### Added

- Added heading description metadata attachment for flat leading AsciiDoc description lists under sections, exposing natural single-line and multiline title metadata through `SectionNode.descriptionMetadata`.
- Added RDF 1.2 direct field projection for heading description metadata fields, so description list entries such as `priority:: normal` and multiline `summary::` values appear on heading resources alongside attrlist fields.
- Added heading description metadata samples and implementation notes under `samples/关于描述列表/`, and included those sample documents in the npm package files.

### Changed

- Updated the basic RDF projection sample to demonstrate title metadata written as the first continuous description list under a heading, including regenerated Turtle, SHACL, Python consumer, and Oxigraph output records.
- Ordered pretty tree output so `descriptionMetadata` appears before ordinary section children, keeping absorbed description list metadata visible near heading metadata.

### Fixed

- Preserved decorated or structurally attached description lists as ordinary content instead of absorbing them as heading metadata.

## 0.1.17 - 2026-06-17

### Changed

- Changed RDF 1.2 complex data projection so heading nodes and xref edge evidence expose complex properties through field predicates instead of the generic `aat:payload` query path.
- Updated the canonical cold-chain sample, structural projection sample, README documentation, 06 RDF12 specification book, and cold-chain consumer script to use complex property and raw value object terminology.
- Updated animation YAML export fixtures and query contracts to consume raw value objects through business field predicates such as `aat:policy-risk-profile`, `aat:relation-evidence`, `aat:release-policy-config`, `aat:review-playbook`, and `aat:dependency-evidence`.

### Fixed

- Removed public RDF emission of `aat:payload`, `aat:payloadSelector`, `aat:payloadKind`, raw value object `aat:role`, and `aat:payloadId` from the complex property query contract.
- Added xref named-attribute matching for source value ids, including literal fallback for unmatched or ambiguous values and support for multiple complex properties on the same xref edge evidence.
- Preserved source value ids as local non-heading target aliases for owning headings while keeping xref target selector binding separate from xref complex property source-value binding.

## 0.1.16 - 2026-06-17

### Added

- Added the official Reader book-entry include preprocessing pipeline for local book roots, using `@asciidoctor/core` Reader output as the include text authority while preserving package-owned source-coordinate evidence.
- Added source-aware logical line records for source-preserving, selected-source, transformed-source, generated-control, and degraded logical lines, with column maps for indented include output.
- Added support for mapped include surfaces in book-entry mode: full-file includes, `tag`, `tags`, `lines`, `indent`, `leveloffset`, `opts=optional`, and escaped include directives.
- Added official-reader book fixtures and regression coverage for tagged source-block includes, nested includes, level offsets, escaped includes, optional missing includes, source coordinate recovery, RDF 1.2 source reconstruction, and CLI JSON output.

### Changed

- Switched active `mode: "book-entry"` parsing from the legacy full-file logical-source builder to the official Reader preprocessing path.
- Source reconstruction now emits the original author-owned source files from the source set, including complete tagged and line-range targets, instead of leaking parser-safe logical text.
- Book-entry preprocessing now prevalidates include boundaries against `documentRoot` before running the Reader pass, allowing legal ancestor-style includes inside the document root without noisy Asciidoctor safe-mode stderr output.
- Expanded coverage for source recovery, official block projection, RDF 1.2 projection edges, Turtle serialization, and animation YAML export so the package-level coverage gate passes with branch coverage above the configured threshold.

### Fixed

- Fixed tagged and line-range source includes inside source blocks so book-entry parsing succeeds and listing content comes from the selected target lines.
- Fixed source coordinates for selected, non-contiguous, and indented include output, including column-unmapped diagnostics for inserted indentation columns.
- Fixed multi-source block raw recovery so blocks spanning author files emit `block-origin.multi-source-span` instead of fake raw coordinates.
- Fixed RDF 1.2 source-file projection for official-reader book entries so optional missing targets, generated control lines, escaped include targets, and parser-safe logical text are not reconstructed as source files.

## 0.1.15 - 2026-06-16

### Changed

- Synchronized the RDF 1.2 heading projection payload contract with the 06 specification book, replacing the old payload-block surface with explicit node payload and edge payload object semantics.
- Updated README, RDF12 preview samples, canonical structural payload samples, and animation YAML fixtures to use `for` / `forSelector` node payload markers, xref `payload=` edge selectors, source block language formats, and role-token payload schemas.
- Extended local non-heading target IDs from listings, tables, blocks, inline anchors, and payload blocks into owning heading address labels while keeping xref target selectors separate from xref payload selectors.

### Fixed

- Project node payloads without requiring source payload IDs, including source-owner binding from no-value `for` markers.
- Project payload roles, source block language formats, raw payload literals, source line spans, and edge payload IDs without expanding payload raw content into business RDF predicates.
- Hardened edge payload selector binding so repeated source payload IDs on the same payload object do not create false ambiguity, while multiple payload objects with the same selector remain unconnected.
- Preserved animation YAML export for node payloads that do not have source payload IDs by reading payload objects from heading `aat:payload` links.

## 0.1.14 - 2026-06-10

### Changed

- **Breaking:** RDF 1.2 heading projection now represents the ordered heading tree with `aat:containsDirectly`, `aat:childOrder`, and `aat:documentOrder`. `aat:containsDirectly` expresses direct parent-child heading relationships, `aat:childOrder` orders direct children within the same parent, and `aat:documentOrder` orders all headings by logical preorder.
- **Breaking:** RDF 1.2 heading projection no longer emits `aat:previousSibling`. Consumers should migrate sibling ordering to numeric `aat:childOrder` and whole-document heading traversal to numeric `aat:documentOrder`.
- **Breaking:** Book-entry heading order now comes from the logical `AbundantDocument` heading tree. Source coordinate fields such as `aat:relativePath`, `aat:startLine`, `aat:endLine`, `aat:headingLine`, and `aat:raw` continue to describe origin source location and slices, but they are not valid order fallbacks.

## 0.1.13 - 2026-06-09

### Added

- Added first-class description list nodes with item, term, description, delimiter, metadata, source span, inline occurrence, nested list, and book-entry origin source recovery support.

### Fixed

- Fixed official AST traversal for Asciidoctor description list tuple items so description lists no longer produce unknown `undefined` block diagnostics or disappear from the public tree.
- Fixed description list item and description source spans so direct description text, attached blocks, and nested description lists keep distinct source surfaces.

## 0.1.12 - 2026-06-08

### Fixed

- Fixed book-entry heading slice recovery so table, listing, source-block, and ordinary block metadata surfaces no longer truncate section `source.raw/span` or RDF12 heading `aat:raw/endLine` before the next real same-origin heading.

## 0.1.11 - 2026-06-08

### Added

- Added a business-layer animation YAML exporter that consumes book-entry RDF 1.2 projection facts and emits structured animation adaptation YAML.
- Added the `animation-yaml-export` CLI bin and `exportAnimationYaml` TypeScript API for downstream tools such as `seekwant`.
- Added JSON/YAML payload parsing, animation script block extraction, business role and relation mapping, source coordinates, export warnings, and coverage fixtures for animation profile data.

## 0.1.10 - 2026-06-07

### Fixed

- Fixed RDF 1.2 book-entry heading raw projection so origin-backed section nodes emit the exact source heading slice instead of being sliced again through the single-file fallback path.

### Changed

- Completed the npm publish workflow so both tag-triggered and manual dispatch releases publish the package, keep the version tag aligned with `package.json`, and create the GitHub release record when needed.

## 0.1.9 - 2026-06-04

### Added

- Added explicit `book-entry` parsing mode for the library API and CLI, with `documentRoot`-bounded full-file include construction and origin source coordinates.
- Added CLI `--mode single-file|book-entry` and `--document-root <root>` behavior for JSON, pretty tree, RDF 1.2 Turtle, and RDF 1.2 JSON-LD output.
- Added downstream RDF 1.2 projection coverage for book-entry origin `aat:relativePath` values on heading resources, xref edge evidence, payload resources, and source document provenance.
- Added `samples/book-entry-demo/` as a small book-shaped black-box sample for explicit book-entry parsing.

### Changed

- Extended the CLI smoke gate to cover the book-entry demo JSON path.

### Fixed

- Preserved single-file mode as the default and kept `:doctype: book`, include directives, filenames, and `--document-root` from implicitly switching parser input construction.
- Hardened book-entry construction and recovery diagnostics so construction errors block document creation and unrecoverable origin spans do not emit fake raw text or coordinates.

## 0.1.8 - 2026-05-29

### Fixed

- Allowed node payload blocks to bind from `for` or `forSelector` attributes without requiring a `.payload` role token.
- Allowed xref edge payloads to bind from xref `payload` selectors and matching listing IDs without requiring a `.xref-payload` role token.
- Updated the RDF 1.2 line projection book to document payload binding as attribute-driven behavior, with role tokens treated as source surface fields rather than binding gates.

## 0.1.7 - 2026-05-29

### Fixed

- Aligned the RDF 1.2 provenance projection entity with the heading projection contract by emitting `aat:HeadingProjection`.
- Removed `aat:AsciiDocDocument` and `aat:AbundantDocument` from the public RDF graph while keeping the runtime projection result fields for compatibility.
- Synchronized the provenance, query-contract, serializer, and README coverage with the current heading projection contract.

## 0.1.6 - 2026-05-28

### Fixed

- Parsed shorthand attribute lists such as `[#delivery-policy.section, kind=policy]` as structured attrlists, preserving the explicit ID, role token, and named attributes separately.
- Finalized the RDF 1.2 public graph as a heading projection: heading nodes now carry direct label fields, line slices, containment, sibling order, xref edge evidence, RDF 1.2 reifiers, direct field predicates, and payload complex property objects.
- Removed legacy RDF 1.2 public contract surfaces for structural block resources, label resources, surface attribute resources, xref occurrence resources, and payload block resources.
- Preserved node payload `for` binding and xref `payload` selector binding through `aat:payload` complex property objects while keeping payload raw text opaque.

### Added

- Added regression coverage for section attrlist attributes, attrlist-derived address labels, payload address label source lines, and the `samples/structural-payload.adoc` RDF projection contract.

## 0.1.5 - 2026-05-28

### Fixed

- Reworked inline macro argument binding so `xref:target[rel=is]` treats `rel` as a named attribute instead of a display label.
- Preserved RDF relation predicate selection for leading `rel` macro attributes, so explicit relations use `rel:*` predicates and only missing `rel` falls back to `aat:references`.

### Changed

- Added a dedicated macro argument parser with positional and named argument separation for xref macro parsing.

## 0.1.4 - 2026-05-28

### Added

- Added RDF 1.2 JSON-LD output for frontend consumption through CLI `--format rdf12-json-ld`.
- Added `jsonLd` to the public `rdf12(document, options)` TypeScript API result.
- Added JSON-LD serializer coverage for IRI, literal, language-tagged literal, and RDF 1.2 triple-term objects.

### Changed

- Extended the CLI smoke gate to cover both Turtle `rdf12` and JSON-LD `rdf12-json-ld` output.

## 0.1.3 - 2026-05-28

### Added

- Strengthened RDF 1.2 projection audit coverage for adapter rejection paths, language-tagged literal roundtrip, selector ambiguity, source-span boundaries, payload binding, relation predicate fallback, and source-surface diagnostics.
- Added coverage for serializer edge behavior and source coordinate handling used by downstream RDF projection checks.

### Changed

- Documented coverage verification as part of the development gate for RDF projection releases.

## 0.1.2 - 2026-05-28

### Added

- Completed the RDF 1.2 projection surface from graph primitives through public runtime access.
- Projected identity coordinates, source provenance, structural resources, label catalogs, xref relation reifiers, surface attributes, and opaque payload source text.
- Serialized RDF 1.2 Turtle output with triple-term `rdf:reifies` objects through both the `rdf12(document, options)` API and CLI `--format rdf12`.
- Added query-contract acceptance coverage for the completed RDF projection.

### Changed

- Updated README documentation to describe RDF 1.2 projection as a runtime package capability rather than only a specification artifact.

### Fixed

- Stabilized RDF 1.2 graph ordering, helper label ownership, payload label identity, and indexed xref occurrence coverage.

## 0.1.1 - 2026-05-28

### Added

- Public `rdf12(document, options)` TypeScript API returning both project graph facts and Turtle 1.2 text.
- CLI `--format rdf12` output for RDF 1.2 Turtle serialization.
- RDF 1.2 projection coverage for source locations, labels, selector binding, xref relation reifiers, surface attributes, payload blocks, and query-contract acceptance.

### Known Boundaries

- RDF output is exposed only through the `rdf12` format/API surface; `rdf`, `ttl`, and `turtle` are not public aliases.
- The projection does not lint prose, validate cross-file xref targets by opening external files, or interpret payload raw text.

## 0.1.0 - 2026-05-26

Initial public release.

### Added

- Single-file AsciiDoc parsing through `parseAbundantTree`.
- Source-aware `AbundantDocument` model for sections, paragraphs, listings, tables, metadata, targets, anchors, and xrefs.
- Target catalog for sections, blocks, listings, tables, inline anchors, and block anchors.
- Xref occurrence records with raw target text, labels, source spans, containing section, scope, target kind, and official Asciidoctor binding data.
- Pretty tree output through `formatAbundantTree`.
- JSON-safe serialization through `serializeAbundantTreeToJson`.
- CLI entry point `asciidoc-abundant-tree`.
- Apache-2.0 license, GitHub Actions CI, and npm package metadata.

### Known Boundaries

- The parser reads one source file at a time.
- Include graphs and interdocument target validation are outside the current package boundary.
- The output is an analysis-oriented tree, not a full AsciiDoc CST or replacement for Asciidoctor.
