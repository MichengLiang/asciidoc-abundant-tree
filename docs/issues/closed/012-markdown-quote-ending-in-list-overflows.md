# markdown 引语以列表结尾时，解析栈溢出

- 发现：2026-10-22，aat 计划 #8 为 callout 列表写"markdown 引语里的 callout 列表"测试时撞上。
- 代码版本：asciidoc-abundant-tree 仓库 `7d93499`（0.2.3）。
- 影响：markdown 引语（`> ` 开头的段落）的最后一个子块是列表（ulist、olist、colist）时，整份文档解析抛出
  `RangeError: Maximum call stack size exceeded`，什么都拿不到。0.2.3 的 7.2 引入；真书里没有这种写法，裁判比对没有覆盖到。

## 复现（实测）

```asciidoc
= 文

== 节

> * 一 xref:a[A]
> * 二

后文。
```

## 原因

`markdownQuoteSpan`（`src/source-interval-resolver.ts`）向子块要结束行（`lastChildIntervalEnd`）。列表没有自己的结束线索：
不是分隔块，也没有源行数可数，它的结束行取下一个兄弟块之前，没有兄弟时向父块要（`parentEndLine`）。父块就是引语，
引语又向列表要，互相递归。

## 方向

markdown 引语是官方先读成一个段落、再认出来的（`parser.js` 1102 行），范围就是这个段落。照官方读段落的规则从源行算
（`readParagraphLines`，`parser.js` 3018-3047 行），不向子块要。

## 解决

2026-10-22，aat 计划 #8 的 8.7（`git log --grep "Work-Package: 8.7"`），随 0.2.4 发布。规约在 09 号书第 7 章新增
「官方怎样读段落」，「段落写法的引语」的范围一句指向它。

- 新模块 `src/official-paragraph.ts` 逐句移植 `readParagraphLines` 与 `readLinesUntil` 的段落分支：`paragraphEndLine` 返回段落
  读进的最后一行，停在空行、`+`、块分隔符（`officialDelimiter`）与块属性行（`BlockAttributeLineRx`）之前，在列表里还停在
  列表标记行（`AnyListRx`）之前；行注释跳过。8.3 的列表条目续行复用它。
- `markdownQuoteSpan` 的范围改为这个段落：最后一行是出处时取走它，再去掉末尾只有 `>` 的行与行注释，得到内容区间。
- 对照测试（`test/official-paragraph.test.ts`）：同一组输入交给官方 `Parser.readParagraphLines` 与 `paragraphEndLine`，
  读进的行与最后一行都相同；列表内外各一组。引语以 ulist、olist（带出处）结尾的回归测试。变异实验：去掉 `+`、列表标记、
  属性行判定，或把注释算作读进的行，都被抓到。
