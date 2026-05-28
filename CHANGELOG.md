# Changelog

All notable changes to this project are documented in this file.

This project uses semantic versioning after `0.1.0`.

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
