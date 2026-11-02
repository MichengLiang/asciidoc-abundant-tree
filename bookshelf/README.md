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
链接文字。runtime 只初始化与渲染（模板 0.7.0 起）：它用 aat 投影每本书，一处引用恰好对上一节时，把 HTML 里的链接
接到那一节上，标题原文、`::` 限定地址这样的引用，Asciidoctor 自己的 HTML 认不出，在这里照样是通的；对上零节或几节的
链接照 Asciidoctor 写下的样子留着，构建不报。构建只在做不出页面时失败。

书里的引用对不对，归读投影的工具：workbench 的 bookgraph。`.bookgraph/config.toml` 列着这七本书，
`bookgraph.audit("micheng-ts/projects/asciidoc-abundant-tree")` 审全部书的书内与跨书引用，报出绑不上与对上几节的。
改书、改投影的提交都要过它：推进 aat 的 hora 计划时，把它与 `pnpm check` 一起挂在 `before_commit` 上，书里两组
非空就挡下。GitHub 上没有 bookgraph，CI 与 Pages 只构建书库，不审引用。

书库是 aat 这个 pnpm 工作区的成员，依赖写作 `workspace:*`：投影书的就是仓库里当前的 aat。`pnpm check` 的末尾
（`pnpm build:books`）用它把书库构建一遍：aat 改了投影，书库还渲染得出来。

## 书的结构

书照工作区模板的书籍结构写，不另立规矩。模板的规矩写在它的样书 00 号《完整书籍结构标本》与它的 `DESIGN.adoc`
（Shared Attributes、Sample Front Matter、Sample Back Matter）、`docs/guides/part-numbering.adoc` 里；它们与
《芝加哥手册》对书的划分一致，Asciidoctor 的 book 文档类型也照这个划分设特殊节：一本书分前置内容、正文、后附内容，
部是正文内部的划分，附录、术语表、参考文献、索引属于后附，不属于哪一部。落到这七本书上：

- 文档头：`book.adoc` 的书名、作者、版本三行之后紧接 `include::../../shared/attributes.adoc[]`，不留空行（空行结束
  文档头，只在文档头生效的属性就不生效了）。书库共有的属性在 `shared/attributes.adoc` 写一次，包括附录的 caption
  “附录”；只属于一本书的写在 include 之后，盖过共有的。
- 部：标题只写部讲什么，不写“第一部”这样的序号；有部的书在自己的文档头写 `:partnums:` 与 `:part-signifier: Part`，
  编号由 Asciidoctor 生成（Part I、Part II），目录与正文一致，调换顺序也不会错号。
- 前置内容：只用 book 的前置样式 `[colophon]`、`[dedication]`、`[preface]`、`[acknowledgments]`。书名、作者、
  版本在文档头，书名页由转换器生成，不写半书名页、标题页这样的节；版权与出版信息写在 `[colophon]`。书没有摘要
  （`[abstract]` 属于 article，在 book 里会成为编了号的一章）；一本书覆盖什么、怎样读，写在前言里。引言是论述的
  起点时，作为正文第一部的第一章。
- 后附内容：有部的书里，附录、术语表、参考文献、索引的标题写成 `=`，与各部并列（Asciidoctor 把它们调成第 1 级，
  仍与各部并列）；写成 `==` 就成了最后一部里的一章。它们的第一级小节写 `===`：在 `=` 的附录下写 `==`，小节会离开
  附录、成为编了号的章。样式按内容取：术语表是 `[glossary]`，参考文献是 `[bibliography]`，索引是 `[index]`，
  其余才是 `[appendix]`。附录标题不写“附录 A”，字母由 Asciidoctor 按顺序加。

## 运行

在仓库根：

```bash
pnpm install
pnpm build                       # 书库用的是 aat 的 dist
pnpm --dir bookshelf run build   # build/html/index.html
```

模板 runtime 更新时，用新版初始化器生成一个临时书库，把它的 `tools/adoc-books.mjs` 拷过来。
