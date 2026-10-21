import { resolve } from "node:path";
import type { IncludeProcessorDslInterface, Registry } from "@asciidoctor/core";
import type { IncludeResolver } from "../model";
import { constructionError } from "./diagnostics";
import { relativePathWithinDocumentRoot } from "./path-boundary";

// 解析器为一次 include 交回的来源，挂在官方 Reader 这一次推入上（见 ReaderPush）。
export type ResolvedInclude = {
	// directive 写下的完整目标，带前缀。
	readonly target: string;
	readonly absolutePath: string;
	readonly startLine: number;
	readonly lineCount: number;
};

export function claimingResolver(
	resolvers: readonly IncludeResolver[],
	target: string,
): IncludeResolver | undefined {
	return resolvers.find((resolver) => target.startsWith(resolver.prefix));
}

// 解析器只在官方 Reader 这一侧调用，一处 directive 一次：交回的文本推入 Reader，文件与起始行取自来源，游标因此落在
// 来源的真实行上。这一次推入的帧对象（includeStack 栈顶）记下来源，logical document 一侧按推入身份取用，
// 两侧读到的是同一份文本（10 号书「宿主登记的 include 解析器」）。
export function registerIncludeResolvers(
	registry: Registry,
	resolvers: readonly IncludeResolver[],
	documentRoot: string,
	resolutions: WeakMap<object, ResolvedInclude>,
): void {
	registry.includeProcessor(function (this: IncludeProcessorDslInterface) {
		this.handles(
			(target: string) => claimingResolver(resolvers, target) !== undefined,
		);
		this.process(async (_document, reader, target, attributes) => {
			const resolver = claimingResolver(resolvers, target);
			if (!resolver) {
				return;
			}
			const sourcePath = reader.getCursor().getFile() ?? "";
			const resolution = await resolveOrFail(
				resolver,
				target,
				attributes,
				sourcePath,
			);
			const absolutePath = resolve(documentRoot, resolution.origin.path);
			let relativePath: string;
			try {
				relativePath = relativePathWithinDocumentRoot(
					documentRoot,
					absolutePath,
				);
			} catch {
				throw constructionError(
					"include.outside-document-root",
					`Include resolver '${resolver.prefix}' returned a source outside documentRoot for include::${target}[] in ${sourcePath}: ${absolutePath}.`,
				);
			}
			// 末尾的换行是行的结束，不是多出来的一行：Reader 按 '\n' 切行，留着它会多切出一个空行。
			const text = resolution.text.replace(/\r?\n$/u, "");
			reader.pushInclude(
				text,
				absolutePath,
				relativePath,
				resolution.origin.startLine,
				attributes,
			);
			// 文本为空时 Reader 推入后立刻弹出，栈顶是外层的帧，不能记。
			const frame = reader.includeStack.at(-1);
			if (frame && text !== "") {
				resolutions.set(frame, {
					target,
					absolutePath,
					startLine: resolution.origin.startLine,
					lineCount: text.split(/\r?\n/u).length,
				});
			}
		});
	});
}

async function resolveOrFail(
	resolver: IncludeResolver,
	target: string,
	attributes: Record<string, string>,
	sourcePath: string,
) {
	try {
		return await resolver.resolve({
			target: target.slice(resolver.prefix.length),
			attributes,
			sourcePath,
		});
	} catch (error) {
		throw constructionError(
			"include.resolver-failed",
			`Include resolver '${resolver.prefix}' failed for include::${target}[] in ${sourcePath}: ${error instanceof Error ? error.message : String(error)}.`,
		);
	}
}
