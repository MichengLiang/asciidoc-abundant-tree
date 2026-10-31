#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { convertFile as convertAsciiDocFile, Extensions, LoggerManager, MemoryLogger } from "@asciidoctor/core";
import { parseAbundantTree, rdf12 } from "asciidoc-abundant-tree";
const DIAGRAM_BLOCK_PATTERN = /^\[(?:actdiag|blockdiag|bpmn|bytefield|c4plantuml|d2|dbml|ditaa|erd|excalidraw|graphviz|mermaid|nomnoml|nwdiag|packetdiag|pikchr|plantuml|rackdiag|seqdiag|svgbob|symbolator|umlet|vega|vegalite|wavedrom|structurizr|diagramsnet|wireviz)(?:,|\])/m;
const HTML_ANCHOR_PATTERN = /\b(?:id|name)="([^"]+)"/g;
const AAT_NAMESPACE = "https://micheng.dev/ns/asciidoc-abundant-tree#";
// 标题投影的 label space：aat 图上标题节点的这四个谓词（aat 06 号书第 2 章「地址与 Label 空间」）。
const LABEL_PREDICATES = ["headline", "addressPath", "addressLabel", "generatedAddressLabel"];
const HTML_FRAGMENT_LINK_PATTERN = /<a href="#([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g;
const HTML_DOCUMENT_LINK_PATTERN = /<a href="([^"#]+\.html)#([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g;
const HOME_MARKER = "data-multi-book-home";
const CONTROLS_MARKER = "data-multi-book-controls";
const FETCH_DIAGRAMS_ENV = "ADOC_BOOKS_FETCH_DIAGRAMS";
const CONFIG_FILE = "adoc-books.config.mjs";
const DEFAULT_CONFIG = {
    rootIndex: {
        redirectTo: "catalog.html",
        title: "AsciiDoc Multi-Book Workspace"
    },
    homeLink: {
        label: "Back to catalog",
        subtitle: "AsciiDoc multi-book workspace"
    }
};
function objectValue(value) {
    return typeof value === "object" && value !== null ? value : {};
}
function stringValue(value, fallback) {
    return typeof value === "string" && value.trim() !== "" ? value : fallback;
}
async function loadRuntimeConfig(rootDir) {
    const configPath = path.join(rootDir, CONFIG_FILE);
    const rawConfig = await existsFile(configPath) ? await importConfig(configPath) : {};
    const rawRootIndex = objectValue(rawConfig.rootIndex);
    const rawHomeLink = objectValue(rawConfig.homeLink);
    return {
        documentRoot: documentRootValue(rootDir, rawConfig.documentRoot),
        includeResolvers: includeResolversValue(rawConfig.includeResolvers),
        rootIndex: {
            redirectTo: stringValue(rawRootIndex.redirectTo, DEFAULT_CONFIG.rootIndex.redirectTo),
            title: stringValue(rawRootIndex.title, DEFAULT_CONFIG.rootIndex.title)
        },
        homeLink: {
            label: stringValue(rawHomeLink.label, DEFAULT_CONFIG.homeLink.label),
            subtitle: stringValue(rawHomeLink.subtitle, DEFAULT_CONFIG.homeLink.subtitle)
        }
    };
}
async function importConfig(configPath) {
    const configUrl = pathToFileURL(configPath);
    configUrl.search = `mtime=${(await stat(configPath)).mtimeMs}`;
    const module = await import(configUrl.href);
    return objectValue(module.default ?? module);
}
// 相对工作区根解析：配置文件就在工作区根，".." 即项目根。书要 include ../../shared/attributes.adoc，所以根必须
// 包含工作区；不合规的值直接报错，悄悄退回默认值时，使用者只会看到 include 越界，想不到是配置没生效。
function documentRootValue(rootDir, value) {
    if (value === undefined)
        return rootDir;
    if (typeof value !== "string" || value === "") {
        throw new Error(`${CONFIG_FILE}: documentRoot must be a path string relative to the workspace root`);
    }
    const documentRoot = path.resolve(rootDir, value);
    if (!isWithin(documentRoot, rootDir)) {
        throw new Error(`${CONFIG_FILE}: documentRoot must contain the workspace root ${rootDir}, got ${documentRoot}`);
    }
    return documentRoot;
}
function isWithin(root, filePath) {
    const relative = path.relative(root, filePath);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function includeResolversValue(value) {
    if (value === undefined)
        return [];
    const valid = Array.isArray(value) && value.every((resolver) => {
        const entry = objectValue(resolver);
        return typeof entry.prefix === "string" && entry.prefix !== "" && typeof entry.resolve === "function";
    });
    if (!valid)
        throw new Error(`${CONFIG_FILE}: includeResolvers must be an array of { prefix, resolve } objects`);
    return value;
}
async function existsFile(filePath) {
    try {
        const stats = await stat(filePath);
        return stats.isFile();
    }
    catch {
        return false;
    }
}
async function existsDir(dir) {
    try {
        const stats = await stat(dir);
        return stats.isDirectory();
    }
    catch {
        return false;
    }
}
async function collectFiles(dir, predicate) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectFiles(entryPath, predicate));
        }
        else if (entry.isFile() && predicate(entryPath)) {
            files.push(entryPath);
        }
    }
    return files.sort();
}
async function discoverBooks(rootDir) {
    const booksDir = path.join(rootDir, "books");
    const entries = await readdir(booksDir, { withFileTypes: true });
    const books = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const bookDir = path.join(booksDir, entry.name);
        const input = path.join(bookDir, "book.adoc");
        if (await existsFile(input)) {
            books.push({
                bookId: entry.name,
                bookDir,
                input,
                htmlOutputDir: path.join(rootDir, "build", "html", "books", entry.name)
            });
        }
    }
    return books.sort((a, b) => a.bookId.localeCompare(b.bookId));
}
async function readIfExists(filePath) {
    return await existsFile(filePath) ? readFile(filePath, "utf8") : "";
}
async function combinedBookSource(bookDir) {
    const files = await collectFiles(bookDir, (filePath) => filePath.endsWith(".adoc") || filePath.endsWith(".mjs"));
    const sources = [];
    for (const file of files) {
        const relativePath = path.relative(path.dirname(bookDir), file).split(path.sep).join("/");
        const source = await readFile(file, "utf8");
        sources.push(`// file: ${relativePath}\n${source.endsWith("\n") ? source : `${source}\n`}`);
    }
    return sources.join("\n");
}
async function workspaceUsesDiagrams(rootDir, books) {
    const sources = [await readIfExists(path.join(rootDir, "catalog.adoc"))];
    for (const book of books)
        sources.push(await combinedBookSource(book.bookDir));
    return sources.some((source) => DIAGRAM_BLOCK_PATTERN.test(source));
}
// 每次构建单独一个 registry，include 解析器与 Kroki 都登记在它上面：登记在全局会留在进程里，把上一个工作区的解析器
// 带进下一个（DESIGN.adoc 的 Cheap Performance Rules）。
async function createExtensionRegistry(config, loadKroki) {
    const registry = Extensions.create();
    registerIncludeResolvers(registry, config);
    if (loadKroki) {
        try {
            (await import("asciidoctor-kroki")).register(registry);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`current workspace contains diagram blocks, but asciidoctor-kroki could not be loaded: ${message}`);
        }
    }
    return registry;
}
// 书架登记的 include 解析器，在 HTML 这一侧由 Asciidoctor 的 include 处理器调用；阅读数据一侧由 aat 调用同一份，
// 两侧读同一份行（DESIGN.adoc 的 Workspace Configuration）。
function registerIncludeResolvers(registry, config) {
    if (config.includeResolvers.length === 0)
        return;
    const claiming = (target) => config.includeResolvers.find((resolver) => target.startsWith(resolver.prefix));
    // 直接登记在 registry 上：Asciidoctor.js 4 里 Extensions.create(分组函数) 登记的处理器从不被调用，include::前缀:…
    // 被当作 URI 悄悄转成链接、不报任何消息；直接登记的处理器对 catalog 与各本书都有效。
    registry.includeProcessor(function () {
        this.handles((target) => claiming(target) !== undefined);
        this.process(async (document, reader, target, attributes) => {
            const resolver = claiming(target);
            const cursor = reader.getCursor();
            const sourcePath = cursor.getFile();
            // 游标已越过 directive 这一行。
            const location = `include::${target}[] in ${sourcePath}: line ${cursor.getLineNumber() - 1}`;
            let resolution;
            try {
                resolution = await resolver.resolve({ target: target.slice(resolver.prefix.length), attributes, sourcePath });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`include resolver '${resolver.prefix}' failed for ${location}: ${message}`, { cause: error });
            }
            const { text, absolutePath, startLine } = checkedResolution(resolution, config.documentRoot, `include resolver '${resolver.prefix}'`, location);
            // 显示用的路径照 Asciidoctor 自己 include 文件时的写法，相对文档的 base_dir。
            const displayPath = path.relative(document.getBaseDir(), absolutePath).split(path.sep).join("/");
            reader.pushInclude(text, absolutePath, displayPath, startLine, attributes);
        });
    });
}
// 解析器交回的是来源文件里从 startLine 起连续的整行。这里逐行核对：两侧读同一份行的前提是 origin 就是 text 的
// 出处——aat 把 origin 指向的文件全文收进复制纯文本，HTML 只用 text，两者对不上时构建也会成功，读者却看到两份
// 不同的东西（aat 对此只报 warning）。
function checkedResolution(resolution, documentRoot, who, location) {
    const shaped = objectValue(resolution);
    const origin = objectValue(shaped.origin);
    const startLine = origin.startLine;
    if (typeof shaped.text !== "string" || typeof origin.path !== "string" || !Number.isInteger(startLine) || startLine < 1) {
        throw new Error(`${who} returned an invalid result for ${location}; expected { text, origin: { path, startLine } }`);
    }
    const absolutePath = path.resolve(documentRoot, origin.path);
    // 来源是根之内的一个文件，不能是根本身；aat 同样拒绝。
    if (absolutePath === documentRoot || !isWithin(documentRoot, absolutePath)) {
        throw new Error(`${who} returned a source outside documentRoot ${documentRoot} for ${location}: ${absolutePath}`);
    }
    const text = withoutFinalNewline(shaped.text);
    if (text !== "") {
        const lines = text.split(/\r?\n/u);
        let source;
        try {
            source = readFileSync(absolutePath, "utf8");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${who} returned a source that cannot be read for ${location}: ${message}`, { cause: error });
        }
        const sourceLines = withoutFinalNewline(source).split(/\r?\n/u);
        const first = startLine - 1;
        const mismatch = lines.findIndex((line, index) => sourceLines[first + index] !== line);
        if (mismatch !== -1) {
            const lineNumber = first + mismatch + 1;
            const detail = lineNumber > sourceLines.length
                ? `the file has only ${sourceLines.length} lines`
                : `line ${lineNumber} is ${shown(sourceLines[lineNumber - 1])}, the resolver returned ${shown(lines[mismatch])}`;
            throw new Error(`${who} returned text that is not lines ${first + 1}-${first + lines.length} of ${absolutePath} for ${location}: ${detail}`);
        }
    }
    return { text, absolutePath, startLine: startLine };
}
// 末尾的换行是最后一行的结束，不是多出来的一行：留着会让 Reader 多切出一个空行（aat 同样去掉一个）。来源文件按同一
// 规则切行，文件最后一行之后才不会多出一个并不存在的空行。
function withoutFinalNewline(text) {
    return text.replace(/\r?\n$/u, "");
}
// 消息里的一行：截短，BOM 与控制字符写成可见的转义，行尾空白看得出来。
function shown(line) {
    const clipped = line.length > 60 ? `${line.slice(0, 60)}…` : line;
    return JSON.stringify(clipped).replaceAll("﻿", "\\uFEFF");
}
function shouldFetchDiagrams() {
    const value = process.env[FETCH_DIAGRAMS_ENV];
    return value === "1" || value === "true";
}
async function pruneStaleBookHtmlDirs(rootDir, books) {
    const htmlBooksDir = path.join(rootDir, "build", "html", "books");
    if (!await existsDir(htmlBooksDir))
        return;
    const current = new Set(books.map((book) => book.bookId));
    const entries = await readdir(htmlBooksDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory() && !current.has(entry.name)) {
            await rm(path.join(htmlBooksDir, entry.name), { force: true, recursive: true });
        }
    }
}
function messageText(message) {
    if (typeof message?.getText === "function")
        return message.getText();
    if (typeof message?.getMessage === "function")
        return message.getMessage();
    return String(message);
}
function messageLocation(message) {
    const sourceLocation = typeof message?.getSourceLocation === "function" ? message.getSourceLocation() : undefined;
    if (!sourceLocation)
        return "";
    const sourcePath = typeof sourceLocation.getPath === "function" ? sourceLocation.getPath() : undefined;
    const lineNumber = typeof sourceLocation.getLineNumber === "function" ? sourceLocation.getLineNumber() : undefined;
    if (sourcePath && lineNumber)
        return `${sourcePath}: line ${lineNumber}`;
    if (sourcePath)
        return sourcePath;
    if (lineNumber)
        return `line ${lineNumber}`;
    return "";
}
function formatAsciidoctorMessage(message) {
    const severity = typeof message?.getSeverity === "function" ? message.getSeverity() : "UNKNOWN";
    const location = messageLocation(message);
    const text = messageText(message);
    return location ? `${severity}: ${location}: ${text}` : `${severity}: ${text}`;
}
async function convertFile(extensionRegistry, input, outputFile, baseDir, attributes = {}) {
    const defaultLogger = LoggerManager.getLogger();
    const memoryLogger = MemoryLogger.create();
    LoggerManager.setLogger(memoryLogger);
    try {
        await convertAsciiDocFile(input, {
            safe: "unsafe",
            base_dir: baseDir,
            to_file: outputFile,
            mkdirs: true,
            extension_registry: extensionRegistry,
            attributes
        });
    }
    finally {
        LoggerManager.setLogger(defaultLogger);
    }
    const messages = memoryLogger.getMessages();
    if (messages.length > 0) {
        throw new Error(`AsciiDoc strict check failed for ${input}\n${messages.map(formatAsciidoctorMessage).join("\n")}`);
    }
}
async function buildHtml(rootDir, books, extensionRegistry, useKroki, fetchDiagrams) {
    await mkdir(path.join(rootDir, "build", "html"), { recursive: true });
    await convertFile(extensionRegistry, path.join(rootDir, "catalog.adoc"), path.join(rootDir, "build", "html", "catalog.html"), rootDir);
    await pruneStaleBookHtmlDirs(rootDir, books);
    for (const book of books) {
        await mkdir(book.htmlOutputDir, { recursive: true });
        await convertFile(extensionRegistry, book.input, path.join(book.htmlOutputDir, "book.html"), book.bookDir, {
            ...(useKroki && fetchDiagrams ? { "kroki-fetch-diagram": "", "kroki-http-method": "post" } : {})
        });
    }
}
async function copyAssets(rootDir, books) {
    const sharedImages = path.join(rootDir, "shared", "images");
    if (await existsDir(sharedImages)) {
        await rm(path.join(rootDir, "build", "html", "shared", "images"), { force: true, recursive: true });
        await cp(sharedImages, path.join(rootDir, "build", "html", "shared", "images"), { recursive: true });
    }
    for (const book of books) {
        const assetsDir = path.join(book.bookDir, "assets");
        if (await existsDir(assetsDir)) {
            await rm(path.join(book.htmlOutputDir, "assets"), { force: true, recursive: true });
            await cp(assetsDir, path.join(book.htmlOutputDir, "assets"), { recursive: true });
        }
    }
}
function escapeHtmlAttribute(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}
function escapeJsonScript(value) {
    return JSON.stringify(value)
        .replaceAll("<", "\\u003c")
        .replaceAll("\u2028", "\\u2028")
        .replaceAll("\u2029", "\\u2029");
}
function escapeJsonValueForScript(value) {
    return JSON.stringify(value)
        .replaceAll("<", "\\u003c")
        .replaceAll("\u2028", "\\u2028")
        .replaceAll("\u2029", "\\u2029");
}
function sectionStyle(section) {
    for (const metadata of section.metadata ?? []) {
        const style = metadata.attributes?.style;
        if (typeof style === "string")
            return style;
    }
    return undefined;
}
function firstSectionId(section) {
    const id = section.ids?.[0];
    if (!id)
        throw new Error(`section is missing an id: ${section.title ?? "(untitled)"}`);
    return id;
}
function childSections(section) {
    return (section.children ?? []).filter((child) => child.kind === "section");
}
function sourceSpan(section) {
    const relativePath = section.source?.relativePath;
    if (!relativePath)
        return undefined;
    return {
        relativePath,
        ...(typeof section.source?.span?.startLine === "number" ? { startLine: section.source.span.startLine } : {}),
        ...(typeof section.source?.span?.endLine === "number" ? { endLine: section.source.span.endLine } : {})
    };
}
function sectionAnchorTree(section) {
    const anchors = [firstSectionId(section)];
    for (const child of childSections(section))
        anchors.push(...sectionAnchorTree(child));
    return anchors;
}
function sectionToc(section, baseDepth = 0, topTitle) {
    const toc = [{ title: topTitle ?? section.title ?? firstSectionId(section), anchor: firstSectionId(section), depth: baseDepth }];
    for (const child of childSections(section)) {
        toc.push(...sectionToc(child, baseDepth + 1));
    }
    return toc;
}
function chapterPage(section, parentPageId) {
    return {
        id: firstSectionId(section),
        kind: "chapter",
        title: section.title ?? firstSectionId(section),
        anchors: sectionAnchorTree(section),
        toc: sectionToc(section, 0, "概述"),
        source: sourceSpan(section),
        ...(parentPageId ? { parentPageId } : {})
    };
}
function backmatterPage(section, kind) {
    return {
        id: firstSectionId(section),
        kind,
        title: section.title ?? firstSectionId(section),
        anchors: sectionAnchorTree(section),
        toc: sectionToc(section, 0, "概述"),
        source: sourceSpan(section)
    };
}
function assertNoToolErrors(bookId, diagnostics) {
    for (const diagnostic of diagnostics) {
        const entry = objectValue(diagnostic);
        if (entry.level === "error") {
            throw new Error(`${bookId}: ${stringValue(entry.code, "error")}: ${stringValue(entry.message, "")}`);
        }
    }
}
function sourceBundleFromDocument(document) {
    const sourceFiles = Array.isArray(document.sourceFiles) ? document.sourceFiles : [];
    const files = sourceFiles.filter((file) => typeof file.relativePath === "string" && typeof file.raw === "string");
    return files.map((file) => {
        const body = file.raw?.endsWith("\n") ? file.raw : `${file.raw ?? ""}\n`;
        return `// file: ${file.relativePath}\n${body}`;
    }).join("\n");
}
// 解析失败就让构建失败，不退回只有封面的阅读页：退回时 include 越过 documentRoot 只剩一条 warning，
// 构建照常成功，没有人发现阅读页坏了（DESIGN.adoc 的 Rendering Failures）。
async function buildReaderBookData(config, book) {
    let parsed;
    let document;
    try {
        parsed = await parseAbundantTree({
            sourcePath: book.input,
            mode: "book-entry",
            documentRoot: config.documentRoot,
            includeResolvers: config.includeResolvers
        });
        document = parsed;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${book.bookId}: ${message}`, { cause: error });
    }
    const diagnostics = Array.isArray(document.toolDiagnostics) ? document.toolDiagnostics : [];
    assertNoToolErrors(book.bookId, diagnostics);
    const title = objectValue(document.title).text;
    const pages = [{
            id: "cover",
            kind: "cover",
            title: typeof title === "string" ? title : book.bookId,
            anchors: [],
            toc: []
        }];
    const sections = (Array.isArray(document.children) ? document.children : []).filter((child) => {
        return typeof child === "object" && child !== null && child.kind === "section";
    });
    // abstract 不在其中：它是 article 的样式，book 里的 [abstract] 被 Asciidoctor 当作编号的一章，阅读器照它渲染的样子
    // 当章节显示（docs/design/book-dual-reader-view.adoc 的 Page Map）。
    const frontmatterStyles = new Set(["colophon", "dedication", "preface", "acknowledgments"]);
    const backmatterStyles = new Set(["appendix", "glossary", "bibliography", "index"]);
    const frontmatter = sections.filter((section) => section.level === 1 && frontmatterStyles.has(sectionStyle(section) ?? ""));
    if (frontmatter.length > 0) {
        pages.push({
            id: "frontmatter",
            kind: "frontmatter",
            title: "前置",
            anchors: frontmatter.map(firstSectionId),
            toc: frontmatter.map((section) => ({
                title: section.title ?? firstSectionId(section),
                anchor: firstSectionId(section),
                depth: 0
            }))
        });
    }
    for (const section of sections) {
        const style = sectionStyle(section);
        if (frontmatterStyles.has(style ?? ""))
            continue;
        if (backmatterStyles.has(style)) {
            pages.push(backmatterPage(section, style));
            continue;
        }
        if (section.level === 0) {
            const partId = `part-${firstSectionId(section)}`;
            const children = childSections(section);
            const childPages = children.map((child) => chapterPage(child, partId));
            pages.push({
                id: partId,
                kind: "part",
                title: section.title ?? firstSectionId(section),
                anchors: [firstSectionId(section)],
                toc: [{ title: "概述", anchor: firstSectionId(section), depth: 0 }],
                source: sourceSpan(section),
                childPageIds: childPages.map((page) => page.id)
            });
            pages.push(...childPages);
            continue;
        }
        pages.push(chapterPage(section));
    }
    const pageMap = {
        version: 1,
        book: {
            id: book.bookId,
            title: pages[0].title,
            entry: path.relative(config.documentRoot, book.input).split(path.sep).join("/")
        },
        pages
    };
    return {
        pageMap,
        sourceBundle: sourceBundleFromDocument(document),
        references: bindReferences(config, parsed)
    };
}
// 书内 xref 落在哪一节，读 aat 的投影（DESIGN.adoc 的 Reference Binding）：哪些是 xref、目标写的是什么（透传与转义
// 不算，属性已展开，指向别的文档的另记 targetDocument）由 aat 里的 Asciidoctor 读出，一处引用对上几节就有几条
// targetHeading。链接只能跳到一处，所以恰好一节才改写；零节或几节保持 Asciidoctor 写下的样子，不替人挑，也不报：
// 引用对不对是投影的读者（bookgraph）的解释，不是渲染的事（DESIGN.adoc 的 Division of Labour）。
function bindReferences(config, document) {
    const projection = rdf12(document, { documentRoot: config.documentRoot });
    const graph = projection.graph;
    const values = (subject, name) => {
        return graph.match({ subject, predicate: { termType: "iri", value: `${AAT_NAMESPACE}${name}` } })
            .map((triple) => triple.object.termType === "triple" ? "" : triple.object.value);
    };
    // 只数节：书名也是图上的一个标题节点、也拥有标签，可它不是书里的一节，网页上没有落点（nodeIndex 里它不是 section）。
    const sections = new Map(projection.nodeIndex.entries()
        .filter((entry) => entry.kind === "section")
        .map((entry) => [entry.iri.value, entry]));
    // 地址的名字：选择器是这一节的标题或某个限定地址时，照写下的样子显示，各级标题之间用间隔号；是 ID（作者声明的或生成的）
    // 时显示标题——ID 是给引用用的第二个地址，不是给读者看的名字。按图上是哪个标签判，不按字符串里有没有 :: 猜。
    const located = (iris, selector) => [...iris].flatMap((iri) => {
        const entry = sections.get(iri);
        const id = entry?.node.ids?.[0];
        if (entry === undefined || id === undefined)
            return [];
        const node = { termType: "iri", value: iri };
        const named = values(node, "headline").includes(selector) || values(node, "addressPath").includes(selector);
        return [{ id, shown: named ? selector.split("::").join("·") : entry.node.title ?? id }];
    });
    // 别的书指过来的引用在这本书的 label space 里找：图上四个标签谓词的值，按整串相等找拥有者。
    const ownersByLabel = new Map();
    for (const name of LABEL_PREDICATES) {
        for (const triple of graph.match({ predicate: { termType: "iri", value: `${AAT_NAMESPACE}${name}` } })) {
            if (triple.object.termType !== "literal")
                continue;
            const iris = ownersByLabel.get(triple.object.value) ?? new Set();
            iris.add(triple.subject.value);
            ownersByLabel.set(triple.object.value, iris);
        }
    }
    const owners = (selector) => located(ownersByLabel.get(selector) ?? [], selector);
    const headingsByFragment = new Map();
    const crossBook = [];
    // 指向整本书的 xref（没有片段）没有 targetSelector：没有可改写的片段。
    for (const triple of graph.match({ predicate: { termType: "iri", value: `${AAT_NAMESPACE}targetSelector` } })) {
        const edge = triple.subject;
        const fragment = triple.object.termType === "triple" ? "" : triple.object.value;
        const document = values(edge, "targetDocument")[0];
        if (document !== undefined) {
            crossBook.push({ document, fragment });
            continue;
        }
        const found = located(values(edge, "targetHeading"), fragment);
        if (found.length !== 1)
            continue;
        headingsByFragment.set(fragment, found[0]);
        headingsByFragment.set(escapeHtmlAttribute(fragment), found[0]);
    }
    return { headingsByFragment, crossBook, owners };
}
// 跨书 xref 同样跟着投影走，只是 label space 在目标书里（DESIGN.adoc 的 Reference Binding）。aat 不打开别的文档，
// 工作区解析了每一本书，所以在这里找。路径按书目录解析：Asciidoctor 把它照写进 HTML，而 HTML 的输出目录与 books/ 下的
// 书目录一一对应。指向的不是工作区里的书、只指向整本书（没有片段）、或在目标书里对上零节或几节的，保持原样。
async function bindCrossBookReferences(book, references, bindingsByInput, anchorCache) {
    const linksByHref = new Map();
    for (const xref of references.crossBook) {
        const { fragment } = xref;
        // Asciidoctor 把 xref:other#x[] 与 xref:other.adoc#x[] 都读成文档 other：去掉 .adoc、没有扩展名的照写，
        // 再加 .html 写进 href。书的入口按 .adoc 登记，链接按 .html 改写，两边都从这个文档名出发。
        const documentName = path.extname(xref.document) === ".adoc" ? xref.document.slice(0, -".adoc".length) : xref.document;
        const target = bindingsByInput.get(path.resolve(book.bookDir, `${documentName}.adoc`));
        if (fragment === "" || target === undefined)
            continue;
        const found = target.references.owners(fragment);
        if (found.length !== 1)
            continue;
        const heading = found[0];
        // 指向本书自己的 book.adoc：Asciidoctor 把它当书内引用，写成 #片段。
        if (target.book.bookId === book.bookId) {
            references.headingsByFragment.set(fragment, heading);
            references.headingsByFragment.set(escapeHtmlAttribute(fragment), heading);
            continue;
        }
        const anchors = await anchorsForHtmlFile(path.join(target.book.htmlOutputDir, "book.html"), anchorCache);
        if (anchors.has(fragment))
            continue;
        const htmlPath = `${documentName}.html`;
        const link = { href: `${htmlPath}#${heading.id}`, shown: heading.shown };
        linksByHref.set(`${htmlPath}#${fragment}`, link);
        linksByHref.set(escapeHtmlAttribute(`${htmlPath}#${fragment}`), link);
    }
    return linksByHref;
}
// 在目标书里恰好对上一节、而目标书的 HTML 里没有这个片段的跨书链接，改成指向那一节的标题。Asciidoctor 对没有显示文字的跨书 xref
// 显示文档路径；改写时换成地址的名字。
function rewriteCrossBookXrefs(html, linksByHref) {
    if (linksByHref.size === 0)
        return html;
    return html.replace(HTML_DOCUMENT_LINK_PATTERN, (whole, htmlPath, fragment, rest, text) => {
        const link = linksByHref.get(`${htmlPath}#${fragment}`) ?? linksByHref.get(`${htmlPath}#${decodeUrlFragment(fragment)}`);
        if (link === undefined)
            return whole;
        const shown = text === htmlPath ? escapeHtmlAttribute(link.shown) : text;
        return `<a href="${escapeHtmlAttribute(link.href)}"${rest}>${shown}</a>`;
    });
}
// Asciidoctor 把它解析不了的书内 xref 写成 <a href="#选择器">[选择器]</a>；aat 的投影里恰好对上一节的，改成指向那一节的标题，
// 显示地址的名字。片段已经是 HTML 里某个元素的 id 时，保持 Asciidoctor 写下的样子。
function rewriteBoundXrefs(html, headingsByFragment) {
    if (headingsByFragment.size === 0)
        return html;
    const anchors = htmlAnchors(html);
    return html.replace(HTML_FRAGMENT_LINK_PATTERN, (whole, fragment, rest, text) => {
        const decoded = decodeUrlFragment(fragment);
        if (anchors.has(fragment) || anchors.has(decoded))
            return whole;
        const heading = headingsByFragment.get(fragment) ?? headingsByFragment.get(decoded);
        if (heading === undefined)
            return whole;
        const shown = text === `[${fragment}]` ? escapeHtmlAttribute(heading.shown) : text;
        return `<a href="#${escapeHtmlAttribute(heading.id)}"${rest}>${shown}</a>`;
    });
}
function readerStyles() {
    return `
.multi-book-reader-toggle {
  display: grid;
  gap: .35rem;
  grid-template-columns: 1fr 1fr;
  margin-top: .75rem;
}
.multi-book-reader-toggle button {
  appearance: none;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #1f2937;
  cursor: pointer;
  font-size: .82rem;
  font-weight: 600;
  padding: .42rem .5rem;
}
.multi-book-reader-toggle button[aria-pressed="true"] {
  border-color: #0f766e;
  color: #0f766e;
}
[data-multi-book-page-nav] {
  border-top: 1px solid #e5e7eb;
  margin-top: .75rem;
  padding-top: .75rem;
}
[data-multi-book-page-nav][hidden] {
  display: none;
}
[data-multi-book-page-nav] a {
  border-left: 3px solid transparent;
  color: #334155;
  display: block;
  font-size: .85rem;
  line-height: 1.35;
  padding: .3rem .35rem .3rem .55rem;
  text-decoration: none;
}
[data-multi-book-page-nav] a[data-reader-depth="1"] {
  padding-left: 1.45rem;
}
[data-multi-book-page-nav] a[aria-current="page"] {
  border-left-color: #0f766e;
  color: #0f766e;
  font-weight: 700;
}
.multi-book-reader-cover {
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
}
.multi-book-reader-cover h2 {
  margin-top: 0;
}
[data-multi-book-page-toc] {
  border-left: 1px solid #e5e7eb;
  color: #334155;
  font-size: .85rem;
  padding-left: 1rem;
}
[data-multi-book-page-toc][hidden] {
  display: none;
}
[data-multi-book-page-toc] strong {
  color: #1f2937;
  display: block;
  font-size: .78rem;
  margin-bottom: .35rem;
}
[data-multi-book-page-toc] a {
  color: #334155;
  display: block;
  margin: .35rem 0;
  text-decoration: none;
}
[data-multi-book-pagination] {
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  margin-bottom: 2rem;
  margin-top: 2.5rem;
  padding-top: 1rem;
}
[data-multi-book-pagination][hidden] {
  display: none;
}
[data-multi-book-pagination] a {
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #1f2937;
  flex: 1 1 0;
  padding: .65rem;
  text-decoration: none;
}
[data-multi-book-pagination] span {
  color: #64748b;
  display: block;
  font-size: .78rem;
}
@media (min-width: 1024px) {
  body.toc2.toc-left.multi-book-reader-paged #content {
    --multi-book-reader-content-gutter: max(0px, calc((100vw - 20em - 1000px) / 2));
    box-sizing: border-box;
    margin-left: var(--multi-book-reader-content-gutter);
    margin-right: 16rem;
    max-width: min(800px, calc(100vw - 20em - 20rem - var(--multi-book-reader-content-gutter)));
    padding-left: 15px;
  }
  body.toc2.toc-left.multi-book-reader-paged [data-multi-book-pagination] {
    --multi-book-reader-content-gutter: max(0px, calc((100vw - 20em - 1000px) / 2));
    margin-left: var(--multi-book-reader-content-gutter);
    max-width: min(800px, calc(100vw - 20em - 20rem - var(--multi-book-reader-content-gutter)));
    width: calc(100vw - 20em - 20rem - var(--multi-book-reader-content-gutter));
  }
  [data-multi-book-page-toc] {
    position: fixed;
    right: 2rem;
    top: 7rem;
    width: 12rem;
  }
}
@media (min-width: 1024px) and (max-width: 1359px) {
  [data-multi-book-page-toc] {
    right: 1rem;
    width: 8rem;
  }
}
body.multi-book-reader-paged #footer {
  display: none;
}
@media (max-width: 767px) {
  #toc.toc2 {
    position: static;
    width: auto;
  }
  [data-multi-book-pagination] {
    flex-direction: column;
  }
  pre, table {
    max-width: 100%;
    overflow-x: auto;
  }
}
`;
}
function readerScript() {
    return `
(function () {
function initReader() {
  var mapElement = document.getElementById("multi-book-page-map");
  if (!mapElement) return;
  var pageMap;
  try {
    pageMap = JSON.parse(mapElement.textContent || "{}");
  } catch (error) {
    return;
  }
  if (!pageMap || !Array.isArray(pageMap.pages)) return;

  var content = document.getElementById("content");
  var toc = document.getElementById("toc");
  if (!content || !toc) return;

  var pages = pageMap.pages;
  var pagesById = new Map();
  var anchorToPageId = new Map();
  pages.forEach(function (page) {
    pagesById.set(page.id, page);
    (page.anchors || []).forEach(function (anchor) { anchorToPageId.set(anchor, page.id); });
  });

  var controls = document.querySelector("[data-multi-book-controls]");
  var toggle = document.createElement("div");
  toggle.className = "multi-book-reader-toggle";
  toggle.setAttribute("data-multi-book-view-toggle", "");
  toggle.innerHTML = '<button type="button" data-reader-view="continuous">连续</button><button type="button" data-reader-view="paged">页面</button>';
  if (controls) controls.appendChild(toggle);

  var nav = document.createElement("nav");
  nav.setAttribute("data-multi-book-page-nav", "");
  nav.setAttribute("aria-label", "页面");
  if (controls && controls.nextSibling) toc.insertBefore(nav, controls.nextSibling);
  else toc.appendChild(nav);

  var pageToc = document.createElement("aside");
  pageToc.setAttribute("data-multi-book-page-toc", "");
  content.parentNode.insertBefore(pageToc, content.nextSibling);

  var pagination = document.createElement("nav");
  pagination.setAttribute("data-multi-book-pagination", "");
  pagination.setAttribute("aria-label", "分页");
  content.parentNode.insertBefore(pagination, pageToc.nextSibling);

  var cover = document.createElement("section");
  cover.id = "multi-book-reader-cover";
  cover.className = "multi-book-reader-cover";
  var sourceTitle = document.querySelector("#header > h1");
  var details = document.querySelector("#header > .details");
  cover.innerHTML = "<h2></h2>";
  cover.querySelector("h2").textContent = sourceTitle ? sourceTitle.textContent : pageMap.book.title;
  if (details) cover.appendChild(details.cloneNode(true));
  content.insertBefore(cover, content.firstChild);

  var originalTocNodes = Array.from(toc.children).filter(function (node) {
    return node !== controls && node !== nav;
  });
  var originalNodes = Array.from(content.children).filter(function (node) { return node !== cover; });
  var currentView = "continuous";
  var currentPageId = "cover";

  function query() {
    return new URLSearchParams(window.location.search);
  }

  function writeQuery(values) {
    var url = new URL(window.location.href);
    Object.keys(values).forEach(function (key) {
      if (values[key] == null) url.searchParams.delete(key);
      else url.searchParams.set(key, values[key]);
    });
    history.pushState(null, "", url);
  }

  function pageNodes(page) {
    if (page.kind === "cover") return [cover];
    if (page.kind === "frontmatter") {
      return (page.anchors || []).map(function (anchor) {
        var heading = document.getElementById(anchor);
        return heading ? heading.closest(".sect1") : null;
      }).filter(Boolean);
    }
    if (page.kind === "part") {
      var partHeading = document.getElementById(page.anchors[0]);
      if (!partHeading) return [];
      var nodes = [partHeading];
      var next = partHeading.nextElementSibling;
      while (next && !next.matches(".sect1") && !next.matches("h1.sect0")) {
        nodes.push(next);
        next = next.nextElementSibling;
      }
      return nodes;
    }
    var heading = document.getElementById(page.anchors[0]);
    var section = heading ? heading.closest(".sect1") : null;
    return section ? [section] : [];
  }

  function renderNav() {
    nav.hidden = currentView !== "paged";
    nav.textContent = "";
    if (currentView !== "paged") return;
    pages.forEach(function (page) {
      var link = document.createElement("a");
      link.href = "?view=paged&page=" + encodeURIComponent(page.id);
      link.textContent = page.title;
      link.dataset.pageId = page.id;
      link.dataset.readerDepth = page.parentPageId ? "1" : "0";
      if (page.id === currentPageId) link.setAttribute("aria-current", "page");
      link.addEventListener("click", function (event) {
        event.preventDefault();
        setView("paged", page.id, true);
      });
      nav.appendChild(link);
    });
  }

  function renderPageToc(page) {
    pageToc.hidden = currentView !== "paged";
    pageToc.textContent = "";
    if (currentView !== "paged") return;
    var title = document.createElement("strong");
    title.textContent = "本页内容";
    pageToc.appendChild(title);
    (page.toc || []).forEach(function (item) {
      var link = document.createElement("a");
      link.href = "#" + item.anchor;
      link.textContent = item.title;
      link.style.paddingLeft = (item.depth * 0.8) + "rem";
      link.addEventListener("click", function (event) {
        event.preventDefault();
        var target = document.getElementById(item.anchor);
        if (target) target.scrollIntoView();
      });
      pageToc.appendChild(link);
    });
  }

  function renderPagination(page) {
    pagination.hidden = currentView !== "paged";
    pagination.textContent = "";
    if (currentView !== "paged") return;
    var index = pages.findIndex(function (candidate) { return candidate.id === page.id; });
    function addLink(label, target) {
      if (!target) {
        var spacer = document.createElement("span");
        pagination.appendChild(spacer);
        return;
      }
      var link = document.createElement("a");
      link.href = "?view=paged&page=" + encodeURIComponent(target.id);
      link.innerHTML = "<span>" + label + "</span>" + target.title;
      link.addEventListener("click", function (event) {
        event.preventDefault();
        setView("paged", target.id, true);
        window.scrollTo(0, 0);
      });
      pagination.appendChild(link);
    }
    addLink("上一页", pages[index - 1]);
    addLink("下一页", pages[index + 1]);
  }

  function setView(view, pageId, persist) {
    currentView = view;
    currentPageId = pagesById.has(pageId) ? pageId : "cover";
    var page = pagesById.get(currentPageId) || pages[0];
    document.body.classList.toggle("multi-book-reader-paged", view === "paged");
    document.body.classList.toggle("multi-book-reader-continuous", view === "continuous");
    toggle.querySelectorAll("button").forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.readerView === view ? "true" : "false");
    });
    if (persist) {
      localStorage.setItem("multi-book-reader-view", view);
      writeQuery({ view: view, page: view === "paged" ? currentPageId : null });
    }
    if (view === "continuous") {
      cover.hidden = true;
      originalNodes.forEach(function (node) { node.hidden = false; });
      originalTocNodes.forEach(function (node) { node.hidden = false; });
      pageToc.hidden = true;
      pagination.hidden = true;
      renderNav();
      return;
    }
    originalTocNodes.forEach(function (node) { node.hidden = true; });
    var visible = new Set(pageNodes(page));
    if (visible.size === 0 && page.kind !== "cover") {
      cover.hidden = false;
      cover.querySelector("h2").textContent = "当前页面无法在生成 HTML 中定位。";
      visible.add(cover);
    }
    cover.hidden = !visible.has(cover);
    originalNodes.forEach(function (node) { node.hidden = !visible.has(node); });
    renderNav();
    renderPageToc(page);
    renderPagination(page);
  }

  toggle.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-reader-view]");
    if (!button) return;
    setView(button.dataset.readerView, currentPageId, true);
  });

  document.addEventListener("click", function (event) {
    if (currentView !== "paged") return;
    var link = event.target.closest('a[href^="#"]');
    if (!link) return;
    var anchor = decodeURIComponent(link.getAttribute("href").slice(1));
    var targetPageId = anchorToPageId.get(anchor);
    if (!targetPageId) return;
    if (targetPageId !== currentPageId) {
      event.preventDefault();
      setView("paged", targetPageId, true);
      var target = document.getElementById(anchor);
      if (target) target.scrollIntoView();
    }
  });

  window.addEventListener("popstate", function () {
    var params = query();
    setView(params.get("view") === "paged" ? "paged" : "continuous", params.get("page") || "cover", false);
  });

  var params = query();
  var initialView = params.get("view") || localStorage.getItem("multi-book-reader-view") || "continuous";
  setView(initialView === "paged" ? "paged" : "continuous", params.get("page") || "cover", false);
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initReader);
} else {
  initReader();
}
}());
`;
}
function addBookControlsToBookHtml(html, href, homeLink, bookSource, pageMap, bookId) {
    if (html.includes(CONTROLS_MARKER))
        return html;
    const marker = '<div id="toc" class="toc2">';
    const index = html.indexOf(marker);
    if (index === -1)
        throw new Error(`${bookId}: missing left TOC container`);
    const insertAt = index + marker.length;
    const controlsBlock = `
<style>
.multi-book-controls {
  margin: 0 0 1rem;
  padding-bottom: .75rem;
  border-bottom: 1px solid #e5e7eb;
}
.multi-book-home {
  color: #1f2937;
  display: block;
  font-weight: 600;
  line-height: 1.35;
  text-decoration: none;
}
.multi-book-home:hover {
  color: #0f766e;
  text-decoration: underline;
}
.multi-book-home span {
  color: #64748b;
  display: block;
  font-size: .78rem;
  font-weight: 400;
  margin-top: .15rem;
}
.multi-book-copy-source {
  appearance: none;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #1f2937;
  cursor: pointer;
  display: block;
  font-size: .82rem;
  font-weight: 600;
  line-height: 1.2;
  margin-top: .75rem;
  padding: .42rem .5rem;
  text-align: center;
  width: 100%;
}
.multi-book-copy-source:hover,
.multi-book-copy-source:focus {
  border-color: #0f766e;
  color: #0f766e;
}
.multi-book-copy-status {
  color: #64748b;
  display: block;
  font-size: .75rem;
  line-height: 1.35;
  margin-top: .4rem;
  min-height: 1em;
}
${readerStyles()}
</style>
<div class="multi-book-controls" ${CONTROLS_MARKER}>
  <a class="multi-book-home" ${HOME_MARKER} href="${escapeHtmlAttribute(href)}">${escapeHtmlAttribute(homeLink.label)}<span>${escapeHtmlAttribute(homeLink.subtitle)}</span></a>
  <button type="button" class="multi-book-copy-source" data-multi-book-source-copy>复制本书为纯文本</button>
  <span class="multi-book-copy-status" data-multi-book-source-status aria-live="polite"></span>
</div>
<script type="application/json" id="multi-book-source-data">${escapeJsonScript(bookSource)}</script>
<script type="application/json" id="multi-book-page-map">${escapeJsonValueForScript(pageMap)}</script>
<script>
(function () {
  var sourceElement = document.getElementById("multi-book-source-data");
  var button = document.querySelector("[data-multi-book-source-copy]");
  var status = document.querySelector("[data-multi-book-source-status]");
  if (!sourceElement || !button) return;

  var source = "";
  var fallbackMode = false;
  try {
    source = JSON.parse(sourceElement.textContent || '""');
  } catch (error) {
    if (status) status.textContent = "纯文本数据读取失败";
    button.disabled = true;
    return;
  }

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function openSourcePage() {
    var blob = new Blob([source], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    setStatus("已尝试打开纯文本页；如果没有出现，请允许弹出窗口后再试");
  }

  button.addEventListener("click", async function () {
    if (fallbackMode) {
      openSourcePage();
      return;
    }

    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(source);
      button.textContent = "已复制";
      setStatus("");
      setTimeout(function () { button.textContent = "复制本书为纯文本"; }, 1800);
    } catch (error) {
      fallbackMode = true;
      button.textContent = "打开纯文本页";
      openSourcePage();
    }
  });
}());
</script>`;
    const withReaderScript = `${controlsBlock}
<script>${readerScript()}</script>`;
    return `${html.slice(0, insertAt)}${withReaderScript}${html.slice(insertAt)}`;
}
async function addHomeLinks(rootDir, books, config) {
    const catalog = path.join(rootDir, "build", "html", "catalog.html");
    // 跨书 xref 在目标书的 label space 里找，所以先把每一本书都解析完。
    const readerData = new Map();
    for (const book of books) {
        readerData.set(book.bookId, await buildReaderBookData(config, book));
    }
    const bindingsByInput = new Map(books.map((book) => [book.input, { book, references: readerData.get(book.bookId).references }]));
    const anchorCache = new Map();
    for (const book of books) {
        const htmlFile = path.join(book.htmlOutputDir, "book.html");
        const href = path.relative(path.dirname(htmlFile), catalog);
        const data = readerData.get(book.bookId);
        const crossBookLinks = await bindCrossBookReferences(book, data.references, bindingsByInput, anchorCache);
        const html = rewriteCrossBookXrefs(rewriteBoundXrefs(await readFile(htmlFile, "utf8"), data.references.headingsByFragment), crossBookLinks);
        await writeFile(htmlFile, addBookControlsToBookHtml(html, href, config.homeLink, data.sourceBundle, data.pageMap, book.bookId), "utf8");
    }
}
async function writeRootIndex(rootDir, rootIndex) {
    const outputDir = path.join(rootDir, "build", "html");
    await mkdir(outputDir, { recursive: true });
    const redirectTo = rootIndex.redirectTo;
    await writeFile(path.join(outputDir, "index.html"), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${escapeHtmlAttribute(redirectTo)}">
  <title>${escapeHtmlAttribute(rootIndex.title)}</title>
</head>
<body>
  <p><a href="${escapeHtmlAttribute(redirectTo)}">${escapeHtmlAttribute(redirectTo)}</a></p>
</body>
</html>
`, "utf8");
}
function decodeUrlFragment(fragment) {
    try {
        return decodeURIComponent(fragment);
    }
    catch {
        return fragment;
    }
}
function htmlAnchors(html) {
    const anchors = new Set();
    for (const match of html.matchAll(HTML_ANCHOR_PATTERN))
        anchors.add(match[1]);
    return anchors;
}
async function anchorsForHtmlFile(filePath, cache) {
    const cached = cache.get(filePath);
    if (cached)
        return cached;
    const anchors = htmlAnchors(await readFile(filePath, "utf8"));
    cache.set(filePath, anchors);
    return anchors;
}
export async function buildWorkspace(rootDir = process.cwd()) {
    const catalog = path.join(rootDir, "catalog.adoc");
    if (!await existsFile(catalog))
        throw new Error(`missing catalog.adoc in ${rootDir}`);
    const books = await discoverBooks(rootDir);
    if (books.length === 0)
        throw new Error(`missing book.adoc entries in ${path.join(rootDir, "books")}`);
    const config = await loadRuntimeConfig(rootDir);
    const useKroki = await workspaceUsesDiagrams(rootDir, books);
    const fetchDiagrams = shouldFetchDiagrams();
    const extensionRegistry = await createExtensionRegistry(config, useKroki);
    await buildHtml(rootDir, books, extensionRegistry, useKroki, fetchDiagrams);
    await copyAssets(rootDir, books);
    await addHomeLinks(rootDir, books, config);
    await writeRootIndex(rootDir, config.rootIndex);
}
export async function cleanWorkspace(rootDir = process.cwd()) {
    await rm(path.join(rootDir, "build"), { force: true, recursive: true });
}
async function main() {
    const command = process.argv[2];
    if (command === "build") {
        await buildWorkspace();
        return;
    }
    if (command === "clean") {
        await cleanWorkspace();
        return;
    }
    console.error("Usage: node tools/adoc-books.mjs <build|clean>");
    process.exitCode = 1;
}
const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (executedPath === modulePath) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
