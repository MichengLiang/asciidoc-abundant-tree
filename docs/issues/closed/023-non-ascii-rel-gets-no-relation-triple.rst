# 023 非 ASCII 的关系谓词不生成主关系三元组

:发现: 2026-10-30，workbench 里为 reST 文档将来的 RDF 投影对照 aat 的谓词命名、在 bookgraph 上实测字段谓词时，顺读``relation-predicate.ts`` 发现，随后用 CLI 实测。
:代码版本: asciidoc-abundant-tree 仓库 ``7627bc3``（0.2.6）。
:相关: asciidoc-abundant-tree#024（中文字段名的谓词做了百分号编码）。
:影响: 书自己声明关系谓词（工作区 07 号书「结构化书写约定标本」的《声明本书的约定》），用中文写成 ``rel=依据`` 时，图里没有``rel:`` 直连边，也没有 reifier 指向的那条三元组，只在 xref 边证据上留一个字面值 ``aat:rel "依据"``；投影不报诊断。按``rel:<谓词>`` 查关系的 SPARQL 查不到这些引用，同一本书里写 ``rel=depends-on`` 的却查得到。
:涉及: ``src/rdf12-projection/relation-predicate.ts:11``

## 复现（实测）

.. code-block:: asciidoc

   = 菜谱

   [.technique]
   == 炒糖色

   冰糖下锅。

   [.dish, 难度=中]
   == 红烧肉

   主料:: 五花肉一斤

   不会《xref:炒糖色[rel=依据]》就做不成。也见 xref:炒糖色[rel=depends-on]。

``node dist/cli.mjs sample.adoc --format rdf12 --document-root .``（0.2.6），退出码 0，stderr 为空。与关系有关的输出：

.. code-block:: text

   rel:depends-on <urn:aat:doc:…#heading-l3-o0>.            ← rel=depends-on：有直连边
   aat:rel "depends-on";                                     ← 它的边证据
   aat:raw "xref:炒糖色[rel=依据]";
   aat:rel "依据";                                           ← rel=依据：只有边证据上的字面值，没有直连边

## 原因

读代码得出，与实测相符：``src/rdf12-projection/relation-predicate.ts:11`` 的 ``ordinaryTokenPattern`` 是
``/^[A-Za-z][A-Za-z0-9._~-]*$/u``，只认 ASCII。``依据`` 不是绝对 IRI、不是已知 CURIE，也不匹配这个模式，落到最后的
``return { rawRel }``，没有 ``predicate``。

规约（06 号书 ``chapters/05-xref-edge.adoc:79``）写的是：

> ``rel`` 字段是普通 token 时，predicate 使用 ``rel:`` 命名空间下的稳定 IRI-safe 映射。``rel`` 不能映射为合法 IRI 时，边证据保留
> ``aat:rel``，不生成主 relation triple。

规约里不生成三元组的条件是“不能映射为合法 IRI”。``依据`` 能：RDF 1.1 的 IRI 按 RFC 3987，``ucschar`` 收汉字；即使按 024 里
现在的字段做法先百分号编码，编码后的串也是合法 IRI。实现把“普通 token”收窄成了 ASCII 标识符，规约没有这样定义。

## 修复要守住的

* ``rel=依据`` 与 ``rel=depends-on`` 一样生成 ``rel:`` 下的直连边与 reifier；IRI 怎么写（汉字原样，还是编码）与 024 的结论一致。
* 真的不能成为 IRI 的 ``rel``（例如含空格）仍照规约只留 ``aat:rel``。
* ASCII 关系谓词映射出的 IRI 不变。

## 解决

:提交: 工作包 12.1、12.1.1（git log --grep "Work-Package: 12.1"；git log --grep "Work-Package: 12.1.1"）

2026-10-30，aat 计划 #12 的 12.1 与 12.1.1（``git log --grep "Work-Package: 12.1"``），随 0.3.0 发布。规约在 06 号书第 1 章
《名字进入 IRI》与第 5 章。

关系谓词按书写下的原文命名：绝对 IRI、已知 CURIE 两支不变，其余非空的 ``rel`` 一律是 ``rel:`` 加上转写后的原文。转写只处理 IRI 不允许的
字符（空格、``<>"{}|\^``、反引号、控制字符等），再把 ``%`` 写成 ``%25``，汉字与中文标点原样保留（``src/rdf12-projection/iri-name.ts``）。
所以 ``rel=依据`` 成为 ``rel:依据``，带空格的 ``rel`` 也能出边（``依 据`` 成为 ``rel:依%20据``）；只有空的 ``rel`` 不生成主关系三元组。

复现样例实测（0.3.0 之前的 dist）：``<#红烧肉> rel:依据 <#炒糖色>`` 与 ``rel:depends-on`` 一样有直连边和 reifier。n3 的 Turtle 写出器
把 ``rel:依据`` 写成完整 IRI，只是写法问题，图是对的，见议题 027。
