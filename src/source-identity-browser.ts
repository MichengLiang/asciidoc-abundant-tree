import type { SourceIdentityApi } from "./source-identity";

export const browserSourceIdentity: SourceIdentityApi = {
	normalize: normalizeBrowserSourceIdentity,
	resolve: normalizeBrowserSourceIdentity,
	isAbsolute: isAbsoluteBrowserSourceIdentity,
	join: joinBrowserSourceIdentity,
	basename: basenameBrowserSourceIdentity,
};

function normalizeBrowserSourceIdentity(path: string): string {
	if (path === "") {
		return ".";
	}
	const normalizedSeparatorPath = path.replaceAll("\\", "/");
	const prefix = sourceIdentityPrefix(normalizedSeparatorPath);
	const trailingSlash =
		normalizedSeparatorPath.endsWith("/") && normalizedSeparatorPath !== "/";
	const segments = normalizedSeparatorPath
		.slice(prefix && prefix !== "/" ? prefix.length : 0)
		.split("/");
	const output: string[] = [];
	for (const segment of segments) {
		if (segment === "" || segment === ".") {
			continue;
		}
		if (segment === "..") {
			const previous = output.at(-1);
			if (previous && previous !== "..") {
				output.pop();
				continue;
			}
			if (!prefix) {
				output.push(segment);
			}
			continue;
		}
		output.push(segment);
	}
	const body = output.join("/");
	const normalized =
		prefix === "/"
			? `/${body}`
			: prefix
				? `${prefix}${body ? `/${body}` : ""}`
				: body || ".";
	return trailingSlash && normalized !== "/" ? `${normalized}/` : normalized;
}

function joinBrowserSourceIdentity(...paths: string[]): string {
	const joined = paths.filter((path) => path.length > 0).join("/");
	return normalizeBrowserSourceIdentity(joined);
}

function basenameBrowserSourceIdentity(path: string): string {
	const normalized = normalizeBrowserSourceIdentity(path);
	if (normalized === "/" || normalized.endsWith(":/")) {
		return "";
	}
	const withoutTrailingSlash = normalized.replace(/\/+$/, "");
	return withoutTrailingSlash.split("/").at(-1) ?? "";
}

function isAbsoluteBrowserSourceIdentity(path: string): boolean {
	return path.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(path);
}

function sourceIdentityPrefix(path: string): string {
	const windowsDrive = /^[A-Za-z]:/u.exec(path)?.[0];
	if (windowsDrive) {
		return windowsDrive;
	}
	return path.startsWith("/") ? "/" : "";
}
