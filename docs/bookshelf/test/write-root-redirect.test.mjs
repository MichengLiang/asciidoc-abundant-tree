import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
	rootRedirectHtml,
	writeRootRedirect,
} from "../scripts/write-root-redirect.mjs";

test("rootRedirectHtml points the site root at the configured book", () => {
	const html = rootRedirectHtml("books/current/book.html");

	assert.match(html, /url=books\/current\/book\.html/);
	assert.match(html, /href="books\/current\/book\.html"/);
});

test("writeRootRedirect writes index.html under the output root", async () => {
	const root = path.resolve(
		"tmp",
		"test-fixtures",
		`root-redirect-${randomUUID()}`,
	);
	await writeRootRedirect(root, "books/current/book.html");

	const html = await readFile(path.join(root, "index.html"), "utf8");
	assert.match(html, /books\/current\/book\.html/);
});
