# Rust 生态 AsciiDoc 解析库全景调查

## 总览

截至目前，Rust 生态中存在 **至少 6 个活跃或半活跃的 AsciiDoc 解析项目**，另有若干已废弃的早期尝试。这些项目在解析策略、成熟度、功能覆盖、下游工具链（LSP/WASM/CLI）等方面差异显著。以下逐一详述。

---

## 一、asciidork（最成熟、下载量最高）

| 项目 | 值 |
|---|---|
| GitHub | jaredh159/asciidork |
| Stars | 58 |
| crates.io | `asciidork` v0.1.0（占位），`asciidork-cli` 可用 |
| 总下载量 | 35,648（所有 Rust AsciiDoc 项目中最高） |
| 最近推送 | 2026-05-30（昨天） |
| License | Apache-2.0 OR MIT |
| 作者 | Jared Henderson，4 位贡献者 |

**架构**：Cargo workspace 包含 11 个 crate——`core`（共享类型）、`ast`（语法树定义）、`parser`（手写递归下降 lexer+parser）、`eval`（AST 求值器）、`backend`（后端 trait）、`dr-html-backend`（主要 HTML 后端，含 CSS 生成）、`backend-html5s`（兼容 Asciidoctor 的 HTML5 后端）、`dr-html-wasm`（WASM 绑定）、`cli`（命令行工具）、`test-utils`、`tck`（官方 TCK 兼容性测试）。

设计哲学是"把复杂度推入 lexer，尽量单 pass，正则作为最后手段"。使用 `bumpalo` arena 分配器提升性能。

**功能覆盖**：
- **块**：段落、listing/source、literal、admonition、image、table、thematic break、callout list、checklist、有序/无序/定义列表（嵌套）、discrete heading、block title、自定义 ID 和 role（`[#id.role]`）
- **行内**：italic、bold、highlight、monospace、literal monospace、superscript、subscript、自定义 span、quoted text、XML passthrough、hard line break
- **宏**：footnote、kbd、btn、pass、icon、menu、image、link、autolink、email autolink、xref 简写（`<<target>>`）
- **文档结构**：header（author/revision）、preamble、sections（自动编号）、TOC、document attributes、include 指令、条件编译（ifdef/ifndef）
- **未实现**：STEM/数学、source 语法高亮、video 宏、"natural" xref（按标题引用）、xref 到 discrete heading

**xref 支持**：`<<target>>` 和 `<<target,label>>` 简写语法可用。但"natural" xref（按标题文本而非显式 ID 引用）被作者有意不实现，认为是"officially discouraged"。多行 xref 文本不支持。

**WASM**：已支持。`dr-html-wasm` crate 提供绑定，有在线 playground：https://asciidork-playground.vercel.app

**CLI**：`cargo install asciidork-cli`，支持文件输入、stdin、embedded mode、输出到文件、性能计时、prettier 格式化。

**TCK**：包含 `tck/` crate，主动对齐官方 AsciiDoc TCK 测试套件。

**评价**：功能覆盖最广、下载量最高、发布节奏最活跃（76 个 release），是目前 Rust 生态中最实用的 AsciiDoc 解析器。crates.io 上的 `asciidork` v0.1.0 是过时占位符，真正活跃的是 GitHub monorepo。

---

## 二、asciidoc-parser（最注重规范对齐）

| 项目 | 值 |
|---|---|
| GitHub | asciidoc-rs/asciidoc-parser |
| Stars | 23 |
| crates.io | `asciidoc-parser` v0.14.4 |
| 总下载量 | 7,508 |
| 最近推送 | 2026-03-09 |
| License | MIT OR Apache-2.0 |
| MSRV | 1.88.0（很高） |
| 贡献者 | 20 人（含 mojavelinux、graphitefriction、ggrossetie） |

**架构**：手写递归下降 parser（非 PEG/pest），输出结构化 AST。模块包括 `attributes`、`blocks`、`content`、`document`、`parser`、`strings`。`Block` 使用枚举 + `IsBlock` trait 的双重设计，避免 `Box<dyn>` 泛滥。内置 `HtmlSubstitutionRenderer` 实现 HTML5 渲染，通过 `InlineSubstitutionRenderer` trait 可扩展其他后端。

**特色**：作者 Eric Scouten 采用"spec-driven development"——逐页逐行阅读 AsciiDoc 语言规范并编写测试，代码覆盖率通常 >99%。mojavelinux（Asciidoctor 创始人）是提交数最多的贡献者。

**功能覆盖**：
- 已实现：段落、sections、listing、literal、sidebar 等基本块；行内格式化（bold、italic、monospace 等）、links、images、icons、anchors
- **未实现（open to-do issues）**：table（#296，最大缺口）、admonition（#456）、**xref（#476，2026-02 才开 issue）**、bibliography（#479）、callout（#311）、checklist（#481）、ruler（#474）、subtitle（#382）
- 明确不支持：UTF-16 输入、`book` doctype、`compat-mode`、URL-based include

