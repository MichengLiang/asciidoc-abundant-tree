```markdown
# ADOC -> DocBook -> LaTeX -> PDF 操作指南

本文说明如何把一本 AsciiDoc / ADOC 书稿，通过官方 Asciidoctor.js DocBook 后端转换为 DocBook，再由 Pandoc 转为 LaTeX，最后用 LaTeX 编译为 PDF。

这条链路适用于当前项目这种 Node / pnpm / Asciidoctor.js 生态：源文档是 `.adoc`，项目已经使用 `@asciidoctor/core` 做 AsciiDoc 处理，希望保留书籍结构后再进入 LaTeX 出版流程。

核心链路是：

```text
AsciiDoc (.adoc)
-> Asciidoctor.js + @asciidoctor/docbook-converter
-> DocBook 5 XML
-> Pandoc DocBook reader
-> LaTeX
-> latexmk / xelatex
-> PDF
```

> 本文写于书架使用 `@asciidoctor/core` 3.x 的时候。4.x 内置 `docbook5` 后端，不必安装 `@asciidoctor/docbook-converter`（它要求 core 低于 4），转换时直接给 `backend: 'docbook5'`；`convertFile` 等接口在 4.x 上是具名导出并返回 Promise。

不要把 HTML 当成出版中间层。HTML 是浏览器展示目标，不是这条链路里的正式出版中间格式。正式中间层应使用 DocBook。

## 1. 准备依赖

进入书架项目目录：

```bash
cd /home/t103o/workbench/projects/seekmoon/bookshelf
```

确认当前项目使用 pnpm：

```bash
pnpm --version
```

安装官方 DocBook converter：

```bash
pnpm add -D @asciidoctor/docbook-converter@3.0.0
```

当前项目已有 `@asciidoctor/core@3.0.4` 时，`@asciidoctor/docbook-converter@3.0.0` 是匹配的，因为它要求：

```text
@asciidoctor/core >= 3.0 < 4.0
```

安装后，`package.json` 中应出现：

```json
{
  "devDependencies": {
    "@asciidoctor/core": "^3.0.4",
    "@asciidoctor/docbook-converter": "3.0.0"
  }
}
```

实际版本号以项目锁文件为准。

## 2. 建立构建目录

推荐把 DocBook、LaTeX、PDF 和日志都放在 `build/` 下，不写回源书目录。

```bash
mkdir -p build/docbook/08-package-reuse-ecosystem
mkdir -p build/latex-docbook/08-package-reuse-ecosystem
mkdir -p build/tmp/pdf-render-check/08-package-reuse-ecosystem-docbook
```

推荐目录结构：

```text
build/
├── docbook/
│   └── 08-package-reuse-ecosystem/
│       ├── book.xml
│       └── asciidoctor-docbook.log
├── latex-docbook/
│   └── 08-package-reuse-ecosystem/
│       ├── book.tex
│       ├── book.pdf
│       ├── compile-check.log
│       └── pandoc-docbook-header.tex
└── tmp/
    └── pdf-render-check/
        └── 08-package-reuse-ecosystem-docbook/
```

## 3. 使用官方 DocBook 后端生成 DocBook XML

创建一个临时 Node 调用，使用 Asciidoctor.js API 注册 DocBook converter。

关键规则：

1. 先实例化 Asciidoctor。
2. 再注册 `@asciidoctor/docbook-converter`。
3. 转换时使用 `backend: 'docbook5'`。
4. 输出路径使用绝对路径或以项目根为基准明确控制，避免写到源书目录。

命令：

```bash
node --input-type=module <<'EOF' > build/docbook/08-package-reuse-ecosystem/asciidoctor-docbook.log 2>&1
import path from 'node:path';
import asciidoctorFactory from '@asciidoctor/core';
import docbookConverter from '@asciidoctor/docbook-converter';

const asciidoctor = asciidoctorFactory();
docbookConverter.register();

const outputFile = path.resolve('build/docbook/08-package-reuse-ecosystem/book.xml');

const loggerManager = asciidoctor.LoggerManager;
const defaultLogger = loggerManager.getLogger();
const memoryLogger = asciidoctor.MemoryLogger.create();
loggerManager.setLogger(memoryLogger);

try {
  asciidoctor.convertFile('books/08-package-reuse-ecosystem/book.adoc', {
    safe: 'unsafe',
    base_dir: 'books/08-package-reuse-ecosystem',
    backend: 'docbook5',
    doctype: 'book',
    standalone: true,
    to_file: outputFile,
    mkdirs: true,
    attributes: {
      sectnums: '',
      partnums: '',
      toclevels: '3'
    }
  });
} finally {
  loggerManager.setLogger(defaultLogger);
}

