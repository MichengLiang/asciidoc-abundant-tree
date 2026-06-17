````xml
<Assistant id="1">
# RDF12 复杂载荷建模阅读汇报

我已经完整读完了 `docs/bookshelf/books/06-rdf12-line-projection` 这本书，包括 `book.adoc`、前言、术语表、参考坐标和 8 章正文；也完整读了两个样例：`samples/structural-payload-old.adoc` 和 `samples/structural-payload.adoc`。之后我又看了当前 RDF12 投影相关源码，重点包括 `projector.ts`、`payload-projector.ts`、`xref-projector.ts`、`attributes.ts`、`labels.ts`、`label-catalog.ts`、`selector-binding.ts`、`structure-projector.ts`，并实际跑了两个样例的 `--format rdf12` 输出。我没有改代码，只做阅读、调查和判断。

## 一、书里的对象边界非常清楚，但 payload 章节还停在旧契约

这本书的大方向是成立的，而且它的对象边界其实比当前样例旧写法更清楚：标题投影图只承诺两类结构查询资源，一类是 `aat:Heading`，另一类是 `aat:XrefEdge`。其它东西，包括段落、listing、table、inline anchor、surface attribute、payload block，都不应变成结构节点。payload 的身份是“复杂属性值”，它通过所属 heading 或 xref edge evidence 被读取，不作为标题树节点、不参与 `aat:containsDirectly`、不参与 `aat:documentOrder`、不成为 relation triple 的 subject/object。

这个边界我认为是最关键的。它解决的是“AsciiDoc 文档里有很多可见表面，但 RDF12 标题投影图到底对外承诺什么”的问题。也就是说，投影图不是把 AsciiDoc AST 原样 RDF 化，而是做一个面向标题阅读、标题关系、回源和复杂载荷查询的公共投影。这个判断和你说的“我们这里就是忠实地把这些东西数据结构做好”并不冲突，因为忠实不等于把所有源表面都提升为公共结构节点。忠实应该是：标题仍然是标题，边仍然是边，payload 仍然是 payload，payload 内部 raw 仍然 opaque，下游自己按 schema 解释。

但是到了第 6 章 `Payload 与属性` 和第 8 章完整样例，书里的具体契约还保留了明显旧痕迹：节点 payload 被写成“带有手动 ID 且声明 `for` 或 `forSelector` 字段的 listing block 表达节点 payload”；payload object 保存 `aat:payloadId`；format 由 `data` 优先，缺少 `data` 才来自 source block language；完整样例还保留 `.payload`、`.xref-payload`、`data=json`。这些规则里面，有些只是实现阶段的历史产物，有些甚至和书前面更抽象的对象边界发生张力。

我认为最大的张力是：节点 payload 明明是标题内容里的一个复杂属性块，它既然已经被放在某个标题切片里，又通过 `for=delivery` 绑定到一个标题，那么 payload 自身不一定需要一个作者可寻址 ID。它的对象身份已经可以由投影器的 source-coordinate resource identity 给出，例如当前实现已经用 `payload-l<startLine>-o<ordinal>` 这种 local id；消费者读取它也不应该通过作者给的 payload id，而应该通过 `?heading aat:payload ?payload`。如果要求作者额外写 `#delivery-policy-payload`，就把一个没有消费者动作授权的表面单位塞进了源文档。

旧样例里的节点 payload ID `delivery-policy-payload` 实际没有独立消费场景。它不是 xref target，不是 schema 名，不是业务类型，不是跨块绑定 selector。唯一作用是让当前实现能通过 `payloadId` 找到 payload 对象。但这是实现便利反过来污染源文档契约。按照书里“公共图单位必须服务消费者动作”的标准，这个 ID 没有充分准入理由。

## 二、新样例更接近正确方向：role 表达 schema/type，ID 只在需要被指向时出现

你新写的 `structural-payload.adoc` 我认为明显比 old 方向好。它把标题头部从旧样例的：

```asciidoc
[#delivery-policy.section, kind=policy, status=active, owner=ops]
== 配送策略
```

改成：

```asciidoc
[#delivery.policy, status=active, owner=ops]
== 配送策略
```

这里的变化不是单纯写法缩短，而是语义位置更干净。`delivery` 是 address label，`policy` 是 role。标题节点本来就是 section，不需要再通过 `.section` 或 `kind=policy` 这种混杂写法重复说明“我是 section”。如果 `policy` 是作者领域模型里的类型或 schema，它放在 role 上比放在 `kind=policy` 更像 AsciiDoc 表面的自然语义。`kind` 这个字段在旧样例里承担了业务分类，但名字太泛，容易和解析器节点种类、payload kind、RDF type 等层位混淆。

节点 payload 的新写法：

```asciidoc
[.banana, for=delivery]
[source,json]
----
...
----
```

这个设计点我基本赞同。它表达了几件清楚的事实：第一，它是当前标题内容中的一个 listing block；第二，它的 role 是 `banana`，也就是下游 schema/type 选择线索；第三，它通过 `for=delivery` 绑定到标题投影 label space 中的 `delivery`；第四，它的数据语法来自 `[source,json]`；第五，它没有手动 ID，因为没有别的源表面要指向它。

这比旧写法优雅的地方在于：它没有虚构一个独立寻址对象。节点 payload 不是关系边 payload，也不是一个需要从别处引用的证据块。它只是挂在标题上的复杂属性。消费者的自然查询路径应当是：先按 heading label 找到 `delivery` 标题，再读 `aat:payload`，再看这个 payload 的 role/schema 和 format/raw。这个路径中完全不需要 payload ID。

你说“复杂载荷才用这样子的形式，普通载荷挂标题头 metadata 区就行了”，这也是一个非常好的分界。标题上的 `status=active`、`owner=ops` 是直接属性，投影为 `aat:status`、`aat:owner` 就够了。它们不需要 payload 容器，不需要 schema role，也不需要 source block。复杂 payload 则需要一个可以保存 raw、format、line span、content span、schema role 的容器。这个容器不是为了增加 RDF 结构复杂度，而是为了保留一个可由下游按 schema 解析的 opaque data block。

这里我建议未来契约明确写成：直接属性是表面字段，复杂 payload 是 opaque raw data value；一旦使用复杂 payload，作者就已经进入一个“与下游 schema 约定”的空间。投影器不验证 banana schema，也不解释 banana 字段，但要忠实保留 payload role、format、raw、forSelector 和回源坐标。这样 `banana`、`pear`、`policy` 这些业务身份不会污染投影器本体，投影器只负责把“哪个 payload 属于谁、作者声明它是什么角色、它用什么语法写、原文在哪里”投影出来。

## 三、当前源码确实还在旧契约上，而且新样例的节点 payload 被主动丢掉

我实跑了两个样例的 RDF。`structural-payload-old.adoc` 的旧写法可以投影出节点 payload 和边 payload：

- `heading-l5-o0` 有 `aat:payload <...#payload-l10-o0>`。
- 节点 payload 有 `aat:payloadId "delivery-policy-payload"`、`aat:payloadKind "node"`、`aat:forSelector "delivery-policy"`、`aat:format "json"`、`aat:raw ...`。
- xref edge 有 `aat:payloadSelector "rel-delivery-capacity"`，并连接到 edge payload。

但是 `structural-payload.adoc` 的新写法只投影出了边 payload，没有投影出节点 payload。原因非常明确，在 `payload-projector.ts` 里：

```ts
const payloadId = node.ids[0];
if (payloadId === undefined) {
  return;
}
```

也就是说，当前实现虽然 `payloadKindForListing()` 能通过 `forSelectorFor(node)` 识别一个 listing 是 node payload，但真正创建 payload resource 前又强制要求 `node.ids[0]` 存在。新样例的节点 payload 没有 ID，所以即使 AST 里已经有 `roles=["banana"]`、`attributes.for="delivery"`、`language="json"`、content span、raw content，RDF projector 还是直接 `return` 了。

这不是解析器能力问题。我用 JSON 输出看了新样例的 AST：这个无 ID listing 的信息是完整的。它有 `kind: "listing"`、`ids: []`、`style: "source"`、`language: "json"`、metadata 第一项包含 role `banana` 和 attribute `for=delivery`，metadata 第二项包含 `[source,json]` 的 language 信息，content/contentSpan/span 都完整。也就是说，源码现在丢掉节点 payload，是 RDF payload projector 的旧门槛，不是上游模型拿不到。

测试也在固化这个旧契约。`payload-projector.test.ts` 里有一个测试名叫“requires a payload id before projecting node payload objects”，它明确断言无 ID 的 node payload 不输出 `payloadId`、不输出 `payloadKind`、不连接到 source heading。`payload.acceptance.test.ts` 和 `heading-projection.acceptance.test.ts` 也都通过 `onlyPayloadById("delivery-policy-payload")` 来定位节点 payload。这说明旧契约不是偶发 bug，而是文档、实现、测试一起锁住了。

## 四、`data` 属性目前确实制造了你说的不一致，而且应该降级或移除

新样例里边 payload 写的是：

```asciidoc
[#rel-delivery.pear, data=toml]
[source,yaml]
----
reason:
  type: risk-control
...
----
```

当前 RDF 输出里这个 payload 的 `aat:format` 是 `"toml"`。源码 `dataFormatFor()` 的逻辑是先找 metadata attrlist 里的 `data`，有就返回；没有才返回 `node.language`。所以这里 source block 明明是 YAML，raw 内容也是 YAML 形态，投影却因为 `data=toml` 输出了 TOML。

