# 032 06 号书与 09 号书没有写 hmeta: 宏写下的标题字段

:发现: 2026-11-01，小汤（分身），计划 #25 收尾
:代码版本: ``fdf2ef1``
:影响: hmeta: 宏的行为只有实现、没有规约，改它的人无从核对
:涉及: ``src/heading-inline-metadata.ts:17``、``bookshelf/books/06-rdf12-line-projection/chapters/06-field-and-complex-property.adoc:62``

## 现象

aat 认得标题切片里的 ``hmeta:字段[值, label=显示文本]`` 宏，把它投影成标题字段（0.7.0 起字段证据的
``aat:surface "heading-inline"`` ）。规约里没有它：09 号书（解析器）一处也没有写；06 号书（RDF 投影）只在
0.7.0 新增的《字段证据》一节里提到这种表面的名字。它的写法只出现在 12 号书附录 A 的一行表格里。

## 原因

实测：``rg -n "hmeta|headingInlineMetadata"`` 在 09 号书零处，06 号书只有字段证据一节与查询契约；实现在
``src/heading-inline-metadata.ts`` 与 ``src/inline-occurrence-scanner.ts`` 。规约先行的项目里，实现有、规约没有，
改它的人无处可依。

## 修复要守住的

- 09 号书写明宏的语法（位置值与 ``value=`` 、 ``label=`` ）、在标题切片里的作用范围、缺值时的行为
  （``missing-value`` ）；06 号书第 2 章写明它投影成哪个标题的字段。
- 或者，如果这种写法不该留，按规约先行删掉实现与 12 号书那一行：这是要由小亮定的去留，修之前先问。
