import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	computeDocumentKey,
	computePathCoordinate,
} from "../../src/rdf12-projection/path-coordinate";

describe("rdf12 path coordinates", () => {
	it("generates the same document key for the same relative path", () => {
		const relativePath = "samples/reference-links.adoc";

		expect(computeDocumentKey(relativePath)).toBe(
			computeDocumentKey(relativePath),
		);
		expect(computeDocumentKey(relativePath)).toBe(
			createHash("sha256").update(relativePath).digest("hex"),
		);
	});

	it("generates different document keys for different relative paths", () => {
		expect(computeDocumentKey("samples/a.adoc")).not.toBe(
			computeDocumentKey("samples/b.adoc"),
		);
	});

	it("normalizes Windows separators to slash separators", () => {
		const coordinate = computePathCoordinate({
			documentRoot: "C:\\repo\\docs",
			sourcePath: "C:\\repo\\docs\\chapter\\intro.adoc",
		});

		expect(coordinate.relativePath).toBe("chapter/intro.adoc");
	});

	it("rejects source paths outside documentRoot using path structure", () => {
		expect(() =>
			computePathCoordinate({
				documentRoot: path.resolve("/repo/docs"),
				sourcePath: path.resolve("/repo/docs-neighbor/outside.adoc"),
			}),
		).toThrow(/outside documentRoot/u);
	});

	it("allows child path segments that merely start with two dots", () => {
		const coordinate = computePathCoordinate({
			documentRoot: path.resolve("/repo/docs"),
			sourcePath: path.resolve("/repo/docs/..drafts/intro.adoc"),
		});

		expect(coordinate.relativePath).toBe("..drafts/intro.adoc");
	});
});
