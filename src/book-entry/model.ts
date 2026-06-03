import type { LineTable } from "../source-lines";

export type LineOrigin = {
	readonly logicalLine: number;
	readonly absolutePath: string;
	readonly relativePath: string;
	readonly sourceLine: number;
};

export type SourceFileRecord = {
	readonly absolutePath: string;
	readonly relativePath: string;
	readonly text: string;
	readonly lineTable: LineTable;
};

export type LogicalSource = {
	readonly entryPath: string;
	readonly documentRoot: string;
	readonly logicalText: string;
	readonly lineOrigins: readonly LineOrigin[];
	readonly sourceFiles: readonly SourceFileRecord[];
};

export type BuildLogicalSourceOptions = {
	readonly sourcePath: string;
	readonly documentRoot: string;
	readonly readFile?: (absolutePath: string) => string;
};
