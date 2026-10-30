import { describe, expect, it } from "vitest";
import { fieldPredicate } from "../../src/rdf12-projection/field-predicate";
import { namespaces } from "../../src/rdf12-projection/namespaces";

describe("rdf12 field predicate mapping", () => {
	it("writes every field name as written under the field namespace", () => {
		expect(fieldPredicate("status").value).toBe(`${namespaces.field}status`);
		expect(fieldPredicate("难度").value).toBe(`${namespaces.field}难度`);
		expect(fieldPredicate("9priority").value).toBe(
			`${namespaces.field}9priority`,
		);
		expect(fieldPredicate("x/y").value).toBe(`${namespaces.field}x/y`);
	});

	it("keeps field names apart from the projector's own vocabulary", () => {
		expect(fieldPredicate("role").value).toBe(`${namespaces.field}role`);
		expect(fieldPredicate("headline").value).not.toBe(
			`${namespaces.aat}headline`,
		);
	});

	it("percent-encodes only what an IRI cannot carry", () => {
		expect(fieldPredicate("über score").value).toBe(
			`${namespaces.field}über%20score`,
		);
	});

	it("maps the same field name deterministically", () => {
		expect(fieldPredicate("über score")).toEqual(fieldPredicate("über score"));
	});
});
