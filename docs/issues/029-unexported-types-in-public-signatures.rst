# 029 公开签名用到的七个类型没有从入口导出

:发现: 2026-10-31，小汤，计划 #14 期间为 aat 的 API 参考实测 TypeDoc 与 sphinx-js 时
:代码版本: ``86f465c``
:影响: 使用方写不出 rdf12 的参数类型、Rdf12Result 各字段的类型名；API 参考工具对它们报引用断裂
:涉及: ``src/index.ts:13-51``、``src/model.ts:63``、``src/model.ts:230``、``src/rdf12-projection/projector.ts:19-30``

## 现象与复现

在 aat 根目录用 TypeDoc 0.28.20（TypeScript 6.0.3）读两个公开入口：

.. code-block:: bash

   typedoc --entryPoints src/index.ts --entryPoints src/browser.ts --tsconfig tsconfig.json --json /tmp/aat-api.json --logLevel Warn

``86f465c`` 上的输出（与本题无关的 git remote、bookshelf 两条略去）：

.. code-block:: text

   [warning] NodeBase, defined in asciidoc-abundant-tree/src/model.ts, is referenced by browser.DescriptionListItemNode but not included in the documentation
   [warning] UnknownNode, defined in asciidoc-abundant-tree/src/model.ts, is referenced by index.AbundantNode but not included in the documentation
   [warning] Rdf12Projection, defined in asciidoc-abundant-tree/src/rdf12-projection/projector.ts, is referenced by index.Rdf12Result but not included in the documentation
   [warning] ExportWarning, defined in asciidoc-abundant-tree/src/animation-yaml-export/payload-parser.ts, is referenced by index.ExportAnimationYamlResult.warnings but not included in the documentation
   [warning] Rdf12Options, defined in asciidoc-abundant-tree/src/rdf12-projection/options.ts, is referenced by index.rdf12.options but not included in the documentation

``Rdf12Projection`` 的字段又用到四个同样没从入口导出的类型：``graph: Rdf12Graph``、``prefixes: Rdf12PrefixMap``、
``nodeIndex: Rdf12NodeIndex``、``labelCatalog: Rdf12LabelCatalog``（``src/rdf12-projection/projector.ts:24-36``）。
TypeDoc 只在 ``Rdf12Projection`` 收进文档以后才会对它们报同样的警告：计划 #14 期间的 sphinx-js 实测把
``Rdf12Projection`` 写进页面，开着 nitpicky 时剩下的引用断裂正是这四个。

记下以后少了两个：0.4.0 从 ``Rdf12Projection`` 去掉了 ``labelCatalog``（``git log --grep "Work-Package: 15.1"``），
计划 #17 删掉了动画 YAML 导出，``ExportAnimationYamlResult`` 与它露出的 ``ExportWarning`` 随之不在
（``git log --grep "Work-Package: 17.1"``）。剩下七个：``NodeBase``、``UnknownNode``、``Rdf12Projection``、
``Rdf12Options``、``Rdf12Graph``、``Rdf12PrefixMap``、``Rdf12NodeIndex``。

## 原因

``src/index.ts`` 显式列出导出的类型（``export type { AbundantDocument, … } from "./model"`` 与 ``Rdf12Result``），
上面七个类型不在列表里：

* ``NodeBase``、``UnknownNode`` 在 ``src/model.ts`` 里没有 ``export``（63、230 行）。``AbundantNode`` 是包含
  ``UnknownNode`` 的联合，各种节点类型都是 ``NodeBase & {…}``。
* 其余五个在各自模块里有 ``export``，入口没有转出：``rdf12(document, options: Rdf12Options)``、
  ``Rdf12Result = Rdf12Projection & {…}`` 直接露出它们。

## 影响到的使用方

* 使用方想在自己的代码里写出 ``rdf12`` 的参数类型、``Rdf12Result.graph`` 这样的字段类型时，只能用
  ``Parameters<typeof rdf12>[1]``、``Rdf12Result["graph"]`` 去绕，名字写不出来。
* 生成 API 参考的工具对这些类型报引用断裂；``-W -n`` 这类严格构建要么失败，要么得写忽略清单。

## 修复要守住的

* 公开签名（函数参数与返回、导出类型的字段）里出现的每个类型，使用方都能从 ``.`` 或 ``./browser`` 入口按名字导入；
  或者签名不再露出它。哪些导出、哪些收进签名内部，由修的人按 09 号书第 10 章（CLI 与库 API）的公共契约定。
* 判据可以直接写成测试：上面的 TypeDoc 命令对这两个入口不再报 "not included in the documentation"。