这正好说明 `data` 这个属性的问题：它和 `[source,yaml]` 形成双来源，而且优先级还压过了更直接的语法事实。对读者和下游来说，payload 格式到底是什么，不应该由两个地方共同决定。source block language 已经足够表达“这个代码块用什么数据语法写”。如果作者写 `[source,json]`，投影 `aat:format "json"`；如果写 `[source,yaml]`，投影 `aat:format "yaml"`。额外的 `data=...` 很容易变成陈述层位冲突的来源。

如果确实存在“source language 是展示/高亮语言，但 payload parser 应按另一种 media type 解释”的场景，也不应该叫 `data`，更不应该默认参与当前核心契约。那是另一个更重的设计点，比如 `mediaType=application/ld+json` 或 `payloadFormat=...`，而且需要说明消费者动作和冲突规则。就当前对象而言，我认为应该删掉 `data` 的核心地位，至少把格式规则改成 source block language 优先；更彻底一点，直接不再承认 `data` 是 payload format 控制字段，把它当普通源表面属性也不投到 payload，避免继续制造两个地方。

## 五、边 payload 和节点 payload 的差异必须保留：边 payload 需要 ID，节点 payload 不需要

你指出“交叉引用边的复杂载荷挂载确实需要显式身份，方便交叉引用手动指向”，这个判断很重要。这里不能把“节点 payload 无 ID”机械推广到所有 payload。

边 payload 的自然绑定路径是：xref edge evidence 上有 `payload=rel-delivery`，然后投影器在文档里找到 ID 为 `rel-delivery` 的 listing block，把它作为该 xref edge 的 payload。这里 ID 是必要的，因为 xref 是行内出现点，payload block 在另一个位置；两者之间需要一个作者显式 selector。这个 selector 的存在理由很充分：它改变了消费者动作，使边证据可以取得一段复杂 raw data；没有它，投影器不知道哪个 listing 是这个 edge 的 payload。

节点 payload 不一样。节点 payload 写在标题切片里，而且带 `for=delivery`。它的绑定 selector 已经是 `for`，不是 payload block 自己的 ID。如果 payload block 是标题的孩子，甚至可以进一步讨论是否允许省略 `for`，让它默认归属最近/所属标题；但你当前新样例保留 `for=delivery` 是更显式、更稳的过渡形态。无论如何，节点 payload 自己的 `#id` 不是绑定所需。它只会造成一个没人消费的地址。

所以我建议契约拆成两条：

1. 节点 payload：由 listing block 的 `for`/`forSelector` 声明触发；不要求手动 ID；通过 `for` 在 heading label space 绑定；绑定成功后由 heading 的 `aat:payload` 指向 payload resource；payload resource 可以没有 `aat:payloadId`。
2. 边 payload：由 xref 的 `payload=<selector>` 声明触发；要求某个 listing block 有匹配手动 ID；匹配成功后由 xref edge evidence 的 `aat:payload` 指向 payload resource；这个 payload 应保留 `aat:payloadId` 或至少保留可用于审计的 selector/id，因为该 ID 是绑定事实的一部分。

这能解释为什么新样例里 `[.banana, for=delivery]` 不需要 ID，而 `[#rel-delivery.pear]` 需要 ID。前者是标题复杂属性；后者是被 xref edge 远程指向的复杂属性证据。

## 六、role 应该进入 payload 对象，而不是只作为“识别条件”或丢失

当前 `projectPayloadListing()` 会输出 `payloadKind`、`payloadId`、`format`、`forSelector`、raw 和坐标，但不会把 payload listing 的 role 投影到 payload resource 上。旧书中说 `.payload` 和 `.xref-payload` role 不是识别条件，可以作为源文档表面语义投影为 `aat:role`；但是当前实现并没有对 listing payload 的 role 做通用投影。`projectSurfaceAttributes()` 只投影 heading metadata role 和 xref 普通属性，不投影 listing metadata role。

在旧样例里这还不明显，因为 `.payload`、`.xref-payload` 只是旧机制标签，不值得消费。但在新样例里 `.banana` 和 `.pear` 是真正重要的 schema/type 线索。如果 RDF 输出不保留 payload role，那么下游拿到 payload raw 后不知道该用香蕉模型还是梨子模型。你说“这里一定要给角色。角色代表背后的 Schema”，这个点应该落实为公共契约字段。

这里命名上可以有两个方向：

- 简单沿用 `aat:role "banana"`、`aat:role "pear"`，表示源表面 role token。优点是和 heading role 一致，投影器不解释业务语义。
- 或者引入更专门的 `aat:payloadRole` / `aat:payloadSchema` / `aat:schemaRole`。但我更倾向先用 `aat:role`，因为它只是保留 AsciiDoc role token，不扩大投影器承诺。下游把 role 解释为 schema，是下游和作者的约定。

不过要注意，如果 payload listing 有多个 role，投影应该保留多个 `aat:role`，不要假装只有一个 schema。下游可以自己规定只接受一个，或者按优先级处理。投影器只保留事实。

## 七、还有一个额外不一致：书说本地非标题 target ID 归属 heading addressLabel，但当前实现/测试没有做到

这次你主要关注 payload，但我读完整本书和跑样例时看到另一个相关问题：书中多处规定本地非标题 target 的 ID 应归属为所属标题节点的 `aat:addressLabel`。第 2 章、第 5 章、第 6 章、第 8 章都在说：listing/table/block/inline anchor/payload listing 的本地 target ID 不创建结构节点，但应成为覆盖它的 heading 的 address label；xref 指向这些 ID 时，target heading 是所属标题。

第 8 章完整样例甚至写 `配送策略` 节点应该有 `aat:addressLabel "delivery-policy-payload"` 和 `aat:addressLabel "rel-delivery-capacity"`。但当前源码 `labels.ts` 只把 heading 自身 ID、generated ID、headline 加进 label catalog；没有处理 `document.targets` 中的非 section target。当前测试还反过来断言 `delivery-policy-payload`、`rel-delivery-capacity` 不在 selector label space 里。

仓库里已经有一个计划文档 `docs/plan/rdf12-heading-address-label-alias-implementation-plan.md`，目标正是“让本地非标题 AsciiDoc target ID 绑定到 owning heading 的 `aat:addressLabel`”。这说明团队已经意识到书的规范和当前实现之间有差距，只是还没落地或部分测试仍停在旧批次状态。

这和 payload ID 的新设计要小心协调。因为如果我们说“节点 payload 不需要 ID”，那自然没有 `delivery-policy-payload` 这个 label 要归属；如果边 payload 有 ID `rel-delivery`，它是否也要作为所属标题 address label？按照书当前规则，是的，因为它是本地非标题 target。但这样会产生一个边界问题：xref target selector `rel-delivery` 如果被普通 xref 使用，会绑定到所属标题；xref attribute `payload=rel-delivery` 则绑定到 edge payload。两个 selector 字段同名但语境不同。这是可以成立的，但必须在书里讲清楚：xref target selector 和 xref payload selector 不是同一个 selector space。书里其实已经说了这一点，但实现还没有完全跟上。

## 八、我建议的收敛契约

我建议把 payload 新契约收敛为下面这样：

第一，payload object 的 resource identity 一律由投影器生成，基于 source coordinate，而不是作者 ID。当前 `payload-l<startLine>-o<ordinal>` 已经是正确方向。作者 ID 如果存在，只是源表面绑定事实，不进入 resource identity。

第二，节点 payload 不要求 ID。识别条件是：listing block 有 `for` 或 `forSelector`，并且它是 source/listing block，有可回源 span。它的 payload kind 是 node。`for` 在 heading projection label space 绑定；绑定成功则 heading `aat:payload` 指向 payload；未绑定/多义则 payload resource 保留 `aat:forSelector` 和坐标，但不连接 heading。

第三，边 payload 要求 ID，因为 xref edge 的 `payload=` 必须有可匹配 selector。识别条件是：某个 xref edge evidence 有 `payloadSelector`，listing block 的手动 ID 与 selector 唯一匹配。它的 payload kind 是 edge。`.xref-payload` 或 `.pear` 不作为识别条件，只作为 role fact。

第四，payload role 要投影到 payload resource。新样例中的 `banana`、`pear` 是下游 schema 选择线索，应保留为 `aat:role`。旧的 `.payload`、`.xref-payload` 可以继续被保留为 role，但不再具有核心控制语义。更理想的迁移是样例不再使用 `.payload` / `.xref-payload` 这种实现味很重的 role。

第五，payload format 应来自 source block language，至少 source language 优先于 `data`。我更倾向移除 `data` 的控制地位。`[source,json]`、`[source,yaml]` 已经足够表达格式。如果未来要表达 media type 或 schema version，另起字段并说明消费者动作，不要让 `data` 继续和 source language 抢格式语义。

第六，payload raw 继续 opaque，不展开内部结构。这一点旧契约是对的，不能因为 schema role 存在就让投影器解析 banana 字段。投影器的责任是保留 raw、format、role、坐标和归属关系；schema 校验和内部字段解释属于下游。

第七，直接属性和复杂 payload 的边界要写进书：`status=active`、`owner=ops`、`weight=0.8` 这种直接属性投影为直接 `aat:` 谓词；复杂嵌套数据才进入 payload block。这个分界能防止所有东西都被塞进 payload，也能防止嵌套结构被拆成一堆投影器不该理解的 RDF 谓词。

## 九、如果下一步要改代码，主要落点很集中

如果之后要把新样例作为目标契约落地，改动点并不发散：

