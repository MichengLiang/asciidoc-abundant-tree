import { describe, expect, it } from "vitest";
import { rowsFromTable } from "../src/official-projector";

describe("official-projector helpers", () => {
	it("handles missing and irregular table row groups", () => {
		expect(rowsFromTable(null)).toEqual([]);
		expect(
			rowsFromTable({
				head: [["head-1", { getText: () => "head-2" }], "skip"],
				body: [[{ getText: () => "body-1" }], [{ getText: () => "body-2" }]],
				foot: [[{ getText: () => "foot-1" }]],
			}),
		).toEqual([["head-1", "head-2"], ["body-1"], ["body-2"], ["foot-1"]]);
	});
});
