# 指南建议「标题会变就用 stable ID」，与工作区的约定、也与 aat 自己的 label space 相左

- 发现：2026-10-30，asciidoc-multi-book-workspace 计划 #6 的 6.1：重写 07 号书「结构化书写约定标本」的寻址一章时对照 aat 指南。
- 代码版本：asciidoc-abundant-tree 仓库 `9aabaa2`（0.2.6）。
- 性质：转告。
- 影响：照指南写书的人会给可能改名、可能重名的标题预先打上语义 ID。标题改名时 ID 不变，引用处照常成功，不再暴露、也不受检查；
  ID 里冻结着旧的说法。

## 指南现在怎么说

`docs/bookshelf/books/12-asciidoc-abundant-tree-guide/parts/030-identity-and-fields/010-address-and-stable-id.adoc`：

> stable ID 是作者为标题声明的长期寻址 label。写法是标题前 attrlist 中的 `#id`。
>
> 长期引用且标题文本可能变更或重复的标题使用 stable ID。标题文本本身已经是领域内唯一且稳定的标识符时，标题文本承担寻址职责。

## 工作区这一轮定下的约定

* 标题原文就是地址。
* 第二个地址只在需要时才加：一个标题要被单独引用，这时才知道它的标题在引用范围里是否与别的标题重名；重名了，再给它一个 ID。
* 改名就是改名。书都在本地，引用都在同一个仓库里，检查覆盖每一处引用；改了名，就该让引用它的地方一起接受检查，
  不用一个不变的 ID 把它们屏蔽掉。Asciidoctor 文档建议成熟内容改用 ID、免受标题修订影响，那是发布在网上、外部链接收不回来的处境。

约定写在工作区的 07 号书，见 asciidoc-multi-book-workspace 的 `git log --grep "Work-Package: 6.6"`（重写寻址一章的那一包）。

## aat 自己的 label space 已经是这个模型（实测）

样例在 `:idprefix:` 为空、`:idseparator: -` 下：

```asciidoc
== 名称、角色与关系
[#src]
== 源文本与投影
== 术语表
== 术语表

xref:名称、角色与关系[] xref:源文本与投影[] xref:src[] xref:术语表[]
```

| 引用 | Asciidoctor.js 3 的 HTML | aat 0.2.6 的 RDF |
|---|---|---|
| `xref:名称、角色与关系[]` | 断：生成的 ID 去掉了顿号（`名称角色与关系`） | 按 `aat:headline` 绑定 |
| `xref:源文本与投影[]`（标题带 `[#src]`） | 断：手写 ID 顶替了生成的 ID | 按 `aat:headline` 绑定，与 `xref:src[]` 指向同一个标题 |
| `xref:术语表[]`（两个同名标题） | 静默指向第一个 | 两个 `aat:candidateHeading`，不生成单一的 target heading |

headline 原文就是地址，手写 ID 是别名，重名明说有歧义：这正是上面的约定。指南的建议与之相反。

## 转告

只陈述事实与工作区的约定；指南要不要改、怎样改，由 aat 定。12 号书自己的各章也都带英文 ID（如 `[#address-and-stable-id]`），一并供参考。

## 解决

2026-10-30，aat 计划 #12 的 12.4（`git log --grep "Work-Package: 12.4"`），随 0.3.0 发布。

指南的寻址一节改写为 `parts/030-identity-and-fields/010-address-space.adoc`：标题原文就是地址；重名被引用时用 `::` 补上上级标题
（`xref:红烧肉::火候[]`，12.3 起 aat 按这个后缀路径绑定）；custom ID 只是别名，不预先声明；改名就是改名，断链提醒你回原文看引用
是否还指着原来的东西；想要稳定的地址，就把编号写进标题，像 PEP、JEP 那样。

12 号书与 06–11 号书自己的英文 ID 在 12.6 清掉了（`git log --grep "Work-Package: 12.6"`）：187 个标题 ID 都删了，128 处引用
改写成 aat 算出的标题地址。
