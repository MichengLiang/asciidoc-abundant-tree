import { createHash } from "node:crypto";
import path from "node:path";

export type PathCoordinateInput = {
	readonly documentRoot: string;
	readonly sourcePath: string;
};

export type PathCoordinate = {
	readonly documentRoot: string;
	readonly sourcePath: string;
	readonly relativePath: string;
	readonly documentKey: string;
};

export function computePathCoordinate(
	input: PathCoordinateInput,
): PathCoordinate {
	const paths = selectPathApi(input.documentRoot, input.sourcePath);
	const documentRoot = paths.resolve(input.documentRoot);
	const sourcePath = paths.resolve(input.sourcePath);
	const relativePath = paths.relative(documentRoot, sourcePath);

	if (relativePath === "" || paths.isAbsolute(relativePath)) {
		throw new Error(`sourcePath is outside documentRoot: ${input.sourcePath}`);
	}

	const slashRelativePath = relativePath.split(paths.sep).join("/");

	if (slashRelativePath.split("/").includes("..")) {
		throw new Error(`sourcePath is outside documentRoot: ${input.sourcePath}`);
	}

	return {
		documentRoot,
		sourcePath,
		relativePath: slashRelativePath,
		documentKey: computeDocumentKey(slashRelativePath),
	};
}

export function computeDocumentKey(relativePath: string): string {
	return createHash("sha256").update(relativePath).digest("hex");
}

function selectPathApi(
	documentRoot: string,
	sourcePath: string,
): typeof path.posix {
	if (
		/[A-Za-z]:[\\/]/u.test(documentRoot) ||
		/[A-Za-z]:[\\/]/u.test(sourcePath)
	) {
		return path.win32;
	}
	return path;
}
