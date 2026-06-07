import { parse as parseYaml } from "yaml";

export type ExportWarning = {
	readonly code: string;
	readonly node?: string;
	readonly message: string;
};

export function parsePayloadRaw(input: {
	readonly payloadId: string;
	readonly format?: string;
	readonly raw?: string;
	readonly warnings: ExportWarning[];
}): unknown {
	if (input.raw === undefined) {
		return undefined;
	}

	const format = input.format?.toLowerCase();

	try {
		if (format === "json") {
			return JSON.parse(input.raw) as unknown;
		}
		if (format === "yaml" || format === "yml") {
			return parseYaml(input.raw) as unknown;
		}
		input.warnings.push({
			code: "payload_format_unsupported",
			node: input.payloadId,
			message: `Unsupported payload format: ${input.format ?? "unknown"}`,
		});
		return { raw: input.raw };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		input.warnings.push({
			code: "payload_parse_failed",
			node: input.payloadId,
			message: `Failed to parse ${format ?? "unknown"} payload: ${message}`,
		});
		return {
			raw: input.raw,
			parse_error: message,
		};
	}
}
