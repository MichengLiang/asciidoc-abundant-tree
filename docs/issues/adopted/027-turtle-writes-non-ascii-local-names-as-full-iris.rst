# 027 Turtle 里非 ASCII 的字段与关系谓词写成完整 IRI，读不出前缀名

:发现: 2026-10-30，aat 计划 #12 的 12.1：字段改成 ``field:<原文>`` 以后，aat 写出的 Turtle 里 ``field:难度`` 仍是一整条 IRI。
:代码版本: asciidoc-abundant-tree 仓库 ``b9cc8e8``（0.3.0 之前）；依赖 n3 2.0.3。
:影响: 只影响 Turtle 的可读性，图本身是对的：pyoxigraph 读回以后 ``?h field:难度 ?v`` 照常查到。读 Turtle 的人看到的是``<https://micheng.dev/ns/asciidoc-field#难度>``，而不是 ``field:难度``。标题节点不受影响：0.4.0 起它们的局部名是投影器起的 ``heading-<N>``，以空前缀写成 ``:heading-2``。仍受影响的只有书的词，即 ``field:`` 与 ``rel:`` 下的中文局部名。
:涉及: ``src/rdf12-projection/turtle-serializer.ts``
:复测: ``bd62f3e`` 上仍复现（5dcc0b2 之后的 dist）：field:难度 写成完整 IRI；n3 最新 2.13.12 与 3.0.0-alpha.12 的 Writer 仍只缩写 ASCII 局部名。

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

0.4.0 之前（仓库 ``cdb1629``，标题身份已改为 ``heading-<N>``）用同一份源复测，两条字段谓词仍写成完整 IRI，标题写成 ``:heading-2``。

## 原因

n3 2.0.3 的 ``N3Writer.js`` 第 301–302 行，前缀名的局部名只认 ``[_a-zA-Z0-9][\-_a-zA-Z0-9]*``。Turtle 规约的 ``PN_LOCAL`` 收汉字与大部分
中文标点（``PN_CHARS_BASE`` 含 ``#x4E00`` 一带），所以 ``field:难度`` 本来能写成前缀名。上游有没有现成的议题，没有查。

## 方向

两条候选，不在这里定：

* 给 n3.js 提 PR，让 Writer 照 ``PN_LOCAL`` 判断，需要转义的字符（如 ``/``、``(``）写成 ``\/``；
* aat 的序列化自己补：写完以后再把能写成前缀名的完整 IRI 换回前缀名。

## 采纳

:采纳: 2026-10-31，小汤

要做，修在 n3.js 那一层：Writer 判断合法局部名时，以注册前缀 IRI 开头的那一支只认 ASCII，而 Turtle 的 PN_LOCAL 收汉字（#820 之后 ex:foo 那一支已照 PN_LOCAL 判断）。已提上游 PR rdfjs/N3.js#875（让两支共用 #820 的局部名模式，附往返测试与性能对比）。不在 aat 里另写 Turtle 后处理：那是在错的层再造一份序列化规则。上游合并发布后，aat 升级 n3（现锁 2.0.3，同时升到当时最新），核对书架与 cases 的 Turtle 只在前缀名写法上变化，随之关闭本记录。
