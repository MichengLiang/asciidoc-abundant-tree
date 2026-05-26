# asciidoc-abundant-tree

[![npm version](https://img.shields.io/npm/v/asciidoc-abundant-tree.svg)](https://www.npmjs.com/package/asciidoc-abundant-tree)
[![CI](https://github.com/MichengLiang/asciidoc-abundant-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/MichengLiang/asciidoc-abundant-tree/actions/workflows/ci.yml)
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

The primary artifact is the TypeScript object. Pretty text and JSON are projections of the same parsed document.

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

## Current Boundaries

This package is intentionally narrow.

- It reads one source file at a time.
- It does not expand an AsciiDoc include graph as a multi-file workspace.
- It does not validate interdocument xref targets by opening other files.
- It does not expose a complete inline CST.
- It does not lint prose style.
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

## Library API

```ts
import {
	formatAbundantTree,
	parseAbundantTree,
	serializeAbundantTreeToJson,
} from "asciidoc-abundant-tree";

const document = parseAbundantTree({
	sourcePath: "docs/index.adoc",
});

const prettyText = formatAbundantTree(document);
const jsonData = serializeAbundantTreeToJson(document);
```

`parseAbundantTree` reads only the supplied source file. Interdocument xrefs keep their raw target and official href when Asciidoctor exposes one, but this package does not open the referenced `.adoc` file.

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
```

## Release State

The package is usable for single-file source analysis and xref/target auditing. The object model is still small and conservative. Prefer pinning a minor version in production workflows and checking the JSON shape against your own fixtures before relying on it for large document systems.

## License

Apache-2.0. See [LICENSE](./LICENSE).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
