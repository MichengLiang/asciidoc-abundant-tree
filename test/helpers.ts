import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = new URL("..", import.meta.url).pathname;
const fixtureRoot = join(projectRoot, "tmp/test-fixtures");

export function writeFixture(name: string, source: string): string {
	mkdirSync(fixtureRoot, { recursive: true });
	const path = join(fixtureRoot, name);
	writeFileSync(path, source, "utf8");
	return path;
}
