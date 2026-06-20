import createAsciidoctor from "@asciidoctor/core";
import { type DefaultTreeAdapterMap, parseFragment } from "parse5";
import { interpretHeadingInlineMetadataAttributes } from "./heading-inline-metadata";

export type AsciidoctorBlock = {
	getAttributes?: () => Record<string, unknown>;
	getBlocks?: () => unknown[];
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
		getDirectory?: () => string | undefined;
		getFile?: () => string | undefined;
		getLineNumber?: () => number;
		getPath?: () => string | undefined;
	};
	getSubstitutions?: () => string[];
	getRefs?: () => Record<string, unknown>;
	getStyle?: () => string;
	getText?: () => unknown;
	getTitle?: () => string;
	$resolve_id?: (target: string) => unknown;
};

type HtmlAnchorBinding = {
	href?: string | undefined;
	text: string;
	id?: string | undefined;
};

type RuntimeInlineFactory = {
	create(
		parent: AsciidoctorBlock,
		context: string,
		text: string,
		options: Record<string, unknown>,
	): {
		convert: () => string;
	};
};

type RuntimeExtensionFactory = {
	create(): unknown;
};

export const ASCIIDOCTOR_CORE_VERSION = "3.0.4";

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
};

export type AsciidoctorAdapter = {
	parserVersion: string;
	loadFile(sourcePath: string): AsciidoctorBlock;
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
	): OfficialXrefBinding | undefined;
};

export type AsciidoctorParserAdapter = AsciidoctorAdapter & {
	loadSource(sourceText: string): AsciidoctorBlock;
	readPreprocessedLines(options: {
		readonly sourcePath: string;
		readonly baseDir: string;
		readonly jailDir?: string | undefined;
		readonly attributes?: Record<string, unknown> | undefined;
	}): readonly OfficialReaderLine[];
};