**xref 支持**：**尚未实现**。`<<target>>` 简写语法的解析是 #476 issue，tagged `to-do`。文档模型中有 `Catalog` + `RefEntry` + `RefType` 基础设施，但实际的 inline xref 宏解析还未完成。

**评价**：最具规范严谨性的项目，有 Asciidoctor 核心团队直接参与。但功能覆盖缺口很大（table、xref、admonition 都未实现），不适合当前使用。长期来看如果要构建严格符合规范的工具，这是最佳基础。

---

## 三、acdc-parser（PEG 语法 + 完整工具链）

| 项目 | 值 |
|---|---|
| GitHub | nlopes/acdc |
| Stars | 32 |
| crates.io | `acdc-parser` v0.9.0 |
| License | MIT OR Apache-2.0 |
| 作者 | Norberto Lopes，4 位贡献者 |
| Rust Edition | 2024，最低 rustc 1.85 |

**架构**：使用 `peg` crate 实现 PEG 语法解析器。两遍行内处理策略：先识别行内元素边界，再解析内容。包含独立的预处理器（`include::`、`ifdef`/`ifndef`/`ifeval`）。Fail-fast 设计，遇到第一个错误即停止。

**功能覆盖**（AST 节点非常丰富）：
- **块**：DelimitedBlock（listing、literal、sidebar 等）、Table（完整行/列/对齐）、CalloutList、DescriptionList、OrderedList、UnorderedList、Admonition、ThematicBreak、PageBreak、Image、Audio、Video、Pass（passthrough）、StemContent（数学/STEM）、TOC、Footnote
- **行内**：Bold、Italic、Monospace、Highlight、Superscript、Subscript、Link、Url、Autolink、**CrossReference**、Mailto、InlineMacro、Stem、Menu、Icon、Button、Keyboard、IndexTerm、curved quotes
- **替换系统**：完整的 `Substitution`/`SubstitutionOp`/`SubstitutionSpec` 体系，有 header、normal、verbatim 三套预定义替换集

**xref 支持**：AST 中有 `CrossReference` 节点和 `Anchor` 类型。`acdc-lsp` 实现了跨文件 anchor 索引，说明 xref 解析至少在编辑器场景可用。

**下游工具**：
- `acdc-cli`：命令行转换器
- `acdc-lsp`：Language Server（诊断、hover、completion、rename、references、semantic tokens）
- `acdc-editor-wasm`：WASM 实时编辑器（语法高亮 + 预览），在线演示：https://acdc.nlopes.dev/
- 转换后端：HTML5、Manpage（roff）、Markdown（CommonMark/GFM）、Terminal（rich 输出）

**评价**：功能覆盖最全面的 Rust 项目之一（table、admonition、STEM、xref 都有 AST 支持）。PEG 语法带来确定性解析。LSP + WASM 编辑器是独特优势。但 crates.io 下载量仅 306，实际采用率低。

---

## 四、asciidocr（CLI 转换 + TCK 适配器）

| 项目 | 值 |
|---|---|
| GitHub | delfanbaum/asciidocr |
| Stars | 49 |
| crates.io | `asciidocr` v0.1.14 |
| 总下载量 | 8,456 |
| License | MIT |
| 作者 | Danny Elfanbaum，3 位贡献者 |

**架构**：三阶段流水线——Scanner（lexer）→ Parser（生成 ASG）→ Backends。ASG 是基于图的表示（非严格树），大致遵循 Eclipse/Asciidoc-Lang 的 ASG schema。

**后端**：
- **HTMLBook**（默认）：生成 HTML，使用 Tera 模板
- **JSON**：输出 ASG 的 JSON 表示，同时作为 **TCK 适配器**（从 stdin 读取即可运行官方 TCK 测试）
- **DOCX**（实验性，feature flag）：使用 `docx-rs` 生成 Word 文档

**CLI**：`asciidocr <file>` 支持 `-o` 输出、`-b` 后端选择、`-c` 字数统计、`-x` 允许未解析 target。可编译为 WASM（`wasm32-wasip1`），能在 iOS a-Shell 运行。

**功能覆盖**：支持大部分常见 AsciiDoc 标注（段落、sections、listing、literal、sidebar、admonition、image、table、描述列表、有序/无序列表、open block、example block、passthrough、thematic break、page break、行内格式化、cross-reference、footnote、include with tag/line filter）。未实现：checklist、条件编译、复杂 table、block-level `subs`。

**xref 支持**：支持 cross-references（在行内节点列表中明确列出）。

**评价**：CLI 转换工具定位清晰，TCK 适配器是独特价值。DOCX 输出是差异化功能。但功能覆盖不如 asciidork 和 acdc 全面。

---

## 五、oak-ascii-doc（增量解析 + LSP 框架）

