#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import type { OutputFormat } from "./model";
import { parseAbundantTree } from "./parser";
import { formatAbundantTree, serializeAbundantTreeToJson } from "./serializers";

export type CliResult = {
	code: number;
	stdout: string;
	stderr: string;
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
			stdout: "",
			stderr: formatError(error),
		};
	}

	if (parsed.help) {
		return {
			code: 0,
			stdout: USAGE,
			stderr: "",
		};
	}

	if (parsed.sourcePath === undefined) {
		return {
			code: 1,
			stdout: "",
			stderr: `${USAGE}\n\nMissing input file.`,
		};
	}

	const inputPath = resolve(parsed.sourcePath);

	if (!existsSync(inputPath)) {
		return {
			code: 1,
			stdout: "",
			stderr: `Input file not found: ${parsed.sourcePath}`,
		};
	}

	try {
		const document = parseAbundantTree({
			sourcePath: inputPath,
		});
		return {
			code: 0,
			stdout:
				parsed.format === "json"
					? `${JSON.stringify(serializeAbundantTreeToJson(document), null, 2)}\n`
					: `${formatAbundantTree(document)}\n`,
			stderr: "",
		};
	} catch (error) {
		return {
			code: 1,
			stdout: "",
			stderr: formatError(error),
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
				throw new Error(`Unsupported format: ${next}. Expected tree or json.`);
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
	if (result.stdout) {
		process.stdout.write(
			result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`,
		);
	}
	if (result.stderr) {
		process.stderr.write(
			result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`,
		);
	}
	process.exitCode = result.code;
}