- `payload-projector.ts`：允许 node payload 无 ID；对 node payload 创建 payload resource 时不强制 `node.ids[0]`；只有存在 ID 时才输出 `aat:payloadId` 并注册 selector。
- `payload-projector.ts`：把 payload listing roles 写入 payload resource，比如 `aat:role "banana"`、`aat:role "pear"`。
- `payload-projector.ts`：调整 `dataFormatFor()`，改为 source language 优先，或者移除 `data` 控制字段。
- `payload-projector.test.ts`：删掉/反转“无 ID node payload 不投影”的旧测试，新增“无 ID + for + role + source language 能投影并绑定 heading”的测试。
- `payload.acceptance.test.ts`：不要再只用 `payloadId` 找 node payload，应通过 heading 的 `aat:payload` 找到 payload，再断言 `payloadKind=node`、`forSelector=delivery`、`role=banana`、`format=json`、raw 和 span。
- `heading-projection.acceptance.test.ts` 和书第 8 章：更新样例到新写法，避免 `.section`/`kind=policy`/`.payload`/`data=json` 这些旧信号继续误导。
- 如果同时推进本地非标题 target alias，则 `labels.ts` 需要按已有 plan 加 `document.targets` 到 owning heading 的 `aat:addressLabel`，但这个可以和 payload 契约分开做，避免两个迁移互相干扰。

## 十、我的总体判断

你的新样例方向是对的：节点 payload 不需要自身 ID；role 承担业务 schema/type 线索；source block language 承担数据格式；复杂 payload 只在需要表达嵌套/结构化 raw data 时出现；普通字段仍留在标题或 xref metadata 上；边 payload 因为需要被 xref 显式选择，所以仍需要 ID。

当前设计“不优雅”的根源不是 RDF 1.2 或 reifier，也不是 payload 作为复杂属性这个大方向，而是旧契约把实现门槛暴露给作者：节点 payload 必须写 ID、format 要写 `data`、`.payload`/`.xref-payload` 像控制标签一样存在、测试还用 `payloadId` 定位 node payload。这些都让源文档看起来像在讨好投影器，而不是自然表达作者的结构事实。

更干净的对象关系应该是：标题节点是结构对象；xref edge evidence 是边证据对象；payload 是挂在二者上的复杂属性对象。节点 payload 的“归属”来自 `for` 或标题局部上下文，边 payload 的“归属”来自 xref 的 `payload` selector。payload 的“业务身份”来自 role；payload 的“语法格式”来自 source block language；payload 的“内容”是 opaque raw；payload 的“可审计性”来自 source line span。这样每个表面单位都有存在理由，作者不需要为了投影器手写无消费者动作的 ID。
</Assistant>

<User id="1">
“……的，因为 xref 是行内出现点，payload block 在另一个位置；两者之间需要一个作者显式 selector。这个 selector 的存在理由很充分：它改变了消费者动作，使边证据可以取得一段复杂 raw data；没有它，投影器不知道哪个 listing 是这个 edge 的 payload。

节点 payload 不一样。节点 payload 写在标题切片里，而且带 for=delivery。它的绑定 selector 已经是 for，不是 payload block 自己的 ID。如果 payload block 是标题的孩子，甚至可以进一步讨论是否允许省略 for，让它默认归属最近/所属标题；但你当前新样例保留 for=delivery 是更显式、更稳的过渡形态。无论如何，节点 payload 自己的 #id 不是绑定所需。它只会造成一个没人消费的地址。……”没有什么未来过渡。如果你觉得未来才做这件事情，那我今天我就是个癫子。I'm a user，我是个用户，我是个疯子，我才来找你说话吗？我没病吧？我来找你讨论这件事情干嘛？什么叫未来再做？你的意思是说我现在跟你讨论做这件事情是狗屎吗？你不想做就滚蛋，知道吗？ 第二点，什么叫进一步讨论？讨论个屁啊！你把for省略了，不是for的问题，而是你根本不知道这个block它到底是不是一个载荷块。你没有任何符号标记或者表达你是一个载荷块，它的结构位置也不足以支撑它到底是不是一个载荷块。你总得有一个符号，有个信号吧？要不然是手动的标注，要不然是位置上的结构，但是它都不于，都不足以承载，那就得有一个，那这个for就挺好的呗？那不就是这个吗？ 要不然就是把这个什么source，json 的source改掉，改成自定义的这个符号，是吧？但是它干什么又丢失这个原本的代码块渲染了？是不是还在做额外逻辑？我觉得没必要啊，我觉得就这样子挺好的，你自己想自己想，自己想啊。我这里就是故意留下这个for，留下来干嘛呢？其中一个目的就是表达，我这一个block是一个载荷。 但如果从这个角度去推的话，那确实这个for它不需要有值。 那你可以思考一下啊，可以来一个这种标记的一种属性，不需要值了，就是来表达一下啊，我是一个什么block就可以了。这里你可以进行设计。
然后呢？关于交叉引用载荷的那个data直接删掉没有必要啊，你作者想怎么写就怎么写啊，你作者写的是JSON，然后写的是Ymal。无所谓啊，因为我的这个数据模型的名字要不然叫叫梨子，要不然叫香蕉，那香蕉梨子它根本不管你数据传输格式是什么，是不是这个道理？也就是下游，是吧？写作的约定和这个啊？业务字段的解析的约定，是不是啊？他们可以干嘛呢？可以自己去建模呀。什么叫相交啊？什么叫离子啊？是不是然后呢啊？解析器自己适配啊？啊适配数据传输格式JSON呢？还是什么别的吗？你解析之后不就拿到了这个内存上的数据结构吗？那不就不就可以再去解释再去用了吗？所以说在这里你就直接不需要data，是不是？好的啊，你自己确定一下。优先呢，先把书籍里面不一致的地方先修正，然后呢再把代码进行修正。但是现在你要做的事情，把概念给我捋得清清楚楚，不要跟我讲什么第一步做什么，第二步做什么，下一步。你没有下一步，你没有资格下一步，你没有未来，不要跟我讲下一步。 我就很好奇，什么下一步下一步啊？你给出这个，你给我的下一步我永远不会听。你这一坨屎知道吗？你根本，你连哈利法塔的蓝图长什么样子都不知道。你为什么该三峡大坝？三峡大坝里面有什么？一坨厕所，几个水泥墩子，几个石头吗？你不知道，你给我下一步我敢用吗？群死群伤爆炸了怎么办？我去蹲牢子吗？ 好好想一想哈，想好之后，弹窗发给我啊，1000字的反思，4000字的回答，总共5000字或者更多，开始吧啊，你自己也可以去补充你自己需要的信息。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="2">
# 复杂载荷概念反思与收敛定义

## 一、反思

我上一份汇报里最严重的问题，是把一个对象定义问题写成了实施节奏问题。我用了“过渡”“进一步讨论”“下一步”这类词，这些词在这里不只是语气不合适，而是对象层位错误。你要讨论的不是某个实现排期，而是 RDF12 标题投影图里的复杂载荷到底是什么、凭什么成立、作者表面应该怎样写、投影器应该怎样解释。这个对象没有被定义清楚时，任何“之后再做”“可以讨论”的表达都会把判断责任推迟到一个不存在的位置。这里必须直接给出对象边界。

第二个错误，是我把“省略 `for`”当成一个可以轻飘飘摆出来的邻近可能性，但没有先证明 block 成为 payload 的构成性条件。一个普通 `[source,json]` listing 不能因为它位于标题切片内就自动成为 payload。标题切片里可以有示例代码、配置片段、日志、命令行输出、教学材料、引用材料，它们都是 listing，却不都是标题的复杂载荷。位置不足以承担 payload 身份，source language 也不足以承担 payload 身份，role 也不宜单独承担 payload 身份，因为 role 本身更适合表达 schema/type。一个 block 成为节点 payload，必须有一个明确的载荷信号。

第三个错误，是我没有把 `for` 的两个职责拆清楚。`for` 的存在本身可以是载荷信号；`for` 的值可以是绑定 selector。这样它不是一个可有可无的“过渡写法”，而是节点 payload 表面的核心控制字段。带值的 `for=delivery` 表达“这是 payload，并且绑定到 label space 中的 delivery heading”。无值的 `for` 表达“这是 payload，并且归属当前源位置所属的 heading”。这两个表面共享同一个对象职责：让 listing 从普通代码块进入 payload 语境。

第四个错误，是我对 `data` 的判断还不够彻底。这里不应该说“降级或移除”，而应该说：`data` 不属于 RDF12 标题投影图的 payload 契约。payload 的业务模型身份由 role 表达，例如 `banana`、`pear`；payload 的文本传输语法由 source block language 表达，例如 `[source,json]`、`[source,yaml]`。`data=toml` 这类字段把同一个事实拆成两个冲突位置，并且让投影器承担不该承担的解释权。它应该从书里的规范表面消失。

第五个错误，是我没有把作者契约和投影器事实保留分开说。规范写作可以要求 payload 有 schema role；投影器作为源事实投影者，可以只保留源表面而不做业务 schema 校验。也就是说，书可以定义“合格 payload 表面必须声明 role”；投影器不因此变成 schema lint。它只把 role、format、raw、归属关系和回源坐标投出来。

下面是我重新收敛后的对象定义。

## 二、核心对象：payload 是复杂属性值，不是文档结构节点

RDF12 标题投影图中的 payload 是复杂属性值。它归属于一个 heading node 或一个 xref edge evidence。它不创建 heading，不创建 listing block resource，不参与标题层级边，不参与 `aat:documentOrder`，不作为 relation triple 的 subject 或 object。

