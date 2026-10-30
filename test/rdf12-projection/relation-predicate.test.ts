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

	it("writes the book's relation words as written into the rel namespace", () => {
		expect(mapRelationPredicate("depends-on", {}).predicate?.value).toBe(
			`${namespaces.rel}depends-on`,
		);
		expect(mapRelationPredicate("依据", {}).predicate?.value).toBe(
			`${namespaces.rel}依据`,
		);
	});

	it("percent-encodes what an IRI cannot carry in a relation word", () => {
		expect(mapRelationPredicate("依 据", {}).predicate?.value).toBe(
			`${namespaces.rel}依%20据`,
		);
	});

	it("leaves an empty rel without a predicate", () => {
		expect(mapRelationPredicate("", {})).toEqual({ rawRel: "" });
	});

	it("falls back from unknown CURIE-shaped rel values to absolute IRI handling", () => {
		expect(mapRelationPredicate("urn:depends-on", {}).predicate?.value).toBe(
			"urn:depends-on",
		);
	});
});
