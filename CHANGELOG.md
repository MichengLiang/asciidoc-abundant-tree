# Changelog

All notable changes to this project are documented in this file.

This project uses semantic versioning after `0.1.0`.

## Unreleased

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