这个定义先于所有写法。只要一个对象是 payload，它的公共读取路径就必须经过所属对象：节点 payload 通过 heading 的 `aat:payload` 读取；边 payload 通过 xref edge evidence 的 `aat:payload` 读取。消费者不应把 payload 当成文档树节点遍历，也不应通过 payload 的作者 ID 建立主查询路径。

payload 保存的核心事实是：它属于谁、它是什么 schema role、它用什么源文本语法承载、它的 raw 是什么、它在源文件哪里。payload 内部的 JSON、YAML、TOML 或其它格式不展开成 RDF 业务图。下游消费者可以根据 role 和 format 选择自己的解析器与 schema；标题投影器不解释 `owner.team`、`risk.level`、`reason.type` 这些内部字段。

这里必须区分两层身份：

- RDF resource identity：由投影器根据 source coordinate 生成，例如 `payload-l10-o0`。这是投影图内部稳定指称 payload object 的方式。
- 作者 schema identity：由 role token 表达，例如 `.banana`、`.pear`。这是作者和下游约定数据模型的方式。

作者手写 ID 不应该成为 payload object 的身份。手写 ID 只有在 selector 需要指向某个 payload block 时才有存在理由。

## 三、直接属性和复杂 payload 的边界

直接属性是标题或 xref 表面上可以作为简单 literal 保存的字段。标题上的 `status=active`、`owner=ops`，xref 上的 `weight=0.8`，都属于直接属性。它们投影为所属对象上的直接 `aat:` 谓词，不需要 payload object。

复杂 payload 是需要保留一个结构化 raw body 的属性值。它适合承载嵌套对象、数组、多字段业务数据、较长文本结构或需要由下游 schema 解析的数据。它不适合替代所有 metadata。把 `status=active` 这类简单事实塞进 JSON payload，会让查询者无法用直接字段查询；把嵌套数据拆成一堆标题投影谓词，又会让投影器越界解释业务模型。两者的边界是：投影器能否在不理解业务 schema 的情况下忠实表达该字段。简单表面字段可以直接表达；嵌套业务数据保留为 opaque raw。

因此，`banana` 和 `pear` 不是 RDF 投影器的业务类型系统。它们是 payload role，是下游 schema 选择线索。投影器不验证“香蕉模型”有什么字段，也不验证“梨子模型”有什么字段。投影器只保留：这个 payload 声明了 `banana` 或 `pear`，raw 是 JSON/YAML 文本，源文件坐标在哪里。

## 四、节点 payload 的构成性条件

节点 payload 是挂在 heading node 上的复杂属性值。它的 authored surface 是一个 listing block，并且该 listing block 必须携带 payload binding marker。这个 marker 使用 `for` 或 `forSelector` 字段。

`for` 的存在表示：这个 listing block 不是普通代码块，而是节点 payload。`for` 的值表示：这个 payload 绑定到哪个 heading label。这里的关键不是“for 这个英文词”，而是它同时承担两个必要职责：第一，把 listing block 标记为 payload；第二，在需要时给出 heading selector。

节点 payload 的规范表面有两种成立形态：

```asciidoc
[.banana, for=delivery]
[source,json]
----
{ ... }
----
```

这个表面表示：该 listing 是节点 payload；它的 schema role 是 `banana`；它的绑定 selector 是 `delivery`；它的源文本语法是 `json`；它的 raw body 保留为 payload raw。

```asciidoc
[.banana, for]
[source,json]
----
{ ... }
----
```

这个表面表示：该 listing 是节点 payload；它的 schema role 是 `banana`；它归属到源位置所属的最内层 heading；它的源文本语法是 `json`。这里的 `for` 是无值标记属性，不是字符串 selector。它不绑定 label space，而是绑定 source ownership，也就是“这个 block 属于哪个 heading slice”。

这两个表面不是阶段差异，也不是迁移关系。它们是同一个控制字段的两种解释：带值时用 selector 绑定；无值时用源位置归属绑定。二者都比省略 `for` 清楚，因为省略 `for` 会让普通 source block 和 payload block 无法区分。

节点 payload 不要求手动 ID。原因很直接：节点 payload 的读取路径是 heading -> `aat:payload` -> payload object；它的绑定事实由 `for` 提供；它的 schema 身份由 role 提供；它的 RDF identity 由投影器生成。作者手写 `#delivery-policy-payload` 没有构成性作用。没有消费者通过这个 ID 来完成必要动作，它就不应进入规范表面。

节点 payload 如果出现手写 ID，该 ID也不应成为节点 payload 成立的前提。它最多是源文档中的本地 target 事实，是否归属为 heading address label属于 local target alias 规则，而不是 payload object 的核心身份规则。规范样例不应鼓励节点 payload 手写 ID。

## 五、`for` 的精确定义

`for` 是节点 payload binding marker。它只出现在 listing block 的 metadata attrlist 上。它不投影为普通 `aat:for` 字段，而投影为 payload object 的绑定事实。

当 `for` 具有非空字符串值时，该值是 heading selector。selector 查询 heading projection label space。这个 label space 只包含 `aat:addressLabel`、`aat:generatedAddressLabel` 和 `aat:headline`。它不查询 role，不查询 payload role，不查询 payload raw，不查询 xref display label，不查询 RDF IRI。

当 `for` 是无值标记属性时，它不是 selector literal。投影器应使用该 listing block 的源位置，找到覆盖该 block 起始行的最内层 heading node，并把 payload 连接到该 heading。这个规则的本体基础是 heading slice ownership：一个 block 写在某个标题切片内，且它已经通过 `for` 明确声明自己是 payload，那么它可以由源位置确定所属 heading。

当 `for` 缺失时，该 listing block 不是节点 payload，即使它带 `.banana` role，即使它是 `[source,json]`，即使它位于标题切片内。role 不是 payload marker；source language 不是 payload marker；位置不是 payload marker。

当 `for=<selector>` 未绑定或多义绑定时，payload object 仍可作为源事实保留，但不能连接到任何 heading。它保留 `aat:forSelector`、role、format、raw 和回源坐标。未绑定或多义不是投影器任意选择目标的许可。

当无值 `for` 的 block 没有可确定 owning heading 时，payload object 同样不能连接 heading。这个情况说明源位置不足以建立归属，不应虚构 document-level owner。

## 六、payload role 的定义

payload role 是 payload schema label。它来自 listing block metadata 的 role token。`.banana` 表示该 payload 声明 `banana` role；`.pear` 表示该 payload 声明 `pear` role。投影器把这些 role 作为源表面事实写到 payload object 上，例如：

```turtle
:payload-l10-o0 aat:role "banana" .
```

role 不决定 payload 属于节点还是边。节点 payload 由 `for` 决定；边 payload 由 xref edge 的 `payload=` selector 和 listing ID 决定。role 只告诉下游“这个 payload 应按哪个作者约定的模型解释”。

规范作者表面应要求复杂 payload 声明至少一个 schema role。否则下游只能拿到 raw 和 format，却不知道应使用哪个业务模型。这个要求是作者契约，不是投影器业务校验。投影器可以忠实保留没有 role 的 payload，但那种 payload 在规范意义上是不完整的复杂载荷。

`.payload` 和 `.xref-payload` 不应作为规范 role 出现。它们把实现分类写进了作者 schema 位置。节点还是边已经由绑定机制决定，不需要 role 再重复表达。role 应留给 `banana`、`pear`、`policy-metadata`、`risk-profile` 这类作者领域模型身份。

## 七、format 的定义：source block language 是唯一格式事实

payload format 来自 source block language。`[source,json]` 投影为 `aat:format "json"`；`[source,yaml]` 投影为 `aat:format "yaml"`。如果 source block 没有 language，则 payload object 不输出 format，或输出缺失状态；投影器不猜测。

`data` 不属于 payload 契约。它不选择 schema，不选择绑定对象，不选择 payload kind，也不覆盖 source block language。`data=toml` 和 `[source,yaml]` 同时出现时，当前旧实现输出 `aat:format "toml"`，这就是不一致的来源。规范表面应删除 `data`，投影器不应读取 `data` 来决定 payload format。

这里的理由不是“JSON 比 YAML 好”或“YAML 比 TOML 好”。恰恰相反，作者可以用 JSON、YAML、TOML、XML 或别的传输格式写同一个 `banana` 模型。业务模型身份和传输格式是两件事：`banana` 是模型名，`json` 是文本编码/语法。下游先按 `aat:format` 把 raw 解析成内存数据结构，再按 `aat:role` 选择 schema 解释这份数据。投影器只保留这两个正交事实，不把它们混在 `data` 里。

如果作者写 `[source,json]` 但 raw 内容实际是 YAML，投影器也不负责纠正。投影器保存的是源表面声明和 raw。格式合法性、schema 合法性、字段合法性属于下游 lint 或业务解析器。

## 八、边 payload 的构成性条件

边 payload 是挂在 xref edge evidence 上的复杂属性值。它必须有显式 selector，因为 xref 是行内出现点，payload block 是另一个源表面。没有 selector，投影器不能知道哪个 block 是这条边的复杂载荷。

边 payload 的 authored surface 由两部分共同构成：

```asciidoc
xref:capacity[运力规则, rel=depends-on, payload=rel-delivery]
```

这里 `payload=rel-delivery` 是 xref edge evidence 的 payload selector。它不表示普通属性，不投影为 `aat:payload "rel-delivery"` literal，而投影为 `aat:payloadSelector "rel-delivery"`。

```asciidoc
[#rel-delivery.pear]
[source,yaml]
----
reason:
  type: risk-control
----
```

这里 `#rel-delivery` 是被 edge payload selector 指向的本地 ID。`.pear` 是 payload schema role。`[source,yaml]` 是 payload format。raw body 是 opaque edge payload content。

