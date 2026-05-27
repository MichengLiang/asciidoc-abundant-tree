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
});
