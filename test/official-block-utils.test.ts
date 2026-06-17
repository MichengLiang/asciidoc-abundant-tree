import { describe, expect, it } from "vitest";
import type { AsciidoctorBlock } from "../src/asciidoctor-adapter";
import {
	childBlocksOf,
	descriptionListItemsFromBlock,
} from "../src/official-block-utils";

describe("official block utilities", () => {
	it("filters malformed description list raw items while preserving term-only items", () => {
		const term = block("dlist-term");
		const description = block("paragraph");
		const dlist: AsciidoctorBlock = {
			getContext: () => "dlist",
			getBlocks: () => [
				"not an item",
				["not terms", description],
				[[], description],
				[[{}], description],
				[[term], undefined],
				[[term], description],
			],
		};

		expect(descriptionListItemsFromBlock(dlist)).toEqual([
			{
				terms: [term],
			},
			{
				terms: [term],
				description,
			},
		]);
		expect(childBlocksOf(dlist)).toEqual([term, term, description]);
	});

	it("returns no children when getBlocks is absent and filters non-block children", () => {
		const paragraph = block("paragraph");

		expect(childBlocksOf({ getContext: () => "open" })).toEqual([]);
		expect(
			childBlocksOf({
				getContext: () => "open",
				getBlocks: () => [null, "text", {}, paragraph],
			}),
		).toEqual([paragraph]);
	});
});

function block(context: string): AsciidoctorBlock {
	return {
		getContext: () => context,
		getNodeName: () => context,
	};
}