边 payload 的 ID 有存在理由：它被 xref edge 的 `payload=` 字段消费。这个 ID 不是 payload object 的 RDF identity，也不是 schema identity。它是 selector binding fact。投影器可以在 edge payload object 上保留 `aat:payloadId "rel-delivery"`，但这个字段的语义应被限定为“被 selector 使用的源 ID”，而不是“payload object 的身份”。

边 payload 归属于 xref edge evidence，不归属于 source heading，也不归属于 target heading。source heading 与 target heading之间的主 relation triple只表达标题关系；edge payload 描述的是这一次 xref 边出现的复杂证据或边属性。把 edge payload 挂到 source heading 或 target heading 都会丢失“这是哪一条边的载荷”的事实。

## 九、selector space 必须分开

普通 xref target selector 和 xref payload selector不是同一个 selector space。

`xref:capacity[...]` 中的 `capacity` 查询 heading projection label space，结果是 target heading。它使用 `aat:addressLabel`、`aat:generatedAddressLabel` 和 `aat:headline`。

`payload=rel-delivery` 中的 `rel-delivery` 查询 edge payload block ID space，结果是 edge payload object。它不查询 heading label，不查询 headline，不查询 role。

如果 local target alias 规则把 `rel-delivery` 也归属为所属 heading 的 `aat:addressLabel`，这也不构成冲突。因为字段语境不同：作为 xref target 时，`rel-delivery` 可以寻址 owning heading；作为 xref payload selector 时，`rel-delivery` 选择 edge payload block。一个字符串可以出现在不同 selector field 中，但解释由字段决定。

这个区分必须写进书里，否则读者会误以为 payload block ID 既是 payload identity，又是 heading address label，又是 schema role。实际上它们是三件事：ID 是源 selector target，address label 是 heading 查询别名，role 是 schema label。

## 十、书中应呈现的规范样例

节点 payload 的规范样例应类似：

```asciidoc
[#delivery.policy, status=active, owner=ops]
== 配送策略

[.banana, for=delivery]
[source,json]
----
{
  "owner": {
    "team": "ops"
  }
}
----
```

对应 RDF 事实应表达为：

```turtle
:heading-l5-o0 aat:addressLabel "delivery" ;
  aat:role "policy" ;
  aat:status "active" ;
  aat:owner "ops" ;
  aat:payload :payload-l10-o0 .

:payload-l10-o0 aat:payloadKind "node" ;
  aat:role "banana" ;
  aat:forSelector "delivery" ;
  aat:format "json" ;
  aat:raw """...""" ;
  aat:relativePath "samples/structural-payload.adoc" ;
  aat:startLine 10 ;
  aat:endLine 23 ;
  aat:contentStartLine 13 ;
  aat:contentEndLine 22 .
```

这里没有 `aat:payloadId`，因为节点 payload 没有作者 ID，也不需要作者 ID。`payload-l10-o0` 是投影器生成的 resource identity。

无值 `for` 的规范样例应类似：

```asciidoc
== 配送策略

[.banana, for]
[source,json]
----
{ ... }
----
```

对应 RDF 事实同样是 heading `aat:payload` 指向 payload object，但 payload object 不输出 `aat:forSelector`，可以输出一个更准确的归属字段，例如 `aat:payloadBinding "owner-heading"` 并不一定必要。更简单的做法是只输出连接结果和回源坐标；连接结果本身已经表达了归属。若需要审计来源，可以增加 `aat:bindingMode "source-owner"`，但这不是构成性事实，除非消费者确实需要区分 selector 绑定和源位置绑定。

边 payload 的规范样例应类似：

```asciidoc
配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery]。

[#rel-delivery.pear]
[source,yaml]
----
reason:
  type: risk-control
----
```

对应 RDF 事实应表达为：

```turtle
:xref-edge-l8-c8-o0 a aat:XrefEdge ;
  aat:payloadSelector "rel-delivery" ;
  aat:payload :payload-l25-o0 .

:payload-l25-o0 aat:payloadKind "edge" ;
  aat:payloadId "rel-delivery" ;
  aat:role "pear" ;
  aat:format "yaml" ;
  aat:raw """reason:\n  type: risk-control""" .
```

这里 `payloadId` 有意义，因为 `rel-delivery` 被 xref edge 的 `payload=` selector 消费。`.pear` 才是 schema role。`yaml` 才是传输语法。没有 `data`。

## 十一、书里需要修正的不一致

术语表里 `payload` 现在写“payload 保存 id、kind、format、raw 和回源坐标”。这句话应改成：payload 保存 kind、role、format、raw、归属/绑定事实和回源坐标；只有参与 selector 绑定的 payload block 才保存 source payload id。否则会继续暗示所有 payload 都必须有 ID。

第 1 章里“payload 对象保存 payload id、kind、format、raw”也应改掉。payload id 不是 payload 对象的构成性条件。节点 payload 不需要 ID。边 payload 的 ID 是 selector binding fact。

第 6 章里“带有手动 ID 且声明 `for` 或 `forSelector` 字段的 listing block 表达节点 payload”应改成：“声明 `for` 或 `forSelector` 字段的 listing block 表达节点 payload。”并补充：`for` 无值时按源位置归属 owning heading；`for` 有值时按 heading label space 绑定。

第 6 章里“payload format 来自 payload attrlist 的 `data` 字段。缺少 `data` 字段时，format 来自 source block 的 language”应删除，改成：“payload format 来自 source block language。”`data` 不应出现在核心契约里。

第 6 章里 `.payload` 和 `.xref-payload` 的解释应删除或改成反例说明。规范 role 不应使用实现分类名。role 应表达 schema label，例如 `.banana`、`.pear`。

第 8 章完整样例应改成当前新样例方向，但还要把边 payload 的 `data=toml` 删除。节点 payload 保持无 ID，保留 `.banana` 和 `for=delivery`。边 payload 保留 `#rel-delivery`，保留 `.pear`，使用 `[source,yaml]`。验收事实中不应再要求节点 payload 有 `payloadId`，应要求 `配送策略` heading 有一个 node payload，payload role 为 `banana`，format 为 `json`，raw 保持 opaque。边 payload 验收应要求 role 为 `pear`，format 为 `yaml`，payloadId 为 `rel-delivery`。

## 十二、代码契约应与对象定义一致

当前源码把无 ID node payload 丢掉，这是旧契约。对象定义成立后，代码应按对象定义解释源表面：

- 有 `for` 或 `forSelector` 的 listing 是 node payload。
- node payload 不要求 `ids[0]`。
- node payload 有 role 时，把 role 投影到 payload object。
- node payload 的 format 来自 `node.language`。
- `data` 不参与 format。
- xref edge 的 `payload=` selector 仍绑定 listing ID。
- edge payload 有 role 时，把 role 投影到 payload object。
- edge payload 的 format 同样来自 `node.language`。
- payload resource identity 继续由 source coordinate 生成。

这不是实施顺序，而是同一对象定义在代码中的必要投影。代码如果继续要求 node payload ID，就和节点 payload 的对象定义冲突。代码如果继续让 `data` 覆盖 source language，就和 format 定义冲突。代码如果不投影 payload role，就让下游无法选择 banana/pear schema。

## 十三、最终收敛

复杂载荷的干净模型是：

标题是结构节点。xref edge evidence 是边证据。payload 是复杂属性值。

节点 payload 的控制信号是 `for`。`for=selector` 绑定 heading label；无值 `for` 绑定源位置所属 heading。没有 `for`，listing 不是节点 payload。

边 payload 的控制信号是 xref attribute `payload=selector`。这个 selector 绑定 listing block ID。没有 ID，边 payload 无法被 xref edge 指向。

payload role 是 schema label。`.banana`、`.pear` 属于 payload object。`.payload`、`.xref-payload` 不属于规范 schema role。

payload format 是 source block language。`[source,json]` 就是 JSON raw，`[source,yaml]` 就是 YAML raw。`data` 不属于契约。

payload raw 不展开。投影器不解释 banana 字段，也不解释 pear 字段。下游按 role 选择模型，按 format 解析 raw，得到内存数据结构，再执行自己的业务解释。

节点 payload 不需要手写 ID，因为它通过 heading 的 `aat:payload` 被消费。边 payload 需要手写 ID，因为 xref edge 的 `payload=` 必须指向它。

这个定义能解释你的新样例，也能解释 old 为什么乱：old 把 section 身份、业务分类、payload 识别、payload selector、format 声明和 schema identity混在一起；新样例把它们拆回了各自位置。还需要补上的关键点，是把 `for` 明确定义为节点 payload marker，并把无值 `for` 作为合法的当前位置归属表面；同时把 `data` 从契约里删除，把 role 投影为 payload schema label。
</Assistant>

<User id="2">
好的啊，那接下来请你具体告诉我，我们这个6号书籍具体你会怎么修订？ 要写的清清楚楚啊，不要给后续的架构师、开发者或者说别的消费者留下困惑、歧义或者模糊。所以说，该写的东西要写啊，写详细、丰富、偏保守没问题啊。请你告诉我你会怎么做？你会怎么改？你会怎么修订？把你的计划告诉我，不少于3000字或者更多，我来确认一下。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="3">
# 6 号书 RDF12 payload 修订方案

下面是我对 `docs/bookshelf/books/06-rdf12-line-projection` 的具体修订方案。这里先只谈书的文本契约，不谈代码实现顺序。目标是把 6 号书修成一个后续架构师、开发者、测试作者和下游消费者都能直接依赖的规约：概念边界明确，作者表面明确，投影事实明确，反例边界明确，查询契约明确，验收事实明确。

