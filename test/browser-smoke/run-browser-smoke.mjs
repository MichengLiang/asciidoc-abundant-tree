import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const listenAsync = promisify((server, callback) =>
	server.listen(0, "127.0.0.1", callback),
);
const closeAsync = promisify((server, callback) => server.close(callback));
const workspaceRoot = process.cwd();
const smokeRoot = "tmp/browser-smoke";
const appRoot = `${smokeRoot}/app`;
const distRoot = `${smokeRoot}/dist`;
const fixture = `= 浏览器解析夹具

[#source.policy, status=active, owner=docs]
== 来源节点

priority:: high
summary::
来源节点说明第一行。
来源节点说明第二行。

来源节点引用 xref:target.rule[目标节点, rel=requires, weight=0.7]。

[#target.rule, status=draft]
== 目标节点

[#target-json]
[source,json]
----
{"kind":"rule","status":"draft"}
----
`;

await main();

async function main() {
	assertDistExists();
	await writeSmokeApp();
	const buildOutput = await buildSmokeApp();
	assertNoNodeExternalizationWarnings(buildOutput);
	await runChromiumSmoke();
	console.log("browser smoke ok");
}

function assertDistExists() {
	const requiredFiles = ["dist/browser.mjs", "dist/browser.d.mts"];
	const missing = requiredFiles.filter((path) => !existsSync(path));
	if (missing.length > 0) {
		throw new Error(
			`browser smoke requires built browser package files. Missing: ${missing.join(", ")}. Run \`pnpm build\` first.`,
		);
	}
}

async function writeSmokeApp() {
	await rm(smokeRoot, { recursive: true, force: true });
	await mkdir(appRoot, { recursive: true });
	await writeFile(
		`${appRoot}/index.html`,
		`<!doctype html>
<html lang="zh-CN">
	<head>
		<meta charset="UTF-8" />
		<title>browser smoke</title>
	</head>
	<body>
		<main id="status">pending</main>
		<script type="module" src="./main.js"></script>
	</body>
</html>
`,
	);
	await writeFile(
		`${appRoot}/main.js`,
		`import { parseAbundantTreeFromSource } from "asciidoc-abundant-tree/browser";

const fixture = ${JSON.stringify(fixture)};

try {
	const abundantDocument = parseAbundantTreeFromSource({
		sourceText: fixture,
		sourcePath: "fixture.adoc",
	});
	const sections = abundantDocument.children
		.filter((node) => node.kind === "section")
		.map((section) => ({
			title: section.title,
			ids: section.ids,
			metadata: section.metadata ?? [],
			descriptionMetadata: section.descriptionMetadata,
		}));
	const sourceSection = sections.find((section) => section.title === "来源节点");
	const xref = abundantDocument.xrefOccurrences[0];
	window.__BROWSER_SMOKE_RESULT__ = {
		kind: abundantDocument.kind,
		mode: abundantDocument.mode,
		title: abundantDocument.title?.text,
		sectionCount: sections.length,
		xrefCount: abundantDocument.xrefOccurrences.length,
		targetCount: abundantDocument.targets.length,
		sourceSection,
		xref: xref
			? {
					attributes: xref.attributes,
					containingSectionId: xref.containingSectionId,
					sourceSpan: xref.sourceSpan,
				}
			: undefined,
	};
	document.querySelector("#status").textContent = "ok";
} catch (error) {
	window.__BROWSER_SMOKE_ERROR__ =
		error instanceof Error ? error.stack : String(error);
	document.querySelector("#status").textContent = "error";
	throw error;
}
`,
	);
	await writeFile(
		`${smokeRoot}/vite.config.mjs`,
		`export default {
	base: "./",
	root: "tmp/browser-smoke/app",
	build: {
		outDir: "../dist",
		emptyOutDir: true,
	},
};
`,
	);
}

async function buildSmokeApp() {
	try {
		const { stdout, stderr } = await execFileAsync(
			"pnpm",
			["exec", "vite", "build", "--config", `${smokeRoot}/vite.config.mjs`],
			{
				cwd: workspaceRoot,
				maxBuffer: 1024 * 1024 * 20,
			},
		);
		return `${stdout}${stderr}`;
	} catch (error) {
		const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
		throw new Error(`browser smoke Vite build failed.\n${output}`);
	}
}

function assertNoNodeExternalizationWarnings(output) {
	const forbiddenPatterns = [
		/externalized for browser compatibility/u,
		/node:fs/u,
		/node:path/u,
		/node:crypto/u,
		/node:process/u,
	];
	const matched = forbiddenPatterns.find((pattern) => pattern.test(output));
	if (matched) {
		throw new Error(
			`browser smoke Vite build emitted forbidden dependency warning matching ${matched}.\n${output}`,
		);
	}
}

