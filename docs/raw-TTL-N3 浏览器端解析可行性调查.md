# 关于 TTL / Turtle / N3 在纯浏览器前端解析的调查报告

结论先说清楚：**可以。TTL/Turtle 文本可以在纯浏览器、纯前端里完成解析，不必须经过 Node 后端。N3.js 也不是只能在 Node 上使用；它官方明确支持浏览器，通过 webpack/browserify 打包，或者直接加载浏览器 bundle。**我还做了一个最小 Playwright 实测：在 Chromium 页面里通过 `https://unpkg.com/n3/browser/n3.min.js` 加载 N3.js，然后用 `new N3.Parser({ format: 'text/turtle' })` 解析一段 Turtle 字符串，浏览器端成功得到 2 个 quad。

但这里有几个概念需要拆开，否则会误判技术路线：

1. **TTL 通常指 Turtle 文件格式**，也就是 RDF 的一种文本语法，常见扩展名是 `.ttl`，MIME 类型常见为 `text/turtle`。
2. **N3 既可能指 Notation3 语法，也可能指 N3.js 这个 JavaScript 库**。Notation3 比 Turtle 更强，包含规则、公式等扩展；N3.js 这个库可以解析 Turtle、TriG、N-Triples、N-Quads，也支持 Notation3 的一部分解析。
3. **普通 JSON 不是 RDF**。浏览器当然能解析 JSON，但普通 JSON 只会得到对象、数组、字符串、数字，不会自动知道哪个字段是 RDF subject、predicate、object。
4. **JSON-LD 是“带语义的 JSON”**。如果你接收的是 JSON-LD，浏览器里也可以把它展开、规范化，甚至转成 N-Quads；如果你接收的是普通 JSON，则需要额外 mapping / context / schema 才能转成 RDF。

## 1. N3.js 是否只能在 Node 使用？

不是。

N3.js 官方 README 说它是 JavaScript 的 RDF 处理库，提供 Turtle、TriG、N-Triples、N-Quads、Notation3 的解析，写出 Turtle/TriG/N-Triples/N-Quads，以及内存存储能力。官方安装段落里虽然先给了 Node 的 `npm install n3` 和 `require('n3')` 示例，但紧接着写明：N3.js 可以通过 webpack 或 browserify 在浏览器中工作；如果不熟悉这些工具，也可以直接走浏览器 bundle / CDN。

我进一步检查了 npm 包：当前 `n3` 包版本为 `2.0.4`，包内容里包含 `browser/n3.min.js`，大小约 280 KB。也就是说它不是只有 Node 入口，而是随包发布了浏览器 bundle。包依赖里有 `buffer` 和 `readable-stream`，这说明它的完整能力里包含一些 Node stream 兼容层；但这不等于不能在浏览器用。对于“前端页面拿到一段 TTL 字符串并解析成 quads”这个场景，浏览器 bundle 是可直接工作的。

我做的实测代码本质如下：

```html
<script src="https://unpkg.com/n3/browser/n3.min.js"></script>
<script>
  const ttl = `@prefix ex: <https://example.org/> .
  ex:s ex:p "hello" .
  ex:s ex:p2 ex:o .`;

  const parser = new N3.Parser({
    format: 'text/turtle',
    baseIRI: 'https://example.org/base'
  });

  const quads = parser.parse(ttl);
  console.log(quads.length);
</script>
```

在浏览器里得到的结果是：`N3` 全局对象存在，解析结果 `quadCount = 2`，第一条 quad 的 subject 是 `https://example.org/s`，predicate 是 `https://example.org/p`，object 是字面量 `hello`。所以这个问题不是理论上可行，而是实际可行。

## 2. 在纯前端里能做到什么？

纯浏览器前端可以完成这些事情：

- 用户粘贴一段 `.ttl` 文本，前端直接解析成 RDF/JS quads。
- 用户上传 `.ttl` 文件，前端用 File API 读文本，然后交给 N3.Parser。
- 前端 `fetch()` 一个 `.ttl` URL，拿到文本后解析。
- 把解析结果放进 `N3.Store`，在内存中做简单查询、match、遍历。
- 把 quads 再序列化回 Turtle / N-Triples / N-Quads 等格式。
- 对 JSON-LD 做浏览器端解析、展开、转成 N-Quads。

这里的“纯前端”并不要求完全没有构建工具。可以有两种方式：

第一种是**无构建工具**，直接用 CDN script：

```html
<script src="https://unpkg.com/n3/browser/n3.min.js"></script>
```

