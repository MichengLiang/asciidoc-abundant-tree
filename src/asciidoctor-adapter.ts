import {
	type AbstractBlock,
	type Document,
	Extensions,
	getVersion,
	Inline,
	type InlineMacroProcessorDslInterface,
	load,
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

// 浏览器也能用的这一层：从源文本加载与解析 xref。从文件加载在 asciidoctor-file-adapter.ts——4.x 的浏览器构建
// 不导出 loadFile，这里导入它会让浏览器打包失败。
export type AsciidoctorAdapter = {
	parserVersion: string;
	loadSource(sourceText: string): Promise<AsciidoctorBlock>;
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

export function createAsciidoctorAdapter(
	extensionRegistry: Registry = createExtensionRegistry(),
): AsciidoctorAdapter {
	return {
		parserVersion: getVersion(),
		async loadSource(sourceText) {
			const document = await load(sourceText, {
				safe: "secure",
				sourcemap: true,
				to_file: false,
				extension_registry: extensionRegistry,
			});
			return document as unknown as AsciidoctorBlock;
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

export function createExtensionRegistry(): Registry {
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