这次修订的中心不是“让新样例通过”，而是把 payload 的本体位置写清楚。payload 是 heading 或 xref edge evidence 的复杂属性值；它不是 AsciiDoc listing block 的 RDF 节点化版本，也不是业务 schema 的 RDF 展开。作者在源文档中写的是一个可渲染的 source block；投影图中得到的是一个 opaque complex property object；下游根据 role 和 format 自行解释 raw。

## 一、全书术语总原则

全书会统一使用以下术语，不再混用旧词。

`payload object` 表示 RDF12 投影图中的复杂属性值 resource。它由投影器生成 IRI，保存 role、kind、format、raw、绑定事实和 source coordinate。

`payload block` 表示源文档中的 listing/source block 表面。它是 AsciiDoc 源表面，不是 RDF 结构节点。

`node payload` 表示归属于 heading node 的 payload object。

`edge payload` 表示归属于 xref edge evidence 的 payload object。

`payload role` 表示 payload block 的 role token，例如 `.banana`、`.pear`。它是下游 schema/model label，不决定 node/edge kind。

`payload format` 表示 source block language，例如 `[source,json]` 的 `json`、`[source,yaml]` 的 `yaml`。

`payload id` 只表示源文档中可被 selector 指向的 block ID。它不是 payload object 的 RDF identity，不是 schema role，也不是 payload 成立条件。只有 edge payload 这种需要被 xref `payload=` 指向的场景，payload id 才是核心绑定事实。

`for marker` 或 `node payload binding marker` 表示 listing attrlist 中的 `for` / `forSelector` 字段。它是 node payload 的控制字段。`for` 的存在把 listing block 归入 node payload 语境；`for` 的值决定显式 heading selector；无值 `for` 决定按源位置归属 owning heading。

`data` 不再作为 payload 契约术语出现。书中不再用 `data=json`、`data=toml` 说明 format，也不再把 `data` 写成控制字段。若需要提及，放在排除边界中说明：`data` 是普通源表面属性名时不参与 payload format 解释；规范 payload 表面不使用 `data`。

## 二、修订 `frontmatter/preface.adoc`

前言现在说：标题节点保存标题自身切片 raw、标题头部属性、payload 和回源坐标；交叉引用边保存 xref raw、target selector、关系谓词、边属性、payload 和回源坐标。这个方向可以保留，但需要补一句限定 payload 的身份：payload 是复杂属性值，不是结构节点。

我会把前言中的核心断言扩充为：

> 标题节点保存标题自身切片 raw、标题头部直接属性、node payload 和回源坐标。交叉引用边证据保存 xref raw、target selector、关系谓词、边直接属性、edge payload 和回源坐标。payload 是归属于标题节点或交叉引用边证据的复杂属性值；payload block 不作为标题节点、结构边端点或 xref target heading 进入标题投影图。

这样读者在前言就知道 payload 的层位。后面所有 payload 规则都不会被误读为“把 listing block RDF 化”。

前言还会补一句：

> payload raw 的内部结构由下游消费者按 payload role 和 payload format 解释；标题投影图只保存源表面事实和归属关系。

这句话的作用是把 schema 解释权从投影器中拿出去，防止开发者把 `.banana` 理解成 RDF class，或者把 JSON/YAML 内部字段展开成 `aat:owner`、`aat:risk`。

## 三、修订 `backmatter/glossary.adoc`

术语表是后续读者查定义的地方，这里必须改得最精确。

### 1. 修改 `payload::`

当前定义大意是：payload 保存 id、kind、format、raw 和回源坐标。这个定义会让读者误以为 id 是所有 payload 的构成性条件。

我会改成：

> payload:: 归属于 heading node 或 xref edge evidence 的复杂属性值。payload 保存 payload kind、payload role、format、raw、绑定事实和回源坐标，不展开内部结构，不作为 heading node、structure edge endpoint 或 xref target heading。只有由 selector 显式指向的 payload block 才保存 source payload id。

这里把 `id` 从核心列表里拿掉，并限定为 selector 场景。

### 2. 新增 `payload block::`

> payload block:: 源文档中承载 payload raw 的 listing block。payload block 通过 `for` / `forSelector` 成为 node payload，或通过手动 ID 被 xref `payload` selector 选中成为 edge payload。payload block 自身不创建 RDF 结构节点。

这个定义把源表面和 RDF object 分开。

### 3. 新增 `payload role::`

> payload role:: payload block 的 role token。payload role 是作者与下游消费者约定的 schema/model label，例如 `banana` 或 `pear`。payload role 不决定 payload kind，不绑定 heading，不选择 edge payload。

这能阻止 `.payload` / `.xref-payload` 继续污染 schema 位置。

### 4. 修改 `selector::`

当前 selector 定义已经区分 xref target、节点 payload `for`、xref `payload`。我会进一步细化：

> selector:: 用于绑定目标的字符串。xref target selector 和 node payload `for` selector 查询 heading projection label space；xref `payload` selector 查询 payload block ID space。无值 `for` 不是 selector，它按 payload block 源位置归属 owning heading。

这样无值 `for` 不会被误写成 `aat:forSelector ""`。

### 5. 新增 `node payload binding marker::`

> node payload binding marker:: listing block attrlist 中的 `for` 或 `forSelector` 字段。该字段的存在使 listing block 成为 node payload；字段有值时按 heading selector 绑定，字段无值时按源位置归属 owning heading。

这个术语会支撑第 6 章的核心规则。

## 四、修订 `chapters/01-projection-object.adoc`

第 1 章定义投影对象。这里要把 payload 的本体边界写清楚。

### 1. 修改“构成性对象”中的 payload 段

当前句子说：payload 对象保存 payload id、kind、format、raw 和回源坐标；payload listing 的本地 target ID 归属为 heading address label。

我会改成三段：

第一段定义 payload object：

> payload object 是复杂属性值。node payload 通过 `aat:payload` 归属于 heading node；edge payload 通过 `aat:payload` 归属于 xref edge evidence。payload object 保存 payload kind、payload role、format、raw、绑定事实和回源坐标。payload object 不作为标题层级、标题顺序、relation triple 或 xref target binding 的结构资源。

第二段定义 payload id：

> payload object 的 RDF identity 由投影器生成。源文档中的 payload block ID 只在 selector 需要指向该 block 时成为绑定事实。node payload 不要求 payload block ID；edge payload 需要 payload block ID，因为 xref edge evidence 使用 `payload` selector 指向它。

第三段定义 raw 内部解释：

> payload raw 内部字段不进入标题投影图。payload role 和 payload format 只为下游解释 raw 提供源表面线索；标题投影器不执行 schema validation，不把 payload 内部字段投影为 RDF 谓词。

### 2. 修改“消费者动作”

现在消费者动作里有“读取边属性、边 payload 和 xref raw”。我会扩成：

- 读取 heading 的直接属性和 node payload。
- 读取 xref edge evidence 的直接属性和 edge payload。
- 通过 payload role 与 payload format 选择下游解析路径。
- 从 payload 查询结果回到源文件 line span。

这不是增加功能，而是把 payload 消费动作写完整。否则 role/format 的存在理由不清楚。

### 3. 修改“排除边界”

增加明确排除：

> `data` 不属于 payload format 控制字段。payload format 来自 source block language。

> `.payload` 和 `.xref-payload` 不属于规范 payload role。payload kind 由绑定机制决定，不由 role token 决定。

这两个排除语句是必要的，因为旧书和旧样例已经制造了高成本误读。

## 五、修订 `chapters/02-heading-node.adoc`

第 2 章主要是 heading node，不应塞太多 payload 细节。但标题头部属性例子需要修。

当前例子使用：

```asciidoc
[#delivery-policy.section, kind=policy, status=active, owner=ops]
== 配送策略
```

我会改成：

```asciidoc
[#delivery.policy, status=active, owner=ops]
== 配送策略
```

对应 RDF 改成：

```turtle
:heading-l5-o0 a aat:Heading ;
  aat:headline "配送策略" ;
  aat:addressLabel "delivery" ;
  aat:role "policy" ;
  aat:status "active" ;
  aat:owner "ops" .
```

这里的修订理由是：heading 已经由等号标题创建，不需要 `.section` 重复说明；`policy` 是作者领域角色，应放在 role token；`kind=policy` 作为 named attribute 会让 `kind` 同时像 parser kind、payload kind、business kind，语义不稳。

我会在此章补一句：

> heading role 是标题表面的作者角色，不参与 selector binding，不决定 heading node 的 RDF type。heading node 的结构身份只来自等号标题。

这句话能防止开发者把 `.policy` 写成 `rdf:type` 或拿 role 参与 selector binding。

## 六、修订 `chapters/05-xref-edge.adoc`

第 5 章需要保留 xref edge 的基本规则，但 payload selector 部分要和新契约对齐。

当前 xref 例子使用 `payload=rel-delivery-capacity`。我会把样例统一改成新样例风格：

```asciidoc
配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery]。
```

对应 RDF：

```turtle
:xref-edge-l8-c8-o0 a aat:XrefEdge ;
  aat:sourceHeading :heading-l5-o0 ;
  aat:targetHeading :heading-l39-o0 ;
  aat:targetSelector "capacity" ;
  aat:displayLabel "运力规则" ;
  aat:rel "depends-on" ;
  aat:weight "0.8" ;
  aat:payloadSelector "rel-delivery" ;
  aat:raw "xref:capacity[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery]" .
```

这里会特别加一段：

