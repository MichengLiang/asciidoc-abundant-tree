# 033 标题里带点号时，裸写的 xref 被认作文档，指南没有教 xref:# 的写法

:发现: 2026-11-02，小汤，seekcrowd 第 2 号书的 DeepSeek 试跑里，册子的 bookgraph 审计报“文档不存在”时
:代码版本: ``465ca11``
:来自: seekcrowd
:性质: 愿望
:影响: 标题里有版本号、小数（v1.2、2.5KG、Python 3.13）的一节，作者照指南写 ``xref:标题[]`` 绑不上；审计只说文档不存在，作者看不出该改用 ``xref:#标题[]``。
:涉及: ``src/xref-recognition.ts:213-235``、``bookshelf/books/12-asciidoc-abundant-tree-guide/parts/030-identity-and-fields/010-address-space.adoc``

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

## 已有的写法：xref:#

AsciiDoc 本来就有表示“本文档里的片段”的写法：目标以 ``#`` 开头，官方走片段那一支（同文件 ``substitutors.js``
``hashIdx === 0``），不检查扩展名；aat 在 asciidoc-abundant-tree#021 之后按作者写下的文字绑定它。实测（aat 0.7.0）：

.. code-block:: text

   xref:#大瓶 2.5KG[]          → 《大瓶 2.5KG》
   xref:#上级::版本 v2.0[]     → 《版本 v2.0》（限定地址也行）
   xref:#C# 入门[]             → 《C# 入门》（标题里本身带 #）
   xref:大瓶 2.5KG[]           → aat:targetDocument "大瓶 2.5KG"，没有标题

所以 aat 的行为与官方一致，规约“一节的地址是它的标题原文”也成立：地址还是标题原文，前面加 ``#`` 表明它是本文档里
的片段。缺的是让作者知道这件事。上面“现象与复现”一节记的是裸写的样子；这封记录原先还有一节“要定的”，提议让 aat
在官方认作路径时改到标题里找，那是寄信时没有查到这个写法，已经删掉。

## 修复要守住的

* 真指向别的文档的引用不变：``xref:other.adoc#x[]``、``xref:chapters/b.adoc[章节]``、``xref:{book01}#x[]``
  （#022、#030 那几种）照旧是跨文档。aat 不在路径那一支去标题里找。
* 12 号书讲寻址的那一节写明：标题会被官方读成路径时（含 ``.``），引用写 ``xref:#标题[]``；标题里带 ``#`` 的同样写
  ``xref:#``。06 号书讲地址的那一节同。
* 一条引用被认作文档、书里又没有这个文档、label 空间里恰有标题原文是这串文字的一节时，投影留下能让下游说出
  “改写成 ``xref:#…``”的线索（诊断或字段，由投影的设计定）；bookgraph 的“文档不存在”是这条线索的下游。

## 解决

:提交: 工作包 26.2（git log --grep "Work-Package: 26.2"）

aat 的读法不改，规约与指南写明官方的路径判定与 ``#`` 前缀，测试钉住这些写法。三条“修复要守住的”各落在：

* 真指向别的文档的引用不变：代码没有改，``xref-recognition.ts`` 的 ``addressOf`` 本来就照官方走。``test/xref-recognition.test.ts`` 新增一条（issue 033），与官方完整转换接到的 xref 条数对照，钉住 ``xref:大瓶 2.5KG[]``、``xref:2.5KG大瓶[]``、``xref:版本 v1.2[]`` 给 ``document``、不绑标题；``xref:#大瓶 2.5KG[]``、``xref:#2.5KG大瓶[]``、``xref:#版本 v1.2[]``、``xref:#C# 入门[]``、``xref:#上级::版本 v2.0[]`` 与 ``<<大瓶 2.5KG>>``、``<<2.5KG大瓶>>`` 绑到各自的标题；``xref:other.adoc#x[]``、``xref:{book}#x[]`` 照旧是跨文档。
* 讲寻址的地方写明：12 号书「地址空间」新增「带点号或井号的标题」一节（含 ``C# 入门``、限定地址、``<<…>>`` 不用加）；06 号书第 2 章「地址与 Label 空间」末句指向第 5 章，第 5 章「Target Heading」新增一段写官方的路径判定（``substitutors.js`` 1196–1204 行、``helpers.js`` 的 ``isExtname``）与 ``#`` 前缀；09 号书第 8 章 Xref Occurrence 新增一段写解析器照官方给 ``document``、不去 label 空间找同名标题。
* 投影留的线索：06 号书第 5 章写明，被读成路径的引用在图上同时有它写下的 ``aat:targetDocument`` 与 label 空间里的标签，哪一处写的文档名恰好是本文档某一节的地址，下游据这两样就查得出来；投影器不另写诊断，这是解释，归读投影的一方。bookgraph 的“改写成 ``xref:#…``”提示在 bookgraph 那边做。
