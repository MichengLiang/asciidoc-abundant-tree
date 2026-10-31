# 026 行内锚点仍由 aat 的正则认，book-entry 下的锚点在回源之后去重

:发现: 2026-10-30，aat 计划 #12 的 12.2：xref 改由官方转换认定时，锚点（``[[id]]``、``anchor:id[]``）的扫描没有一起改。
:代码版本: asciidoc-abundant-tree 仓库 ``b9cc8e8``（0.3.0 之前）；0.2.6 同样。
:影响: 两处，都和 12.2 修好的 xref 是同一类问题。1. 锚点有没有，由 ``src/inline-occurrence-scanner.ts`` 的正则认，不经官方。透传里的锚点，aat 与官方的转换结果不一致（见下）。2. book-entry 下几个文件同一行同一列写着同样的锚点时，回源以后坐标相同，被当成重复只剩一条。xref 在 12.2 改成了先去重、再回源；这个缺陷在 0.2.6 让 aat 07 号书丢了 5 条 xref、11 号书丢了 12 条。锚点仍是旧顺序。
:涉及: ``src/inline-occurrence-scanner.ts``

## 复现（实测，第 1 处）

.. code-block:: asciidoc

   = T

   == 甲

   写法：`pass:[[[锚点]]]`，真锚点 [[真锚点]] 在这里。

   +++[[三加号]]+++

.. list-table::
   :header-rows: 1

   * - \ 
     - ``[[真锚点]]``
     - ``pass:[[[锚点]]]``
     - ``+++[[三加号]]+++``
   * - aat 0.3.0 之前的 ``anchorOccurrences``
     - 有
     - 无
     - 有
   * - 官方转换出的 HTML（``<a id>``）
     - 有
     - 无
     - 无
   * - 官方 ``getRefs()``
     - 有
     - 无
     - 有

官方在解析时就把段落里的行内锚点登记进 refs（不看 ``+++`` 透传），转换时却不输出它。所以“官方怎么认”在这里有两个答案：登记的目录，
还是转换的结果。

## 方向

照 12.2 的办法交给官方：同一个探测转换器也会收到 ``type`` 为 ``ref`` 的 ``convert_inline_anchor``，扫描器只给位置。去重挪到回源之前。
透传里的锚点该不该算，先定规约（09 号书第 8 章）：xref 以转换结果为准，锚点若以 refs 目录为准，两者就各用一套标准。

## 采纳

:采纳: 2026-10-31，小汤

要做。复测（f72e636）：+++[[三加号]]+++ 进了 anchorOccurrences 与 targets，并成为标题的 addressLabel；行内锚点目标由 aat 自己的扫描器加入（src/binding-merge.ts 的 addAnchorTargets），不经官方。记录里留的疑问（以 refs 目录还是转换结果为准）在这里消掉：两者回答的是两个问题。“这段文字是不是 xref”看行内转换（12.2）；“这个 id 能不能被寻址”看官方 refs 目录 getRefs()，官方解析 xref:三加号[] 查的就是它，并解析到 #三加号。HTML 里没有 <a id> 是渲染层的事，按“先服务 RDF 查询”排在后面。所以锚点 id 在不在以 getRefs() 为准，扫描器只给位置；book-entry 下的去重挪到回源之前，同 12.2。设计随修复的工作包写进 09 号书第 8 章。

## 解决

:提交: 工作包 18.4（git log --grep "Work-Package: 18.4"）

锚点改由官方认定，与 xref 同一个机制（09 号书第 8 章 Anchor Occurrence 重写的几段）：扫描器给出候选与位置，anchor-recognition 把候选按位置放进 xref 的区域文字，交给收下这段文字的官方节点重跑替换；探测转换器接到的 convert_inline_anchor（type ref 或 bibref）紧跟在哪个候选的哨兵后面，官方就认下了哪个。适配层的探测核心（probeMarked）由 xref 与锚点共用。块锚点（单独一行的 [[id]]）与节标题末尾的 [[id]]（官方用 InlineSectionAnchorRx 摘下当作节的 ID）按 refs 里这个 ID 是不是登记成块来判；参考文献条目按 refs 里的 bibref 登记判（InlineBiblioAnchorRx 锚定在文字开头，探测的哨兵会让官方认不出它，而 catalogInlineBiblioAnchor 对这一种的登记是完整的）。
采纳时定的“以 refs 目录为准”实测推翻了：Asciidoctor.js 4.1.1 只在读段落时登记行内锚点（parser.js 1181 行 catalogInlineAnchors），单元格只在文字以 [[ 开头时登记（table.js 528 行）；列表项、描述、单元格、块标题里的锚点都不进目录，HTML 里却都有 <a id>、官方 xref 的 href 照样指向它们；反过来 +++[[x]]+++ 进了目录，HTML 里却没有。照目录过滤时门禁有四条测试失败（节标题、回调列表、描述里的锚点与块锚点），正是 aat 一直投影成 addressLabel 的锚点。主刀改定以转换结果为准。于是记录的例子里 +++[[三加号]]+++ 与 pass:[[[锚点]]] 都不算，[[真锚点]] 照旧。
book-entry 下锚点改为先去重、再回源（finishAnchorOccurrences，照 finishXrefOccurrences）。新增 test/anchor-official-recognition.test.ts：透传里的不算；列表项、描述、单元格、块标题、块锚点、节标题末尾、参考文献条目里的照算；两个被包含的文件同一行同一列写着同样的锚点，两处都保留（把收尾改回先回源再去重，这一条就失败）。
