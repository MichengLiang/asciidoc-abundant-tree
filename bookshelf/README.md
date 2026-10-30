# asciidoc-abundant-tree 书库

这里是 aat 的设计、思想与论证：规约、实现计划与指南，一本书一个目录。教程、操作指南、API 参考这类项目文档在
`docs/`，由 Sphinx 写成；两边各占一坑。

公开入口：<https://michengliang.github.io/asciidoc-abundant-tree/>

## 书目

- `books/06-rdf12-line-projection/`：AsciiDoc 标题切片到 RDF 1.2 标题投影图的规约。
- `books/07-rdf12-heading-projection-implementation-plan/`：RDF 1.2 标题投影图实现计划书。
- `books/08-body-lab-material-system/`：`100_body` 与 `200_lab` 书籍化项目材料体系设计。
- `books/09-asciidoc-abundant-tree-parser-spec/`：解析器规约。
- `books/10-book-entry-source-mapped-logical-document/`：书稿入口回源逻辑文档规约。
- `books/11-book-entry-source-mapped-logical-document-implementation-plan/`：书稿入口回源逻辑文档实现计划书。
- `books/12-asciidoc-abundant-tree-guide/`：用书稿构建可查询知识图谱的指南。

## 由工作区模板构建

书库是 [create-asciidoc-multi-book-workspace](https://github.com/MichengLiang/asciidoc-multi-book-workspace)
生成的标准书库：`tools/adoc-books.mjs` 是模板 runtime 的副本，`adoc-books.config.mjs` 只写书库首页的标题与回目录的
链接文字。runtime 用 aat 投影每本书，按 aat 的绑定检查每一处引用，并把 HTML 里的链接接到 aat 绑定的标题上：
标题原文、`::` 限定地址这样的引用，Asciidoctor 自己的 HTML 认不出，在这里照样是通的。

书库是 aat 这个 pnpm 工作区的成员，依赖写作 `workspace:*`：投影书的就是仓库里当前的 aat。aat 改了投影，书里的
引用随 `pnpm check` 的末尾（`pnpm check:books`）重新核对一遍。

## 运行

在仓库根：

```bash
pnpm install
pnpm build                       # 书库用的是 aat 的 dist
pnpm --dir bookshelf run check   # 引用、锚点、include 与本地资源
pnpm --dir bookshelf run build   # build/html/index.html
```

模板 runtime 更新时，用新版初始化器生成一个临时书库，把它的 `tools/adoc-books.mjs` 拷过来。
