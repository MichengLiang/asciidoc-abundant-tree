#!/usr/bin/env node

import { existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import process from "node:process";
import { rdf12 } from "./index";
import type { OutputFormat, ParseAbundantTreeOptions } from "./model";
import { parseAbundantTree } from "./parser";
import { formatAbundantTree, serializeAbundantTreeToJson } from "./serializers";

type CliOutputFormat = OutputFormat | "rdf12" | "rdf12-json-ld";
type CliMode = "single-file" | "book-entry";

export type CliResult = {
	code: number;
	stdout: string;
	stderr: string;
};

const USAGE = `Usage:
  asciidoc-abundant-tree <file.adoc> [--json]
  asciidoc-abundant-tree <file.adoc> [--format tree|json|rdf12|rdf12-json-ld]
  asciidoc-abundant-tree <file.adoc> [--mode single-file|book-entry]
  asciidoc-abundant-tree <file.adoc> [--document-root <root>]
  asciidoc-abundant-tree --help

Default mode is single-file. In book-entry mode, --document-root is the relativePath basis and path boundary; when omitted it defaults to the current working directory. JSON is a machine-friendly projection of the same TypeScript document model. RDF 1.2 output is available as Turtle text or JSON-LD.`;

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
	const documentRoot = resolve(parsed.documentRoot ?? process.cwd());

	if (parsed.mode !== "book-entry" && !existsSync(inputPath)) {
		return {
			code: 1,
			stdout: "",
			stderr: `Input file not found: ${parsed.sourcePath}`,
		};
	}

	try {
		if (
			parsed.mode === "book-entry" &&
			isOutsideRoot(documentRoot, inputPath)
		) {
			return {
				code: 1,
				stdout: "",
				stderr: `Input source path is outside documentRoot: ${inputPath}`,
			};
		}
		if (
			isRdf12Format(parsed.format) &&
			isOutsideRoot(documentRoot, inputPath)
		) {
			return {
				code: 1,
				stdout: "",
				stderr: `Input source path is outside document root: ${inputPath}`,
			};
		}
		const document = parseAbundantTree(
			parserOptions(parsed, inputPath, documentRoot),
		);
		if (parsed.format === "rdf12") {
			const projection = rdf12(document, { documentRoot });
			return {
				code: 0,
				stdout: projection.ttl,
				stderr: "",
			};
		}
		if (parsed.format === "rdf12-json-ld") {
			const projection = rdf12(document, { documentRoot });
			return {
				code: 0,
				stdout: projection.jsonLd,
				stderr: "",
			};
		}
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
	format: CliOutputFormat;
	mode: CliMode;
	documentRoot: string | undefined;
} {
	let help = false;
	let sourcePath: string | undefined;
	let format: CliOutputFormat = "tree";
	let mode: CliMode = "single-file";
	let documentRoot: string | undefined;

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
			requireOptionValue(next, "--format");
			if (
				next !== "tree" &&
				next !== "json" &&
				next !== "rdf12" &&
				next !== "rdf12-json-ld"
			) {
				throw new Error(
					`Unsupported format: ${next}. Expected tree, json, rdf12, or rdf12-json-ld.`,
				);
			}
			format = next;
			index += 1;
			continue;
		}

		if (arg === "--mode") {
			const next = args[index + 1];
			requireOptionValue(next, "--mode");
			if (next !== "single-file" && next !== "book-entry") {
				throw new Error(
					`Unsupported mode: ${next}. Expected single-file or book-entry.`,
				);
			}
			mode = next;
			index += 1;
			continue;
		}

		if (arg === "--document-root") {
			const next = args[index + 1];
			requireOptionValue(next, "--document-root");
			documentRoot = next;
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

	return { help, sourcePath, format, mode, documentRoot };
}

function requireOptionValue(
	value: string | undefined,
	optionName: string,
): asserts value is string {
	if (!value || value.startsWith("-")) {
		throw new Error(`${optionName} requires a value`);
	}
}

function parserOptions(
	parsed: ReturnType<typeof parseArgs>,
	inputPath: string,
	documentRoot: string,
): ParseAbundantTreeOptions {
	if (parsed.mode === "book-entry") {
		return {
			sourcePath: inputPath,
			mode: "book-entry",
			documentRoot,
		};
	}
	return {
		sourcePath: inputPath,
		mode: "single-file",
	};
}

function isRdf12Format(format: CliOutputFormat): boolean {
	return format === "rdf12" || format === "rdf12-json-ld";
}

function isOutsideRoot(documentRoot: string, sourcePath: string): boolean {
	const relativePath = relative(documentRoot, sourcePath);
	return relativePath === ".." || relativePath.startsWith(`..${sep}`);
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "Unknown error";
}

/* c8 ignore start */
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
/* c8 ignore end */