这种方式适合快速实验、原型、单页 demo。缺点是依赖外部 CDN，生产环境最好固定版本、加 SRI、或把文件 vendored 到自己的静态资源里。

第二种是**现代前端项目打包**，例如 Vite / webpack / Rollup：

```js
import { Parser, Store } from 'n3';

const parser = new Parser({ format: 'text/turtle' });
const quads = parser.parse(ttlText);
const store = new Store(quads);
```

这种方式适合正式前端应用。需要注意打包器对 Node polyfill 的处理。N3 的普通字符串解析路径通常问题不大，但如果你使用 StreamParser、Node stream 风格 API，打包体积和兼容层会更明显。生产项目里建议先做一个小 PoC，用目标打包器构建一次，看 bundle size、polyfill、tree-shaking 情况。

## 3. “接收一段 JSON 或结构化数据”这件事怎么理解？

如果你接收的是普通 JSON，例如：

```json
{
  "name": "Alice",
  "homepage": "https://alice.example/"
}
```

浏览器可以 `JSON.parse()`，但它并不知道：

- Alice 是一个资源还是一个字符串？
- `name` 对应哪个 IRI？是 `schema:name`、`foaf:name`，还是你自己的 ontology？
- `homepage` 是普通字符串还是 `@id` 类型的 IRI？
- subject 应该是什么？来自字段、URL、空白节点，还是外部上下文？

所以普通 JSON 到 RDF 需要一层显式映射。这个映射可以是你自己写的，也可以用 JSON-LD 的 `@context` 表达。

如果你接收的是 JSON-LD，例如：

```json
{
  "@context": {
    "name": "http://schema.org/name",
    "homepage": { "@id": "http://schema.org/url", "@type": "@id" }
  },
  "@id": "https://example.org/alice",
  "name": "Alice",
  "homepage": "https://alice.example/"
}
```

那它就已经带了 RDF 语义。浏览器端可以用 `jsonld.js` 处理。jsonld.js 官方 README 明确提供 Browser bundler、Browser bundles、cdnjs、jsDelivr、unpkg 等浏览器使用方式，并且提供 `toRDF`，可把 JSON-LD 序列化成 N-Quads。

因此，若你的输入是“结构化 JSON”，路线有两条：

- **你控制 JSON 格式**：建议直接设计成 JSON-LD，或者至少提供一个稳定 context / mapping。
- **你不控制 JSON 格式**：需要写转换器，把业务 JSON 映射成 RDF triples/quads。此时 N3.js 可以用于创建 quad、存储和写出 Turtle，但它不会自动理解普通 JSON。

## 4. 限制在哪里？

纯浏览器解析 TTL 可行，但有工程限制：

第一，**CORS 限制**。如果前端要 `fetch()` 远程 `.ttl` 文件，目标服务器必须允许浏览器跨域访问。Node 后端不存在同样的浏览器 CORS 限制。所以如果你要解析任意第三方 URL 上的 TTL，纯前端可能会被 CORS 卡住。用户本地上传文件或粘贴文本则没有这个问题。

第二，**大文件和性能**。浏览器里可以解析，但主线程解析大 TTL 会卡 UI。N3.js 有同步字符串解析用法，非常方便，但对大文件建议放到 Web Worker 里处理。若是几十 MB 甚至更大，应该认真考虑 worker、分块、流式处理、进度提示、取消按钮。纯前端可以做，但复杂度会上升。

第三，**stream API 差异**。N3.js 文档里的 `fs.createReadStream()`、`StreamParser` 等示例明显面向 Node stream。浏览器里最稳的是拿到完整字符串后 `parser.parse(text)`。如果一定要浏览器流式解析，需要自己处理 Web Streams 与库的接口适配，或者评估当前版本是否已经能被你的打包器顺利 polyfill。不要把“库支持浏览器”理解为“所有 Node stream 示例原样复制到浏览器都能跑”。

第四，**安全与资源消耗**。解析不可信 TTL 一般不是 XSS，因为解析器不是执行代码；但仍然可能遇到恶意超大输入、极深嵌套、复杂 blank node/list 结构导致内存或 CPU 消耗。前端应用应限制输入大小，必要时用 Web Worker 并提供超时/取消机制。

第五，**N3 推理能力不是完整语义引擎**。N3.js README 提到它支持 reasoning，但也说明目前规则推理只支持 premise 和 conclusion 里的 Basic Graph Patterns，不支持 built-ins 和 backward-chaining。也就是说，解析 TTL/Turtle 是一回事，完整 N3 推理是另一回事。如果你需要完整 N3 reasoner，可能要看 eye-js 或后端 reasoner。

