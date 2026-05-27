import { describe, expect, it, vi } from "vitest";

vi.mock("../src/parser", () => ({
	parseAbundantTree: vi.fn(),
}));

import { runCli } from "../src/cli";
import { parseAbundantTree } from "../src/parser";

describe("cli error handling", () => {
	it("reports parser errors", () => {
		vi.mocked(parseAbundantTree).mockImplementation(() => {
			throw new Error("parser boom");
		});

		const result = runCli(["samples/reference-links.adoc"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("parser boom");
	});

	it("reports unknown parser failures", () => {
		vi.mocked(parseAbundantTree).mockImplementation(() => {
			throw "boom";
		});

		const result = runCli(["samples/reference-links.adoc"]);

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("Unknown error");
	});
});
