import { readFile } from "node:fs/promises";

const [version] = process.argv.slice(2);

if (!version) {
	console.error("Usage: node scripts/release-notes.mjs <version>");
	process.exit(1);
}

const changelog = await readFile(
	new URL("../CHANGELOG.md", import.meta.url),
	"utf8",
);
const heading = `## ${version} - `;
const start = changelog.indexOf(heading);

if (start === -1) {
	console.error(`Could not find changelog entry for ${version}`);
	process.exit(1);
}

const section = changelog.slice(start);
const nextHeadingOffset = section.slice(1).search(/\n## /);
const releaseNotes =
	nextHeadingOffset === -1 ? section : section.slice(0, nextHeadingOffset + 1);

process.stdout.write(`${releaseNotes.trim()}\n`);
