# asciidoc-abundant-tree

[![npm version](https://img.shields.io/npm/v/asciidoc-abundant-tree.svg)](https://www.npmjs.com/package/asciidoc-abundant-tree)
[![CI](https://github.com/MichengLiang/asciidoc-abundant-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/MichengLiang/asciidoc-abundant-tree/actions/workflows/ci.yml)
[![Pages](https://github.com/MichengLiang/asciidoc-abundant-tree/actions/workflows/pages.yml/badge.svg)](https://github.com/MichengLiang/asciidoc-abundant-tree/actions/workflows/pages.yml)
[![License](https://img.shields.io/npm/l/asciidoc-abundant-tree.svg)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/asciidoc-abundant-tree.svg)](./package.json)

`asciidoc-abundant-tree` turns one AsciiDoc source file into a source-aware, analysis-ready document tree.

The package exists for tools that need more than rendered HTML and less than a full AsciiDoc language server. Asciidoctor is excellent at conversion and official reference resolution, but its public output surfaces are not shaped as a compact source map for downstream static analysis. This package keeps Asciidoctor as the authority for AsciiDoc semantics, then adds a TypeScript object model that preserves the authored surface, source spans, block structure, target catalog, xref occurrences, and official xref bindings in one object.

The pretty tree format is designed for terminal reading. Its shape is intentionally close to the `docutils` `pformat()` style: object headlines carry compact scalar attributes, nested objects keep stable indentation, and multiline source text is printed as an indented body instead of being squeezed into an escaped attribute.

## What It Gives You

- A single `AbundantDocument` object for a `.adoc` file.
- Section, paragraph, listing, table, title, metadata, target, anchor, and xref nodes.
- Raw source text and source spans for recoverable authored surfaces.
- A target catalog for sections, blocks, listings, tables, inline anchors, and block anchors.
- Xref occurrence records that keep raw target text, labels, local/external/unresolved scope, containing section, and resolved target kind.
- Official Asciidoctor binding data for xrefs: `href`, `resolvedId`, `resolvedType`, and `reftext`.
- Pretty tree output for terminal inspection and JSON output for automation.
- RDF 1.2 graph and Turtle output through the single `rdf12` projection for source-aware graph queries and line-based edit loops.

The primary artifact is the TypeScript object. Pretty text, JSON, and RDF 1.2 Turtle are projections of the same parsed document.

## Documentation

- Live bookshelf: <https://michengliang.github.io/asciidoc-abundant-tree/>
- RDF 1.2 line projection specification: [AsciiDoc `AbundantDocument` 到 RDF 1.2 行级结构图投影规约](https://michengliang.github.io/asciidoc-abundant-tree/books/06-rdf12-line-projection/book.html)
- Source: [`docs/bookshelf`](./docs/bookshelf/)

The RDF 1.2 projection book specifies the graph vocabulary and query contract used by the package runtime. The public runtime surface exposes that projection through the `rdf12(document, options)` API and CLI `--format rdf12`.

## When To Use It

Use this package when you are building:

- documentation analyzers
- xref and anchor audits
- source-aware migration tools
- documentation inventory scripts
- authoring diagnostics that need line and column evidence
- experiments that compare authored AsciiDoc with Asciidoctor's resolved model

It is especially useful when a tool needs to answer questions such as:

- Where is this xref written in the source file?
- Does this target come from a section, listing, table, block ID, or inline anchor?
- Which section contains this occurrence?
- What did Asciidoctor resolve this xref to?
- What source text produced this block or metadata layer?
- Which RDF resources and reified relations represent the same source interval, xref occurrence, or authored surface?

## RDF 1.2 Projection

The `rdf12` projection derives an RDF 1.2 graph from an `AbundantDocument`. The source document remains the fact source, `AbundantDocument` is the input contract, and the RDF graph is the queryable projection.

Projection resources use deterministic IRIs generated from the document coordinate system, not author strings. Titles, explicit IDs, generated IDs, anchor IDs, xref display labels, and xref targets are represented as labels or selectors. Query code can use the label catalog to find resources, then read `relativePath`, `startLine`, and `endLine` for source inspection or patching.

The graph includes source document provenance, structural resources, direct containment, label resources, selector binding, xref occurrence resources, RDF 1.2 reifiers for resolved xref relations, surface attributes, and payload block resources. Xref occurrences keep raw selectors and official Asciidoctor evidence separately. Payload blocks keep opaque source text and content line spans; the projection does not interpret JSON, YAML, TOML, XML, or other payload formats.

## Current Boundaries

This package is intentionally narrow.

- It reads one source file at a time.
- It does not expand an AsciiDoc include graph as a multi-file workspace.
- It does not validate interdocument xref targets by opening other files.
- It does not expose a complete inline CST.
- It does not lint prose style.
- It does not interpret payload raw text or expand payload data into a business RDF graph.
- It does not generate HTML, PDF, EPUB, or a static site.
- It does not replace Asciidoctor; it uses Asciidoctor as the official parser and resolver layer.

The model is designed for static analysis and source inspection. It is not a complete AsciiDoc implementation.

## Install

```bash
pnpm add asciidoc-abundant-tree
```

```bash
npm install asciidoc-abundant-tree
```

## CLI

Try it without installing a project dependency:

```bash
npx asciidoc-abundant-tree path/to/file.adoc --format tree
```

```bash
asciidoc-abundant-tree <file.adoc>
asciidoc-abundant-tree <file.adoc> --json
asciidoc-abundant-tree <file.adoc> --format tree
asciidoc-abundant-tree <file.adoc> --format json
asciidoc-abundant-tree <file.adoc> --format rdf12
asciidoc-abundant-tree --help
```

Default output is a pretty tree:

```text
<document mode="single-file" sourcePath="samples/reference-links.adoc">
    <parser name="@asciidoctor/core" version="3.0.4">
    children[]
        <section idOrigin="source" ids="section-basics" level=1 title="基础概念">
            <source>
                <sourceSpan>
                    <end column=10 line=19>
                    <start column=1 line=19>
            children[]
```

JSON output preserves the same object fields and omits `undefined` values:

```bash
asciidoc-abundant-tree docs/index.adoc --json > tree.json
```

RDF 1.2 output writes Turtle text directly to stdout:

```bash
asciidoc-abundant-tree docs/index.adoc --format rdf12 > projection.ttl
```

The CLI exposes only `rdf12` for RDF output. It does not accept `rdf`, `ttl`, or `turtle` as public format aliases.

## Library API

```ts
import {
	formatAbundantTree,
	parseAbundantTree,
	rdf12,
	serializeAbundantTreeToJson,
} from "asciidoc-abundant-tree";

const document = parseAbundantTree({
	sourcePath: "docs/index.adoc",
});

const prettyText = formatAbundantTree(document);
const jsonData = serializeAbundantTreeToJson(document);
const projection = rdf12(document, {
	documentRoot: process.cwd(),
});

const graph = projection.graph;
const ttl = projection.ttl;
```

`parseAbundantTree` reads only the supplied source file. Interdocument xrefs keep their raw target and official href when Asciidoctor exposes one, but this package does not open the referenced `.adoc` file.

The public `rdf12(document, options)` call returns one projection result containing both `graph` and `ttl`. The `graph` is the project-owned RDF 1.2 graph model; the Turtle 1.2 text in `ttl` preserves RDF 1.2 reifier semantics by writing `rdf:reifies` objects as triple terms, not string literals. The projection is for source-aware query contracts: it records surface attributes and opaque payload source text, but it does not lint documents, validate cross-file targets, or interpret payload raw content.

## Object Layers

The output separates authored source facts from official Asciidoctor facts.

Source-layer fields describe the file surface: raw text, source line, line span, source span, syntax, target, label, IDs, roles, attributes, metadata span, and content span.

Official-layer fields describe Asciidoctor results: context, node name, href, resolved ID, resolved type, and reftext.

The separation matters. Raw xref targets are not overwritten by official bindings, and official xref data is not inferred from ordinary links in converted HTML. Each source xref occurrence receives its official binding from the Asciidoctor xref conversion for that occurrence.

## Example Tasks

List unresolved local xrefs:

```ts
import { parseAbundantTree } from "asciidoc-abundant-tree";

const document = parseAbundantTree({ sourcePath: "docs/index.adoc" });

for (const xref of document.xrefOccurrences) {
	if (xref.scope === "unresolved") {
		console.log(`${xref.target} at line ${xref.sourceSpan?.start.line}`);
	}
}
```

Inspect target kinds:

```ts
import { parseAbundantTree } from "asciidoc-abundant-tree";

const document = parseAbundantTree({ sourcePath: "docs/index.adoc" });

const byKind = new Map<string, number>();
for (const target of document.targets) {
	byKind.set(target.targetType, (byKind.get(target.targetType) ?? 0) + 1);
}

console.log(Object.fromEntries(byKind));
```

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm pack:check
```

Run the CLI from source:

```bash
pnpm dev samples/reference-links.adoc
pnpm dev samples/reference-links.adoc --json
pnpm dev samples/reference-links.adoc --format rdf12
```

## Release State

The package is usable for single-file source analysis and xref/target auditing. The object model is still small and conservative. Prefer pinning a minor version in production workflows and checking the JSON shape against your own fixtures before relying on it for large document systems.

## License

Apache-2.0. See [LICENSE](./LICENSE).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
