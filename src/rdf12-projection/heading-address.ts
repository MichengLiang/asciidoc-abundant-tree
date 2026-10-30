// 标题的地址只算一次（06 号书第 2 章「地址与 Label 空间」）：图上的标签与绑定用的 label catalog 都由它来。
// 地址是标签，不是身份；谁和谁重复、一处引用对上几个算不算歧义，这里不判断。

export type HeadingAddressKind =
	| "headline"
	| "addressPath"
	| "addressLabel"
	| "generatedAddressLabel";

export type AddressedHeading<K> = {
	readonly key: K;
	readonly parent?: K;
	readonly headline: string;
	// 标题自身的 ID：作者写的是 addressLabel，官方生成的是 generatedAddressLabel。
	readonly ids: readonly string[];
	readonly idKind: "addressLabel" | "generatedAddressLabel";
	// 归属到这个标题的本地非标题 target ID。
	readonly targetAliases: readonly string[];
};

export type HeadingAddress<K> = {
	readonly value: string;
	readonly owner: K;
	readonly kind: HeadingAddressKind;
};

export type HeadingAddressBook<K> = {
	readonly addresses: readonly HeadingAddress<K>[];
	owners(selector: string): readonly K[];
};

const separator = "::";

export function buildHeadingAddressBook<K>(
	headings: readonly AddressedHeading<K>[],
): HeadingAddressBook<K> {
	const byKey = new Map(headings.map((heading) => [heading.key, heading]));
	const pathOf = new Map<K, readonly string[]>();
	const path = (heading: AddressedHeading<K>): readonly string[] => {
		const known = pathOf.get(heading.key);
		if (known !== undefined) {
			return known;
		}
		const parent =
			heading.parent === undefined ? undefined : byKey.get(heading.parent);
		const segments = [...(parent ? path(parent) : []), heading.headline];
		pathOf.set(heading.key, segments);
		return segments;
	};

	const addresses: HeadingAddress<K>[] = [];
	const ownersByValue = new Map<string, K[]>();
	const add = (value: string, owner: K, kind: HeadingAddressKind): void => {
		if (value === "") {
			return;
		}
		addresses.push({ value, owner, kind });
		const owners = ownersByValue.get(value) ?? [];
		if (!owners.includes(owner)) {
			owners.push(owner);
		}
		ownersByValue.set(value, owners);
	};

	for (const heading of headings) {
		if (heading.headline !== "") {
			const segments = path(heading);
			for (let length = 1; length <= segments.length; length += 1) {
				add(
					suffix(segments, length),
					heading.key,
					length === 1 ? "headline" : "addressPath",
				);
			}
		}
		for (const id of heading.ids) {
			add(id, heading.key, heading.idKind);
		}
		for (const alias of heading.targetAliases) {
			add(alias, heading.key, "addressLabel");
		}
	}

	return {
		addresses,
		owners: (selector) => ownersByValue.get(selector) ?? [],
	};
}

function suffix(segments: readonly string[], length: number): string {
	return segments.slice(segments.length - length).join(separator);
}
