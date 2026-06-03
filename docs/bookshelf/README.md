# asciidoc-abundant-tree Bookshelf

本目录承载 `asciidoc-abundant-tree` 的 AsciiDoc book 书稿。

公开 HTML 入口：

```text
https://michengliang.github.io/asciidoc-abundant-tree/
```

## 目录结构

```text
catalog.adoc          # 书库入口
books/                # 每个一级子目录是一本文档书
shared/               # 跨书共享属性
scripts/              # 书库级构建脚本
package.json          # 书库构建依赖入口
```

## 当前书目

- `books/06-rdf12-line-projection/`：AsciiDoc 标题切片到 RDF 1.2 标题投影图的规约。
- `books/07-rdf12-heading-projection-implementation-plan/`：RDF 1.2 标题投影图实现计划书。
- `books/08-body-lab-material-system/`：`100_body` 与 `200_lab` 书籍化项目材料体系设计。

公开书页：

```text
https://michengliang.github.io/asciidoc-abundant-tree/books/06-rdf12-line-projection/book.html
```

## 运行

安装依赖：

```bash
pnpm install
```

运行脚本测试：

```bash
pnpm run test
```

生成单文件 ADOC：

```bash
pnpm run build:adoc
```

构建全部产物：

```bash
pnpm run build
```

输出入口：

```text
build/adoc/catalog.adoc
build/html/index.html
build/html/catalog.html
```

当前书稿输出：

```text
build/adoc/books/06-rdf12-line-projection.adoc
build/adoc/books/07-rdf12-heading-projection-implementation-plan.adoc
build/adoc/books/08-body-lab-material-system.adoc
build/html/books/06-rdf12-line-projection/book.html
build/html/books/07-rdf12-heading-projection-implementation-plan/book.html
build/html/books/08-body-lab-material-system/book.html
```

`build/adoc/` 是纯文本投影。它展开书稿 include，保留图片宏和跨书 xref 的文本语义，不复制图片资源。