> xref `payload` 字段不是普通 named attribute。它不投影为 `aat:payload` literal，也不进入 relation predicate mapping。它只保存为 `aat:payloadSelector`，并在唯一匹配 payload block ID 时连接 edge payload object。

再加一段 selector space 区分：

> xref target selector 和 xref payload selector 使用不同绑定空间。xref target selector 查询 heading projection label space；xref payload selector 查询 payload block ID space。相同字符串在两个字段中出现时，由字段语境决定解释。

这段必须写，否则 local target alias 和 edge payload ID 会混淆。

## 七、重写 `chapters/06-payload-and-attribute.adoc`

第 6 章应成为本次修订的核心。我的建议不是小修，而是按以下结构重写大部分章节。

### 1. 保留“直接属性谓词”，但换例子

直接属性小节保留。例子改成：

```asciidoc
[#delivery.policy, status=active, owner=ops]
== 配送策略
```

RDF：

```turtle
:heading-l5-o0
  aat:role "policy" ;
  aat:status "active" ;
  aat:owner "ops" .
```

xref 直接属性例子保留 `weight=0.8`。

这一节会明确：`rel` 和 `payload` 是 xref 控制字段，不作为普通字段；`for` 是 node payload 控制字段，不作为普通 payload internal field；`data` 不属于 payload 控制字段。

### 2. 新增“小节：Payload Object”

这一节先定义 payload object，不马上进入 node/edge。

要写的规则：

- payload object 是 complex property value。
- payload object 的 IRI 由投影器生成。
- payload object 保存 `aat:payloadKind`、`aat:role`、`aat:format`、`aat:raw`、line span、content line span。
- payload object 只有在源 block ID 参与 selector binding 时才保存 `aat:payloadId`。
- payload raw opaque。
- payload role 来自 listing role token。
- payload format 来自 source block language。
- payload block 不创建 RDF structure node。

这里会给一个最小 RDF skeleton：

```turtle
:payload-l10-o0 aat:payloadKind "node" ;
  aat:role "banana" ;
  aat:format "json" ;
  aat:raw """...""" ;
  aat:relativePath "samples/structural-payload.adoc" ;
  aat:startLine 10 ;
  aat:endLine 23 ;
  aat:contentStartLine 13 ;
  aat:contentEndLine 22 .
```

### 3. 重写“小节：节点 Payload”

节点 payload 小节写成对象规则，而不是旧例子。

核心规则：

> listing block 声明 `for` 或 `forSelector` 字段时表达 node payload。`for` 字段是 node payload binding marker。该 marker 的存在使 listing block 成为 node payload；marker 的值存在时作为 heading selector；marker 无值时按 payload block 源位置归属 owning heading。

然后分两种 authored surface：

#### 带值 `for`

```asciidoc
[.banana, for=delivery]
[source,json]
----
{ ... }
----
```

解释：

- `.banana` -> payload role。
- `for=delivery` -> node payload marker + heading selector。
- `[source,json]` -> format json。
- raw body -> opaque raw。
- 无 ID -> 合法。

投影：

```turtle
:heading-l5-o0 aat:payload :payload-l10-o0 .

:payload-l10-o0 aat:payloadKind "node" ;
  aat:role "banana" ;
  aat:forSelector "delivery" ;
  aat:format "json" ;
  aat:raw """...""" .
```

#### 无值 `for`

```asciidoc
[.banana, for]
[source,json]
----
{ ... }
----
```

解释：

- `for` 是 marker，不是 empty selector。
- 归属由 source coordinate 找 owning heading。
- RDF 可以只输出 heading -> payload 连接，不输出 `aat:forSelector`。

我会谨慎处理是否引入 `aat:bindingMode`。我的倾向是不引入，除非书里明确有消费者需要区分 selector-binding 和 source-owner-binding。投影结果本身已经表达归属；源位置和 raw 可以审计来源。为了减少表面单位，核心契约不加 `aat:bindingMode`。

节点 payload 排除规则：

- 只有 `.banana` 没有 `for`，不是 node payload。
- 只有 `[source,json]` 没有 `for`，不是 node payload。
- 位于标题切片内但没有 `for`，不是 node payload。
- node payload 不要求 hand-written ID。
- node payload 的 hand-written ID 如果存在，不参与 node payload 成立；它只可能作为 local target fact 被其它规则消费。

### 4. 重写“小节：边 Payload”

边 payload 规则：

> xref edge evidence 的 `payload` 字段表达 edge payload selector。该 selector 匹配 payload block 的手动 ID。唯一匹配时，xref edge evidence 通过 `aat:payload` 连接 edge payload object。

规范表面：

```asciidoc
xref:capacity[运力规则, rel=depends-on, payload=rel-delivery]

[#rel-delivery.pear]
[source,yaml]
----
reason:
  type: risk-control
----
```

解释：

- `payload=rel-delivery` 是 edge payload selector。
- `#rel-delivery` 是 selector target。
- `.pear` 是 payload role。
- `[source,yaml]` 是 payload format。
- `data` 不出现。

RDF：

```turtle
:xref-edge-l8-c8-o0 aat:payloadSelector "rel-delivery" ;
  aat:payload :payload-l25-o0 .

:payload-l25-o0 aat:payloadKind "edge" ;
  aat:payloadId "rel-delivery" ;
  aat:role "pear" ;
  aat:format "yaml" ;
  aat:raw """...""" .
```

边 payload 排除规则：

- `.pear` 不让 block 自动成为 edge payload；edge payload 由 xref `payload=` selector 选择。
- 没有手动 ID 的 block 不能被 edge payload selector 选中。
- 多个 block 同 ID 时不任意绑定。
- 未匹配 selector 时保留 `aat:payloadSelector`，不虚构 payload。
- edge payload 不挂到 source heading 或 target heading。

### 5. 重写“Opaque Raw”

Opaque Raw 小节保留并加强：

- raw 不展开。
- role 不是展开许可。
- format 不是展开许可。
- 投影器不做 JSON/YAML/TOML parse validation。
- 下游可以解析 raw，但解析结果不属于 heading projection graph。

### 6. 新增“小节：`data` 不属于 Payload 契约”

因为旧样例已经有 `data=toml`，必须显式清掉误读。这个小节写成排除规则，不写成历史说明。

内容：

> payload format 只来自 source block language。`data` 不选择 payload format，不选择 schema role，不决定 node/edge kind，不参与 payload binding。规范 payload 表面不使用 `data`。

给一个反例：

```asciidoc
[#rel-delivery.pear, data=toml]
[source,yaml]
----
reason:
  type: risk-control
----
```

说明：规范表面应删除 `data=toml`；该 block 的 format 是 `yaml`，schema role 是 `pear`。

## 八、修订 `chapters/07-query-contract.adoc`

查询契约要跟新 payload 规则一致。

### 1. 查找节点 payload

当前查询要求：

```sparql
?payload aat:payloadKind "node" ;
         aat:format ?format ;
         aat:raw ?payloadRaw .
```

我会加上 role：

```sparql
SELECT ?payload ?role ?payloadRaw ?format ?start ?end WHERE {
  ?heading aat:addressLabel "delivery" ;
           aat:payload ?payload .
  ?payload aat:payloadKind "node" ;
           aat:role ?role ;
           aat:format ?format ;
           aat:raw ?payloadRaw ;
           aat:startLine ?start ;
           aat:endLine ?end .
}
```

查询不通过 `payloadId` 找 node payload。node payload 的公共入口是 heading。

### 2. 查找边 payload

边 payload 查询加 role，并保留 payloadSelector：

```sparql
SELECT ?payload ?selector ?role ?payloadRaw ?format ?start ?end WHERE {
  ?edge a aat:XrefEdge ;
        aat:payloadSelector ?selector ;
        aat:payload ?payload .
  ?payload aat:payloadKind "edge" ;
           aat:role ?role ;
           aat:format ?format ;
           aat:raw ?payloadRaw ;
           aat:startLine ?start ;
           aat:endLine ?end .
}
```

### 3. 增加按 payload role 查询

这是新增但必要的消费者动作，因为 role 是 schema label：

```sparql
SELECT ?heading ?payload ?raw WHERE {
  ?heading aat:payload ?payload .
  ?payload aat:payloadKind "node" ;
           aat:role "banana" ;
           aat:raw ?raw .
}
```

以及 edge role 查询：

```sparql
SELECT ?edge ?payload ?raw WHERE {
  ?edge a aat:XrefEdge ;
        aat:payload ?payload .
  ?payload aat:payloadKind "edge" ;
           aat:role "pear" ;
           aat:raw ?raw .
}
```

这证明 role 不是装饰字段，而是下游 schema 选择入口。

## 九、重写 `chapters/08-worked-example.adoc`

完整样例必须换成新规范表面。它应该成为全书最重要的可执行例子。

### 1. Source Document 改写

改成：

```asciidoc
= root

一段摘要

[#delivery.policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, payload=rel-delivery]。

[.banana, for=delivery]
[source,json]
----
{
  "owner": {
    "team": "ops",
    "fallback": "manual-review"
  },
  "risk": {
    "level": "high",
    "signals": ["weather", "capacity"]
  }
}
----

[#rel-delivery.pear]
[source,yaml]
----
reason:
  type: risk-control
  signals:
    - weather
    - capacity
  description: 配送策略需要读取运力规则来决定是否降级。
edge:
  direction: outbound
  required: true
----

[#capacity.rule, status=active]
== 运力规则

运力规则描述系统在不同运力条件下如何判断配送策略是否需要降级。

=== 我是3级标题

123
```

