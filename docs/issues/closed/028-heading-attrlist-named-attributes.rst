# 028 标题 attrlist 的命名属性由 aat 自己拆，与 Asciidoctor 不一致：葱、姜=多 成了字段

:发现: 2026-10-31，小汤，为工作区 07 号书核对 aat 0.3.0 的投影时
:代码版本: ``ff2478c``
:影响: 作者在 attrlist 里写带标点的字段名时，图里有这个字段，Asciidoctor 与 HTML 里没有；书照官方教“带标点的字段名写进描述列表”，图却说可以
:涉及: ``src/metadata-parser.ts:120-160``

## 现象与复现

.. code-block:: asciidoc

   = T

   [.dish, 难度=中, 葱、姜=多, a.b=1, 用-时=4]
   == 糖醋排骨

   正文

Asciidoctor.js 4.1.1（aat 自带的那一份）``load`` 以后，这一节的属性是：

.. code-block:: text

   {"3":"葱、姜=多","4":"a.b=1","难度":"中","用-时":"4","role":"dish"}

``葱、姜=多`` 与 ``a.b=1`` 是第 3、4 个位置属性，不是命名属性。aat 的 ``rdf12`` 投影却给这一节写出 ``field:葱、姜`` 一条（值 ``多``），
与 ``field:难度`` 并列（实测，``tmp/ws-probe``）。

## 原因

``src/metadata-parser.ts`` 的 ``parseAttrList``（120 行起）按逗号切开 attrlist，含 ``=`` 的一段就把等号前面当作名字（137 行），
不看名字合不合 Asciidoctor 的规则。Asciidoctor 的 ``AttributeList`` 只认 ``[\p{Word}][\p{Word}-]*`` 这样的名字
（``attribute_list.js`` 的 ``NameRx``），名字里有顿号、点号的整段是位置属性。按逗号直接切开，引号里的逗号也会被切开（推断，没有单独测）。

## 修复要守住的

* 标题的字段与官方给这个标题的命名属性一一对应：上面的例子只有 ``难度`` 与 ``用-时`` 两个字段，``葱、姜=多`` 与 ``a.b=1`` 不是字段。
* 结构由官方认：attrlist 怎样拆、哪段是命名属性，取 Asciidoctor 解析出的属性，与计划 #12 的 12.2 认 xref 同一个原则；aat 只负责源码位置。
* 工作区 07 号书把“attrlist 里的字段名只用字、数字、``_`` 与 ``-``，带标点的名字写进描述列表”教给作者；修好以后书与图一致。

## 采纳

:采纳: 2026-10-31，小汤

要做。复测（f72e636）仍复现：field:葱、姜 与 field:a.b 写进了图，官方把它们当位置属性。和 12.2 同一原则：attrlist 怎样拆、哪段是命名属性，取 Asciidoctor 解析出的属性，aat 只负责源码位置。设计随修复的工作包写进 09 号书第 8 章与 06 号书第 2 章「标题头部属性」。

## 解决

:提交: 工作包 18.2（git log --grep "Work-Package: 18.2"）

attrlist 改由官方拆（09 号书第 8 章 Metadata Attachment 新加的一段）：解析开始时，parser-core 先把源里每一个 attrlist（引语里去掉各层 `> ` 的也算）交给官方 document.parseAttributes 读一遍（不开 sub_input、sub_result，值保留作者写下的样子），按文字记下；同步的元数据扫描遇到 attrlist 时查这份记录，查不到就抛错，不退回自己拆。位置属性的键是 "1"、"2"……，其余是官方认下的命名属性；#id 与 .role 只从第一个位置属性读，与官方相同。
记录里的例子现在只有 难度 与 用-时 两个字段。顺带更正：引号里的逗号不再切开值（[cols="1,2"]），带引号的值不再连引号一起保存，排在后面位置的 #id、.role 不再被认作 ID 与 role（官方核实：[source,ts,#late-id,.late-role] 的块没有 ID 与 role）。
新增 test/attrlist-official-split.test.ts（记录的例子加一个引号里带逗号的值，从解析验到投影出的字段）；test/parser-input-edges.test.ts 里那条钉着“后面位置的 #id 也算 ID”的期望按官方改正；test/source-interval-resolver.test.ts 绕过 parser-core 直接扫描，先预读。
