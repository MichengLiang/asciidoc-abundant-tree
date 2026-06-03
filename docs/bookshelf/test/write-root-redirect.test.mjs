import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
	bookshelfHomeHtml,
	writeBookshelfHome,
} from "../scripts/write-root-redirect.mjs";

test("bookshelfHomeHtml lays out the catalog and book entries", () => {
	const html = bookshelfHomeHtml([
		{
			id: "alpha-book",
			title: "Alpha Book",
			href: "books/alpha-book/book.html",
		},
		{
			id: "beta-book",
			title: "Beta & Book",
			href: "books/beta-book/book.html",
		},
	]);

	assert.doesNotMatch(html, /http-equiv="refresh"/);
	assert.match(html, /href="catalog\.html"/);
	assert.match(html, /href="books\/alpha-book\/book\.html"/);
	assert.match(html, />Alpha Book</);
	assert.match(html, /href="books\/beta-book\/book\.html"/);
	assert.match(html, />Beta &amp; Book</);
});

test("writeBookshelfHome writes index.html from the workspace book structure", async () => {
	const root = path.resolve(
		"tmp",
		"test-fixtures",
		`bookshelf-home-${randomUUID()}`,
	);
	const outputRoot = path.join(root, "build", "html");
	await mkdir(path.join(root, "books", "alpha-book"), { recursive: true });
	await mkdir(path.join(root, "books", "beta-book"), { recursive: true });
	await writeFile(
		path.join(root, "books", "alpha-book", "book.adoc"),
		"= Alpha\n",
	);
	await writeFile(
		path.join(root, "books", "beta-book", "book.adoc"),
		"= Beta\n",
	);

	await writeBookshelfHome(outputRoot, root);

	const html = await readFile(path.join(outputRoot, "index.html"), "utf8");
	assert.match(html, /books\/alpha-book\/book\.html/);
	assert.match(html, /books\/beta-book\/book\.html/);
});