## 5. 可以考虑的库

### N3.js

最直接的选择。适合：

- 解析 Turtle / TriG / N-Triples / N-Quads / 部分 N3。
- 浏览器里把 TTL 字符串变成 RDF/JS quads。
- 内存 Store 查询。
- 写出 Turtle/N-Triples/N-Quads。

我倾向于把它作为 TTL/Turtle 前端解析的首选，因为它 API 简洁、官方有浏览器说明、npm 包自带浏览器 bundle、实际测试也通过。

### jsonld.js

适合 JSON-LD，而不是普通 JSON 自动语义化。官方明确提供浏览器打包和浏览器 bundle，并支持 `toRDF` 转成 N-Quads。若你希望“前端接收 JSON 结构化数据，然后进入 RDF 世界”，JSON-LD 是比自己发明 mapping 更标准的路线。

### rdflib.js

rdflib.js README 明确说它是“Javascript RDF library for browsers and Node.js”，能读写 RDF/XML、Turtle、N3，能读 RDFa 和 JSON-LD，也有 store 和查询能力。它更像一个比较完整的 Linked Data/Solid 客户端库。若你做 Solid 或 linked data 客户端，rdflib.js 值得看；如果只是单纯 TTL parser，N3.js 更轻、更聚焦。

### rdf-parse / Comunica 生态

`rdf-parse` 走 Comunica actor 生态，能统一解析多种 RDF 格式。npm 依赖比较重，包括 HTML/RDFa/JSON-LD/N3/RDFXML 等多 actor。它适合需要“多格式统一入口”的系统，但对一个纯前端小工具来说可能偏重。若只是 Turtle，直接 N3.js 更简单。

## 6. 推荐工程方案

如果目标是做一个浏览器内的 TTL/JSON-LD 解析工具，我建议这样分层：

1. 输入层：支持粘贴文本、上传文件、可选 URL fetch。
2. 格式识别层：用户可手动选择 `text/turtle`、`text/n3`、`application/ld+json`、`application/n-quads`，不要完全依赖自动猜测。
3. TTL/Turtle 路径：使用 N3.js 的 `Parser`，输出 RDF/JS quads。
4. JSON-LD 路径：使用 jsonld.js 的 `toRDF(..., { format: 'application/n-quads' })`，再可选用 N3.js 解析 N-Quads 进入同一个 Store。
5. 数据层：统一存成 RDF/JS quads 或 N3.Store。
6. 展示层：显示 triples/quads 表格、prefix、错误位置、可导出 N-Triples/Turtle。
7. 性能层：大输入放 Web Worker，主线程只负责 UI。

如果只是快速验证，甚至可以一页 HTML 搞定：一个 textarea、一个 parse 按钮、一个结果表格，加载 `n3.min.js` 即可。

## 7. 最终判断

我的判断是：**TTL 在纯浏览器里解析完全可行，N3.js 不是 Node-only。**对“浏览器接收一段结构化数据并解析”这个需求，关键不在浏览器能力，而在输入格式是否已经有 RDF 语义：

- 输入是 `.ttl` / Turtle：直接用 N3.js。
- 输入是 N3：N3.js 可以解析，但完整 N3 规则推理不要过度期待。
- 输入是 N-Triples / N-Quads / TriG：N3.js 也适合。
- 输入是 JSON-LD：用 jsonld.js，必要时转 N-Quads，再进入 N3.js / RDF store。
- 输入是普通 JSON：必须先定义 mapping/context；浏览器能做，但库不会凭空知道 RDF 语义。

所以，如果你的目标是“完全本地、无后端、用户把 TTL 或 JSON-LD 扔进页面就解析”，这是现实可做的。如果目标是“前端从任意 URL 抓 TTL 并解析”，主要风险是 CORS。如果目标是“前端处理任意普通 JSON 并自动变成正确 RDF”，那就不是解析库问题，而是语义建模问题。

参考来源：

- N3.js 官方 README：`https://github.com/rdfjs/N3.js/`
- N3 npm 包信息与包内容：`n3@2.0.4`，包含 `browser/n3.min.js`
- jsonld.js 官方 README：`https://github.com/digitalbazaar/jsonld.js/`
- rdflib.js 官方 README：`https://github.com/linkeddata/rdflib.js/`

本地实测：我在 `/home/t103o/workbench` 下用 Node + Playwright 启动 Chromium，页面加载 `https://unpkg.com/n3/browser/n3.min.js`，在浏览器上下文中执行 `N3.Parser`，成功解析 Turtle 字符串并返回 quads。
