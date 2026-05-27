import { describe, expect, it } from "vitest";
import { namespaces } from "../../src/rdf12-projection/namespaces";
import { mapRelationPredicate } from "../../src/rdf12-projection/relation-predicate";

describe("rdf12 relation predicate mapping", () => {
	it("uses aat:references when rel is absent", () => {
		expect(mapRelationPredicate(undefined, {}).predicate?.value).toBe(
			`${namespaces.aat}references`,
		);
	});

	it("uses absolute IRIs unchanged", () => {
		expect(
			mapRelationPredicate("https://example.test/relation", {}).predicate
				?.value,
		).toBe("https://example.test/relation");
	});

	it("expands known CURIEs from relationPrefixMap", () => {
		expect(
			mapRelationPredicate("ex:depends-on", {
				ex: "https://example.test/relation/",
			}).predicate?.value,
		).toBe("https://example.test/relation/depends-on");
	});

	it("maps ordinary tokens into the rel namespace", () => {
		expect(mapRelationPredicate("depends-on", {}).predicate?.value).toBe(
			`${namespaces.rel}depends-on`,
		);
	});

	it("does not map invalid rel values", () => {
		expect(mapRelationPredicate("bad value", {})).toEqual({
			rawRel: "bad value",
		});
	});
});
