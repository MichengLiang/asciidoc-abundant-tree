# 030 book-entry 下指向本书 include 章节文件的 xref 被记成跨文档

:发现: 2026-10-31，小汤（分身），bookgraph 计划 #25 收尾复现小荇的发现
:代码版本: ``d0a6122``
:影响: 指向本书 include 章节的 xref 在图上不绑定（没有 targetHeading）、officialHref 与渲染不一致；aat 号称照 Asciidoctor 读的官方事实在这里与渲染相左
:涉及: ``src/asciidoctor-adapter.ts:179``、``src/rdf12-projection/xref-projector.ts:227``

## 现象与复现

book-entry 下，书里一处 xref 的目标是本书 include 进来的章节文件时，aat 把它记成指向别的文档：边证据写
``aat:targetDocument "chapters/b.adoc"`` 、 ``aat:officialHref "chapters/b.html#本书小节"`` ，不在本书的 label 空间
里绑定（06 号书第 5 章「Target Heading」：指向别的文档的不在本文档绑定），所以这处引用没有 ``aat:targetHeading`` 。
同一份源用同一份 Asciidoctor.js（4.1.1）渲染，链接是书内的 ``#本书小节`` ，落在本书那一节。

样例书（bookgraph 计划 #25 小荇的原型，在 ``.aktant/bookgraph/tmp/小荇-25.2/proj/bookshelf/books/02-other/`` ）：

.. code-block:: asciidoc

   = 另一本
   :doctype: book

   include::chapters/a.adoc[]

   include::chapters/b.adoc[]

``chapters/b.adoc`` 是 ``== 本书小节`` ， ``chapters/a.adoc`` 里写：

.. code-block:: asciidoc

   . 指向本书的章节文件 xref:chapters/b.adoc#本书小节[]
   . 章节文件整本 xref:chapters/b.adoc[章节]
   . 指向本书 book.adoc xref:../02-other/book.adoc#本书小节[]

在 aat 仓库根以 ``node --input-type=module -e`` 跑 ``parseAbundantTree({ mode: 'book-entry', … })`` 与 ``rdf12`` ，
再用 ``@asciidoctor/core`` 的 ``load(源文, { safe: 'unsafe', base_dir, attributes: { docname: 'book', docdir, docfile } })``
渲染同一本书（脚本在 ``.aktant/bookgraph/tmp/分身-25.4/href.mjs`` ，2026-10-31，aat ``f72e636`` 之后的 dist）：

.. list-table::
   :header-rows: 1

   * - 写法
     - aat 的 officialHref
     - Asciidoctor.js 渲染
   * - ``xref:chapters/b.adoc#本书小节[]``
     - ``chapters/b.html#本书小节``
     - ``#本书小节``
   * - ``xref:chapters/b.adoc[章节]``
     - ``chapters/b.html``
     - ``#``
   * - ``xref:../02-other/book.adoc#本书小节[]``
     - ``../02-other/book.html#本书小节``
     - ``../02-other/book.html#本书小节`` （一致）

第三行在 4.1.1 上一致；小荇当时在工作区（Asciidoctor.js 3）里看到"指回本书"也渲染成书内，那一半在这里没有复现，
不算进这份记录。

## 原因

实测：aat 的 ``officialXref`` （ ``src/asciidoctor-adapter.ts`` ）照 Asciidoctor 交给 ``convert_inline_anchor`` 的节点读
``path`` 属性，有 ``path`` 就是跨文档。

推断（没有单独验证）：book-entry 下 aat 交给 Asciidoctor 的是它自己展开过 include 的逻辑文档，Asciidoctor 的
``catalog.includes`` 里没有 ``chapters/b`` ；Asciidoctor 判断 xref 目标是不是本文档时会查这张表（被 include 进来的
文件算本文档），表是空的，它就把 ``chapters/b.adoc`` 当成别的文档、给出 ``path`` 。真实渲染时 Asciidoctor 自己处理
include，表里有它，于是写成书内。

## 修复要守住的

* book-entry 下，目标是本书 include 进来的源文件（带片段或不带）时，这处 xref 是书内引用：没有
  ``aat:targetDocument`` ，片段在本书的 label 空间里绑定， ``aat:officialHref`` 与渲染一致（ ``#片段`` ）。
* 目标是本书以外的文档时照旧。
* 下游现状：bookgraph 25.2 自己按"本书 book.adoc 或本书源文件就是书内"判（ ``.aktant/bookgraph/src/bookgraph/review.py`` ），
  不读 officialHref，不受影响；修好以后它与 aat 的事实一致。

## 解决

:提交: 工作包 22.1（git log --grep "Work-Package: 22.1"）

推断经实测证实：book-entry 预处理用官方 PreprocessorReader 展开 include，那份文档的 ``catalog.includes`` 是满的；之后解析逻辑文本时新开了一份文档，表丢了，官方判书内的那一行（Asciidoctor.js 4.1.1 ``substitutors.js`` 1215 行起）看不到被拼进来的文件。

修法是把官方登记的事实原样交回官方，不让 aat 自己判“是不是本书源文件”： ``readPreprocessedLines`` 交出 ``catalog.includes`` ，逻辑文档带上它（ ``officialIncludes`` ）， ``loadSource`` 以 ``parse: false`` 加载、填表、再解析。规约写在 06 号书第 5 章「Target Heading」、09 号书第 8 章 Xref Occurrence 与 10 号书第 7 章「Asciidoctor 调用」。

同根的另一处一起修了：官方认作本文档、又不带片段的引用（``xref:chapters/b.adoc[章节]`` 、single-file 里的 ``xref:本文件.adoc[]`` ）官方 ``refid`` 为空、写成 ``#`` ，指向文档本身；aat 原先把整串目标当 selector 去 label 空间找标题，现在没有 selector。

测试： ``test/rdf12-projection/included-file-xref.acceptance.test.ts`` （夹具 ``test/book-entry/fixtures/included-file-xref/`` ，含嵌套 include）钉住带片段的绑到本书那一节、 ``officialHref`` 为 ``#乙`` / ``#丙`` ；整章链接没有 selector 与 targetHeading、 ``officialHref`` 为 ``#`` ；按入口目录读路径，相对写引用文件的写法仍是跨文档；single-file 自引用不带片段时同样指向文档本身。修复前四条里有三条失败，按入口目录读的那条本来就对。
