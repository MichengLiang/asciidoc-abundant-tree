import { describe, expect, it } from "vitest";
import { parseAbundantTree } from "../src/parser";
import { writeFixture } from "./helpers";

describe("description list parsing", () => {
	it("projects basic description list items without unknown official block diagnostics", async () => {
		const path = writeFixture(
			"description-list-basic.adoc",
			`= Probe

CPU:: The brain.
RAM:: Memory.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const list = document.children.find(
			(node) => node.kind === "descriptionList",
		) as DescriptionListView | undefined;

		expect(document.toolDiagnostics.map((item) => item.code)).not.toContain(
			"official-block-context.unknown",
		);
		expect(document.toolDiagnostics.map((item) => item.code)).not.toContain(
			"source-location.missing",
		);
		expect(list).toEqual(
			expect.objectContaining({
				kind: "descriptionList",
				delimiter: "::",
				span: { startLine: 3, endLine: 4 },
				items: [
					expect.objectContaining({
						terms: [expect.objectContaining({ text: "CPU", line: 3 })],
						description: expect.objectContaining({
							text: "The brain.",
							line: 3,
						}),
					}),
					expect.objectContaining({
						terms: [expect.objectContaining({ text: "RAM", line: 4 })],
						description: expect.objectContaining({
							text: "Memory.",
							line: 4,
						}),
					}),
				],
			}),
		);
	});

	it("keeps multiple terms attached to one description according to the official dlist model", async () => {
		const path = writeFixture(
			"description-list-multi-term.adoc",
			`= Probe

Hard drive::
Hard disk::
Persistent storage.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const list = onlyDescriptionList(document.children);

		expect(list.items).toHaveLength(1);
		expect(list.items[0]?.terms.map((term) => term.text)).toEqual([
			"Hard drive",
			"Hard disk",
		]);
		expect(list.items[0]?.description?.text).toBe("Persistent storage.");
	});

	it("projects multiline descriptions on their own source line", async () => {
		const path = writeFixture(
			"description-list-multiline-description.adoc",
			`= Probe

CPU::
The brain.

RAM::
Memory.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const list = onlyDescriptionList(document.children);

		expect(list.items.map((item) => item.description?.text)).toEqual([
			"The brain.",
			"Memory.",
		]);
		expect(list.items[0]?.terms[0]?.sourceSpan).toEqual({
			start: { line: 3, column: 1 },
			end: { line: 3, column: 4 },
		});
		expect(list.items[0]?.description?.sourceSpan).toEqual({
			start: { line: 4, column: 1 },
			end: { line: 4, column: 11 },
		});
	});

	it("keeps consecutive terms without descriptions attached to the next described item", async () => {
		const path = writeFixture(
			"description-list-empty-description-boundary.adoc",
			`= Probe

Term::
Next:: Value
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const list = onlyDescriptionList(document.children);

		expect(list.items).toHaveLength(1);
		expect(list.items[0]?.terms.map((term) => term.text)).toEqual([
			"Term",
			"Next",
		]);
		expect(list.items[0]?.description?.text).toBe("Value");
		expect(list.items[0]?.description?.sourceSpan).toEqual({
			start: { line: 4, column: 8 },
			end: { line: 4, column: 13 },
		});
	});

	it("projects nested description lists created by delimiter changes", async () => {
		const path = writeFixture(
			"description-list-nested.adoc",
			`= Probe

Outer::
Description line.
Inner::: Value
Other::: More

Second:: Done
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const outer = onlyDescriptionList(document.children);
		const nested = outer.items[0]?.description?.children?.find(
			(node) => node.kind === "descriptionList",
		) as DescriptionListView | undefined;

		expect(outer.items.map((item) => item.terms[0]?.text)).toEqual([
			"Outer",
			"Second",
		]);
		expect(nested?.items.map((item) => item.terms[0]?.text)).toEqual([
			"Inner",
			"Other",
		]);
		expect(nested?.items.map((item) => item.description?.text)).toEqual([
			"Value",
			"More",
		]);
		expect(outer.items[0]?.description?.text).toBe("Description line.");
		expect(outer.items[0]?.description?.source?.span).toEqual({
			startLine: 4,
			endLine: 4,
		});
		expect(outer.items[0]?.description?.source?.sourceSpan).toEqual({
			start: { line: 4, column: 1 },
			end: { line: 4, column: 18 },
		});
	});

	it("projects semicolon-delimited nested description lists", async () => {
		const path = writeFixture(
			"description-list-semicolon-nested.adoc",
			`= Probe

Outer::
Sub;; Value

Second:: Done
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const outer = onlyDescriptionList(document.children);
		const nested = outer.items[0]?.description?.children?.find(
			(node) => node.kind === "descriptionList",
		) as DescriptionListView | undefined;

		expect(outer.items.map((item) => item.terms[0]?.text)).toEqual([
			"Outer",
			"Second",
		]);
		expect(nested?.items[0]?.terms[0]?.text).toBe("Sub");
		expect(nested?.items[0]?.description?.text).toBe("Value");
		expect(nested?.delimiter).toBe(";;");
	});

	it("preserves description list metadata, style, and inline occurrences", async () => {
		const path = writeFixture(
			"description-list-metadata-inline.adoc",
			`= Probe

[#target]
== Target

[#terms]
.Terms
[horizontal,labelwidth=25,itemwidth=75]
Term with <<target>>:: Description with anchor:desc-anchor[].
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = document.children.find((node) => node.kind === "section") as
			| { children?: unknown[] }
			| undefined;
		const list = onlyDescriptionList(section?.children ?? []);

		expect(list).toEqual(
			expect.objectContaining({
				ids: ["terms"],
				title: "Terms",
				style: "horizontal",
				metadataSpan: { startLine: 6, endLine: 8 },
				span: { startLine: 6, endLine: 9 },
			}),
		);
		expect(document.xrefOccurrences.map((xref) => xref.raw)).toContain(
			"<<target>>",
		);
		expect(document.anchorOccurrences.map((anchor) => anchor.raw)).toContain(
			"anchor:desc-anchor[]",
		);
		expect(
			list.items[0]?.terms[0]?.children?.map((child) => child.kind),
		).toEqual(["xref"]);
		expect(
			list.items[0]?.description?.children?.map((child) => child.kind),
		).toEqual(["anchor"]);
		expect(list.items[0]?.terms[0]?.sourceSpan).toEqual({
			start: { line: 9, column: 1 },
			end: { line: 9, column: 21 },
		});
		expect(list.items[0]?.description?.sourceSpan).toEqual({
			start: { line: 9, column: 24 },
			end: { line: 9, column: 62 },
		});
		expect(list.items[0]?.children).toBeUndefined();
	});

	it("keeps qanda lists as description lists with qanda style", async () => {
		const path = writeFixture(
			"description-list-qanda.adoc",
			`= Probe

[qanda]
What is CPU?:: The brain.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const list = onlyDescriptionList(document.children);

		expect(list.kind).toBe("descriptionList");
		expect(list.style).toBe("qanda");
		expect(list.items[0]?.terms[0]?.text).toBe("What is CPU?");
		expect(list.items[0]?.description?.text).toBe("The brain.");
	});

	it("keeps attached description paragraphs as children while preserving direct description text", async () => {
		const path = writeFixture(
			"description-list-attached-paragraph.adoc",
			`= Probe

Term:: first paragraph.
+
second attached paragraph.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const list = onlyDescriptionList(document.children);
		const description = list.items[0]?.description;

		expect(description?.text).toBe("first paragraph.");
		expect(description?.children).toEqual([
			expect.objectContaining({
				kind: "paragraph",
				text: "second attached paragraph.",
			}),
		]);
		expect(list.items[0]?.span).toEqual({ startLine: 3, endLine: 5 });
	});

	it("does not scan xrefs inside listings attached to descriptions", async () => {
		const path = writeFixture(
			"description-list-attached-listing.adoc",
			`= Probe

[#target]
== Target

Intro paragraph.

Term::
+
----
<<not-scanned>>
----

See <<target>>.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = document.children.find((node) => node.kind === "section") as
			| { children?: unknown[] }
			| undefined;
		const list = onlyDescriptionList(section?.children ?? []);

		expect(document.xrefOccurrences.map((xref) => xref.raw)).toEqual([
			"<<target>>",
		]);
		expect(list.items[0]?.description?.children).toEqual([
			expect.objectContaining({
				kind: "listing",
				content: "<<not-scanned>>",
			}),
		]);
	});

	it("scans hmeta in description terms once and attaches it to the term", async () => {
		const path = writeFixture(
			"description-list-hmeta-term.adoc",
			`= Probe

[#rule]
== Rule

Intro paragraph.

Status hmeta:status[active, label=生效]:: Description.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = document.children.find((node) => node.kind === "section") as
			| { children?: unknown[] }
			| undefined;
		const list = onlyDescriptionList(section?.children ?? []);

		expect(document.headingInlineMetadataOccurrences).toHaveLength(1);
		expect(list.items[0]?.terms[0]?.children).toEqual([
			expect.objectContaining({
				kind: "headingInlineMetadata",
				field: "status",
				value: "active",
			}),
		]);
		expect(list.items[0]?.description?.children ?? []).toEqual([]);
	});

	it("scans hmeta in description text once and attaches it to the description", async () => {
		const path = writeFixture(
			"description-list-hmeta-description.adoc",
			`= Probe

[#rule]
== Rule

Intro paragraph.

Status:: hmeta:status[active, label=生效] description.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = document.children.find((node) => node.kind === "section") as
			| { children?: unknown[] }
			| undefined;
		const list = onlyDescriptionList(section?.children ?? []);

		expect(document.headingInlineMetadataOccurrences).toHaveLength(1);
		expect(list.items[0]?.terms[0]?.children ?? []).toEqual([]);
		expect(list.items[0]?.description?.children).toEqual([
			expect.objectContaining({
				kind: "headingInlineMetadata",
				field: "status",
				value: "active",
			}),
		]);
	});

	it("does not scan hmeta inside listings attached to descriptions", async () => {
		const path = writeFixture(
			"description-list-attached-listing-hmeta.adoc",
			`= Probe

[#rule]
== Rule

Intro paragraph.

Term::
+
----
hmeta:status[not-scanned]
----

Visible hmeta:status[active].
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = document.children.find((node) => node.kind === "section") as
			| { children?: unknown[] }
			| undefined;
		const list = onlyDescriptionList(section?.children ?? []);

		expect(
			document.headingInlineMetadataOccurrences.map((item) => item.value),
		).toEqual(["active"]);
		expect(list.items[0]?.description?.children).toEqual([
			expect.objectContaining({
				kind: "listing",
				content: "hmeta:status[not-scanned]",
			}),
		]);
	});

	it("keeps leading description metadata absorbable with hmeta children", async () => {
		const path = writeFixture(
			"description-metadata-hmeta-absorbable.adoc",
			`= Probe

[#rule]
== Rule

status hmeta:status[active]:: active

Body paragraph.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = document.children.find((node) => node.kind === "section") as
			| {
					descriptionMetadata?: {
						entries?: Array<{ key: string; value: string }>;
					};
					children?: Array<{ kind?: string }>;
			  }
			| undefined;

		expect(section?.descriptionMetadata?.entries).toEqual([
			expect.objectContaining({
				key: "status hmeta:status[active]",
				value: "active",
			}),
		]);
		expect(section?.children?.map((node) => node.kind)).toEqual(["paragraph"]);
		expect(document.headingInlineMetadataOccurrences).toEqual([
			expect.objectContaining({
				field: "status",
				value: "active",
				containingSectionId: "rule",
			}),
		]);
	});

	it("keeps raw description metadata term keys when hmeta has a label", async () => {
		const path = writeFixture(
			"description-metadata-hmeta-labeled-key.adoc",
			`= Probe

[#rule]
== Rule

status hmeta:status[active, label=生效]:: active

Body paragraph.
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });
		const section = document.children.find((node) => node.kind === "section") as
			| {
					descriptionMetadata?: {
						entries?: Array<{
							key: string;
							value: string;
							term?: { text?: string };
						}>;
					};
			  }
			| undefined;
		const entry = section?.descriptionMetadata?.entries?.[0];

		expect(entry).toEqual(
			expect.objectContaining({
				key: "status hmeta:status[active, label=生效]",
				value: "active",
			}),
		);
		// The term text is reader-facing conversion output; metadata keys stay tied
		// to the raw source term so label display cannot rewrite structural facts.
		expect(entry?.term?.text).toBe("status 生效");
		expect(document.headingInlineMetadataOccurrences).toEqual([
			expect.objectContaining({
				field: "status",
				value: "active",
				label: "生效",
				containingSectionId: "rule",
			}),
		]);
	});
});

describe("document header boundary around description lists", () => {
	it("treats the line after a document title as an author until a blank line ends the header", async () => {
		const path = writeFixture(
			"description-list-header-author.adoc",
			`= Probe
下面是系统的配置参数：

Host:: 127.0.0.1
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });

		expect(document.children.map((node) => node.kind)).toEqual([
			"descriptionList",
		]);
		expect(JSON.stringify(document.children)).not.toContain(
			"下面是系统的配置参数：",
		);
	});

	it("treats the line after a blank line following the title as body prose", async () => {
		const path = writeFixture(
			"description-list-header-body.adoc",
			`= Probe

下面是系统的配置参数：

Host:: 127.0.0.1
`,
		);

		const document = await parseAbundantTree({ sourcePath: path });

		expect(document.children.map((node) => node.kind)).toEqual([
			"paragraph",
			"descriptionList",
		]);
	});
});

type DescriptionListView = {
	kind: "descriptionList";
	ids?: string[];
	title?: string;
	style?: string;
	delimiter?: string;
	span?: { startLine: number; endLine: number };
	metadataSpan?: { startLine: number; endLine: number };
	items: DescriptionListItemView[];
};

type DescriptionListItemView = {
	children?: unknown[];
	span?: { startLine: number; endLine: number };
	terms: Array<{
		text: string;
		line?: number;
		sourceSpan?: {
			start: { line: number; column: number };
			end: { line: number; column: number };
		};
		children?: Array<{ kind?: string }>;
	}>;
	description?: {
		text?: string;
		line?: number;
		source?: {
			span?: { startLine: number; endLine: number };
			sourceSpan?: {
				start: { line: number; column: number };
				end: { line: number; column: number };
			};
		};
		sourceSpan?: {
			start: { line: number; column: number };
			end: { line: number; column: number };
		};
		children?: Array<{
			content?: string;
			kind?: string;
			text?: string;
		}>;
	};
};

function onlyDescriptionList(nodes: unknown[]): DescriptionListView {
	const lists = nodes.filter(
		(node): node is DescriptionListView =>
			isRecord(node) && node.kind === "descriptionList",
	);
	expect(lists).toHaveLength(1);
	const list = lists[0];
	if (!list) {
		throw new Error("expected one description list");
	}
	return list;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

// 09 号书 05 章 Description List：span 到最后一个后代块的结束行，只从后代自己往下读出（issue 015）。
describe("description list span", () => {
	it.each([
		["an attached multi-line paragraph", "术语:: 解释\n+\n附加\n第二行", 8],
		["an attached listing", "术语:: 解释\n+\n----\nx\ny\n----\n\n后文。", 10],
		["an attached example", "术语:: 解释\n+\n====\n例\n====", 9],
		[
			"a nested list with a continuation line",
			"术语:: 解释\n* 子条目\n续行\n\n后文。",
			7,
		],
		[
			"an attached cloaked paragraph",
			"术语:: 解释\n+\n[source]\nx = 1\ny = 2",
			9,
		],
		["an attached admonition paragraph", "术语:: 解释\n+\nNOTE: 注\n第二行", 8],
		["a wrapped last description", "甲:: 一\n乙:: 二\n续行", 7],
	])("ends at the last line of %s", async (name, body, endLine) => {
		expect(await descriptionListSpan(name, body)).toEqual({
			startLine: 5,
			endLine,
		});
	});

	// 引语的第一行不能就是描述列表：`> 术语:: 解释` 先匹配描述列表，官方会把 `> 术语` 读成术语，引语根本不成立。
	// 引语里的结构按去掉 `> ` 之后的行判断；D 的 `> ----` 按源文的原行看不是分隔符，那样会一路读到后文。
	it.each([
		["an attached paragraph", "> 术语:: 解释\n> +\n> 附加\n> 第二行", 10],
		["an attached quote", "> 术语:: 解释\n> +\n> > 引一\n> > 引二", 10],
		[
			"a listing whose content looks like a delimiter",
			"> 术语:: 解释\n> +\n> ----\n> > ----\n> ----",
			11,
		],
		[
			"a listing followed by quoted text",
			"> 术语:: 解释\n> +\n> ----\n> x\n> ----\n>\n> 后文。",
			11,
		],
	])("inside a markdown quote ends at the last line of %s", async (name, body, endLine) => {
		expect(
			await descriptionListSpan(`quoted-${name}`, `> 引语开头。\n>\n${body}`),
		).toEqual({ startLine: 7, endLine });
	});
});

async function descriptionListSpan(name: string, body: string) {
	const document = await parseAbundantTree({
		sourcePath: writeFixture(
			`description-list-span-${name.replaceAll(" ", "-")}.adoc`,
			`= Probe\n\n正文。\n\n${body}\n`,
		),
	});
	const nodes: unknown[] = [];
	const visit = (node: unknown) => {
		nodes.push(node);
		if (isRecord(node) && Array.isArray(node.children)) {
			node.children.forEach(visit);
		}
	};
	document.children.forEach(visit);
	expect(document.toolDiagnostics).toEqual([]);
	return onlyDescriptionList(nodes).span;
}
