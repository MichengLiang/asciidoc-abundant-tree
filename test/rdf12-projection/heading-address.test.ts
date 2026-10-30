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

	it("names a heading after its shortest address that only it owns", () => {
		const addresses = book(cookbook);

		expect(addresses.nameOf("sugar")).toBe("炒糖色");
		expect(addresses.nameOf("pork-heat")).toBe("红烧肉::火候");
		expect(addresses.nameOf("fish-heat")).toBe("清蒸鲈鱼::火候");
		expect(addresses.nameOf("book")).toBe("家常菜谱");
	});

	it("matches selectors as whole strings, so a headline may contain ::", () => {
		const addresses = book([
			{ key: "book", headline: "C++" },
			{ key: "vector", parent: "book", headline: "std::vector" },
		]);

		expect(addresses.owners("std::vector")).toEqual(["vector"]);
		expect(addresses.nameOf("vector")).toBe("std::vector");
	});

	it("judges uniqueness against the whole label space, aliases included", () => {
		// 另一个标题的 custom ID 恰好是「火候」时，「火候」写回 selector 会多义，所以不能作名字。
		const addresses = book([
			{ key: "book", headline: "菜谱" },
			{ key: "pork", parent: "book", headline: "红烧肉" },
			{ key: "heat", parent: "pork", headline: "火候" },
			{ key: "other", parent: "book", headline: "别的", ids: ["火候"] },
		]);

		expect(addresses.nameOf("heat")).toBe("红烧肉::火候");
		expect(addresses.nameOf("other")).toBe("别的");
	});

	it("falls back to the heading's own custom ID, then to a numbered path, for siblings that share a headline", () => {
		const withId = book([
			{ key: "book", headline: "附录" },
			{
				key: "first",
				parent: "book",
				headline: "关闭对象",
				ids: ["关闭对象甲"],
			},
			{ key: "second", parent: "book", headline: "关闭对象" },
		]);
		expect(withId.nameOf("first")).toBe("关闭对象甲");
		expect(withId.nameOf("second")).toBe("关闭对象-2");

		const generated = book([
			{ key: "book", headline: "附录" },
			{
				key: "first",
				parent: "book",
				headline: "关闭对象",
				ids: ["_关闭对象"],
				generated: true,
			},
			{
				key: "second",
				parent: "book",
				headline: "关闭对象",
				ids: ["_关闭对象_2"],
				generated: true,
			},
		]);
		// 生成 ID 不是作者给的别名，不作名字。
		expect(generated.nameOf("first")).toBe("关闭对象-1");
		expect(generated.nameOf("second")).toBe("关闭对象-2");
	});

	it("lengthens a numbered name that collides with another address", () => {
		const addresses = book([
			{ key: "book", headline: "书" },
			{ key: "appendix", parent: "book", headline: "附录" },
			{ key: "first", parent: "appendix", headline: "关闭对象" },
			{ key: "second", parent: "appendix", headline: "关闭对象" },
			{ key: "taken", parent: "book", headline: "关闭对象-1" },
		]);

		expect(addresses.nameOf("first")).toBe("附录::关闭对象-1");
		expect(addresses.nameOf("second")).toBe("关闭对象-2");
	});

	it("leaves empty headlines and empty IDs out of the label space", () => {
		const addresses = book([{ key: "empty", headline: "", ids: [""] }]);

		expect(addresses.addresses).toEqual([]);
		expect(addresses.nameOf("empty")).toBeUndefined();
	});

	it("keeps every name distinct and binds a name back to its own heading", () => {
		const words = [
			"火候",
			"红烧肉",
			"std",
			"vector",
			"std::vector",
			"A",
			"火候-1",
		];
		let seed = 20261031;
		const random = (limit: number): number => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % limit;
		};

		for (let round = 0; round < 300; round += 1) {
			const specs: Spec[] = [{ key: "h0", headline: "书" }];
			const count = 2 + random(12);
			for (let index = 1; index < count; index += 1) {
				const ids = random(4) === 0 ? [words[random(words.length)] ?? "A"] : [];
				specs.push({
					key: `h${index}`,
					parent: `h${random(index)}`,
					headline: words[random(words.length)] ?? "A",
					ids,
				});
			}
			const addresses = book(specs);
			const names = specs.map((spec) => addresses.nameOf(spec.key));

			expect(new Set(names).size).toBe(names.length);
			for (const spec of specs) {
				const name = addresses.nameOf(spec.key) ?? "";
				// 写回 selector：要么绑到它自己，要么（加了 -k 的名字）不是任何标题的地址，绝不绑到别的标题。
				expect([[spec.key], []]).toContainEqual(addresses.owners(name));
			}
		}
	});
});