for (const message of memoryLogger.getMessages()) {
  const severity = typeof message.getSeverity === 'function' ? message.getSeverity() : 'UNKNOWN';
  const text = typeof message.getMessage === 'function' ? message.getMessage() : String(message);
  console.log(`${severity}: ${text}`);
}

console.log(`docbook=${outputFile}`);
EOF
```

确认输出文件存在：

```bash
test -f build/docbook/08-package-reuse-ecosystem/book.xml && echo ok
```

查看 DocBook 文件头：

```bash
bat --line-range 1:40 build/docbook/08-package-reuse-ecosystem/book.xml
```

应看到类似结构：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<book xmlns="http://docbook.org/ns/docbook" version="5.0">
  <info>
    <title>包复用生态：发现、管理与评价尺度</title>
    ...
  </info>
  ...
</book>
```

这一步完成后，ADOC 已经进入 DocBook 5 书籍结构。

## 4. 检查 DocBook 结构

如果系统有 `xmllint`，可以先做 XML well-formed 检查：

```bash
xmllint --noout build/docbook/08-package-reuse-ecosystem/book.xml
```

如果没有 `xmllint`，可以使用 Python 标准库解析：

```bash
uv run python <<'EOF'
from pathlib import Path
import xml.etree.ElementTree as ET

path = Path('build/docbook/08-package-reuse-ecosystem/book.xml')
root = ET.parse(path).getroot()
ns = {'db': 'http://docbook.org/ns/docbook'}

print('well_formed=yes')
print('root_tag=' + root.tag)
print('parts=' + str(len(root.findall('.//db:part', ns))))
print('chapters=' + str(len(root.findall('.//db:chapter', ns))))
print('sections=' + str(len(root.findall('.//db:section', ns))))
print('tables=' + str(len(root.findall('.//db:table', ns)) + len(root.findall('.//db:informaltable', ns))))
print('links=' + str(len(root.findall('.//db:link', ns)) + len(root.findall('.//db:xref', ns))))
print('appendices=' + str(len(root.findall('.//db:appendix', ns))))
print('bibliography=' + str(len(root.findall('.//db:bibliography', ns))))
print('index=' + str(len(root.findall('.//db:index', ns))))
EOF
```

对当前这本书，已确认结构计数为：

```text
well_formed=yes
root_tag={http://docbook.org/ns/docbook}book
parts=7
chapters=29
sections=43
tables=32
links=236
appendices=4
bibliography=1
index=1
```

这个结果说明 DocBook 后端没有只是生成一个空壳 XML，而是保留了书籍结构、章节、表格、链接、附录、参考文献和索引。

## 5. 准备 LaTeX header

为 Pandoc 生成的 LaTeX 提供基础中文和断行支持。创建：

```bash
cat > build/latex-docbook/08-package-reuse-ecosystem/pandoc-docbook-header.tex <<'EOF'
\usepackage{ragged2e}
\usepackage{xurl}
\usepackage{fvextra}
\fvset{breaklines=true,breakanywhere=true}
\setlength{\emergencystretch}{3em}
\renewcommand{\arraystretch}{1.18}
\newcolumntype{L}[1]{>{\RaggedRight\arraybackslash}p{#1}}
EOF
```

如果项目要求完整控制字体、页眉页脚、横向表格、索引格式等，应把这些内容放在出版模板或 header 文件中，不要修改 ADOC 源文档来迁就某一次 PDF 编译。

## 6. 使用 Pandoc 从 DocBook 生成 LaTeX

命令：

```bash
pandoc build/docbook/08-package-reuse-ecosystem/book.xml \
  --from docbook --to latex \
  --standalone \
  --toc --toc-depth=3 \
  --metadata title='包复用生态：发现、管理与评价尺度' \
  --metadata author='弥澄亮' \
  --metadata date='2026-06' \
  --variable documentclass=ctexbook \
  --variable classoption=oneside \
  --variable papersize=a4 \
  --variable geometry:margin=2.2cm \
  --variable fontsize=10pt \
  --variable colorlinks=true \
  --include-in-header=build/latex-docbook/08-package-reuse-ecosystem/pandoc-docbook-header.tex \
  --output build/latex-docbook/08-package-reuse-ecosystem/book.tex
```

确认 LaTeX 文件生成：

