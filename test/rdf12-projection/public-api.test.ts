import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree, rdf12 } from "../../src/index";
import { parseTurtleToRdf12Graph } from "../../src/rdf12-projection/n3-adapter";

const projectRoot = process.cwd();
const sourcePath = join(projectRoot, "samples/reference-links.adoc");

describe("rdf12 public API", () => {
	it("returns graph and Turtle from the single public rdf12 call", () => {
		const document = parseAbundantTree({ sourcePath });
		const result = rdf12(document, {
			documentRoot: projectRoot,
		});

		expect(result.graph).toBeDefined();
		expect(result.ttl).toContain("@prefix aat:");
		expect(result.ttl).toContain("rdf:reifies <<(");
		expect(parseTurtleToRdf12Graph(result.ttl).size).toBe(result.graph.size);
	});

	it("returns JSON-LD from the single public rdf12 call", () => {
		const document = parseAbundantTree({ sourcePath });
		const result = rdf12(document, {
			documentRoot: projectRoot,
		});

		const jsonLd = JSON.parse(result.jsonLd);

		expect(jsonLd["@context"].rdf12).toBe(
			"https://micheng.dev/ns/asciidoc-abundant-tree/rdf12-json-ld#",
		);
		expect(jsonLd["@graph"]).toHaveLength(result.graph.size);
		expect(jsonLd["@graph"]).toContainEqual(
			expect.objectContaining({
				"@type": "rdf12:Triple",
				object: expect.objectContaining({
					"@type": "rdf12:TripleTerm",
					triple: expect.any(Object),
				}),
			}),
		);
	});
});