这里保留 `for=delivery`，不省略。因为这是规范主例，要展示显式 selector 绑定。无值 `for` 可以在第 6 章作为独立规则例子，不放主 worked example，避免主例承担太多分支。

### 2. 标题节点表格更新

`配送策略` label 改为 `delivery`。role 改为 `policy`。不再有 `kind=policy`。不再列 `delivery-policy-payload`。`rel-delivery` 是否列为 `addressLabel`，取决于 local target alias 规则是否在本书当前修订中同步落地。

这里我建议书内保持原则一致：如果第 2 章仍定义 local non-heading target ID 归属 heading address label，那么表格应列出 `rel-delivery` 是 `配送策略` 的 address label。节点 payload 没有 ID，所以不会产生 `delivery-policy-payload`。边 payload 有 ID `rel-delivery`，它作为 local non-heading target ID 可归属到 `配送策略`。

也就是说表格写：

- `配送策略`: label `delivery`, `rel-delivery`；role `policy`；level 1。
- `运力规则`: label `capacity`；role `rule`；level 1。

如果担心 local target alias 当前代码还没实现，书作为规约仍应写正确对象定义，不能为了旧实现退回测试事实。

### 3. 节点事实更新

`heading-l5-o0` 示例中：

- `aat:addressLabel "delivery"`
- `aat:addressLabel "rel-delivery"` 若 local target alias 同步写入本章。
- `aat:role "policy"`
- `aat:status "active"`
- `aat:owner "ops"`
- `aat:payload :payload-l10-o0`
- 不输出 `aat:kind "policy"`
- raw 中不出现 `data`

### 4. 节点 Payload 示例更新

改成：

```turtle
:heading-l5-o0 aat:payload :payload-l10-o0 .

:payload-l10-o0 aat:payloadKind "node" ;
  aat:role "banana" ;
  aat:forSelector "delivery" ;
  aat:format "json" ;
  aat:relativePath "samples/structural-payload.adoc" ;
  aat:startLine 10 ;
  aat:endLine 23 ;
  aat:contentStartLine 13 ;
  aat:contentEndLine 22 ;
  aat:raw """...""" .
```

不出现 `aat:payloadId`。

### 5. xref edge 示例更新

`targetSelector` 改 `capacity`；`payloadSelector` 改 `rel-delivery`；raw 对应更新。

### 6. 边 Payload 示例更新

改成：

```turtle
:xref-edge-l8-c8-o0 aat:payload :payload-l25-o0 .

:payload-l25-o0 aat:payloadKind "edge" ;
  aat:payloadId "rel-delivery" ;
  aat:role "pear" ;
  aat:format "yaml" ;
  aat:relativePath "samples/structural-payload.adoc" ;
  aat:startLine 25 ;
  aat:endLine 37 ;
  aat:contentStartLine 28 ;
  aat:contentEndLine 36 ;
  aat:raw """reason:
  type: risk-control
...""" .
```

`aat:format` 必须是 `yaml`，不是 `toml`。

### 7. 验收事实更新

旧验收事实要改成以下类型：

- 标题节点数量仍为四个。
- `= root` 创建标题节点。
- `配送策略` 节点有 `aat:addressLabel "delivery"`、`aat:role "policy"`、`aat:status "active"`、`aat:owner "ops"`。
- `配送策略` 节点不要求 `aat:kind "policy"`。
- node payload block 没有 hand-written ID 仍投影为 node payload。
- node payload 通过 `for=delivery` 绑定为 `配送策略` 的 `aat:payload`。
- node payload 有 `aat:payloadKind "node"`、`aat:role "banana"`、`aat:forSelector "delivery"`、`aat:format "json"`。
- node payload 不要求 `aat:payloadId`。
- xref `payload=rel-delivery` 投影为 edge evidence 的 `aat:payloadSelector "rel-delivery"`。
- `rel-delivery` block 通过 hand-written ID 绑定为 edge payload。
- edge payload 有 `aat:payloadKind "edge"`、`aat:payloadId "rel-delivery"`、`aat:role "pear"`、`aat:format "yaml"`。
- `data` 不参与 payload format；样例中不出现 `data`。
- payload raw 不展开为业务 RDF 图。
- payload block 不创建 structure node。
- edge payload 不挂到 source heading 或 target heading。
- direct attributes 仍投影为直接谓词，例如 `status`、`owner`、`weight`。

## 十、修订样例文件引用

6 号书的 worked example 和实际 `samples/structural-payload.adoc` 应保持一致。现在实际 sample 已经接近目标，但仍有 `data=toml`，且书中旧样例不一致。

书中 canonical sample 应使用实际 `samples/structural-payload.adoc` 的目标形态：

- 标题 ID 使用 `delivery`、`capacity`。
- 标题 role 使用 `policy`、`rule`。
- node payload 使用 `[.banana, for=delivery]`。
- node payload 无 ID。
- edge payload 使用 `[#rel-delivery.pear]`。
- edge payload source language 使用 `[source,yaml]`。
- 删除 `data=toml`。

`structural-payload-old.adoc` 可保留为旧情况对照样例，但 6 号书不应把 old 当规范。

## 十一、关于 local target alias 的协调

6 号书已经规定本地非标题 target ID 归属 owning heading 的 `aat:addressLabel`。payload 修订不能回避这个规则。

修订后，节点 payload 没有 ID，所以它不会产生 payload ID label。边 payload 有 ID `rel-delivery`，它是 listing block 的本地 target ID。按照本书现有 local target alias 规则，它应归属为 `配送策略` heading 的 `aat:addressLabel "rel-delivery"`。

这不会和 edge payload selector 冲突，因为 selector space 不同：

- `xref:rel-delivery[...]` 作为 xref target selector 时，绑定 owning heading。
- `payload=rel-delivery` 作为 xref payload selector 时，绑定 edge payload block。

书中需要把这句话写在第 6 章或第 5 章，以免开发者误删 local target alias 或误认为 edge payload ID 不能进入 address label。

## 十二、修订后的全书一致性检查

修完以后，全书应满足以下一致性：

- 没有规范样例使用 `.payload` 或 `.xref-payload`。
- 没有规范样例使用 `data=json`、`data=toml` 表达 payload format。
- `payloadId` 不再被写成所有 payload 的必备字段。
- node payload 示例不要求手动 ID。
- edge payload 示例要求手动 ID。
- payload role 出现在 payload object 上，而不是只存在源文档中。
- role 不决定 node/edge kind。
- format 来自 source block language。
- direct attributes 和 payload raw 的边界明确。
- selector space 明确分为 heading label space 与 payload block ID space。
- query contract 不通过 payloadId 查询 node payload。
- worked example、query contract、glossary、验收事实对同一个 authored surface 给出同一套 RDF 解释。

## 十三、我会按这个方式修订

我会把 6 号书修成一个正面定义优先的规约，而不是围绕旧实现打补丁。具体文本上会做三类修改。

第一类是对象定义修改：前言、术语表、第 1 章、第 6 章会统一 payload object、payload block、payload role、payload format、payload id、for marker 的定义。

第二类是规范表面修改：第 2、5、6、8 章中的 AsciiDoc 示例会统一改成 `delivery/capacity`、`.policy/.rule`、`.banana/.pear`、`for=delivery`、`payload=rel-delivery`、`[source,json]`、`[source,yaml]`，删除 `.section`、`kind=policy`、`.payload`、`.xref-payload`、`data=...`。

第三类是查询与验收修改：第 7、8 章会把 node payload 查询入口改为 heading `aat:payload`，把 payload role 纳入查询，保留 edge payload selector 查询，删除 node payload 必须有 `payloadId` 的验收事实，增加 `data` 不参与 format 的验收事实。

这份修订完成后，6 号书表达的对象应是：作者用 AsciiDoc source block 写复杂载荷；`for` 把 listing 标记为 node payload；xref `payload=` 把 listing ID 标记为 edge payload selector target；role 是 schema label；source language 是 format；raw opaque；payload object 是 heading 或 edge evidence 的复杂属性值。这个对象定义完整，后续实现和测试可以直接按它落地，不需要再猜 `.payload`、`data`、payload ID 到底谁在承担身份。
</Assistant>

<User id="3">
好的，我采纳你的“6 号书 RDF12 payload”
那么你可以正式开始，按照这份修订方案开始兑现这份方案里面的承诺，开始修订6号书籍。 你需要完整的去阅读一下Skill写作规范。然后呢你自己要明白，这本书它承担的是截止当下整个项目的设计规范，它没有任何的什么，哎呀我们昨天用了绿色，今天用了红色，前年又用了蓝色，没有任何的时态信息。
\\wsl.localhost\Ubuntu\home\t103o\workbench\notes\0-我\关于言语沟通.adoc
\\wsl.localhost\Ubuntu\home\t103o\workbench\notes\0-我\粉色大象与白熊.md
你自己可以读一下这个啊。该提的东西要提啊，不该提的东西，你觉得要提吗？你自己去想啊。像比如说我们废弃了什么字段啊，废弃了这个废弃那个，全部都给我写到Git历史记录里面或者PR里面啊。 关于这个变迁的时态的啊，一个东西A变化成了B，这些东西全部给我丢到该丢的地方，书里面该放什么不该放什么，请你自己心里想清楚。 第二点哈，这是书啊。描述东西呢，该讲的详细就详细，不要压缩成一句话。自以为压缩的很漂亮，实际上你已经越过了信息论的下界，是有损压缩，信息早就湮灭了，知道吗？好，自己去看，开始修订吧。

Tip:
完成后记得使用弹窗与我沟通。
</User>
````
