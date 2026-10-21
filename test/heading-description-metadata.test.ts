import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

describe("heading description metadata", () => {
	it("attaches a flat leading description list as section descriptionMetadata", async () => {
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

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "你好");

		expect(section.descriptionMetadata?.fields).toEqual({
			host: "127.0.0.1\n苹果",
			banana: "5个",
		});
	});

	it("removes the absorbed leading description list from section children", async () => {
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

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "你好");

		expect(section.children?.map((node) => node.kind)).toEqual(["paragraph"]);
	});

	it("preserves real multiline description text", async () => {
		const path = writeFixture(
			"heading-description-metadata-multiline.adoc",
			`= Probe

== Apple

description::
Line one.
Line two.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Apple");

		expect(section.descriptionMetadata?.fields.description).toBe(
			"Line one.\nLine two.",
		);
	});

	it("keeps literal backslash-n text literal", async () => {
		const path = writeFixture(
			"heading-description-metadata-literal-backslash-n.adoc",
			`= Probe

== Literal

description:: 第一行\\n第二行
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Literal");

		expect(section.descriptionMetadata?.fields.description).toBe(
			"第一行\\n第二行",
		);
	});

	it("ignores blank lines between heading and leading description list", async () => {
		const path = writeFixture(
			"heading-description-metadata-blank-lines.adoc",
			`= Probe

== Blank



key:: value
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Blank");

		expect(section.descriptionMetadata?.fields).toEqual({ key: "value" });
	});

	it("does not attach a later description list after a leading paragraph", async () => {
		const path = writeFixture(
			"heading-description-metadata-later-list.adoc",
			`= Probe

== Later

正文

key:: value
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Later");

		expect(section.descriptionMetadata).toBeUndefined();
		expect(section.children?.map((node) => node.kind)).toEqual([
			"paragraph",
			"descriptionList",
		]);
	});

	it("absorbs the complete leading consecutive description list run", async () => {
		const path = writeFixture(
			"heading-description-metadata-consecutive-run.adoc",
			`= Probe

== Run

first:: 1

second:: 2

正文
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Run");

		expect(section.descriptionMetadata?.fields).toEqual({
			first: "1",
			second: "2",
		});
		expect(section.children?.map((node) => node.kind)).toEqual(["paragraph"]);
	});

	it("does not absorb description lists after the leading run is interrupted", async () => {
		const path = writeFixture(
			"heading-description-metadata-interrupted-run.adoc",
			`= Probe

== Interrupted

first:: 1

正文

second:: 2
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Interrupted");

		expect(section.descriptionMetadata?.fields).toEqual({ first: "1" });
		expect(section.children?.map((node) => node.kind)).toEqual([
			"paragraph",
			"descriptionList",
		]);
	});

	it("rejects the complete run when any descendant description list exists", async () => {
		const path = writeFixture(
			"heading-description-metadata-nested-failure.adoc",
			`= Probe

== 你也好呀

fruits:: 2个
pear::: 3个

正文
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "你也好呀");

		expect(section.descriptionMetadata).toBeUndefined();
		expect(section.children?.[0]?.kind).toBe("descriptionList");
	});

	it("does not absorb decorated leading description lists with block metadata", async () => {
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

		const document = await parseAbundantTree({ sourcePath: path });
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

	it("keeps inline markup and xref macros in field values as authored", async () => {
		const path = writeFixture(
			"heading-description-metadata-inline-markup.adoc",
			`= Probe

== Markup

出处:: \`src/layout.ts:2110-2115\`。
推导自:: xref:Markup[原则, rel=derives-from]。
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Markup");

		expect(section.descriptionMetadata?.fields).toEqual({
			出处: "`src/layout.ts:2110-2115`。",
			推导自: "xref:Markup[原则, rel=derives-from]。",
		});
	});

	it("absorbs attached blocks into the field value as authored source", async () => {
		const path = writeFixture(
			"heading-description-metadata-attached-listing.adoc",
			`= Probe

== Attached

情况:: 某种情况。
出处:: \`x.ts:1-2\`。
另一行。
+
[source,ts]
----
const a = 1
----
+
第二段。
落点:: core。

正文
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Attached");

		expect(section.descriptionMetadata?.fields).toEqual({
			情况: "某种情况。",
			出处: "`x.ts:1-2`。\n另一行。\n\n[source,ts]\n----\nconst a = 1\n----\n\n第二段。",
			落点: "core。",
		});
		expect(section.children?.map((node) => node.kind)).toEqual(["paragraph"]);
	});

	it("starts a value at an attached block when the term has no text", async () => {
		const path = writeFixture(
			"heading-description-metadata-attached-only.adoc",
			`= Probe

== Attached Only

Term::
+
----
attached block
----
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Attached Only");

		expect(section.descriptionMetadata?.fields).toEqual({
			Term: "----\nattached block\n----",
		});
	});

	it("keeps a plus line that belongs to an attached listing", async () => {
		const path = writeFixture(
			"heading-description-metadata-plus-in-listing.adoc",
			`= Probe

== Plus

diff::
+
----
a
+
b
----
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Plus");

		expect(section.descriptionMetadata?.fields.diff).toBe(
			"----\na\n+\nb\n----",
		);
	});

	it("ends the last field before a block that is not attached with a continuation", async () => {
		const path = writeFixture(
			"heading-description-metadata-unattached-listing.adoc",
			`= Probe

== Unattached

出处:: \`x.ts:1-2\`。

[source,ts]
----
const a = 1
----
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Unattached");

		expect(section.descriptionMetadata?.fields).toEqual({
			出处: "`x.ts:1-2`。",
		});
		expect(section.children?.map((node) => node.kind)).toEqual(["listing"]);
	});

	it("keeps a list that follows the term after a blank line in the field value", async () => {
		const path = writeFixture(
			"heading-description-metadata-list-after-blank.adoc",
			`= Probe

== 宿舍集中备考者

别名::

* 宿舍高强度备考者（旧称）
* 宿舍备考学生（常用称呼）

正文
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "宿舍集中备考者");

		expect(section.descriptionMetadata?.fields).toEqual({
			别名: "* 宿舍高强度备考者（旧称）\n* 宿舍备考学生（常用称呼）",
		});
	});

	it("reads book-entry field values from the origin file, keeping include directives", async () => {
		const root = join(
			process.cwd(),
			"tmp/test-fixtures/heading-description-metadata-book",
		);
		const write = (relativePath: string, source: string) => {
			const path = join(root, relativePath);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, source, "utf8");
			return path;
		};
		write("assets/code.ts", "const a = 1\nconst b = 2\n");
		write(
			"chapters/rule.adoc",
			`== 规则

出处:: \`code.ts:1-2\`。
+
[source,ts]
----
include::../assets/code.ts[lines=1..2]
----
判定:: 照搬。
`,
		);
		const entry = write(
			"book.adoc",
			"= Book\n:doctype: book\n\ninclude::chapters/rule.adoc[]\n",
		);

		const document = await parseAbundantTree({
			sourcePath: entry,
			mode: "book-entry",
			documentRoot: root,
		});
		const section = onlySection(document, "规则");

		expect(section.descriptionMetadata?.fields).toEqual({
			出处: "`code.ts:1-2`。\n\n[source,ts]\n----\ninclude::../assets/code.ts[lines=1..2]\n----",
			判定: "照搬。",
		});
	});

	it("reads a book-entry field whose description is only a list", async () => {
		const root = join(
			process.cwd(),
			"tmp/test-fixtures/heading-description-metadata-book-list",
		);
		const write = (relativePath: string, source: string) => {
			const path = join(root, relativePath);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, source, "utf8");
			return path;
		};
		write(
			"chapters/slot.adoc",
			`== 槽位

还要取得::
* 布局状态模型；
* 命令的注册。
怎样算完成:: 测试通过。
`,
		);
		const entry = write(
			"book.adoc",
			"= Book\n:doctype: book\n\ninclude::chapters/slot.adoc[]\n",
		);

		const document = await parseAbundantTree({
			sourcePath: entry,
			mode: "book-entry",
			documentRoot: root,
		});
		const section = onlySection(document, "槽位");

		expect(section.descriptionMetadata?.fields).toEqual({
			还要取得: "* 布局状态模型；\n* 命令的注册。",
			怎样算完成: "测试通过。",
		});
	});

	it("attaches child section metadata only to the child section", async () => {
		const path = writeFixture(
			"heading-description-metadata-child-section.adoc",
			`= Probe

== Parent

=== Child

key:: value
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const parent = onlySection(document, "Parent");
		const child = onlyChildSection(parent, "Child");

		expect(parent.descriptionMetadata).toBeUndefined();
		expect(child.descriptionMetadata?.fields).toEqual({ key: "value" });
	});

	it("creates one entry per term for shared descriptions", async () => {
		const path = writeFixture(
			"heading-description-metadata-multi-term.adoc",
			`= Probe

== Storage

Hard drive::
Hard disk::
Persistent storage.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = onlySection(document, "Storage");

		expect(
			section.descriptionMetadata?.entries.map((entry) => entry.key),
		).toEqual(["Hard drive", "Hard disk"]);
		expect(section.descriptionMetadata?.fields).toEqual({
			"Hard drive": "Persistent storage.",
			"Hard disk": "Persistent storage.",
		});
	});

	it("keeps ordered entries and uses last value in fields for duplicate keys", async () => {
		const path = writeFixture(
			"heading-description-metadata-duplicate-keys.adoc",
			`= Probe

== Duplicate

owner:: ops
status:: draft
owner:: platform
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
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
	document: Awaited<ReturnType<typeof parseAbundantTree>>,
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
	section: Awaited<ReturnType<typeof onlySection>>,
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
