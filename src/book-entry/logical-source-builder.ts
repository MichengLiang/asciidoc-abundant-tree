import { existsSync, readFileSync } from "node:fs";
import { buildLineTable } from "../source-lines";
import { constructionError } from "./diagnostics";
import { parseIncludeDirective } from "./include-resolution";
import type {
	BuildLogicalSourceOptions,
	LineOrigin,
	LogicalSource,
	SourceFileRecord,
} from "./model";
import { registerLogicalSourceForRecovery } from "./origin-coordinate";
import {
	normalizeDocumentRoot,
	relativePathWithinDocumentRoot,
	resolveEntryPath,
	resolveIncludeTarget,
} from "./path-boundary";

type BuilderState = {
	readonly documentRoot: string;
	readonly readFile: (absolutePath: string) => string;
	readonly sourceFilesByPath: Map<string, SourceFileRecord>;
	readonly logicalLines: string[];
	readonly lineOrigins: LineOrigin[];
};

export function buildLogicalSource(
	options: BuildLogicalSourceOptions,
): LogicalSource {
	const documentRoot = normalizeDocumentRoot(options.documentRoot);
	const entryPath = resolveEntryPath(options.sourcePath);
	relativePathWithinDocumentRoot(documentRoot, entryPath);
	const state: BuilderState = {
		documentRoot,
		readFile: options.readFile ?? defaultReadFile,
		sourceFilesByPath: new Map(),
		logicalLines: [],
		lineOrigins: [],
	};

	appendSourceFile(entryPath, state, []);
	const logicalSource: LogicalSource = {
		entryPath,
		documentRoot,
		logicalText: state.logicalLines.join("\n"),
		lineOrigins: state.lineOrigins,
		sourceFiles: [...state.sourceFilesByPath.values()],
	};
	assertLogicalDocumentInvariants(logicalSource);
	registerLogicalSourceForRecovery(logicalSource);
	return logicalSource;
}

export function assertLogicalDocumentInvariants(
	logicalSource: LogicalSource,
): void {
	const logicalLineCount = logicalSource.logicalText.split(/\r?\n/u).length;
	if (logicalLineCount !== logicalSource.lineOrigins.length) {
		throw constructionError(
			"logical-line-origin.count-mismatch",
			`Logical line count ${logicalLineCount} does not match line origin count ${logicalSource.lineOrigins.length}.`,
		);
	}

	const sourceFilesByPath = new Map(
		logicalSource.sourceFiles.map((file) => [file.absolutePath, file]),
	);
	for (const origin of logicalSource.lineOrigins) {
		const sourceFile = sourceFilesByPath.get(origin.absolutePath);
		if (!sourceFile) {
			throw constructionError(
				"line-origin.source-file-missing",
				`Line origin references a source file missing from source file table: ${origin.absolutePath}.`,
			);
		}
		if (
			origin.sourceLine < 1 ||
			origin.sourceLine > sourceFile.lineTable.lines.length
		) {
			throw constructionError(
				"line-origin.source-line-out-of-range",
				`Line origin sourceLine ${origin.sourceLine} is outside origin file line table for ${origin.relativePath}.`,
			);
		}
	}
}

export function originForLogicalLine(
	logicalSource: LogicalSource,
	logicalLine: number,
): LineOrigin | undefined {
	return logicalSource.lineOrigins[logicalLine - 1];
}

function appendSourceFile(
	absolutePath: string,
	state: BuilderState,
	includeStack: readonly string[],
): void {
	if (includeStack.includes(absolutePath)) {
		throw constructionError(
			"include.cycle",
			`Include graph contains a cycle at ${absolutePath}.`,
		);
	}

	const sourceFile = readSourceFileRecord(absolutePath, state);
	const nextStack = [...includeStack, absolutePath];
	for (const line of sourceFile.lineTable.lines) {
		const directive = parseIncludeDirective(sourceFile.lineTable, line.number);
		if (directive.kind === "ordinary") {
			appendLogicalLine(sourceFile, line.text, line.number, state);
			continue;
		}

		const includePath = resolveIncludeTarget(absolutePath, directive.target);
		relativePathWithinDocumentRoot(state.documentRoot, includePath);
		appendSourceFile(includePath, state, nextStack);
	}
}

function appendLogicalLine(
	sourceFile: SourceFileRecord,
	text: string,
	sourceLine: number,
	state: BuilderState,
): void {
	const logicalLine = state.logicalLines.length + 1;
	state.logicalLines.push(text);
	state.lineOrigins.push({
		logicalLine,
		absolutePath: sourceFile.absolutePath,
		relativePath: sourceFile.relativePath,
		sourceLine,
	});
}

function readSourceFileRecord(
	absolutePath: string,
	state: BuilderState,
): SourceFileRecord {
	const existing = state.sourceFilesByPath.get(absolutePath);
	if (existing) {
		return existing;
	}

	const relativePath = relativePathWithinDocumentRoot(
		state.documentRoot,
		absolutePath,
	);
	const text = readSourceText(absolutePath, state.readFile);
	const sourceFile: SourceFileRecord = {
		absolutePath,
		relativePath,
		text,
		lineTable: buildLineTable(text),
	};
	state.sourceFilesByPath.set(absolutePath, sourceFile);
	return sourceFile;
}

function readSourceText(
	absolutePath: string,
	readFile: (absolutePath: string) => string,
): string {
	try {
		return readFile(absolutePath);
	} catch {
		throw constructionError(
			"include.missing-target",
			`Include target file does not exist: ${absolutePath}.`,
		);
	}
}

function defaultReadFile(absolutePath: string): string {
	if (!existsSync(absolutePath)) {
		throw constructionError(
			"include.missing-target",
			`Include target file does not exist: ${absolutePath}.`,
		);
	}
	return readFileSync(absolutePath, "utf8");
}
