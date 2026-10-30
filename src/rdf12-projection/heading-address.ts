// 标题的地址与名字只算一次（06 号书第 2 章「身份」「地址与 Label 空间」），label catalog 与标题节点的 IRI 都由它来。
// 这里只认标题与它的地址，不认 IRI：名字定下以后，IRI 才由名字生成。

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
	nameOf(key: K): string | undefined;
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

	const owners = (selector: string): readonly K[] =>
		ownersByValue.get(selector) ?? [];
	const names = nameHeadings(headings, path, owners);

	return {
		addresses,
		nameOf: (key) => names.get(key),
		owners,
	};
}

function nameHeadings<K>(
	headings: readonly AddressedHeading<K>[],
	path: (heading: AddressedHeading<K>) => readonly string[],
	owners: (selector: string) => readonly K[],
): Map<K, string> {
	const names = new Map<K, string>();
	const ownedOnlyBy = (selector: string, group: readonly K[]): boolean => {
		const found = owners(selector);
		return (
			found.length === group.length && group.every((key) => found.includes(key))
		);
	};

	// 第三种情形的标题按完整路径分组：同一父标题下同名的一组，在文档顺序里各有位次。
	const groups = new Map<string, K[]>();
	for (const heading of headings) {
		if (heading.headline === "") {
			continue;
		}
		const full = path(heading).join(separator);
		groups.set(full, [...(groups.get(full) ?? []), heading.key]);
	}
	const used = new Set<string>();
	const taken = (candidate: string): boolean =>
		owners(candidate).length > 0 || used.has(candidate);
	const assign = (key: K, name: string): void => {
		names.set(key, name);
		used.add(name);
	};

	for (const heading of headings) {
		const segments = heading.headline === "" ? [] : path(heading);
		const unique = shortestSuffix(segments, (selector) =>
			ownedOnlyBy(selector, [heading.key]),
		);
		if (unique !== undefined) {
			assign(heading.key, unique);
			continue;
		}
		// custom ID 是别名，排在地址路径之后：作者给标题补一个 ID，不改变已有的名字。
		const ownId =
			heading.idKind === "addressLabel"
				? heading.ids.find((id) => ownedOnlyBy(id, [heading.key]))
				: undefined;
		if (ownId !== undefined) {
			assign(heading.key, ownId);
			continue;
		}
		if (segments.length === 0) {
			continue;
		}
		const group = groups.get(segments.join(separator)) ?? [heading.key];
		const rank = group.indexOf(heading.key) + 1;
		const shared =
			shortestLength(segments, (selector) => ownedOnlyBy(selector, group)) ??
			segments.length;
		assign(heading.key, numberedName(segments, shared, rank, taken));
	}
	return names;
}

// 加了 -k 以后撞上别的地址时，路径往前补一级再加；补到完整路径仍撞上，就再加一次 -k。
function numberedName(
	segments: readonly string[],
	from: number,
	rank: number,
	taken: (candidate: string) => boolean,
): string {
	for (let length = from; length <= segments.length; length += 1) {
		const candidate = `${suffix(segments, length)}-${rank}`;
		if (!taken(candidate)) {
			return candidate;
		}
	}
	let candidate = `${segments.join(separator)}-${rank}`;
	while (taken(candidate)) {
		candidate += `-${rank}`;
	}
	return candidate;
}

function shortestSuffix(
	segments: readonly string[],
	accept: (selector: string) => boolean,
): string | undefined {
	const length = shortestLength(segments, accept);
	return length === undefined ? undefined : suffix(segments, length);
}

function shortestLength(
	segments: readonly string[],
	accept: (selector: string) => boolean,
): number | undefined {
	for (let length = 1; length <= segments.length; length += 1) {
		if (accept(suffix(segments, length))) {
			return length;
		}
	}
	return undefined;
}

function suffix(segments: readonly string[], length: number): string {
	return segments.slice(segments.length - length).join(separator);
}
