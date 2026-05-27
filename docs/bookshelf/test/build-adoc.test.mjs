import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
	adocBuildPlanForWorkspace,
	buildAdocForWorkspace,
} from "../scripts/build-adoc.mjs";

test("adocBuildPlanForWorkspace maps catalog and each book to the adoc output tree", async () => {
	const root = path.resolve(
		"tmp",
		"test-fixtures",
		`bookshelf-adoc-plan-${randomUUID()}`,
	);
	await mkdir(path.join(root, "books", "alpha-book"), { recursive: true });
	await mkdir(path.join(root, "books", "beta-book"), { recursive: true });
	await mkdir(path.join(root, "books", "notes-only"), { recursive: true });
	await writeFile(path.join(root, "catalog.adoc"), "= Catalog\n");
	await writeFile(
		path.join(root, "books", "alpha-book", "book.adoc"),
		"= Alpha\n",
	);
	await writeFile(
		path.join(root, "books", "beta-book", "book.adoc"),
		"= Beta\n",
	);

	const plan = await adocBuildPlanForWorkspace(root);

	assert.deepEqual(
		plan.map((entry) => ({
			kind: entry.kind,
			bookId: entry.bookId,
			input: path.relative(root, entry.input),
			output: path.relative(root, entry.output),
		})),
		[
			{
				kind: "catalog",
				bookId: null,
				input: "catalog.adoc",
				output: path.join("build", "adoc", "catalog.adoc"),
			},
			{
				kind: "book",
				bookId: "alpha-book",
				input: path.join("books", "alpha-book", "book.adoc"),
				output: path.join("build", "adoc", "books", "alpha-book.adoc"),
			},
			{
				kind: "book",
				bookId: "beta-book",
				input: path.join("books", "beta-book", "book.adoc"),
				output: path.join("build", "adoc", "books", "beta-book.adoc"),
			},
		],
	);
});

test("buildAdocForWorkspace expands shared attributes and book includes into pure text files", async () => {
	const root = path.resolve(
		"tmp",
		"test-fixtures",
		`bookshelf-adoc-build-${randomUUID()}`,
	);
	const bookDir = path.join(root, "books", "06-rdf12-line-projection");
	await mkdir(path.join(root, "shared"), { recursive: true });
	await mkdir(path.join(bookDir, "frontmatter"), { recursive: true });
	await writeFile(
		path.join(root, "catalog.adoc"),
		"= Catalog\n\n* xref:books/06-rdf12-line-projection/book.adoc[RDF projection]\n",
	);
	await writeFile(
		path.join(root, "shared", "attributes.adoc"),
		":series-name: Bookshelf Fixture\n",
	);
	await writeFile(
		path.join(bookDir, "book.adoc"),
		[
			"= RDF Projection",
			":doctype: book",
			"",
			"include::../../shared/attributes.adoc[]",
			"",
			"include::frontmatter/preface.adoc[]",
		].join("\n"),
	);
	await writeFile(
		path.join(bookDir, "frontmatter", "preface.adoc"),
		"== Preface\nExpanded text.\n",
	);

	await buildAdocForWorkspace(root);

	const catalog = await readFile(
		path.join(root, "build", "adoc", "catalog.adoc"),
		"utf8",
	);
	const book = await readFile(
		path.join(root, "build", "adoc", "books", "06-rdf12-line-projection.adoc"),
		"utf8",
	);

	assert.match(catalog, /xref:books\/06-rdf12-line-projection\/book\.adoc/);
	assert.match(book, /:series-name: Bookshelf Fixture/);
	assert.match(book, /Expanded text\./);
	assert.doesNotMatch(`${catalog}\n${book}`, /^[ \t]*include::/m);
});
