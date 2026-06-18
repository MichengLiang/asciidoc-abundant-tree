import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

describe("heading description metadata", () => {
	it("attaches a flat leading description list as section descriptionMetadata", () => {
		const path = writeFixture(
			"heading-description-metadata-flat.adoc",
			`= Probe

== 你好

host::
127.0.0.1
苹果
banana:: 5个

正文
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "你好");

		expect(section.descriptionMetadata?.fields).toEqual({
			host: "127.0.0.1\n苹果",
			banana: "5个",
		});
	});

	it("removes the absorbed leading description list from section children", () => {
		const path = writeFixture(
			"heading-description-metadata-removes-absorbed-run.adoc",
			`= Probe

== 你好

host::
127.0.0.1
苹果
banana:: 5个

正文
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "你好");

		expect(section.children?.map((node) => node.kind)).toEqual(["paragraph"]);
	});

	it("preserves real multiline description text", () => {
		const path = writeFixture(
			"heading-description-metadata-multiline.adoc",
			`= Probe

== Apple

description::
Line one.
Line two.
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Apple");

		expect(section.descriptionMetadata?.fields.description).toBe(
			"Line one.\nLine two.",
		);
	});

	it("keeps literal backslash-n text literal", () => {
		const path = writeFixture(
			"heading-description-metadata-literal-backslash-n.adoc",
			`= Probe

== Literal

description:: 第一行\\n第二行
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Literal");

		expect(section.descriptionMetadata?.fields.description).toBe(
			"第一行\\n第二行",
		);
	});

	it("ignores blank lines between heading and leading description list", () => {
		const path = writeFixture(
			"heading-description-metadata-blank-lines.adoc",
			`= Probe

== Blank



key:: value
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Blank");

		expect(section.descriptionMetadata?.fields).toEqual({ key: "value" });
	});

	it("does not attach a later description list after a leading paragraph", () => {
		const path = writeFixture(
			"heading-description-metadata-later-list.adoc",
			`= Probe

== Later

正文

key:: value
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Later");

		expect(section.descriptionMetadata).toBeUndefined();
		expect(section.children?.map((node) => node.kind)).toEqual([
			"paragraph",
			"descriptionList",
		]);
	});

	it("absorbs the complete leading consecutive description list run", () => {
		const path = writeFixture(
			"heading-description-metadata-consecutive-run.adoc",
			`= Probe

== Run

first:: 1

second:: 2

正文
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Run");

		expect(section.descriptionMetadata?.fields).toEqual({
			first: "1",
			second: "2",
		});
		expect(section.children?.map((node) => node.kind)).toEqual(["paragraph"]);
	});

	it("does not absorb description lists after the leading run is interrupted", () => {
		const path = writeFixture(
			"heading-description-metadata-interrupted-run.adoc",
			`= Probe

== Interrupted

first:: 1

正文

second:: 2
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Interrupted");

		expect(section.descriptionMetadata?.fields).toEqual({ first: "1" });
		expect(section.children?.map((node) => node.kind)).toEqual([
			"paragraph",
			"descriptionList",
		]);
	});

	it("rejects the complete run when any descendant description list exists", () => {
		const path = writeFixture(
			"heading-description-metadata-nested-failure.adoc",
			`= Probe

== 你也好呀

fruits:: 2个
pear::: 3个

正文
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "你也好呀");

		expect(section.descriptionMetadata).toBeUndefined();
		expect(section.children?.[0]?.kind).toBe("descriptionList");
	});

	it("does not absorb decorated leading description lists with block metadata", () => {
		const path = writeFixture(
			"heading-description-metadata-decorated-list.adoc",
			`= Probe

== Decorated

[#terms]
.Terms
[horizontal,labelwidth=25,itemwidth=75]
Term:: Description.
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Decorated");

		expect(section.descriptionMetadata).toBeUndefined();
		expect(section.children?.[0]).toEqual(
			expect.objectContaining({
				kind: "descriptionList",
				ids: ["terms"],
				title: "Terms",
				style: "horizontal",
			}),
		);
	});

	it("does not absorb leading description lists with structural attached children", () => {
		const path = writeFixture(
			"heading-description-metadata-attached-listing.adoc",
			`= Probe

== Attached

Term::
+
----
attached block
----
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Attached");

		expect(section.descriptionMetadata).toBeUndefined();
		expect(section.children?.[0]).toEqual(
			expect.objectContaining({
				kind: "descriptionList",
				items: [
					expect.objectContaining({
						description: expect.objectContaining({
							children: [
								expect.objectContaining({
									kind: "listing",
									content: "attached block",
								}),
							],
						}),
					}),
				],
			}),
		);
	});

	it("attaches child section metadata only to the child section", () => {
		const path = writeFixture(
			"heading-description-metadata-child-section.adoc",
			`= Probe

== Parent

=== Child

key:: value
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const parent = onlySection(document, "Parent");
		const child = onlyChildSection(parent, "Child");

		expect(parent.descriptionMetadata).toBeUndefined();
		expect(child.descriptionMetadata?.fields).toEqual({ key: "value" });
	});

	it("creates one entry per term for shared descriptions", () => {
		const path = writeFixture(
			"heading-description-metadata-multi-term.adoc",
			`= Probe

== Storage

Hard drive::
Hard disk::
Persistent storage.
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Storage");

		expect(
			section.descriptionMetadata?.entries.map((entry) => entry.key),
		).toEqual(["Hard drive", "Hard disk"]);
		expect(section.descriptionMetadata?.fields).toEqual({
			"Hard drive": "Persistent storage.",
			"Hard disk": "Persistent storage.",
		});
	});

	it("keeps ordered entries and uses last value in fields for duplicate keys", () => {
		const path = writeFixture(
			"heading-description-metadata-duplicate-keys.adoc",
			`= Probe

== Duplicate

owner:: ops
status:: draft
owner:: platform
`,
		);

		const document = parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Duplicate");

		expect(section.descriptionMetadata?.fields.owner).toBe("platform");
		expect(
			section.descriptionMetadata?.entries.map((entry) => [
				entry.key,
				entry.value,
			]),
		).toEqual([
			["owner", "ops"],
			["status", "draft"],
			["owner", "platform"],
		]);
	});
});

function onlySection(
	document: ReturnType<typeof parseAbundantTree>,
	title: string,
) {
	const section = document.children.find(
		(node) => node.kind === "section" && node.title === title,
	);
	expect(section).toBeDefined();
	if (section?.kind !== "section") {
		throw new Error(`missing section ${title}`);
	}
	return section;
}

function onlyChildSection(
	section: ReturnType<typeof onlySection>,
	title: string,
) {
	const child = section.children?.find(
		(node) => node.kind === "section" && node.title === title,
	);
	expect(child).toBeDefined();
	if (child?.kind !== "section") {
		throw new Error(`missing section ${title}`);
	}
	return child;
}
