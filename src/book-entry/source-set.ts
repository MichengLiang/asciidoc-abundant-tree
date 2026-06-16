import { existsSync, readFileSync } from "node:fs";
import { buildLineTable } from "../source-lines";
import type { SourceFileRecord } from "./line-origin-model";
import {
	normalizeDocumentRoot,
	relativePathWithinDocumentRoot,
} from "./path-boundary";

export type SourceSet = {
	readonly documentRoot: string;
	registerFile(absolutePath: string): SourceFileRecord;
	maybeRegisterFile(absolutePath: string): SourceFileRecord | undefined;
	records(): readonly SourceFileRecord[];
};

export function createSourceSet(options: {
	readonly documentRoot: string;
	readonly readFile?: (absolutePath: string) => string;
}): SourceSet {
	const documentRoot = normalizeDocumentRoot(options.documentRoot);
	const readFile =
		options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
	const byPath = new Map<string, SourceFileRecord>();

	function registerFile(absolutePath: string): SourceFileRecord {
		const relativePath = relativePathWithinDocumentRoot(
			documentRoot,
			absolutePath,
		);
		const existing = byPath.get(absolutePath);
		if (existing) {
			return existing;
		}
		const text = readFile(absolutePath);
		const record = {
			absolutePath,
			relativePath,
			text,
			lineTable: buildLineTable(text),
		};
		byPath.set(absolutePath, record);
		return record;
	}

	return {
		documentRoot,
		registerFile,
		maybeRegisterFile(absolutePath) {
			if (!existsSync(absolutePath)) {
				return undefined;
			}
			return registerFile(absolutePath);
		},
		records() {
			return [...byPath.values()];
		},
	};
}
