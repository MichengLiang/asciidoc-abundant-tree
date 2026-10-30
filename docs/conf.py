"""Sphinx 宿主配置：docs/ 是 docparts 声明的项目的文档源目录，不读 TypeScript 源码。"""

project = "asciidoc-abundant-tree"
language = "zh_CN"

extensions = [
    "sphinx_copybutton",
    "docparts.headings",
    "docparts.sections",
    "docparts.reading",
    "docparts.trimblank",
]

html_theme = "sphinx_book_theme"
trimblank_keep_alnum_blank = True
nitpicky = True
# issues/ 是某个提交时刻的问题记录，形状由 docparts check 的 issues 一步检查，不参与构建。
# bookshelf/ 是 AsciiDoc 书架，由它自己的构建出 HTML；它还带着 node_modules，不让 Sphinx 去遍历。
exclude_patterns = ["issues/**", "bookshelf/**"]
