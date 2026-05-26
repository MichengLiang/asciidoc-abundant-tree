# asciidoc-abundant-tree Bookshelf

本目录承载 `asciidoc-abundant-tree` 的 AsciiDoc book 书稿。

## 目录结构

```text
catalog.adoc          # 书库入口
books/                # 每个一级子目录是一本文档书
shared/               # 跨书共享属性
scripts/              # 书库级构建脚本
package.json          # 书库构建依赖入口
```

## 当前书目

- `books/06-rdf12-line-projection/`：AsciiDoc `AbundantDocument` 到 RDF 1.2 行级结构图的投影规约。

## 运行

安装依赖：

```bash
pnpm install
```

运行脚本测试：

```bash
pnpm run test
```

构建 HTML：

```bash
pnpm run build
```

输出入口：

```text
build/html/catalog.html
```

当前书稿输出：

```text
build/html/books/06-rdf12-line-projection/book.html
```
