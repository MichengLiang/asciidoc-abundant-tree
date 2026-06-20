import { basename, isAbsolute, join, normalize, resolve } from "node:path";
import type { SourceIdentityApi } from "./source-identity";

export const nodeSourceIdentity: SourceIdentityApi = {
	normalize,
	resolve,
	isAbsolute,
	join,
	basename,
};
