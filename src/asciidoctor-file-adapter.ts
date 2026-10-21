import {
	Extensions,
	loadFile,
	type PreprocessorReader,
} from "@asciidoctor/core";
import {
	type AsciidoctorAdapter,
	type AsciidoctorBlock,
	createAsciidoctorAdapter,
	createExtensionRegistry,
} from "./asciidoctor-adapter";
import {
	type ResolvedInclude,
	registerIncludeResolvers,
} from "./book-entry/include-resolvers";
import type { ReaderLineCursor } from "./book-entry/line-origin-model";
import type { IncludeResolver } from "./model";

// 只在 Node 上用的这一层：从文件加载（single-file）与逐行读官方 Reader 的预处理输出（book-entry）。
// 与 asciidoctor-adapter.ts 分开，因为 4.x 的浏览器构建不导出 loadFile。

export type OfficialReaderLine = {
	readonly text: string;
	readonly cursor: ReaderLineCursor;
	readonly push: ReaderPush;
};

// 这一行出自官方 Reader 的哪一次推入。include 每展开一次，Reader 就把当时的状态压进 includeStack，压进去的
// 帧对象每次都是新的，所以以栈顶帧的身份区分推入：紧挨着两次引入同一个文件也分得开，leveloffset 补的前后
// 两行也落在这次推入里。行号不能拿来分界：一次推入的行号从首条选中行逐行累加，选取有空隙时就对不上源行。
// depth 是 includeStack 的深度，根文档为 0、id 为 0。
// 宿主登记的解析器认领的 include，推入上带着解析器交回的来源。
export type ReaderPush = {
	readonly id: number;
	readonly depth: number;
	readonly resolved?: ResolvedInclude;
};

export type AsciidoctorFileAdapter = AsciidoctorAdapter & {
	loadFile(sourcePath: string): Promise<AsciidoctorBlock>;
	readPreprocessedLines(options: {
		readonly sourcePath: string;
		readonly baseDir: string;
		readonly attributes?: Record<string, unknown> | undefined;
		readonly includeResolution?: {
			readonly resolvers: readonly IncludeResolver[];
			readonly documentRoot: string;
		};
	}): Promise<readonly OfficialReaderLine[]>;
};

export function createAsciidoctorFileAdapter(): AsciidoctorFileAdapter {
	const extensionRegistry = createExtensionRegistry();
	return {
		...createAsciidoctorAdapter(extensionRegistry),
		async loadFile(sourcePath) {
			const document = await loadFile(sourcePath, {
				safe: "secure",
				sourcemap: true,
				to_file: false,
				extension_registry: extensionRegistry,
			});
			return document as unknown as AsciidoctorBlock;
		},
		async readPreprocessedLines(options) {
			const resolutions = new WeakMap<object, ResolvedInclude>();
			const registry = Extensions.create();
			if (options.includeResolution) {
				registerIncludeResolvers(
					registry,
					options.includeResolution.resolvers,
					options.includeResolution.documentRoot,
					resolutions,
				);
			}
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
				extension_registry: registry,
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
				const resolved = frame ? resolutions.get(frame) : undefined;
				lines.push({
					text,
					cursor: cursorForReturnedReaderLine(before, after),
					push: {
						id: frame ? (pushIds.get(frame) ?? 0) : 0,
						depth: stack.length,
						...(resolved ? { resolved } : {}),
					},
				});
			}
			return lines;
		},
	};
}

function readerCursorEvidence(
	cursor: ReturnType<PreprocessorReader["getCursor"]>,
): ReaderLineCursor {
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
