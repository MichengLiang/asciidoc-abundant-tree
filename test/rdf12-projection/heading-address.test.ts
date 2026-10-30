import { describe, expect, it } from "vitest";
import {
	type AddressedHeading,
	buildHeadingAddressBook,
} from "../../src/rdf12-projection/heading-address";

type Spec = {
	readonly key: string;
	readonly parent?: string;
	readonly headline: string;
	readonly ids?: readonly string[];
	readonly generated?: boolean;
	readonly aliases?: readonly string[];
};

function book(specs: readonly Spec[]) {
	return buildHeadingAddressBook<string>(
		specs.map(
			(spec): AddressedHeading<string> => ({
				key: spec.key,
				...(spec.parent !== undefined ? { parent: spec.parent } : {}),
				headline: spec.headline,
				ids: spec.ids ?? [],
				idKind: spec.generated ? "generatedAddressLabel" : "addressLabel",
				targetAliases: spec.aliases ?? [],
			}),
		),
	);
}

const cookbook: Spec[] = [
	{ key: "book", headline: "家常菜谱" },
	{ key: "pork", parent: "book", headline: "红烧肉" },
	{ key: "pork-heat", parent: "pork", headline: "火候" },
	{ key: "fish", parent: "book", headline: "清蒸鲈鱼" },
	{ key: "fish-heat", parent: "fish", headline: "火候" },
	{ key: "sugar", parent: "book", headline: "炒糖色" },
];

describe("heading address book", () => {
	it("addresses a heading by every suffix of its headline path", () => {
		const addresses = book(cookbook);

		expect(addresses.owners("火候")).toEqual(["pork-heat", "fish-heat"]);
		expect(addresses.owners("红烧肉::火候")).toEqual(["pork-heat"]);
		expect(addresses.owners("家常菜谱::红烧肉::火候")).toEqual(["pork-heat"]);
		expect(addresses.owners("家常菜谱::火候")).toEqual([]);
	});

	it("records a one-segment address as headline and longer ones as address paths", () => {
		const addresses = book(cookbook);

		expect(
			addresses.addresses
				.filter((address) => address.owner === "pork-heat")
				.map(({ value, kind }) => [value, kind]),
		).toEqual([
			["火候", "headline"],
			["红烧肉::火候", "addressPath"],
			["家常菜谱::红烧肉::火候", "addressPath"],
		]);
	});

	it("matches selectors as whole strings, so a headline may contain ::", () => {
		const addresses = book([
			{ key: "book", headline: "C++" },
			{ key: "std", parent: "book", headline: "std" },
			{ key: "vector", parent: "std", headline: "vector" },
			{ key: "std-vector", parent: "book", headline: "std::vector" },
		]);

		expect(addresses.owners("std::vector")).toEqual(["vector", "std-vector"]);
		expect(addresses.owners("vector")).toEqual(["vector"]);
	});

	it("puts custom IDs, generated IDs and local target aliases in the same label space, with every owner listed", () => {
		// 投影器不判断谁和谁重复：同一个地址有几个拥有者，就列出几个。
		const addresses = book([
			{ key: "book", headline: "菜谱" },
			{ key: "pork", parent: "book", headline: "红烧肉", ids: ["pork"] },
			{ key: "heat", parent: "pork", headline: "火候", aliases: ["heat-note"] },
			{ key: "other", parent: "book", headline: "别的", ids: ["火候"] },
			{
				key: "generated",
				parent: "book",
				headline: "另一节",
				ids: ["_另一节"],
				generated: true,
			},
		]);

		expect(addresses.owners("火候")).toEqual(["heat", "other"]);
		expect(addresses.owners("pork")).toEqual(["pork"]);
		expect(addresses.owners("heat-note")).toEqual(["heat"]);
		expect(addresses.owners("_另一节")).toEqual(["generated"]);
		expect(
			addresses.addresses.find((address) => address.value === "_另一节")?.kind,
		).toBe("generatedAddressLabel");
	});

	it("lists siblings that share a headline as owners of every address they share", () => {
		const addresses = book([
			{ key: "book", headline: "糖醋排骨" },
			{ key: "first", parent: "book", headline: "炸" },
			{ key: "second", parent: "book", headline: "炸" },
		]);

		expect(addresses.owners("炸")).toEqual(["first", "second"]);
		expect(addresses.owners("糖醋排骨::炸")).toEqual(["first", "second"]);
	});

	it("leaves empty headlines and empty IDs out of the label space", () => {
		const addresses = book([{ key: "empty", headline: "", ids: [""] }]);

		expect(addresses.addresses).toEqual([]);
		expect(addresses.owners("")).toEqual([]);
	});
});
