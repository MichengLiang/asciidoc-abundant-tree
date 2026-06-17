import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSourceSet } from "../../src/book-entry/source-set";

const fixtureRoot = join(process.cwd(), "tmp/book-entry-source-set");

describe("book-entry source set", () => {
	it("registers existing author-owned files once and preserves raw line tables", () => {
		const sourcePath = writeSourceSetFixture("book.adoc", "= Book\n\nbody\n");
		const sourceSet = createSourceSet({ documentRoot: fixtureRoot });

		const first = sourceSet.maybeRegisterFile(sourcePath);
		const second = sourceSet.maybeRegisterFile(sourcePath);

		expect(first).toBeDefined();
		expect(second).toBe(first);
		expect(sourceSet.records()).toHaveLength(1);
		expect(first).toEqual(
			expect.objectContaining({
				absolutePath: sourcePath,
				relativePath: "book.adoc",
				text: "= Book\n\nbody\n",
			}),
		);
		expect(first?.lineTable.lines.map((line) => line.text)).toEqual([
			"= Book",
			"",
			"body",
			"",
		]);
	});

	it("does not register missing include targets", () => {
		const sourceSet = createSourceSet({ documentRoot: fixtureRoot });

		expect(sourceSet.maybeRegisterFile(join(fixtureRoot, "missing.adoc"))).toBe(
			undefined,
		);
		expect(sourceSet.records()).toEqual([]);
	});
});

function writeSourceSetFixture(relativePath: string, source: string): string {
	const path = join(fixtureRoot, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source, "utf8");
	return path;
}
