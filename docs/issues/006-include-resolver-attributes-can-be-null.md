# include 解析器收到的属性值可能是 null，类型却写作 string

- 发现：2026-10-21，小棉复核 create-asciidoc-multi-book-workspace 计划 #4（模板接入 includeResolvers）时测出。
- 代码版本：asciidoc-abundant-tree 仓库 `64ef955`（0.2.1）。
- 影响：`IncludeResolverRequest.attributes` 声明为 `Readonly<Record<string, string>>`，按类型写的解析器会对 `null`
  调用字符串方法；宿主（模板的 HTML 一侧）为了与 aat 交同一份属性，只能在调用处做类型断言。
- 涉及：`src/model.ts` 的 `IncludeResolverRequest`；`src/book-entry/include-resolvers.ts` 把 Asciidoctor 4 交来的属性原样转交。

## 复现（实测）

同一个解析器登记给 aat，directive 分别写：

| directive 属性 | 解析器收到的 `attributes` |
|---|---|
| `[,beta]` | `{"1": null, "2": "beta"}` |
| `[beta,,gamma]` | `{"1": "beta", "2": null, "3": "gamma"}` |

Asciidoctor.js 4 对留空的位置属性给 `null`，aat 原样转交。

## 方向

类型如实写出：`Readonly<Record<string, string | null>>`，并在注释里写明哪种写法会得到 `null`。是否在转交前把
`null` 去掉（不写这个键），要看宿主两侧能否一致：Asciidoctor.js 3 对 `[,x]` 给 `undefined`、对 `[a,,b]` 直接丢掉空位，
模板的 HTML 一侧把前者整理成 `null` 与 aat 对齐，后者无从还原，规约要求位置属性不能在中间留空。所以保留 `null`、
修正类型，对宿主最省事。