```bash
test -f build/latex-docbook/08-package-reuse-ecosystem/book.tex && echo ok
```

检查 LaTeX 开头：

```bash
bat --line-range 1:160 build/latex-docbook/08-package-reuse-ecosystem/book.tex
```

应看到：

```latex
\documentclass[..., a4paper, oneside]{ctexbook}
...
\title{包复用生态：发现、管理与评价尺度}
\author{弥澄亮}
\date{2026-06}
...
\begin{document}
\frontmatter
\maketitle
\tableofcontents
\mainmatter
```

这一步完成后，DocBook 已经进入 LaTeX 出版层。

## 7. 使用 latexmk / xelatex 编译 PDF

编译命令必须把日志写入文件，不直接把完整 LaTeX 日志刷到终端。

```bash
latexmk -C \
  -outdir=build/latex-docbook/08-package-reuse-ecosystem \
  build/latex-docbook/08-package-reuse-ecosystem/book.tex \
  > build/latex-docbook/08-package-reuse-ecosystem/clean.log 2>&1 || true

latexmk -xelatex \
  -file-line-error \
  -interaction=nonstopmode \
  -halt-on-error \
  -outdir=build/latex-docbook/08-package-reuse-ecosystem \
  build/latex-docbook/08-package-reuse-ecosystem/book.tex \
  > build/latex-docbook/08-package-reuse-ecosystem/compile-check.log 2>&1

code=$?
printf 'compile_exit=%s log=build/latex-docbook/08-package-reuse-ecosystem/compile-check.log pdf=build/latex-docbook/08-package-reuse-ecosystem/book.pdf\n' "$code"
exit "$code"
```

当前这本书已确认编译结果：

```text
compile_exit=0
pdf=build/latex-docbook/08-package-reuse-ecosystem/book.pdf
log=build/latex-docbook/08-package-reuse-ecosystem/compile-check.log
```

## 8. 检查 PDF 元数据

```bash
pdfinfo build/latex-docbook/08-package-reuse-ecosystem/book.pdf | rg 'Title|Author|Pages|Page size|File size|PDF version'
```

当前确认结果：

```text
Title:           包复用生态：发现、管理与评价尺度
Author:          弥澄亮
Pages:           58
Page size:       595.28 x 841.89 pts (A4)
File size:       372621 bytes
PDF version:     1.7
```

这说明 PDF 文件存在、可读取、元数据正常、页面尺寸为 A4。

## 9. 检查 LaTeX 日志

硬错误检查：

```bash
rg -n 'LaTeX Error|Emergency stop|Fatal|Undefined control sequence|Missing \$|^!' \
  build/latex-docbook/08-package-reuse-ecosystem/book.log
```

引用和文件缺失检查：

```bash
rg -n 'Reference undefined|Citation undefined|File .* not found|Label\(s\) may have changed|Rerun to get cross-references right' \
  build/latex-docbook/08-package-reuse-ecosystem/book.log
```

排版警告检查：

```bash
rg -n 'Overfull \\hbox|Underfull \\hbox|Overfull \\vbox|Underfull \\vbox' \
  build/latex-docbook/08-package-reuse-ecosystem/book.log
```

当前确认结果：

```text
LaTeX Error: none
Emergency stop: none
Fatal: none
Undefined control sequence: none
Reference undefined: none
Citation undefined: none
File not found: none
```

存在 Underfull hbox 警告。这类警告通常来自表格窄列、长英文标识、中英混排、短行断行等。它不影响“链路是否成立”的判断，但如果要做发布级 PDF，需要单独处理表格设计和版式策略。

## 10. 抽页检查 PDF 是否可渲染

```bash
rm -rf build/tmp/pdf-render-check/08-package-reuse-ecosystem-docbook
mkdir -p build/tmp/pdf-render-check/08-package-reuse-ecosystem-docbook

for p in 1 2 3 10 20 35 45 46 47 48 49 50 58; do
  pdftoppm -png -r 130 \
    -f "$p" -l "$p" -singlefile \
    build/latex-docbook/08-package-reuse-ecosystem/book.pdf \
    "build/tmp/pdf-render-check/08-package-reuse-ecosystem-docbook/p${p}"
done
```

输出图像位于：

```text
build/tmp/pdf-render-check/08-package-reuse-ecosystem-docbook/
```

抽页检查用于确认 PDF 不是空白文件、页面能被渲染、目录和正文基本可见。若目标是发布级 PDF，还需要进一步检查表格是否重叠、页眉页脚是否合适、长 URL 和代码标识是否溢出。

