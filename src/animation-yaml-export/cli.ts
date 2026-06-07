#!/usr/bin/env node

import process from "node:process";
import { exportAnimationYaml } from "./export-animation-yaml";

export { exportAnimationYaml } from "./export-animation-yaml";

export type AnimationYamlCliResult = {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
};

const USAGE = `Usage:
  animation-yaml-export <book.adoc>
  animation-yaml-export <book.adoc> --document-root <root>
  animation-yaml-export --help`;

export function runAnimationYamlCli(args: string[]): AnimationYamlCliResult {
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

	try {
		const result = exportAnimationYaml({
			sourcePath: parsed.sourcePath,
			...(parsed.documentRoot === undefined
				? {}
				: { documentRoot: parsed.documentRoot }),
		});
		return {
			code: 0,
			stdout: result.yaml,
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

type ParsedArgs = {
	readonly help: boolean;
	readonly sourcePath?: string;
	readonly documentRoot?: string;
};

function parseArgs(args: string[]): ParsedArgs {
	let help = false;
	let sourcePath: string | undefined;
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
		if (arg === "--document-root") {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("-")) {
				throw new Error("--document-root requires a value");
			}
			documentRoot = value;
			index += 1;
			continue;
		}
		if (arg.startsWith("-")) {
			throw new Error(`Unknown argument: ${arg}`);
		}
		if (sourcePath === undefined) {
			sourcePath = arg;
			continue;
		}
		throw new Error(`Unexpected extra argument: ${arg}`);
	}

	return {
		help,
		...(sourcePath === undefined ? {} : { sourcePath }),
		...(documentRoot === undefined ? {} : { documentRoot }),
	};
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}

/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
	const result = runAnimationYamlCli(process.argv.slice(2));
	if (result.stdout) {
		process.stdout.write(result.stdout);
	}
	if (result.stderr) {
		process.stderr.write(
			result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`,
		);
	}
	process.exitCode = result.code;
}
/* c8 ignore end */
