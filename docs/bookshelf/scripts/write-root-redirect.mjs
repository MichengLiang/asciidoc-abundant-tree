import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function escapeHtml(value) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function bookTitleFromAdoc(source, bookId) {
	const titleLine = source.split(/\r?\n/).find((line) => /^=\s+\S/.test(line));
	if (!titleLine) return bookId;
	return titleLine.replace(/^=\s+/, "").trim();
}

export async function booksForWorkspace(rootDir) {
	const booksDir = path.join(rootDir, "books");
	const entries = await readdir(booksDir, { withFileTypes: true });
	const books = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const bookId = entry.name;
		const input = path.join(booksDir, bookId, "book.adoc");
		try {
			const inputStats = await stat(input);
			if (!inputStats.isFile()) continue;
			const source = await readFile(input, "utf8");
			books.push({
				id: bookId,
				title: bookTitleFromAdoc(source, bookId),
				href: `books/${bookId}/book.html`,
			});
		} catch {
			// A directory without book.adoc is not part of the published bookshelf.
		}
	}

	return books.sort((a, b) => a.id.localeCompare(b.id));
}

export function bookshelfHomeHtml(books) {
	const bookItems = books
		.map(
			(book) => `      <li class="book-card">
        <a href="${escapeHtml(book.href)}">
          <span class="book-id">${escapeHtml(book.id)}</span>
          <span class="book-title">${escapeHtml(book.title)}</span>
        </a>
      </li>`,
		)
		.join("\n");

	return `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>asciidoc-abundant-tree 书库</title>
  <style>
    :root {
      color-scheme: light;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
      color: #18212f;
      background: #f7f8fa;
    }
    body {
      margin: 0;
    }
    main {
      max-width: 1080px;
      margin: 0 auto;
      padding: 48px 24px 64px;
    }
    header {
      margin-bottom: 28px;
    }
    h1 {
      margin: 0;
      font-size: 2rem;
      line-height: 1.15;
      font-weight: 720;
    }
    .lede {
      max-width: 720px;
      margin: 12px 0 0;
      color: #4b5563;
      font-size: 1rem;
    }
    .catalog-link {
      display: inline-flex;
      align-items: center;
      margin-top: 18px;
      color: #0f766e;
      font-weight: 650;
      text-decoration: none;
    }
    .catalog-link:hover {
      text-decoration: underline;
    }
    .book-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .book-card {
      min-height: 142px;
      border: 1px solid #d9dee7;
      border-radius: 8px;
      background: #ffffff;
    }
    .book-card a {
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
      padding: 18px;
      color: inherit;
      text-decoration: none;
    }
    .book-card a:hover {
      border-radius: 8px;
      box-shadow: 0 8px 24px rgb(15 23 42 / 10%);
      outline: 2px solid #99f6e4;
      outline-offset: -2px;
    }
    .book-id {
      color: #64748b;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: .82rem;
      overflow-wrap: anywhere;
    }
    .book-title {
      margin-top: 12px;
      font-size: 1.05rem;
      font-weight: 680;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>asciidoc-abundant-tree 书库</h1>
      <p class="lede">这里是项目的公开文档入口。每个书籍目录对应一份独立的 AsciiDoc book 构建产物。</p>
      <a class="catalog-link" href="catalog.html">打开 AsciiDoc catalog</a>
    </header>
    <ol class="book-grid">
${bookItems}
    </ol>
  </main>
</body>
</html>
`;
}

export async function writeBookshelfHome(
	rootDir,
	workspaceDir = process.cwd(),
) {
	const books = await booksForWorkspace(workspaceDir);
	await mkdir(rootDir, { recursive: true });
	await writeFile(path.join(rootDir, "index.html"), bookshelfHomeHtml(books));
}

async function main() {
	const rootDir = path.resolve(process.argv[2] ?? "build/html");
	const workspaceDir = path.resolve(process.argv[3] ?? process.cwd());
	await writeBookshelfHome(rootDir, workspaceDir);
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);

if (executedPath === modulePath) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
