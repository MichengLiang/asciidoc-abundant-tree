# 普通列表条目里的 xref 没有官方解析结果

- 发现：2026-10-22，aat 计划 #9 收尾的裁判比对。9.4 修好描述以后，trestlework 8 号书 758 个 xref 里还有 46 个没有 `href`，人群实验室
  179 个里还有 8 个，几乎都写在 `* …` 这样的列表条目里。
- 代码版本：asciidoc-abundant-tree 仓库 `08098f8`（0.2.5 之前）；文件模式与 book-entry 都这样，0.2.4 及更早同样。
- 影响：ulist、olist、colist 条目文字里的 xref 只有 aat 按目标找出的 `resolvedId` 与目标标题作 reftext，没有官方的 `href` 与 reftext；
  RDF 里没有 `officialHref`。

## 复现（实测）

```asciidoc
= 文

== 节

* 条目 xref:a[甲]
* 再一条
续行 xref:a[乙]

. 有序 xref:a[丙]

[#a]
== 目标
```

三个 xref 的 `asciidoctor` 都只有 `{resolvedId: "a", resolvedType: "section", reftext: "目标"}`。

## 原因

官方解析结果按块取：投影器为段落、描述的术语与描述等节点登记绑定请求（块加上它名下的 xref），再让官方转换那个块、对出结果。
ulist、olist、colist 与它们的条目在节点树里是透明的，不建节点，也就没有人替条目登记请求。

## 方向

投影器走过透明的列表条目时，照描述的做法给条目登记绑定请求：条目的文字范围已经有了（`listItemTextEndLine`，0.2.4），xref 按这个
范围收。不必为条目建节点。

## 解决

2026-10-22，aat 计划 #10 的 10.2（`git log --grep "Work-Package: 10.2"`），随 0.2.6 发布。规约在 09 号书第 8 章「Binding Merge」
（10.1）：xref 在收下它的官方块下取官方结果；扫描器找到的每个 xref 都在某个块的文字里，所以都带 official href，没有 href 是解析器
缺陷。

修之前用 0.2.5 的 dist 在 16 本书上量过：131 个 xref 没有 href，逐个回到源行看，全部写在 ulist/olist 条目里，没有别的写法漏掉。

修法：投影器经过 olist、ulist、colist 的条目时（`requestListItemBindings`，`src/official-projector.ts`），按区间解析器照官方读法
算出的条目文字范围（`contentSpan`，0.2.4）收 xref，以条目为父块登记绑定请求。条目仍不建节点。修后 16 本书没有 href 的 xref 是 0。

测试（`test/official-binding.test.ts`）：aat 自己书架的 7 本书逐本断言每个 xref 都带 href；端到端守住 ulist、续行、olist 里找不到的
target（`#nope`）、colist，以及 book-entry 下 include 进来的章节里的条目。变异实验 3 个都被抓到。
