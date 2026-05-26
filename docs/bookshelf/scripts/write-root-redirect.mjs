import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function rootRedirectHtml(target) {
  return `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${target}">
  <title>AsciiDoc AbundantDocument 到 RDF 1.2 行级结构图投影规约</title>
  <link rel="canonical" href="${target}">
</head>
<body>
  <p><a href="${target}">打开 RDF 1.2 行级结构图投影规约</a></p>
</body>
</html>
`;
}

export async function writeRootRedirect(rootDir, target) {
  await mkdir(rootDir, { recursive: true });
  await writeFile(path.join(rootDir, "index.html"), rootRedirectHtml(target));
}

async function main() {
  const rootDir = path.resolve(process.argv[2] ?? "build/html");
  const target = process.argv[3] ?? "books/06-rdf12-line-projection/book.html";
  await writeRootRedirect(rootDir, target);
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);

if (executedPath === modulePath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
