import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAsciidoctorFileAdapter } from "../../src/asciidoctor-file-adapter";
import { preprocessBookEntryWithOfficialReader } from "../../src/book-entry/official-reader-preprocessor";
import { parseAbundantTree } from "../../src/index";
import type {
	IncludeResolver,
	IncludeResolverRequest,
	SectionNode,
} from "../../src/model";

// 宿主登记的 include 解析器（10 号书「宿主登记的 include 解析器」）。解析器在这里按符号找到声明所在的整行，
// 与 docloom 按 TypeScript AST 选声明、再扩到整行的做法相同。

const root = join(process.cwd(), "tmp/include-resolvers");

function write(relativePath: string, content: string): string {
	const path = join(root, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
	return path;
}

function symbolResolver(calls: IncludeResolverRequest[] = []): IncludeResolver {
	return {
		prefix: "docloom:",
		resolve: async (request) => {
			calls.push(request);
			const lines = readFileSync(join(root, request.target), "utf8").split(
				"\n",
			);
			const start =
				lines.findIndex((line) =>
					line.includes(`function ${request.attributes.symbol}(`),
				) + 1;
			const end = lines.indexOf("}", start - 1) + 1;
			return {
				text: `${lines.slice(start - 1, end).join("\n")}\n`,
				origin: { path: request.target, startLine: start },
			};
		},
	};
}

async function preprocess(entry: string, resolvers: IncludeResolver[]) {
	return preprocessBookEntryWithOfficialReader({
		adapter: createAsciidoctorFileAdapter(),
		sourcePath: entry,
		documentRoot: root,
		includeResolvers: resolvers,
	});
}

function origins(lines: readonly { text: string; origin?: unknown }[]) {
	return lines.map((line) => {
		const origin = line.origin as
			| { relativePath: string; sourceLine: number }
			| undefined;
		return [line.text, origin && `${origin.relativePath}:${origin.sourceLine}`];
	});
}

rmSync(root, { recursive: true, force: true });
write(
	"code/replay.ts",
	[
		'import { x } from "./x";',
		"",
		"export function replay() {",
		"  return x;",
		"}",
		"",
		"export const other = 1;",
		"",
	].join("\n"),
);

describe("host include resolvers", () => {
	it("registers each resolved line at its line in the source file", async () => {
		const entry = write(
			"symbol/book.adoc",
			"= 书\n\n[source,ts]\n----\ninclude::docloom:code/replay.ts[symbol=replay,part=source]\n----\n\n后文。\n",
		);
		const calls: IncludeResolverRequest[] = [];

		const document = await preprocess(entry, [symbolResolver(calls)]);

		expect(document.diagnostics).toEqual([]);
		expect(origins(document.lines)).toEqual([
			["= 书", "symbol/book.adoc:1"],
			["", "symbol/book.adoc:2"],
			["[source,ts]", "symbol/book.adoc:3"],
			["----", "symbol/book.adoc:4"],
			["export function replay() {", "code/replay.ts:3"],
			["  return x;", "code/replay.ts:4"],
			["}", "code/replay.ts:5"],
			["----", "symbol/book.adoc:6"],
			["", "symbol/book.adoc:7"],
			["后文。", "symbol/book.adoc:8"],
		]);
		expect(calls).toEqual([
			{
				target: "code/replay.ts",
				attributes: { symbol: "replay", part: "source" },
				sourcePath: entry,
			},
		]);
	});

	it("projects the same tree as a file include of the same lines", async () => {
		write("chapter/inner.adoc", "内文。\n");
		write("chapter/part.adoc", "== 部分\n\ninclude::inner.adoc[]\n");
		const viaResolver = write(
			"chapter/book.adoc",
			"= 书\n\n== 章\n\ninclude::pick:chapter/part.adoc[leveloffset=+1]\n",
		);
		const viaFile = write(
			"chapter/book-file.adoc",
			"= 书\n\n== 章\n\ninclude::part.adoc[leveloffset=+1]\n",
		);
		const wholeFile: IncludeResolver = {
			prefix: "pick:",
			resolve: ({ target }) => ({
				text: readFileSync(join(root, target), "utf8"),
				origin: { path: target, startLine: 1 },
			}),
		};

		const resolved = await parseAbundantTree({
			sourcePath: viaResolver,
			mode: "book-entry",
			documentRoot: root,
			includeResolvers: [wholeFile],
		});
		const included = await parseAbundantTree({
			sourcePath: viaFile,
			mode: "book-entry",
			documentRoot: root,
		});
		const part = (resolved.children[0] as SectionNode).children?.find(
			(child) => child.kind === "section",
		) as SectionNode;

		// leveloffset 生效、AsciiDoc 来源里的 include 照常展开：与文件 include 的节点树、诊断逐项相同。
		expect(part.level).toBe(2);
		expect(part.source?.relativePath).toBe("chapter/part.adoc");
		expect(resolved.children).toEqual(
			JSON.parse(
				JSON.stringify(included.children)
					.replaceAll("chapter/book-file.adoc", "chapter/book.adoc")
					.replaceAll(
						"include::part.adoc[",
						"include::pick:chapter/part.adoc[",
					),
			),
		);
		expect(resolved.toolDiagnostics).toEqual(included.toolDiagnostics);
	});

	it("leaves the lines without coordinates when the returned text is not the source", async () => {
		const entry = write(
			"untrue/book.adoc",
			"= 书\n\n----\ninclude::docloom:code/replay.ts[symbol=replay]\n----\n\n后文。\n",
		);
		const untrue: IncludeResolver = {
			prefix: "docloom:",
			resolve: ({ target }) => ({
				text: "export function replay() {\n  return y;\n}",
				origin: { path: target, startLine: 3 },
			}),
		};

		const document = await preprocess(entry, [untrue]);

		expect(document.diagnostics).toEqual([
			expect.objectContaining({
				level: "warning",
				code: "origin-map.selection-mismatch",
				message: expect.stringContaining(
					"the resolver for docloom:code/replay.ts",
				),
			}),
		]);
		expect(origins(document.lines).slice(3, 8)).toEqual([
			["export function replay() {", "code/replay.ts:3"],
			["  return y;", undefined],
			["}", undefined],
			["----", "untrue/book.adoc:5"],
			["", "untrue/book.adoc:6"],
		]);
	});

	it("registers nothing when the resolver returns empty text", async () => {
		const entry = write(
			"empty/book.adoc",
			"= 书\n\ninclude::docloom:code/replay.ts[symbol=none]\n后文。\n",
		);
		const empty: IncludeResolver = {
			prefix: "docloom:",
			resolve: ({ target }) => ({
				text: "",
				origin: { path: target, startLine: 1 },
			}),
		};

		const document = await preprocess(entry, [empty]);

		expect(document.diagnostics).toEqual([]);
		expect(origins(document.lines)).toEqual([
			["= 书", "empty/book.adoc:1"],
			["", "empty/book.adoc:2"],
			["后文。", "empty/book.adoc:4"],
		]);
	});

	it("fails construction when the resolver throws", async () => {
		const entry = write(
			"throws/book.adoc",
			"= 书\n\ninclude::docloom:code/replay.ts[symbol=missing]\n",
		);
		const failing: IncludeResolver = {
			prefix: "docloom:",
			resolve: () => {
				throw new Error("no symbol 'missing'");
			},
		};

		await expect(preprocess(entry, [failing])).rejects.toMatchObject({
			code: "include.resolver-failed",
			message: expect.stringContaining("no symbol 'missing'"),
		});
	});

	it("rejects a source outside documentRoot", async () => {
		const entry = write(
			"outside/book.adoc",
			"= 书\n\ninclude::docloom:code/replay.ts[symbol=replay]\n",
		);
		const escaping: IncludeResolver = {
			prefix: "docloom:",
			resolve: () => ({
				text: "x",
				origin: { path: "../elsewhere.ts", startLine: 1 },
			}),
		};

		await expect(preprocess(entry, [escaping])).rejects.toMatchObject({
			code: "include.outside-document-root",
		});
	});

	it("still rejects the directive when no resolver claims it", async () => {
		const entry = write(
			"unclaimed/book.adoc",
			"= 书\n\ninclude::docloom:code/replay.ts[symbol=replay]\n",
		);

		await expect(
			parseAbundantTree({
				sourcePath: entry,
				mode: "book-entry",
				documentRoot: root,
			}),
		).rejects.toMatchObject({ code: "include.attrlist-unmapped" });
	});
});
