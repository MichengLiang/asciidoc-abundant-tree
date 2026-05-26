#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import type { OutputFormat } from "./model";
import { parseAbundantTree } from "./parser";
import { formatAbundantTree, serializeAbundantTreeToJson } from "./serializers";

export type CliResult = {
	code: number;
	output: string;
};

const USAGE = `Usage:
  asciidoc-abundant-tree <file.adoc> [--json]
  asciidoc-abundant-tree <file.adoc> [--format tree|json]
  asciidoc-abundant-tree --help

Default output is pretty text. JSON is a machine-friendly projection of the same TypeScript document model.`;

export function runCli(args: string[]): CliResult {
	let parsed: ReturnType<typeof parseArgs>;

	try {
		parsed = parseArgs(args);
	} catch (error) {
		return {
			code: 1,
			output: formatError(error),
		};
	}

	if (parsed.help) {
		return {
			code: 0,
			output: USAGE,
		};
	}

	if (parsed.sourcePath === undefined) {
		return {
			code: 1,
			output: `${USAGE}\n\nMissing input file.`,
		};
	}

	const inputPath = resolve(parsed.sourcePath);

	if (!existsSync(inputPath)) {
		return {
			code: 1,
			output: `Input file not found: ${parsed.sourcePath}`,
		};
	}

	try {
		const document = parseAbundantTree({
			sourcePath: inputPath,
		});
		return {
			code: 0,
			output:
				parsed.format === "json"
					? `${JSON.stringify(serializeAbundantTreeToJson(document), null, 2)}\n`
					: `${formatAbundantTree(document)}\n`,
		};
	} catch (error) {
		return {
			code: 1,
			output: formatError(error),
		};
	}
}

function parseArgs(args: string[]): {
	help: boolean;
	sourcePath: string | undefined;
	format: OutputFormat;
} {
	let help = false;
	let sourcePath: string | undefined;
	let format: OutputFormat = "tree";

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === undefined) {
			continue;
		}

		if (arg === "--help" || arg === "-h") {
			help = true;
			continue;
		}

		if (arg === "--json") {
			format = "json";
			continue;
		}

		if (arg === "--format") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("--format requires a value");
			}
			if (next !== "tree" && next !== "json") {
				throw new Error(`Unsupported format: ${next}`);
			}
			format = next;
			index += 1;
			continue;
		}

		if (arg.startsWith("-")) {
			throw new Error(`Unknown argument: ${arg}`);
		}

		if (!sourcePath) {
			sourcePath = arg;
			continue;
		}

		throw new Error(`Unexpected extra argument: ${arg}`);
	}

	return { help, sourcePath, format };
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "Unknown error";
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const result = runCli(process.argv.slice(2));
	if (result.output) {
		process.stdout.write(
			result.output.endsWith("\n") ? result.output : `${result.output}\n`,
		);
	}
	process.exitCode = result.code;
}
