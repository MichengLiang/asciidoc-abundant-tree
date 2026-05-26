import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { buildPlanForWorkspace } from "../scripts/build-books.mjs";

test("buildPlanForWorkspace finds book.adoc entries and maps each to its own output directory", async () => {
  const root = path.join(tmpdir(), `multi-book-${Date.now()}`);
  await mkdir(path.join(root, "books", "alpha-book"), { recursive: true });
  await mkdir(path.join(root, "books", "beta-book"), { recursive: true });
  await mkdir(path.join(root, "books", "notes-only"), { recursive: true });
  await writeFile(path.join(root, "books", "alpha-book", "book.adoc"), "= Alpha\n");
  await writeFile(path.join(root, "books", "beta-book", "book.adoc"), "= Beta\n");

  const plan = await buildPlanForWorkspace(root);

  assert.deepEqual(
    plan.map((entry) => ({
      bookId: entry.bookId,
      input: path.relative(root, entry.input),
      outputDir: path.relative(root, entry.outputDir)
    })),
    [
      {
        bookId: "alpha-book",
        input: path.join("books", "alpha-book", "book.adoc"),
        outputDir: path.join("build", "html", "books", "alpha-book")
      },
      {
        bookId: "beta-book",
        input: path.join("books", "beta-book", "book.adoc"),
        outputDir: path.join("build", "html", "books", "beta-book")
      }
    ]
  );
});
