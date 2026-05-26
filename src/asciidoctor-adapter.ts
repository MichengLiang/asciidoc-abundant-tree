import createAsciidoctor from "@asciidoctor/core";
import { type DefaultTreeAdapterMap, parseFragment } from "parse5";

export type AsciidoctorBlock = {
	getAttributes?: () => Record<string, unknown>;
	getBlocks?: () => AsciidoctorBlock[];
	getCatalog?: () => unknown;
	getContent?: () => string;
	getContext?: () => string;
	getDocumentTitle?: () => string;
	getId?: () => string | undefined;
	getLevel?: () => number;
	getNodeName?: () => string;
	getRows?: () => unknown;
	getSource?: () => string;
	getSourceLocation?: () => {
		getLineNumber?: () => number;
	};
	getStyle?: () => string;
	getTitle?: () => string;
};

type HtmlAnchorBinding = {
	href?: string | undefined;
	text: string;
	id?: string | undefined;
};

export type AsciidoctorAdapter = {
	parserVersion: string;
	loadFile(sourcePath: string): AsciidoctorBlock;
	extractAnchorBindings(html: string): HtmlAnchorBinding[];
};

export function createAsciidoctorAdapter(): AsciidoctorAdapter {
	const processor = createAsciidoctor();

	return {
		parserVersion: processor.getVersion(),
		loadFile(sourcePath) {
			return processor.loadFile(sourcePath, {
				safe: "secure",
				sourcemap: true,
				to_file: false,
			}) as AsciidoctorBlock;
		},
		extractAnchorBindings(html) {
			return extractAnchorBindings(parseFragment(html));
		},
	};
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
