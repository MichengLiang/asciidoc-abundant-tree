# 027 Turtle 里非 ASCII 的字段与关系谓词写成完整 IRI，读不出前缀名

:发现: 2026-10-30，aat 计划 #12 的 12.1：字段改成 ``field:<原文>`` 以后，aat 写出的 Turtle 里 ``field:难度`` 仍是一整条 IRI。
:代码版本: asciidoc-abundant-tree 仓库 ``b9cc8e8``（0.3.0 之前）；依赖 n3 2.0.3。
:影响: 只影响 Turtle 的可读性，图本身是对的：pyoxigraph 读回以后 ``?h field:难度 ?v`` 照常查到。读 Turtle 的人看到的是``<https://micheng.dev/ns/asciidoc-field#难度>``，而不是 ``field:难度``。标题节点不受影响，它们经 ``@base`` 写成 ``<#红烧肉::火候>``。
:涉及: ``src/rdf12-projection/turtle-serializer.ts``

## 复现（实测）

.. code-block:: asciidoc

   = 菜谱

   [.dish, 难度=中]
   == 红烧肉

   落点:: 锅

``rdf12()`` 的 Turtle 里有 ``@prefix field: <https://micheng.dev/ns/asciidoc-field#>.``，谓词却写成：

.. code-block:: turtle

       <https://micheng.dev/ns/asciidoc-field#落点> "锅";
       <https://micheng.dev/ns/asciidoc-field#难度> "中".

## 原因

n3 2.0.3 的 ``N3Writer.js`` 第 301–302 行，前缀名的局部名只认 ``[_a-zA-Z0-9][\-_a-zA-Z0-9]*``。Turtle 规约的 ``PN_LOCAL`` 收汉字与大部分
中文标点（``PN_CHARS_BASE`` 含 ``#x4E00`` 一带），所以 ``field:难度`` 本来能写成前缀名。上游有没有现成的议题，没有查。

## 方向

两条候选，不在这里定：

* 给 n3.js 提 PR，让 Writer 照 ``PN_LOCAL`` 判断，需要转义的字符（如 ``/``、``(``）写成 ``\/``；
* aat 的序列化自己补：写完以后再把能写成前缀名的完整 IRI 换回前缀名。