## 11. 本链路的边界

本指南确认的是健康出版链路：

```text
ADOC -> official DocBook backend -> DocBook XML -> LaTeX -> PDF
```

它不承诺默认排版已经发布级。原因是 DocBook 和 LaTeX 链路解决的是语义和出版通道问题；具体书籍中的大表格、长标识、页眉页脚、字体、断行、索引样式，需要在出版样式层继续处理。

对于当前这本书，Appendix A 的变量字典和 Appendix B 的生态矩阵本身是宽表格。它们天然不适合普通 A4 竖版正文宽度。如果要发布，应单独决定：

1. 是否横向排版。
2. 是否拆成多张表。
3. 是否缩小字号。
4. 是否把变量名和说明拆成列表式条目。
5. 是否为附录表格单独定义出版样式。

这些属于 PDF 版式治理，不影响本链路确认。

## 12. 最小可复现命令汇总

从项目根目录执行：

```bash
cd /home/t103o/workbench/projects/seekmoon/bookshelf

pnpm add -D @asciidoctor/docbook-converter@3.0.0

mkdir -p build/docbook/08-package-reuse-ecosystem
mkdir -p build/latex-docbook/08-package-reuse-ecosystem

node --input-type=module <<'EOF' > build/docbook/08-package-reuse-ecosystem/asciidoctor-docbook.log 2>&1
import path from 'node:path';
import asciidoctorFactory from '@asciidoctor/core';
import docbookConverter from '@asciidoctor/docbook-converter';

const asciidoctor = asciidoctorFactory();
docbookConverter.register();

asciidoctor.convertFile('books/08-package-reuse-ecosystem/book.adoc', {
  safe: 'unsafe',
  base_dir: 'books/08-package-reuse-ecosystem',
  backend: 'docbook5',
  doctype: 'book',
  standalone: true,
  to_file: path.resolve('build/docbook/08-package-reuse-ecosystem/book.xml'),
  mkdirs: true,
  attributes: {
    sectnums: '',
    partnums: '',
    toclevels: '3'
  }
});
EOF

cat > build/latex-docbook/08-package-reuse-ecosystem/pandoc-docbook-header.tex <<'EOF'
\usepackage{ragged2e}
\usepackage{xurl}
\usepackage{fvextra}
\fvset{breaklines=true,breakanywhere=true}
\setlength{\emergencystretch}{3em}
\renewcommand{\arraystretch}{1.18}
\newcolumntype{L}[1]{>{\RaggedRight\arraybackslash}p{#1}}
EOF

pandoc build/docbook/08-package-reuse-ecosystem/book.xml \
  --from docbook --to latex \
  --standalone \
  --toc --toc-depth=3 \
  --metadata title='包复用生态：发现、管理与评价尺度' \
  --metadata author='弥澄亮' \
  --metadata date='2026-06' \
  --variable documentclass=ctexbook \
  --variable classoption=oneside \
  --variable papersize=a4 \
  --variable geometry:margin=2.2cm \
  --variable fontsize=10pt \
  --variable colorlinks=true \
  --include-in-header=build/latex-docbook/08-package-reuse-ecosystem/pandoc-docbook-header.tex \
  --output build/latex-docbook/08-package-reuse-ecosystem/book.tex

latexmk -xelatex \
  -file-line-error \
  -interaction=nonstopmode \
  -halt-on-error \
  -outdir=build/latex-docbook/08-package-reuse-ecosystem \
  build/latex-docbook/08-package-reuse-ecosystem/book.tex \
  > build/latex-docbook/08-package-reuse-ecosystem/compile-check.log 2>&1

pdfinfo build/latex-docbook/08-package-reuse-ecosystem/book.pdf | rg 'Title|Author|Pages|Page size|File size|PDF version'
```

## 13. 最终判断

在现有环境和当前 bookshelf 项目中，这件事应该这样做：

第一步，安装并注册官方 `@asciidoctor/docbook-converter`。

第二步，用 Asciidoctor.js 从 `book.adoc` 生成 DocBook 5 `book.xml`。

第三步，检查 DocBook XML 是否 well-formed，并确认 part、chapter、section、table、appendix、bibliography、index 等结构存在。

第四步，用 Pandoc 从 DocBook 生成 LaTeX，不经过 HTML。

第五步，用 `latexmk -xelatex` 编译 LaTeX，生成 PDF。

第六步，检查日志和 PDF 元数据，确认链路产物存在且可打开。

这条链路已经在当前书稿上实际跑通。
```