export function createAsciidoctorAdapter(): AsciidoctorParserAdapter {
	const processor = createAsciidoctor();
	if (!hasRuntimeInlineFactory(processor)) {
		throw new Error("Asciidoctor runtime does not expose Inline.create");
	}
	if (!hasRuntimeExtensionFactory(processor)) {
		throw new Error("Asciidoctor runtime does not expose Extensions.create");
	}
	const extensionRegistry = createExtensionRegistry(processor);
	const loadExtensionRegistry = extensionRegistry as NonNullable<
		NonNullable<Parameters<typeof processor.load>[1]>["extension_registry"]
	>;

	return {
		parserVersion: resolveParserVersion(processor),
		loadFile(sourcePath) {
			return processor.loadFile(sourcePath, {
				safe: "secure",
				sourcemap: true,
				to_file: false,
				extension_registry: loadExtensionRegistry,
			}) as AsciidoctorBlock;
		},
		loadSource(sourceText) {
			return processor.load(sourceText, {
				safe: "secure",
				sourcemap: true,
				to_file: false,
				extension_registry: loadExtensionRegistry,
			}) as AsciidoctorBlock;
		},
		readPreprocessedLines(options) {
			const document = processor.loadFile(options.sourcePath, {
				// Book-entry preprocessing prevalidates every local include against its
				// documentRoot. The Reader still needs unsafe mode here because Asciidoctor
				// safe mode treats legal `..` includes inside that root as jail ancestors.
				safe: "unsafe",
				base_dir: options.baseDir,
				...(options.jailDir ? { jail_dir: options.jailDir } : {}),
				sourcemap: true,
				parse: false,
				to_file: false,
				attributes: options.attributes ?? {},
				extension_registry: loadExtensionRegistry,
			}) as AsciidoctorBlock & {
				getReader?: () => {
					readLine: () => string | undefined | null;
					getCursor?: () => unknown;
				};
			};
			const reader = document.getReader?.();
			if (!reader) {
				throw new Error("Asciidoctor document does not expose a Reader.");
			}
			const lines: OfficialReaderLine[] = [];
			while (true) {
				const before = readerCursorEvidence(reader.getCursor?.());
				const text = reader.readLine();
				if (text === undefined || text === null) {
					break;
				}
				const after = readerCursorEvidence(reader.getCursor?.());
				lines.push({
					text,
					cursor: cursorForReturnedReaderLine(before, after),
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
			const refs = document.getRefs?.() ?? {};
			if (Object.hasOwn(refs, target)) {
				return `#${target}`;
			}
			const resolved = document.$resolve_id?.(target);
			return typeof resolved === "string" ? `#${resolved}` : undefined;
		},
		resolveXrefBinding(document, parent, xref) {
			const href = this.resolveXrefTarget(document, xref.target);
			const target = href ?? unresolvedLocalHref(xref.target);
			const reftext = resolveXrefReftext(document, xref, href);
			const inline = processor.Inline.create(parent, "anchor", reftext, {
				type: "xref",
				target,
			});
			const converted = extractAnchorBindings(parseFragment(inline.convert()));
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

export function resolveParserVersion(processor: unknown): string {
	if (hasProperties(processor) && typeof processor.getVersion === "function") {
		const version = processor.getVersion();
		if (typeof version === "string" && version.length > 0) {
			return version;
		}
	}
	return ASCIIDOCTOR_CORE_VERSION;
}

function createExtensionRegistry(
	processor: ReturnType<typeof createAsciidoctor> & {
		Extensions: RuntimeExtensionFactory;
	},
): unknown {
	const registry = processor.Extensions.create();
	if (!hasProperties(registry) || typeof registry.inlineMacro !== "function") {
		throw new Error(
			"Asciidoctor extension registry cannot register inline macros",
		);
	}
	registry.inlineMacro("hmeta", function (this: unknown) {
		if (!isInlineMacroRegistration(this)) {
			throw new Error("Asciidoctor inline macro registration is unavailable");
		}
		this.positionalAttributes("value");
		this.process(
			(
				parent: AsciidoctorBlock,
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
	});
	return registry;
}

function readerCursorEvidence(cursor: unknown): ReaderLineCursor {
	if (!hasProperties(cursor)) {
		return {};
	}
	return definedReaderCursor({
		file: typeof cursor.getFile === "function" ? cursor.getFile() : undefined,
		directory:
			typeof cursor.getDirectory === "function"
				? cursor.getDirectory()
				: undefined,
		path: typeof cursor.getPath === "function" ? cursor.getPath() : undefined,
		lineNumber:
			typeof cursor.getLineNumber === "function"
				? cursor.getLineNumber()
				: undefined,
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

function hasRuntimeInlineFactory(value: unknown): value is ReturnType<
	typeof createAsciidoctor
> & {
	Inline: RuntimeInlineFactory;
} {
	if (!hasProperties(value) || !hasProperties(value.Inline)) {
		return false;
	}
	return typeof value.Inline.create === "function";
}

function hasRuntimeExtensionFactory(value: unknown): value is ReturnType<
	typeof createAsciidoctor
> & {
	Extensions: RuntimeExtensionFactory;
} {
	if (!hasProperties(value) || !hasProperties(value.Extensions)) {
		return false;
	}
	return typeof value.Extensions.create === "function";
}

function isInlineMacroRegistration(value: unknown): value is {
	positionalAttributes: (...names: string[]) => void;
	process: (callback: unknown) => void;
	createInline: RuntimeInlineFactory["create"];
} {
	return (
		hasProperties(value) &&
		typeof value.positionalAttributes === "function" &&
		typeof value.process === "function" &&
		typeof value.createInline === "function"
	);
}

function resolveXrefReftext(
	document: AsciidoctorBlock,
	xref: { target: string; label?: string | undefined },
	href: string | undefined,
): string {
	if (xref.label) {
		return xref.label;
	}
	const resolvedId = href?.startsWith("#") ? href.slice(1) : undefined;
	const ref = resolvedId ? document.getRefs?.()?.[resolvedId] : undefined;
	if (isAsciidoctorRef(ref)) {
		const xreftext = ref.$xreftext();
		if (typeof xreftext === "string") {
			return xreftext;
		}
	}
	return `[${xref.target}]`;
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

function isAsciidoctorRef(
	value: unknown,
): value is { $xreftext: () => unknown } {
	return isRecord(value) && typeof value.$xreftext === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function hasProperties(value: unknown): value is Record<string, unknown> {
	return (
		value !== null && (typeof value === "object" || typeof value === "function")
	);
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
