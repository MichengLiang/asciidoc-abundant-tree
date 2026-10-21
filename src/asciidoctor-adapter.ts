import {
	type AbstractBlock,
	type Cursor,
	type Document,
	Extensions,
	getVersion,
	Inline,
	type InlineMacroProcessorDslInterface,
	load,
	loadFile,
	type PreprocessorReader,
	type Registry,
} from "@asciidoctor/core";
import { type DefaultTreeAdapterMap, parseFragment } from "parse5";
import { interpretHeadingInlineMetadataAttributes } from "./heading-inline-metadata";

// aat 读一个 official 块时用到的那几样，是 aat 这一侧的窄接口：投影、扫描与测试替身都按它读块，不必满足
// 4.x 上百个成员的 AbstractBlock。返回类型照 4.x 的实情：getTitle、getStyle 缺值时是 null（getId 是 undefined）。
export type AsciidoctorBlock = {
	getAttributes?: () => Record<string, unknown>;
	getBlocks?: () => unknown[];
	getCatalog?: () => unknown;
	getContent?: () => Promise<string>;
	getContext?: () => string;
	getDocumentTitle?: () => string | null;
	getId?: () => string | undefined;
	getLevel?: () => number;
	getNodeName?: () => string;
	// 4.x 的表格把行放在 rows 属性上（Ruby 的 Table#rows），不再有 getRows()。
	rows?: unknown;
	getSource?: () => string;
	getSourceLocation?: () => {
		getDirectory?: () => string | undefined;
		getFile?: () => string | undefined;
		getLineNumber?: () => number;
		getPath?: () => string | undefined;
	};
	getSubstitutions?: () => string[];
	getRefs?: () => Record<string, unknown>;
	getStyle?: () => string | null;
	getText?: () => unknown;
	getTitle?: () => string | null;
};

// 交进 adapter 的块都出自它自己的 load/loadFile，还原成 4.x 的类型再调用它的方法。
function official<T extends AbstractBlock>(block: AsciidoctorBlock): T {
	return block as unknown as T;
}

type HtmlAnchorBinding = {
	href?: string | undefined;
	text: string;
	id?: string | undefined;
};

export type OfficialXrefBinding = {
	href?: string | undefined;
	resolvedId?: string | undefined;
	reftext?: string | undefined;
};

export type ReaderLineCursor = {
	readonly file?: string | undefined;
	readonly directory?: string | undefined;
	readonly path?: string | undefined;
	readonly lineNumber?: number | undefined;
};

export type OfficialReaderLine = {
	readonly text: string;
	readonly cursor: ReaderLineCursor;
	readonly push: ReaderPush;
};

// 这一行出自官方 Reader 的哪一次推入。include 每展开一次，Reader 就把当时的状态压进 includeStack，压进去的
// 帧对象每次都是新的，所以以栈顶帧的身份区分推入：紧挨着两次引入同一个文件也分得开，leveloffset 补的前后
// 两行也落在这次推入里。行号不能拿来分界：一次推入的行号从首条选中行逐行累加，选取有空隙时就对不上源行。
// depth 是 includeStack 的深度，根文档为 0、id 为 0。
export type ReaderPush = {
	readonly id: number;
	readonly depth: number;
};

export type AsciidoctorAdapter = {
	parserVersion: string;
	loadFile(sourcePath: string): Promise<AsciidoctorBlock>;
	extractAnchorBindings(html: string): HtmlAnchorBinding[];
	resolveXrefTarget(
		document: AsciidoctorBlock,
		target: string,
	): string | undefined;
	resolveXrefBinding(
		document: AsciidoctorBlock,
		parent: AsciidoctorBlock,
		xref: {
			target: string;
			label?: string | undefined;
		},
	): Promise<OfficialXrefBinding | undefined>;
};

