import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "../..");
const repoRoot = resolve(appRoot, "../..");
const screenshotPath = resolve(
	repoRoot,
	"tmp/projection-teacher-typing-e2e.png",
);

const source = `= 浏览器输入体验

[#draft.process, status=draft, owner=ux]
== 起草流程

priority:: high
summary::
用户在左侧输入时，右侧图谱应该稳定更新。

起草流程要求 xref:review.rule[审核规则, rel=requires, weight=0.9]。

[#review.rule, status=active]
== 审核规则

审核规则说明 xref:evidence.note[证据说明, rel=documents]。

[#evidence.note]
== 证据说明

证据说明也引用 xref:draft.process[]。
`;

const port = await findFreePort();
const server = spawn(
	"pnpm",
	[
		"--dir",
		appRoot,
		"exec",
		"vite",
		"--host",
		"127.0.0.1",
		"--port",
		String(port),
	],
	{
		cwd: appRoot,
		stdio: ["ignore", "pipe", "pipe"],
	},
);

let output = "";
server.stdout.on("data", (chunk) => {
	output += chunk.toString();
});
server.stderr.on("data", (chunk) => {
	output += chunk.toString();
});

try {
	await waitForServerReady(port);
	await runBrowserCheck(`http://127.0.0.1:${port}/`);
} finally {
	server.kill("SIGTERM");
}

async function runBrowserCheck(url) {
	await mkdir(dirname(screenshotPath), { recursive: true });
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({
		viewport: { width: 1440, height: 1000 },
	});
	const consoleErrors = [];
	const pageErrors = [];
	page.on("console", (message) => {
		if (message.type() === "error") {
			consoleErrors.push(message.text());
		}
	});
	page.on("pageerror", (error) => {
		pageErrors.push(error.message);
	});

	await page.goto(url, { waitUntil: "networkidle" });
	await page.waitForSelector(".react-flow__node", { timeout: 10000 });

	const initialDiagnostics = await visibleDiagnostics(page);
	const textarea = page.getByLabel("AsciiDoc source");
	await textarea.fill("");
	for (const chunk of source.split("\n\n")) {
		await textarea.pressSequentially(`${chunk}\n\n`, { delay: 2 });
		await page.waitForTimeout(120);
	}
	await page.waitForTimeout(900);

	const result = await page.evaluate(() => {
		const cards = [...document.querySelectorAll(".teaching-node")].map(
			(element) => {
				const rect = element.getBoundingClientRect();
				return {
					text: element.textContent?.slice(0, 80) ?? "",
					left: rect.left,
					right: rect.right,
					top: rect.top,
					bottom: rect.bottom,
				};
			},
		);
		return {
			diagnostics: [...document.querySelectorAll(".graph-pane__header li")].map(
				(element) => element.textContent ?? "",
			),
			sectionNodeCount: document.querySelectorAll(".teaching-node").length,
			edgeLabelCount: document.querySelectorAll(".teaching-edge-label").length,
			edgeCount: document.querySelectorAll(".react-flow__edge").length,
			edgeLabelText: [...document.querySelectorAll(".teaching-edge-label")].map(
				(element) => element.textContent ?? "",
			),
			edgeLabelDistances: [
				...document.querySelectorAll(".teaching-edge-label"),
			].map((label) => {
				const edgeId = label.getAttribute("data-edge-id");
				const path = edgeId
					? document.querySelector(
							`.react-flow__edge[data-id="${CSS.escape(edgeId)}"] path`,
						)
					: null;
				if (!path) {
					return { edgeId, distance: Number.POSITIVE_INFINITY };
				}
				const labelRect = label.getBoundingClientRect();
				const center = {
					x: labelRect.left + labelRect.width / 2,
					y: labelRect.top + labelRect.height / 2,
				};
				const length = path.getTotalLength();
				let distance = Number.POSITIVE_INFINITY;
				for (
					let offset = 0;
					offset <= length;
					offset += Math.max(length / 48, 1)
				) {
					const point = path.getPointAtLength(offset);
					const screenPoint = point.matrixTransform(path.getScreenCTM());
					distance = Math.min(
						distance,
						Math.hypot(center.x - screenPoint.x, center.y - screenPoint.y),
					);
				}
				return { edgeId, distance };
			}),
			graphPane: rectFor(document.querySelector(".graph-pane")),
			cards,
		};

		function rectFor(element) {
			if (!element) {
				return null;
			}
			const rect = element.getBoundingClientRect();
			return {
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
			};
		}
	});

	const collisions = findCollisions(result.cards);
	const clippedCards = findClippedCards(result.cards, result.graphPane);
	await page.screenshot({ path: screenshotPath, fullPage: true });
	await browser.close();

	assertNoRuntimeErrors(pageErrors, consoleErrors);
	assertNoHiddenParserWarning(initialDiagnostics);
	assertNoHiddenParserWarning(result.diagnostics);
	assertCounts(result);
	assertCleanEdgeCards(result);
	assertEdgeLabelsStayOnPaths(result.edgeLabelDistances);
	if (collisions.length > 0) {
		throw new Error(`Card collisions detected: ${JSON.stringify(collisions)}`);
	}
	if (clippedCards.length > 0) {
		throw new Error(
			`Cards clipped by graph viewport: ${JSON.stringify(clippedCards)}`,
		);
	}

	console.log(
		JSON.stringify(
			{
				sectionNodeCount: result.sectionNodeCount,
				edgeLabelCount: result.edgeLabelCount,
				edgeCount: result.edgeCount,
				diagnostics: result.diagnostics,
				screenshotPath,
			},
			null,
			2,
		),
	);
}

