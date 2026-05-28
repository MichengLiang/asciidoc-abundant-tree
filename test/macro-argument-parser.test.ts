import { describe, expect, it } from "vitest";
import { parseMacroArguments } from "../src/macro-argument-parser";

describe("parseMacroArguments", () => {
	it("separates positional and named macro arguments", () => {
		expect(parseMacroArguments("")).toEqual({
			positional: [],
			named: {},
		});
		expect(parseMacroArguments("苹果")).toEqual({
			positional: ["苹果"],
			named: {},
		});
		expect(parseMacroArguments("苹果, rel=is, weight=0.8")).toEqual({
			positional: ["苹果"],
			named: {
				rel: "is",
				weight: "0.8",
			},
		});
		expect(parseMacroArguments("rel=is, weight=0.8, payload=x")).toEqual({
			positional: [],
			named: {
				rel: "is",
				weight: "0.8",
				payload: "x",
			},
		});
	});

	it("keeps bare tokens positional and preserves named empty string values", () => {
		expect(parseMacroArguments(", rel=is")).toEqual({
			positional: [""],
			named: {
				rel: "is",
			},
		});
		expect(parseMacroArguments("苹果, flag, empty=")).toEqual({
			positional: ["苹果", "flag"],
			named: {
				empty: "",
			},
		});
	});

	it("keeps equals signs inside named values", () => {
		expect(parseMacroArguments("苹果, key=value=with=equals")).toEqual({
			positional: ["苹果"],
			named: {
				key: "value=with=equals",
			},
		});
	});

	it("treats empty names and empty positional fields as positional values", () => {
		expect(parseMacroArguments("=value, , name=value")).toEqual({
			positional: ["=value", ""],
			named: {
				name: "value",
			},
		});
	});
});