export type AsciidoctorParserAdapter = AsciidoctorAdapter & {
	loadSource(sourceText: string): Promise<AsciidoctorBlock>;
	readPreprocessedLines(options: {
		readonly sourcePath: string;
		readonly baseDir: string;
		readonly attributes?: Record<string, unknown> | undefined;
	}): Promise<readonly OfficialReaderLine[]>;
};

export function createAsciidoctorAdapter(): AsciidoctorParserAdapter {
	const extensionRegistry = createExtensionRegistry();

	return {
		parserVersion: getVersion(),
		async loadFile(sourcePath) {
			const document = await loadFile(sourcePath, {
				safe: "secure",
				sourcemap: true,
				to_file: false,
				extension_registry: extensionRegistry,
			});
			return document as unknown as AsciidoctorBlock;
		},
		async loadSource(sourceText) {
			const document = await load(sourceText, {
				safe: "secure",
				sourcemap: true,
				to_file: false,
				extension_registry: extensionRegistry,
			});
			return document as unknown as AsciidoctorBlock;
		},
		async readPreprocessedLines(options) {
			const document = await loadFile(options.sourcePath, {
				// Book-entry preprocessing prevalidates every local include against its
				// documentRoot. The Reader still needs unsafe mode here because Asciidoctor
				// safe mode treats legal `..` includes inside that root as jail ancestors.
				safe: "unsafe",
				base_dir: options.baseDir,
				sourcemap: true,
				parse: false,
				to_file: false,
				attributes: options.attributes ?? {},
				extension_registry: extensionRegistry,
			});
			const reader: PreprocessorReader = document.getReader();
			const lines: OfficialReaderLine[] = [];
			const pushIds = new WeakMap<object, number>();
			let pushes = 0;
			while (true) {
				const before = readerCursorEvidence(reader.getCursor());
				const text = await reader.readLine();
				if (text === undefined || text === null) {
					break;
				}
				const after = readerCursorEvidence(reader.getCursor());
				// 读完这一行之后的栈就是这一行所在的推入：Reader 在读下一行时才弹出读尽的推入。
				const stack: readonly object[] = reader.includeStack;
				const frame = stack.at(-1);
				if (frame && !pushIds.has(frame)) {
					pushes += 1;
					pushIds.set(frame, pushes);
				}
				lines.push({
					text,
					cursor: cursorForReturnedReaderLine(before, after),
					push: {
						id: frame ? (pushIds.get(frame) ?? 0) : 0,
						depth: stack.length,
					},
				});
			}
			return lines;
		},
		extractAnchorBindings(html) {
			return extractAnchorBindings(parseFragment(html));
		},
		resolveXrefTarget(document, target) {
			if (target.includes(".adoc#")) {
				return target.replace(".adoc#", ".html#");
			}
			const refs = official<Document>(document).getRefs();
			if (Object.hasOwn(refs, target)) {
				return `#${target}`;
			}
			const resolved = official<Document>(document).resolveId(target);
			return resolved === null ? undefined : `#${resolved}`;
		},
		async resolveXrefBinding(document, parent, xref) {
			const href = this.resolveXrefTarget(document, xref.target);
			const target = href ?? unresolvedLocalHref(xref.target);
			const reftext = await resolveXrefReftext(document, xref, href);
			const inline = new Inline(official(parent), "anchor", reftext, {
				type: "xref",
				target,
			});
			const converted = extractAnchorBindings(
				parseFragment(await inline.convert()),
			);
			const anchor = converted.find((binding) => binding.href);
			if (!anchor?.href) {
				return undefined;
			}
			return {
				href: anchor.href,
				resolvedId: resolvedIdFromHref(anchor.href),
				reftext: anchor.text,
			};
		},
	};
}