async function runChromiumSmoke() {
	const server = await serveDist();
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const pageErrors = [];
	const consoleErrors = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") {
			consoleErrors.push(message.text());
		}
	});
	try {
		await page.goto(`${server.origin}/index.html`);
		try {
			await page.waitForFunction(
				() => window.__BROWSER_SMOKE_RESULT__ !== undefined,
			);
		} catch (error) {
			assertNoBrowserRuntimeErrors(pageErrors, consoleErrors);
			throw error;
		}
		const pageThrownError = await page.evaluate(
			() => window.__BROWSER_SMOKE_ERROR__,
		);
		if (pageThrownError) {
			throw new Error(
				`browser smoke page threw during parse.\n${pageThrownError}`,
			);
		}
		assertNoBrowserRuntimeErrors(pageErrors, consoleErrors);
		const result = await page.evaluate(() => window.__BROWSER_SMOKE_RESULT__);
		assertSmokeResult(result);
	} finally {
		await browser.close();
		await server.close();
	}
}

async function serveDist() {
	const root = resolve(workspaceRoot, distRoot);
	const server = createServer(async (request, response) => {
		try {
			const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
			const pathname =
				requestUrl.pathname === "/"
					? "/index.html"
					: decodeURIComponent(requestUrl.pathname);
			const filePath = resolve(root, `.${pathname}`);
			if (filePath !== root && !filePath.startsWith(`${root}/`)) {
				response.writeHead(403);
				response.end("Forbidden");
				return;
			}
			const body = await import("node:fs/promises").then(({ readFile }) =>
				readFile(filePath),
			);
			response.writeHead(200, {
				"content-type": contentTypeForPath(filePath),
			});
			response.end(body);
		} catch {
			response.writeHead(404);
			response.end("Not found");
		}
	});
	await listenAsync(server);
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("browser smoke static server did not expose a TCP port.");
	}
	return {
		origin: `http://127.0.0.1:${address.port}`,
		close: () => closeAsync(server),
	};
}

function contentTypeForPath(path) {
	switch (extname(path)) {
		case ".html":
			return "text/html; charset=utf-8";
		case ".js":
			return "text/javascript; charset=utf-8";
		default:
			return "application/octet-stream";
	}
}

function assertNoBrowserRuntimeErrors(pageErrors, consoleErrors) {
	if (pageErrors.length > 0 || consoleErrors.length > 0) {
		throw new Error(
			[
				"browser smoke page emitted runtime errors.",
				...pageErrors.map((error) => `pageerror: ${error}`),
				...consoleErrors.map((error) => `console.error: ${error}`),
			].join("\n"),
		);
	}
}

function assertSmokeResult(result) {
	assertEqual(result?.kind, "document", "document kind");
	assertEqual(result?.mode, "single-file", "document mode");
	assertEqual(result?.title, "浏览器解析夹具", "document title");
	assertAtLeast(result?.sectionCount, 2, "section count");
	assertAtLeast(result?.xrefCount, 1, "xref occurrence count");
	assertAtLeast(result?.targetCount, 2, "target count");
	const metadata = result?.sourceSection?.metadata?.[0];
	assertIncludes(result?.sourceSection?.ids, "source", "source section ids");
	assertIncludes(metadata?.ids, "source", "source section metadata ids");
	assertIncludes(metadata?.roles, "policy", "source section metadata roles");
	assertEqual(
		metadata?.attributes?.status,
		"active",
		"source section status metadata",
	);
	assertEqual(
		metadata?.attributes?.owner,
		"docs",
		"source section owner metadata",
	);
	assertEqual(result?.xref?.attributes?.rel, "requires", "xref rel attribute");
	if (
		result?.xref?.attributes?.weight !== "0.7" &&
		result?.xref?.attributes?.weight !== 0.7
	) {
		throw new Error(
			`Expected xref weight attribute to be "0.7" or 0.7, got ${JSON.stringify(result?.xref?.attributes?.weight)}.`,
		);
	}
	assertEqual(
		result?.xref?.containingSectionId,
		"source",
		"xref containing section",
	);
	if (!Number.isInteger(result?.xref?.sourceSpan?.start?.line)) {
		throw new Error("Expected xref sourceSpan.start.line to be an integer.");
	}
	assertAtLeast(
		result.xref.sourceSpan.start.line,
		1,
		"xref sourceSpan.start.line",
	);
}

function assertEqual(actual, expected, label) {
	if (actual !== expected) {
		throw new Error(
			`Expected ${label} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
		);
	}
}

function assertAtLeast(actual, expected, label) {
	if (typeof actual !== "number" || actual < expected) {
		throw new Error(
			`Expected ${label} to be at least ${expected}, got ${JSON.stringify(actual)}.`,
		);
	}
}

function assertIncludes(actual, expected, label) {
	if (!Array.isArray(actual) || !actual.includes(expected)) {
		throw new Error(
			`Expected ${label} to include ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
		);
	}
}
