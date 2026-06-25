import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url);
const casesDir = new URL("cases/", root);
const rootPath = fileURLToPath(root);
const casesPath = fileURLToPath(casesDir);
const requiredDirs = ["source", "projection", "model", "reports", "views"];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else {
      files.push(path);
    }
  }
  return files.sort();
}

const caseNames = (await readdir(casesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const report = [];
for (const caseName of caseNames) {
  const caseDir = join(casesPath, caseName);
  const missingDirs = [];
  for (const dirName of requiredDirs) {
    if (!(await exists(join(caseDir, dirName)))) {
      missingDirs.push(dirName);
    }
  }

  const files = await listFiles(caseDir);
  const relFiles = files.map((file) => relative(rootPath, file));
  const projectionFiles = relFiles.filter((file) => file.startsWith(`cases/${caseName}/projection/`));
  const hasTurtle = projectionFiles.some((file) => file.endsWith(".ttl"));
  const hasJsonLd = projectionFiles.some((file) => file.endsWith(".jsonld"));

  report.push({
    case: caseName,
    missingDirs,
    projection: {
      turtle: hasTurtle,
      jsonld: hasJsonLd,
      files: projectionFiles
    },
    fileCount: relFiles.length
  });
}

const failing = report.filter((entry) => entry.missingDirs.length > 0 || !entry.projection.turtle || !entry.projection.jsonld);
const outputPath = join(rootPath, "cases", "reports.case-inventory.json");
await writeFile(outputPath, `${JSON.stringify({ cases: report }, null, 2)}\n`);

if (failing.length > 0) {
  console.error(JSON.stringify({ failing }, null, 2));
  process.exitCode = 1;
} else {
  const summary = await readFile(outputPath, "utf8");
  console.log(summary);
}
