# Changelog

All notable changes to this project are documented in this file.

This project uses semantic versioning after `0.1.0`.

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