async function visibleDiagnostics(page) {
	return page.evaluate(() =>
		[...document.querySelectorAll(".graph-pane__header li")].map(
			(element) => element.textContent ?? "",
		),
	);
}

function assertNoRuntimeErrors(pageErrors, consoleErrors) {
	if (pageErrors.length > 0 || consoleErrors.length > 0) {
		throw new Error(
			`Browser runtime errors: ${JSON.stringify({ pageErrors, consoleErrors })}`,
		);
	}
}

function assertNoHiddenParserWarning(diagnostics) {
	if (
		diagnostics.some((diagnostic) =>
			diagnostic.includes("official-block-context.unknown"),
		)
	) {
		throw new Error(
			`Internal parser diagnostic leaked to UI: ${JSON.stringify(diagnostics)}`,
		);
	}
}

function assertCounts(result) {
	if (
        result.sectionNodeCount !== 3 ||
        result.edgeLabelCount !== 2 ||
        result.edgeCount !== 3
	) {
		throw new Error(`Unexpected graph counts: ${JSON.stringify(result)}`);
	}
}

function assertCleanEdgeCards(result) {
	const leakedFields = ["rel", "sourceLine", "sourceColumn"];
	const leaked = result.edgeLabelText.filter((text) =>
		leakedFields.some((field) => text.includes(field)),
	);
	if (leaked.length > 0) {
		throw new Error(
			`Internal edge fields leaked to labels: ${JSON.stringify(leaked)}`,
		);
	}
}

function assertEdgeLabelsStayOnPaths(distances) {
	const detached = distances.filter((entry) => entry.distance > 18);
	if (detached.length > 0) {
		throw new Error(
			`Edge labels detached from paths: ${JSON.stringify(detached)}`,
		);
	}
}

function findCollisions(cards) {
	const collisions = [];
	for (let first = 0; first < cards.length; first += 1) {
		for (let second = first + 1; second < cards.length; second += 1) {
			if (overlaps(cards[first], cards[second])) {
				collisions.push([cards[first].text, cards[second].text]);
			}
		}
	}
	return collisions;
}

function findClippedCards(cards, graphPane) {
	if (!graphPane) {
		return ["missing graph pane"];
	}
	const inset = 8;
	return cards
		.filter(
			(card) =>
				card.left < graphPane.left + inset ||
				card.right > graphPane.right - inset ||
				card.top < graphPane.top + inset ||
				card.bottom > graphPane.bottom - inset,
		)
		.map((card) => card.text);
}

function overlaps(first, second) {
	const padding = 4;
	return !(
		first.right + padding <= second.left ||
		second.right + padding <= first.left ||
		first.bottom + padding <= second.top ||
		second.bottom + padding <= first.top
	);
}

async function waitForServerReady(port) {
	const started = Date.now();
	while (Date.now() - started < 15000) {
		if (output.includes(`http://127.0.0.1:${port}/`)) {
			return;
		}
		if (server.exitCode !== null) {
			throw new Error(`Vite exited before ready:\n${output}`);
		}
		await new Promise((resolveReady) => setTimeout(resolveReady, 100));
	}
	throw new Error(`Timed out waiting for Vite:\n${output}`);
}

async function findFreePort() {
	return new Promise((resolvePort, reject) => {
		const probe = createServer();
		probe.on("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const address = probe.address();
			probe.close(() => {
				if (typeof address === "object" && address) {
					resolvePort(address.port);
					return;
				}
				reject(new Error("Unable to allocate a local port."));
			});
		});
	});
}
