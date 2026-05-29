import { describe, expect, it } from "vitest";
import { fieldPredicate } from "../../src/rdf12-projection/field-predicate";
import { namespaces } from "../../src/rdf12-projection/namespaces";

describe("rdf12 field predicate mapping", () => {
	it("uses the aat namespace directly for simple legal field names", () => {
		expect(fieldPredicate("kind").value).toBe(`${namespaces.aat}kind`);
		expect(fieldPredicate("status").value).toBe(`${namespaces.aat}status`);
		expect(fieldPredicate("owner").value).toBe(`${namespaces.aat}owner`);
		expect(fieldPredicate("weight").value).toBe(`${namespaces.aat}weight`);
	});

	it("uses stable IRI-safe encoding for unsafe local names", () => {
		expect(fieldPredicate("9priority").value).toBe(
			`${namespaces.aat}field-9priority`,
		);
		expect(fieldPredicate("über score").value).toBe(
			`${namespaces.aat}field-%C3%BCber%20score`,
		);
		expect(fieldPredicate("x/y").value).toBe(`${namespaces.aat}field-x%2Fy`);
	});

	it("maps the same field name deterministically", () => {
		expect(fieldPredicate("über score")).toEqual(fieldPredicate("über score"));
	});
});
