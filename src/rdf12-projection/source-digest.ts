import { createHash } from "node:crypto";

export type SourceDigestInput = {
	readonly sourceText?: string;
	readonly sourceDigest?: string;
};

export function normalizeSourceDigest(
	input: SourceDigestInput,
): string | undefined {
	if (input.sourceDigest !== undefined) {
		return input.sourceDigest;
	}

	if (input.sourceText !== undefined) {
		return `sha256:${createHash("sha256").update(input.sourceText).digest("hex")}`;
	}

	return undefined;
}
