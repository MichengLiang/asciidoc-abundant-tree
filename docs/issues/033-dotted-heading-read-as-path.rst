# 033 标题里带点号时，xref 按标题原文引用不到它

:发现: 2026-11-02，小汤，seekcrowd 第 2 号书的 DeepSeek 试跑里，册子的 bookgraph 审计报“文档不存在”时
:代码版本: ``465ca11``
:来自: seekcrowd
:影响: 标题里有版本号、小数（v1.2、2.5KG、Python 3.13）的一节，按标题原文写的 xref 一律绑不上；审计只说文档不存在，作者看不出原因。
:涉及: ``src/xref-recognition.ts:213-235``

## 现象与复现

标题原文里有 ``.`` 的一节，用 ``xref:`` 宏按标题原文引用，aat 把目标记成一个文档，不去标题里找。三种写法都这样：

.. code-block:: text

   = 样书

   == 大瓶 2.5KG

   == 2.5KG大瓶

   == 版本 v1.2

   == 引用

   带小数点、有空格：xref:大瓶 2.5KG[]
   带小数点、无空格：xref:2.5KG大瓶[]
   点号后是字母：xref:版本 v1.2[]

``node dist/cli.mjs sample.adoc --format rdf12 --document-root .``（aat 0.7.0，Asciidoctor.js 4.1.1）。三个标题节点都在
（``aat:headline`` 依次是 ``大瓶 2.5KG``、``2.5KG大瓶``、``版本 v1.2``），三条边都是这样，没有 ``aat:targetHeading``：

.. code-block:: text

   aat:officialHref "2.5KG大瓶";
   aat:raw "xref:2.5KG大瓶[]";
   aat:targetDocument "2.5KG大瓶".

下游：bookgraph 审计把它报成“文档不存在”。在 seekcrowd 书架的一本册子里撞上过两次：卖点梯子里一架叫 ``2.5KG大瓶``；
图的依据写 ``xref:阴干也清爽::图位::SKU 图·1 瓶 2.5KG[rel=depends-on]``，限定地址也一样绑不上。

## 原因

实测：上面的复现。

读代码（没有单独测）：

* Asciidoctor.js 4.1.1 ``src/substitutors.js:1196-1204``：宏写法的目标里没有 ``#`` 时，以 ``.adoc`` 结尾的是文档；
  ``isExtname`` 为真的也当路径；其余才当片段。``src/helpers.js:186-189`` 的 ``isExtname``：最后一个 ``.`` 之后没有
  ``/`` 就算有扩展名。所以只要标题里有点号，Asciidoctor 就把整串当成文件路径，``officialHref`` 也就是那串文字。
* aat ``src/xref-recognition.ts:213-235`` 的 ``addressOf``：官方给了 ``path`` 时只返回 ``document``，不给 ``selector``，
  这条引用不进 label 空间。片段那一支 aat 已经按作者写下的文字取地址、不取官方改写过的 fragment；路径这一支照官方。
* 同一段代码里 ``macro`` 为假（``<<…>>`` 简写）时一律当片段，所以 ``<<2.5KG大瓶>>`` 应当不受影响。这一条是读代码推断。

规约的说法：06 号书 ``chapters/02-heading-node.adoc:66`` “一节的地址是它的标题原文”；12 号书
``parts/030-identity-and-fields/010-address-space.adoc`` 同。现在带点号的标题当不了地址，规约里也没有列出这种例外。

## 要定的

由项目主人（小亮）定走哪一边：

* aat 绑定：官方认作路径、书里又没有这个文档、label 空间里有标题原文恰好是这串文字的一节时，绑到那一节；
* aat 不改：规约与指南写明“标题里带 ``.`` 的，按原文写不出 ``xref:`` 引用，要引用就加 custom ID”。工作区的
  《结构化书写约定标本》（p5 与 seekcrowd 两个书架各有一份）《标题、寻址与引用》一节列了两种写不出引用的标题
  （带 ``#`` 或 ``::`` 的、以行内标记开头的），也要补上这一种。

## 修复要守住的

* 真指向别的文档的引用不变：``xref:other.adoc#x[]``、``xref:chapters/b.adoc[章节]``、``xref:{book01}#x[]``
  （#022、#030 那几种）照旧是跨文档。
* 走绑定那一边时：带点号的标题原文与它的限定地址（``上级::版本 v1.2``）都能绑上；书里同时有同名文件与同名标题时，
  怎样认要写进规约，不悄悄挑一个。
* 走不改那一边时：投影或审计至少让作者看得出这条引用是“标题带点号”，而不只是“文档不存在”。
