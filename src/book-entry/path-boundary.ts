import { relative, resolve, sep } from "node:path";
import { constructionError } from "./diagnostics";

export function normalizeDocumentRoot(documentRoot: string): string {
	return resolve(documentRoot);
}

export function resolveEntryPath(sourcePath: string): string {
	return resolve(sourcePath);
}

export function resolveIncludeTarget(
	containingFilePath: string,
	targetPath: string,
): string {
	return resolve(containingFilePath, "..", targetPath);
}

export function relativePathWithinDocumentRoot(
	documentRoot: string,
	absolutePath: string,
): string {
	const normalizedRoot = normalizeDocumentRoot(documentRoot);
	const normalizedPath = resolve(absolutePath);
	const relativePath = relative(normalizedRoot, normalizedPath);
	if (
		relativePath === "" ||
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		relativePath.includes(`${sep}..${sep}`) ||
		relativePath.startsWith(`${sep}`)
	) {
		throw constructionError(
			"include.outside-document-root",
			`Resolved include path is outside documentRoot: ${normalizedPath}.`,
		);
	}
	return toPortableRelativePath(relativePath);
}

function toPortableRelativePath(value: string): string {
	return value.split(sep).join("/");
}