| 项目 | 值 |
|---|---|
| GitHub | ygg-lang/oaks |
| Stars | 17（父仓库） |
| crates.io | `oak-ascii-doc` v0.0.11 |
| License | MPL-2.0 |
| 作者 | oovm，1 位贡献者 |

**架构**：基于 Oak 框架——一个支持 50+ 语言的模块化高性能 parser 框架。使用 Rowan 风格的 Green/Red tree（不可变 interned 节点 + 父感知视图），支持增量解析和错误恢复。配套 `oak-lsp`（Language Server）、`oak-mcp`（Model Context Protocol for AI agents）、`oak-vfs`、`oak-highlight`、`oak-hover`、`oak-pretty-print`。

**评价**：架构最有野心（增量解析、LSP、MCP 一体化），但 AsciiDoc 模块本身处于极早期（v0.0.11，单一贡献者）。更像 Oak 框架的示例级实现，而非独立的 AsciiDoc 工具。Feature flag 包括 `lsp` 和 `mcp`，说明目标是 IDE 和 AI agent 集成。

---

## 六、asciidoxide（新生项目）

| 项目 | 值 |
|---|---|
| GitHub | zheylmun/asciidoxide |
| Stars | 1 |
| 创建时间 | 2026-01-26（4 个月前） |
| License | Apache-2.0 OR MIT |
| 作者 | 1 位贡献者 |

**架构**：零拷贝（zero-copy）、规范对齐的 AsciiDoc parser，输出 ASG。workspace 包含 `asciidoxide-parser` 和 `asciidoxide-lsp`。LSP 基于 `tower-lsp`，提供实时诊断。有 Zed 编辑器扩展（使用 `tree-sitter-asciidoc` 做语法高亮）。

CI、Codecov、CodSpeed benchmark 都已配置，工程素养不错。但太新，功能覆盖无法评估。

---

## 七、已废弃/停滞项目

| 项目 | 说明 |
|---|---|
| cch123/asciidoc-rs | pest-based，语法从 libasciidoc 复制，2019 年后无更新，未发布 crate |
| antoyo/asciidoctor-rs | Asciidoctor 移植，25★，2019 年后废弃 |
| etoal83/adparse | 2021 年实验项目，未发布 crate，已废弃 |
| manuel-woelker/asciicod | 早期尝试，无实质内容 |
| damccull/asciidoc_rs | 无显著存在 |
| Manishearth/pagliascii | "Soon to be"，从未开始 |
| ntgussoni/asciidoctor-rust | 0★，无实质内容 |
| eternalfrustation/rascii | 0★，无实质内容 |

---

## 综合对比

| 项目 | ★ | 下载 | xref | table | admonition | LSP | WASM | HTML 后端 | 成熟度 |
|---|---|---|---|---|---|---|---|---|---|
| **asciidork** | 58 | 35.6K | 部分（简写语法） | 有 | 有 | 无 | 有 | 2 个 | 最成熟 |
| **asciidocr** | 49 | 8.5K | 有 | 基本 | 有 | 无 | 可编译 | HTMLBook | 活跃 |
| **acdc** | 32 | 306 | 有（AST 节点） | 有 | 有 | 实验性 | 有 | HTML+MD+Man+Term | 活跃 |
| **asciidoc-parser** | 23 | 7.5K | **未实现** | **未实现** | **未实现** | 无 | 无 | 内置 HTML5 | 实验性 |
| **oak-ascii-doc** | 17 | 极少 | 未知 | 未知 | 未知 | 有 | 无 | 未知 | 极早期 |
| **asciidoxide** | 1 | 未发布 | 未知 | 未知 | 未知 | 有 | 无 | 未知 | 新生 |

---

## 与我们场景的关联

我们的需求是：从 AsciiDoc 文档中提取 xref 关系（特别是 `rel=` 控制字段），投影为 RDF 图。当前使用 TypeScript 的 `asciidoc-abundant-tree`（基于 Asciidoctor/Node），发现了列表项、描述列表、引用块中 xref 不被提取的问题。

如果考虑 Rust 生态的替代方案：
- **asciidork** 功能覆盖最广、xref 简写可用，但不支持 `xref:target[text]` 宏语法中的 `rel=` 属性列表，且没有 RDF 投影能力
- **acdc-parser** AST 最丰富（有 `CrossReference` 节点），PEG 确定性解析，LSP 可用，但同样没有 `rel=` 属性提取和 RDF 投影
- **asciidoc-parser** 最注重规范但 xref 完全未实现

**结论**：Rust 生态的 AsciiDoc 解析器在 xref 提取方面普遍不如 Node/Asciidoctor 生态成熟。没有一个 Rust 项目提供了类似 `asciidoc-abundant-tree` 的"xref occurrence + source span + RDF 投影"能力。如果要在 Rust 中实现类似功能，最可行的基础是 **acdc-parser**（AST 最全面、有 CrossReference 节点）或 **asciidork**（最成熟、下载量最高），但都需要在此基础上自行构建 xref occurrence 提取和 RDF 投影层。