function createExtensionRegistry(): Registry {
	const registry = Extensions.create();
	registry.inlineMacro(
		"hmeta",
		function (this: InlineMacroProcessorDslInterface) {
			this.positionalAttributes("value");
			this.process(
				(
					parent: AbstractBlock,
					target: string,
					attributes: Record<string, unknown>,
				) => {
					const interpreted = interpretHeadingInlineMetadataAttributes(
						target,
						attributes,
					);
					return this.createInline(
						parent,
						"quoted",
						interpreted.ok ? interpreted.displayText : target,
						{ type: "mark" },
					);
				},
			);
		},
	);
	return registry;
}

function readerCursorEvidence(cursor: Cursor): ReaderLineCursor {
	return definedReaderCursor({
		file: cursor.getFile(),
		directory: cursor.getDirectory(),
		path: cursor.getPath(),
		lineNumber: cursor.getLineNumber(),
	});
}

function definedReaderCursor(cursor: ReaderLineCursor): ReaderLineCursor {
	return {
		...(typeof cursor.file === "string" ? { file: cursor.file } : {}),
		...(typeof cursor.directory === "string"
			? { directory: cursor.directory }
			: {}),
		...(typeof cursor.path === "string" ? { path: cursor.path } : {}),
		...(typeof cursor.lineNumber === "number"
			? { lineNumber: cursor.lineNumber }
			: {}),
	};
}

function cursorForReturnedReaderLine(
	before: ReaderLineCursor,
	after: ReaderLineCursor,
): ReaderLineCursor {
	if (
		before.file === after.file &&
		before.lineNumber !== undefined &&
		after.lineNumber === before.lineNumber + 1
	) {
		return before;
	}
	// The first line emitted from an include is only discoverable after Reader
	// enters the target file; the post-read cursor then points one line ahead.
	if (after.lineNumber !== undefined && after.lineNumber > 1) {
		return definedReaderCursor({
			...after,
			lineNumber: after.lineNumber - 1,
		});
	}
	return before;
}

async function resolveXrefReftext(
	document: AsciidoctorBlock,
	xref: { target: string; label?: string | undefined },
	href: string | undefined,
): Promise<string> {
	if (xref.label) {
		return xref.label;
	}
	const resolvedId = href?.startsWith("#") ? href.slice(1) : undefined;
	const ref: AbstractBlock | Inline | undefined = resolvedId
		? official<Document>(document).getRefs()[resolvedId]
		: undefined;
	// AbstractBlock 的 xreftext 是异步的，Inline 的是同步的；await 两种都接得住。
	return (await ref?.xreftext()) ?? `[${xref.target}]`;
}

function unresolvedLocalHref(target: string): string {
	if (target.includes(".adoc#")) {
		return target.replace(".adoc#", ".html#");
	}
	return `#${target}`;
}

function resolvedIdFromHref(href: string): string | undefined {
	return href.startsWith("#") ? href.slice(1) : href.split("#").at(1);
}

function extractAnchorBindings(
	fragment: DefaultTreeAdapterMap["documentFragment"],
): HtmlAnchorBinding[] {
	const bindings: HtmlAnchorBinding[] = [];

	function walk(node: DefaultTreeAdapterMap["node"]): void {
		if (isElement(node) && node.tagName === "a") {
			const attrs = new Map(node.attrs.map((attr) => [attr.name, attr.value]));
			bindings.push({
				href: attrs.get("href"),
				id: attrs.get("id"),
				text: collectText(node),
			});
		}

		for (const child of getChildNodes(node)) {
			walk(child);
		}
	}

	walk(fragment);
	return bindings;
}

function collectText(node: DefaultTreeAdapterMap["node"]): string {
	if ("value" in node && typeof node.value === "string") {
		return node.value;
	}

	return getChildNodes(node).map(collectText).join("");
}

function getChildNodes(
	node: DefaultTreeAdapterMap["node"],
): DefaultTreeAdapterMap["node"][] {
	if ("childNodes" in node && Array.isArray(node.childNodes)) {
		return node.childNodes;
	}
	return [];
}

function isElement(
	node: DefaultTreeAdapterMap["node"],
): node is DefaultTreeAdapterMap["element"] {
	return "tagName" in node;
}
