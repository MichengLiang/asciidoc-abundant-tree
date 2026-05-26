import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { assetCopyPlanForWorkspace } from "../scripts/copy-assets.mjs";

test("assetCopyPlanForWorkspace plans shared images and each book asset directory", async () => {
	const root = path.join(tmpdir(), `multi-book-assets-${Date.now()}`);
	await mkdir(path.join(root, "shared", "images"), { recursive: true });
	await mkdir(path.join(root, "books", "alpha-book", "assets"), {
		recursive: true,
	});
	await mkdir(path.join(root, "books", "beta-book", "assets"), {
		recursive: true,
	});

	const plan = await assetCopyPlanForWorkspace(root);

	assert.deepEqual(
		plan.map((entry) => ({
			from: path.relative(root, entry.from),
			to: path.relative(root, entry.to),
		})),
		[
			{
				from: path.join("shared", "images"),
				to: path.join("build", "html", "shared", "images"),
			},
			{
				from: path.join("books", "alpha-book", "assets"),
				to: path.join("build", "html", "books", "alpha-book", "assets"),
			},
			{
				from: path.join("books", "beta-book", "assets"),
				to: path.join("build", "html", "books", "beta-book", "assets"),
			},
		],
	);
});
