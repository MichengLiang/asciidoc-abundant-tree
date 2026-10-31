# 031 位置属性推出的 style 与 language 被投影成作者写的字段

:发现: 2026-11-01，小汤（分身），计划 #25 收尾的裁判比对
:代码版本: ``fdf2ef1``
:影响: 书架上带 [preface] 等位置属性的标题多出一个作者没写的 style 字段，按字段名查询的下游会读到它
:涉及: ``src/metadata-parser.ts:286``、``src/metadata-parser.ts:303``、``src/rdf12-projection/attributes.ts:162``

## 现象

``[preface]`` 、 ``[colophon]`` 这类只写位置属性的标题，图上多出一条 ``field:style`` ，作者并没有写 ``style=`` 。
裁判比对（计划 #25，aat 书架 12 号书，``book.adoc`` ）里三处::

    field:style "colophon"         book.adoc:25  [colophon]
    field:style "preface"          book.adoc:28  [preface]
    field:style "acknowledgments"  book.adoc:31  [acknowledgments]

0.7.0 起每个字段有字段证据，这三条证据如实写着 ``aat:fieldName "style"`` 、 ``aat:surface "attrlist"`` 。

## 原因

实测与读码：``src/metadata-parser.ts`` 的 ``parseAttrList`` 把第一个位置属性解析成 style 以后写进
``attributes.style`` （第 286 行），第二个位置属性在有 style 时写进 ``attributes.language`` （第 303 行）；
``src/rdf12-projection/attributes.ts`` 第 162 行把 ``attributes`` 的每一项都当成作者写下的 named attribute，
写成 ``field:`` 字段与字段证据。style 与 language 是 Asciidoctor 从位置属性推出的名字，不是作者写下的字段名
（06 号书第 2 章「标题头部属性」：named attributes 才进入 ``field:`` ）。

推断：块上的同一机制服务 ``[source,ts]`` 的语言（raw value object 的 ``aat:format`` 从这里来），所以修的时候
要把“推出的 style 与 language”与“作者写的 named attribute”分开存，不能直接删。

## 修复要守住的

- ``[preface]`` 标题没有 ``field:style`` ，也没有对应的字段证据；作者写的 ``[.dish, style=炖]`` 照旧是字段。
- ``[source,ts]`` 块的 ``aat:format "ts"`` 不变。
- 规约：06 号书第 2 章写明位置属性推出的 style 不进 ``field:`` 。
