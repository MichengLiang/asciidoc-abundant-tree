````xml
<Assistant id="1">
# 标题节点 payload role 直投影设计汇报

我先说明这次阅读后得到的对象事实。`samples/cold-chain-payload/cold-chain-release.adoc` 里有三类 payload 表面：第一类是挂在“冷链出库放行策略”标题上的 `[.release-policy-config, for=cold-chain-release]` JSON block；第二类是同一个标题下 `[.review-playbook, for]` YAML block；第三类是由 xref `payload=rel-release-temperature-audit` 指向的 `[#rel-release-temperature-audit.dependency-evidence]` YAML block。`consume_payloads.py` 当前的消费路径是先通过 heading label 找到策略标题，再用 `?heading aat:payload ?payload` 取 node payload，再读取 payload object 上的 `aat:role`、`aat:format`、`aat:raw`，最后由 Python 端按 role 选择 Pydantic model。项目 README 和 cold-chain README 也都按这个模型叙述：payload object 保存归属、角色、格式、raw、kind 和坐标；raw 内部解释属于下游。

这说明当前模型有一个稳定核心：payload block 不作为结构节点，payload raw 不展开成业务 RDF，payload 的业务 schema 线索来自 role，payload format 来自 source block language，下游按 role + format 解释 raw。这个核心是对的。但是你指出的“不舒服”也是真实存在的：对标题节点来说，`aat:payload` 这个谓词本身没有携带业务信息。它只说“这里有一个 payload”，然后真正有用的信息被推迟到 payload object 的 `aat:role` 上。下游工具链为了拿到“release-policy-config”或“review-playbook”，必须先知道存在一个泛化谓词 `aat:payload`，再进入 payload object 读 role，再按 role 分派。这个查询形态和普通标题属性不一致，也让 `payload` 这个词在标题节点上显得像一种多余的中间层。

我认为更符合语义逻辑、也更能泛化的设计，是把“节点 payload 是标题节点的复杂属性值”这件事贯彻到底：对于 heading node，payload role 应当成为 heading 上的属性谓词。也就是说，`[.release-policy-config, for=cold-chain-release]` 不应只投影为：

```ttl
:heading aat:payload :payload-l10-o0 .
:payload-l10-o0 aat:role "release-policy-config" ;
  aat:format "json" ;
  aat:raw """...""" .
```

而应投影为：

```ttl
:heading aat:release-policy-config :payload-l10-o0 .
:payload-l10-o0 aat:format "json" ;
  aat:raw """...""" ;
  aat:payloadKind "node" .
```

同理，`[.review-playbook, for]` 应成为：

```ttl
:heading aat:review-playbook :payload-l34-o0 .
:payload-l34-o0 aat:format "yaml" ;
  aat:raw """...""" ;
  aat:payloadKind "node" .
```

这个设计的对象意义更清楚：标题节点有一个名为 `release-policy-config` 的复杂属性；这个属性值不是字符串 literal，而是一个带 raw、format、source span 的 payload object。它和 `aat:status "active"`、`aat:owner "quality-ops"` 是同一层的“标题属性”，只是值的形态更复杂。普通直接属性的值是 literal；复杂属性的值是 payload object。这样 `Payload` 不再作为标题上的业务属性名出现，`payload` 只保留为实现或类型层面的对象分类事实。

这里最关键的判断是：payload 作为词，本身确实不能给业务消费者提供结构信息。消费者关心的是“release policy config 是什么”“review playbook 是什么”“dependency evidence 是什么”，而不是“这里有 payload”。`payload` 这个词适合出现在对象类型、kind、通用审计、诊断、兼容查询里，但不适合垄断 heading 到复杂属性值的主谓词。标题节点上的谓词应尽量表达这个属性是什么，而不是表达这个属性的承载机制是什么。

这个模型也更接近现有标题 metadata 的投影规则。标题头部 `status=active` 会成为 `aat:status "active"`，`owner=quality-ops` 会成为 `aat:owner "quality-ops"`，`.policy` 会成为 `aat:role "policy"`。如果一个 listing block 声明 `.release-policy-config` 并用 `for` 绑定到该标题，那么它的 role 与其说是 payload object 的一个普通字段，不如说是“这个复杂属性的属性名”。换句话说，role 在 node payload 场景中承担的是 property-name 的角色，不只是一个 payload object annotation。把它留在 object 内部会让查询者绕远路；把它提升为 heading predicate，才符合“标题节点拥有属性”的 RDF 表达习惯。

但是这里必须精确限定：这个调整只适用于节点 payload，不适用于边 payload。你对边模型的判断是对的：当前标题节点和边的模型方向不同。节点 payload 是 payload block 主动通过 `for` 指向 heading，投影器能在 heading 上建立“某个复杂属性名 -> payload object”的事实；边 payload 是 xref edge evidence 通过 `payload=<id>` 主动指向某个 payload block。边的主对象是 xref edge evidence，不是 source heading，也不是 target heading。边 payload 的绑定中心仍然是 edge evidence，因此保持 `:xrefEdge aat:payload :payload` 是合理的。因为在边场景里，`dependency-evidence` 更像“这个 edge payload 的 role/schema”，而不是 xref edge 上的关系谓词本身。xref edge 还要保留 `aat:payloadSelector`、`aat:rel`、`aat:sourceHeading`、`aat:targetHeading` 等证据字段。强行把 edge payload 改成 `:xrefEdge aat:dependency-evidence :payload` 不是不可能，但会扩大边模型变化，也会削弱当前 edge payload selector 的稳定性。你明确说边保持原行为，所以我认为这次不动边是正确边界。

节点 payload 改成 role-named predicate 后，payload object 上是否还要保留 `aat:role`？我认为应当保留，至少在当前规约里保留。理由不是为了让 `aat:payload` 继续当主查询入口，而是为了 payload object 的自描述性、调试性和多查询形态。RDF 图里一个 payload object 如果被单独拿出来，它仍应能告诉消费者自己的 role；Turtle 文本里也应能看到该 raw 对应哪个 schema role。并且一个 payload block 理论上可能有多个 role token，如果其中一个或多个被投影成 heading 上的属性谓词，payload object 同时保留这些 role 可以避免信息丢失。也就是说，新的主入口是 heading 上的 role-named predicate，但 payload object 仍保留 `aat:role` 作为源表面事实。

这里还要处理一个命名问题：role token 如何变成 RDF predicate。现有项目已经有 `field-predicate.ts` 和 direct attribute 的字段谓词规则，把字段名映射进 `aat:` namespace。payload role 也可以沿用同一套 predicate local-name 规范。`.release-policy-config` 映射为 `aat:release-policy-config`，`.review-playbook` 映射为 `aat:review-playbook`。这个选择有一个明显优点：heading 上普通属性和复杂属性共用同一命名空间与字段表面，消费者不用学习另一套 `aat:payload/release-policy-config` 之类的路径。保守一点，还可以规定 payload role 必须满足与 direct field predicate 相同的可投影字段名约束；无法形成稳定 predicate 的 role 仍保留为 `aat:role`，但不创建 role-named heading predicate，或者进入诊断。冷链样例里的 role 都是稳定 token，因此没有问题。

同一个 heading 挂多个 payload 完全成立，而且 role-named predicate 比 `aat:payload` 更适合这个事实。当前 `aat:payload` 模型下，多个 node payload 都是同一个谓词对象集合，下游必须过滤 role：

```sparql
?heading aat:payload ?payload .
?payload aat:role "release-policy-config" .
```

新模型下，下游可以直接写：

```sparql
?heading aat:release-policy-config ?payload .
?payload aat:format ?format ;
         aat:raw ?raw .
```

如果同一个标题有多个 `release-policy-config` payload，也只是同一谓词多值，RDF 本来就允许。下游可以按 source line、format、role、其它约束继续区分。这个模型不会限制“同一个标题可以挂载很多个 payload”；它只是把 payload 集合按 role 自然分组。

那么是否还保留 `heading aat:payload payload` 这条通用边？从纯对象设计来说，我倾向于把 role-named predicate 作为规范主边，把 `aat:payload` 降为可选的通用索引边，而不是标题节点 node payload 的唯一主边。这里有两个选择。

第一种选择是只输出 role-named predicate，不再输出 heading `aat:payload`。这是最干净的对象模型：heading 上不存在一个名叫 payload 的业务属性，只有 `release-policy-config`、`review-playbook` 这类复杂属性。缺点是通用枚举所有 node payload 的查询不再能用一个谓词完成，需要查 `?heading ?predicate ?payload` 并识别 object 是 payload object，或者查 `?payload aat:payloadKind "node"` 再反查 subject。这会让通用工具稍微复杂。

第二种选择是同时输出 role-named predicate 和 `aat:payload` 通用索引边，并在书里明确 `aat:payload` 对 heading 是枚举索引，不是业务属性名。规范查询推荐使用 role-named predicate；通用工具需要列出所有 payload 时可以继续使用 `aat:payload`。缺点是图里有两条 heading -> payload 边，消费者需要知道哪条是主语义边、哪条是索引边。如果书写得不清楚，就会继续留下“payload 是标题属性名”的旧误读。

第三种选择是使用一个上层谓词如 `aat:complexProperty` 或 `aat:field` 再带 role，这其实只是把 `aat:payload` 换了名字，没有解决你指出的问题。我不推荐。

如果目标是“语义最干净”，我推荐第一种：节点 payload 只通过 role-named predicate 挂到 heading；payload object 自身保留 `aat:payloadKind "node"`、`aat:role`、`aat:format`、`aat:raw`、source span、`aat:forSelector` 等事实。这样标题节点的属性表面和 RDF 谓词完全对齐，下游不需要知道 payload 机制才能读取具体复杂属性。通用工具如果要枚举 payload，可以查 object 的 `aat:payloadKind "node"`，这比让业务消费者永远经过 `aat:payload` 更合理。

如果目标是“对现有功能和查询尽量不破坏”，可以采用第二种作为兼容形态：新增 role-named predicate，保留 `aat:payload`。但是书里的规范要非常明确：对 node payload，role-named predicate 是字段语义；`aat:payload` 只是通用枚举入口。若不想让书出现时态和迁移语言，可以直接定义两类谓词：字段谓词和枚举谓词。字段谓词用于业务读取，枚举谓词用于工具列举。不要写“以前如何、现在如何、兼容旧版如何”。变迁事实放到 Git commit 或 PR 描述里。

我进一步认为，冷链下游脚本的查询也应随之调整。如果采用纯 role-named predicate，`print_policy_report` 不应再查：

```sparql
?heading aat:payload ?payload .
?payload aat:payloadKind "node" ;
         aat:role ?role ;
         aat:format ?format ;
         aat:raw ?raw .
```

而应查 heading 的具体复杂属性：

```sparql
?heading aat:release-policy-config ?policyPayload ;
         aat:review-playbook ?playbookPayload .
?policyPayload aat:format "json" ; aat:raw ?policyRaw .
?playbookPayload aat:format "yaml" ; aat:raw ?playbookRaw .
```

或者下游若需要按模型注册表动态消费，可以先维护 role -> predicate 的映射。这样模型注册表直接面对业务属性名，而不是面对泛化 payload 集合。`PAYLOAD_MODELS` 仍然可以按 role key 保存 Pydantic model，但 RDF 查询入口变成 `aat:<role>`。

这个设计对“raw 是复杂属性值”也更自然。heading 的 `aat:release-policy-config` object 不是一个业务 RDF graph，而是一个 payload value object。它的内部有 `aat:raw` 和 `aat:format`。这相当于把复杂值用一个资源包装起来，避免 literal 无法携带 source span、format、role、content line 的问题。也就是说，我们不是把 payload 展开成业务字段，而是把复杂属性值对象化。属性名来自 role，属性值是 raw-container resource。这个模型同时满足“语义更干净”和“不解释 raw 内部字段”。

需要注意的是，role-named predicate 与 payload object 的 `aat:role` 不应互相冲突。它们处在两个层次：heading predicate 表达“这个 heading 有一个名为 release-policy-config 的复杂属性”；payload object 上的 `aat:role "release-policy-config"` 表达“该复杂属性值来自一个 role token 为 release-policy-config 的源 block”。前者是 projected field fact，后者是 source-surface fact。字段谓词用于消费；role literal 用于审计、枚举、反查和多 role 保真。

关于多个 role token，规约需要保守写清楚。一个 payload block 如果有多个 role，例如 `[.release-policy-config.experimental, for=...]`，投影器可以输出多个 role literal；是否为每个 role 都建立 heading field predicate，需要定义。我建议先采用“每个 payload role 都形成一个 role-named predicate”的规则，因为这与 AsciiDoc role token 是多值事实一致。但书里要提醒下游：多 role 表示同一个 payload object 可通过多个 role field 被发现；如果业务要求唯一 schema role，应由下游 schema 层约束。另一种更严格做法是规定 node payload 必须有且仅有一个 schema role；多 role 只是普通 role，不都成 predicate。但这会引入 role 分类问题。为了保守、泛化和忠实源表面，我更倾向多 role 全量投影，同时建议规范样例只使用一个 schema role。

关于 `for`，之前已经确定它是 node payload marker。这个设计在 role-named predicate 下更成立：`for` 不只是绑定 selector，也是在告诉投影器“这个 listing block 的 role token 可以提升为 heading complex-property predicate”。没有 `for`，一个 `[source,json]` 代码块即便有 `.release-policy-config` role，也不能自动成为标题属性，因为它可能只是普通示例代码。`for=...` 或无值 `for` 是 listing block 从普通代码块进入 node payload 语境的构成性信号。这里不能用位置替代，也不能用 source language 替代。

关于边保持原行为，最终模型应写成两套不同但相容的规则。节点 payload：payload block 通过 `for` 绑定 heading；payload role 生成 heading 上的 complex-property predicate；payload object 保存 raw、format、role、坐标。边 payload：xref edge evidence 通过 `payload=<source-payload-id>` 绑定 payload block；edge evidence 通过 `aat:payload` 连接 payload object；payload object 保存 `aat:payloadId`、role、format、raw、坐标。这样 node 与 edge 的差异不是不一致，而是由归属机制决定：node payload 是 heading 的属性，edge payload 是 xref edge evidence 的证据附属物。

我建议书里的对象语言这样定：

“节点 payload 是 heading node 的 role-named complex property。payload role 形成 heading 上的 field predicate；payload object 是该 field predicate 的值。payload object 保存 payload role、format、raw、binding fact 与 source coordinate。`aat:payload` 不作为 node payload 的业务字段名使用。”

如果选择保留通用枚举边，则再写：

“标题节点可以同时输出 `aat:payload` 作为 payload object enumeration predicate。该谓词只用于列举 heading 上的 payload objects；具体复杂属性的语义由 role-named field predicate表达。”

但如果要最干净，我建议不要保留这句，避免书里增加一个消费者必须区分的次级谓词。

对 cold-chain README 的 Turtle 示例，相应变化应是：`冷链出库放行策略` heading 不再以 `aat:payload <payload-l10>, <payload-l34>` 作为主要事实，而是输出：

```ttl
:heading-l5-o0 aat:release-policy-config :payload-l10-o0 ;
    aat:review-playbook :payload-l34-o0 .
```

payload object 继续输出：

```ttl
:payload-l10-o0 aat:payloadKind "node" ;
    aat:role "release-policy-config" ;
    aat:forSelector "cold-chain-release" ;
    aat:format "json" ;
    aat:raw """...""" .

:payload-l34-o0 aat:payloadKind "node" ;
    aat:role "review-playbook" ;
    aat:format "yaml" ;
    aat:raw """...""" .
```

edge payload 则保持：

```ttl
:xref-edge-l8-c12-o0 aat:payloadSelector "rel-release-temperature-audit" ;
    aat:payload :payload-l44-o0 .

:payload-l44-o0 aat:payloadKind "edge" ;
    aat:payloadId "rel-release-temperature-audit" ;
    aat:role "dependency-evidence" ;
    aat:format "yaml" ;
    aat:raw """...""" .
```

这个模型对下游最直接的好处是：工具链可以完全不关心“是不是 payload”。如果它要读放行策略配置，就查 `aat:release-policy-config`；如果要读复核手册，就查 `aat:review-playbook`。payload 这个机制性事实只在需要通用处理 raw container、source coordinate、format、role 时出现。换句话说，业务消费者面对的是属性，基础设施消费者面对的是 payload object。两个层次不再混在同一个 `aat:payload` 谓词里。

我最终判断如下：你提出的调整方向是正确的，而且比当前 `heading aat:payload payload` 的单一入口更符合“payload 是复杂属性”的本体定义。标题节点侧应把 payload role 提升为 heading 上的属性谓词，让 node payload 像普通属性一样被读取，只是它的值是一个 raw container resource。边侧不应同步改成 role-named predicate，因为边 payload 的归属中心和选择机制不同；保持 edge evidence `aat:payload` 是合理的。若要最干净，node payload 不再输出 heading `aat:payload`；若要保留通用枚举能力，可以输出但必须在规范里降格为枚举谓词，而不是业务语义谓词。我的推荐是：书的规范主模型采用 role-named predicate；payload object 保留 `aat:role`、`aat:payloadKind`、`aat:format`、`aat:raw` 与坐标；边 payload 维持现有 `aat:payload` 绑定。这样语义层次最清楚，扩展到任意 schema role 也自然，且不会要求下游先理解一个没有业务内容的“Payload”属性名。
</Assistant>

<User id="1">
“……节点 payload 改成 role-named predicate 后，payload object 上是否还要保留 aat:role？我认为应当保留，至少在当前规约里保留。理由不是为了让 aat:payload 继续当主查询入口，而是为了……”你这个理由似乎有点荒谬。你自己看当前的例子，是不是有个Python脚本？Python脚本代表的是什么？代表的是下游供应链的消费。你会发现在下游消费的时候你从哪个角度来说？按照我们即将要改变的那个模型，是不是？你这个节点的这个属性的名字已经是角色名字，你已经能拿到这个东西了，而且语义也很正确。那你再保留它原本的role有什么用吗？没有任何消费者，没有任何的消费者，没有任何消费者的设计，你摆出来是干什么呢？是拿来上供还是过圣诞节的呢？ 有想过这个问题吗？

“……这里还要处理一个命名问题：role token 如何变成 RDF predicate。现有项目已经有 field-predicate.ts 和 direct attribute 的字段谓词规则，把字段名映射进 aat: namespace。payload role 也可以沿用同一套 predicate local-name 规范。.release-policy-config 映射为 aat:release-policy-config，.review-playbook 映射为 aat:review-playbook。这个选择有一个明显优点：heading 上普通属性和复杂属性共用同一命名空间与字段表面，消费者不用学习另一套 aat:payload/release-policy-config 之类的路径。保守一点，还可以规定 payload role 必须满足与 direct field predicate 相同的可投影字段名约束；无法形成稳定 predicate 的 role 仍保留为 aat:role，但不创建 role-named heading predicate，或者进入诊断。冷链样例里的 role 都是稳定 token，因此没有问题。……”你是越俎代庖吗？ 什么命名问题？它有什么特殊的地方吗？你这不就是一个普通的name attribute吗？你在一个标题头上那个中括号里面写自定义的属性，不一样也成名字吗？那你在这边底下那个挂载上去，有什么特权吗？人家是武则天吗？有什么特殊的地方吗？为什么要特殊对待呢？你有想过这个问题吗？你提出的这个问题是问题吗？什么保守一点？什么保守？保守个屁啊！保守不保守的？你到底有没有把问题想明白呀？你想喝水，我给你一口水。你就保守一点，我给你一个火山温泉，要不要？听懂这个讽刺没有？你根本就不知道你想要什么吗？你不知道是什么东西，给我去调查，不要半吊子跟我讲话。半吊子没有资格和我对话。


你自己看啊，这边已经有Python脚本了，它已经是干什么呢？就已经是消费者了。你自己看它Python脚本里面是怎么写怎么消费的。你自己看，你自己想象一下，消费面就这么点，是不是？图查询嘛，查到数据啊，你看它这里，Payload是不是？因为它里面的那些嵌套字段，它是不属于图的原生语言的，是吧？你懂我意思吗？但是它可以进入就是以原始字符串的形式保留在图里面，你下游查出来可以拉起来单独建立数据模型再消费嘛。你看这个链路，它不是就这样子吗？你自己想一想啊。 \\wsl.localhost\Ubuntu\home\t103o\workbench\.codex\skills\observation-judgment-and-action\SKILL.md
\\wsl.localhost\Ubuntu\home\t103o\workbench\.codex\skills\observation-judgment-and-action\知识密集型协作中的认知偏移与话语转换：多学科视角的文献综述.adoc 好好阅读一下这些思想啊，我感觉你根本不会做设计，知道吗？

“……第一种选择是只输出 role-named predicate，不再输出 heading aat:payload。这是最干净的对象模型：heading 上不存在一个名叫 payload 的业务属性，只有 release-policy-config、review-playbook 这类复杂属性。缺点是通用枚举所有 node payload 的查询不再能用一个谓词完成，需要查 ?heading ?predicate ?payload 并识别 object 是 payload object，或者查 ?payload aat:payloadKind "node" 再反查 subject。这会让通用工具稍微复杂。……”我就很奇怪，你下游工具链一定要区分一定要区分，你这个标题节点上面哪部分是Payload的吗？ 你有这个需求吗？ 你没有发现Python脚本都已经是知道了到底要哪一个数据模型了吗？它不是已经知道要哪个角色名字了吗？你不觉得你很奇怪吗？ 也就是说，你想要Payload的这个专属的命名空间吗？你觉得你要吗？因为我根本想不出有什么理由要保留它。如果说要命名空间的话，也不会这么用啊，是不是？
你自己看，你看你挂一个复杂的载荷，这个载荷本身是一定会有Schema的，要不然谁能解释你啊？也就是下游早就知道这个东西了，下游把数据模型建好之后，你才会在文档里面写，才会把它嵌进去啊。你，你这不倒反天罡吗？我怎么觉得你很奇怪？你到底有没有想明白？ 

你好好想一想，而且你最后一句话说什么？是你什么？你自己是这么说的。
“……我最终判断如下：你提出的调整方向是正确的，而且比当前 heading aat:payload payload 的单一入口更符合“payload 是……”什么叫做什么我的最终判断？你判断个屁啊，有什么好判断的？你判断东西不应该这样判断吗？你问我接不接受皮亚诺公理，我说是的，我接受这个公理。左边有个一，右边有个一，相加一下等于2，这就是我的推导过程。这是我的判断吗？是我个人判断吗？为我意志所左右吗？ 那你判断这个东西为什么说是你判断的呢？你不是说什么我们接受了这个东西？啊？那推导之后就是这样子啊。哎，我就觉得很奇怪呀，你好好想想啊，好好想想，做好准备吧啊，该看的东西自己去看、自己去补、自己去想。你自己真正的信心满满的准备好了，该验证的验证，该做的东西做，做好了之后再来用弹窗与我沟通，你自己有任何的不确定性不要留给我，你自己去验证，做实验自己去判断，自己去搜，自己去看，做好之后好再用弹窗与我沟通，不少于5,000字或者更多，请你开始。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="2">
# 节点复杂属性投影的收敛设计

我重新阅读了你指定的 `observation-judgment-and-action` 技能、协作认知材料、言语沟通材料和白熊/粉色大象材料，也重新验证了项目里的实际消费链路。这里先把错误位置摆清楚：上一份回答里，我把不存在的“通用枚举 payload 需求”当作设计点准入理由，把 node payload object 上保留 `aat:role` 说成“自描述性”，又把 role 变成 predicate 说成“命名问题”。这些说法没有从消费者动作推出，属于方案空间抢占问题空间。当前问题的事实很窄：标题节点上挂的是一个有名字的复杂属性；下游知道自己要读哪个模型；raw 内部字段不能展开进 RDF；所以 RDF 只需要让下游用这个属性名取到一个 raw value object，再按传输格式解析它。

我已经实际运行并查看了冷链样例链路。当前 `consume_payloads.py` 的做法是：先找到 `cold-chain-release` heading，再通过 `?heading aat:payload ?payload` 枚举 node payload，再读取 `?payload aat:role ?role`，再由 Python 的 `PAYLOAD_MODELS` 用 role 选择 Pydantic model。这个脚本代表下游供应链消费面。它不是一个不知道自己要什么的通用浏览器；它已经写死并理解了 `release-policy-config`、`review-playbook`、`dependency-evidence` 三个模型。当前查询里 `aat:payload + aat:role` 的两跳结构，只是因为 RDF 目前没有把 role 直接投影成 heading 的复杂属性谓词。改变模型以后，下游脚本不需要再问“有哪些 payload”；它只需要问“这个标题有没有 `release-policy-config` 属性”和“这个标题有没有 `review-playbook` 属性”。

由这个消费事实可以推出：node payload object 上继续输出 `aat:role "release-policy-config"` 没有消费者动作授权。`release-policy-config` 已经作为 heading 上的谓词出现时，它就是属性名；下游从这个谓词进入 value object，已经知道这份 raw 应按哪个模型解释。再在 value object 内重复写一次 `aat:role`，不会减少下游不确定性，不会支持新的解析动作，不会减少查询成本，也不会增加可验证性。它只是把已经由谓词表达过的信息重复一遍。重复信息一旦进入公共投影，就要承担文档解释、测试维护、查询歧义和兼容成本。按照公共投影单位准入规则，它不能进入 node 侧的新规范。

所以，节点侧的收敛规则应当是：node payload 在 RDF 图中不再被投影为 `heading aat:payload payloadObject`，也不再把 payload role 保存在 value object 上；node payload 被投影为 heading 的 role-named complex property。source block role token 就是该复杂属性的名字。复杂属性的值是一个保存 raw、format 和 source coordinate 的 value object。

以冷链样例为例，源表面：

```asciidoc
[.release-policy-config, for=cold-chain-release]
[source,json]
----
{ ... }
----

[.review-playbook, for]
[source,yaml]
----
review_team: quality-ops
...
----
```

应该投影为：

```ttl
:heading-l5-o0 aat:release-policy-config :payload-l10-o0 ;
    aat:review-playbook :payload-l34-o0 .

:payload-l10-o0 aat:format "json" ;
    aat:raw """...""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 10 ;
    aat:endLine 32 ;
    aat:contentStartLine 13 ;
    aat:contentEndLine 31 .

:payload-l34-o0 aat:format "yaml" ;
    aat:raw """...""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 34 ;
    aat:endLine 42 ;
    aat:contentStartLine 37 ;
    aat:contentEndLine 41 .
```

这里没有 `heading aat:payload :payload-l10-o0`，没有 node value object 上的 `aat:role "release-policy-config"`，也没有 node value object 上的 `aat:payloadKind "node"`。`payload-l10-o0` 这个 IRI 只是投影器给复杂属性值分配的资源身份，用来承载 raw、format 和坐标；它不是公共消费者需要先理解的业务类型。消费者面对的是 `aat:release-policy-config` 这个属性名。

这也修正了“命名问题”的误判。这里没有特殊命名问题。项目已经有 `field-predicate.ts`，直接属性字段名也是通过同一套 `fieldPredicate(fieldName)` 映射进 `aat:` namespace。标题头部 `owner=quality-ops` 变成 `aat:owner`，`status=active` 变成 `aat:status`；节点复杂属性的 `.release-policy-config` 也应按同一套 field predicate 规则变成 `aat:release-policy-config`。它不是武则天，没有特权；它只是同一个 heading field surface 的复杂值版本。唯一差别是普通字段的 object 是 literal，复杂字段的 object 是 raw value resource。

因此，书里应当把 node payload 从“payload object with role”重写为“role-named complex property”。更准确的对象定义是：

> 节点复杂属性由带 `for` / `forSelector` marker 的 listing block 产生。该 block 的 property role 是 heading 上的字段名。字段值是保存 payload raw、payload format 和回源坐标的 value object。RDF 图不把 `payload` 作为该 heading 字段的名字；字段名字来自 property role。

这里仍然需要 `for`。`for` 的构成性职责不是提供属性名，而是把普通 source listing 标记为“这是一个要投影到 heading 上的复杂属性值”，并在带值时提供 heading selector。没有 `for`，一个 `[source,json]` block 可能只是示例代码、配置片段、日志或教学材料；位置不能把它自动变成 heading 属性，source language 不能，role token 也不能。`for` 是这个源表面进入 node complex property 语境的信号。

节点复杂属性的构成性条件应当写成三项：第一，listing block 有 `for` 或 `forSelector` marker；第二，listing block 有一个 property role；第三，listing block 有 raw body 和 source coordinate。带值 `for=delivery` 表示 selector binding；无值 `for` 表示 source ownership binding。role 提供属性名；source block language 提供 format；raw body 提供复杂属性值的原始文本。

这里要把 role 的数量也写清楚。因为 role 在 node complex property 中承担字段名职责，一个规范 node complex property block 应声明一个 property role。没有 role，就没有字段名，不能形成 heading field predicate。多个 role 会产生多个候选字段名，消费者无法知道哪一个是该复杂属性的 schema name。书中的 canonical surface 应要求一个 property role。实现层可以把缺失或多个 role 作为诊断、跳过或错误处理，但规范书不应把多个 role 解释成多个字段，也不应默默选择第一个。节点复杂属性不是样式 class 集合；这里的 role 是字段名。

这一点和标题 role 不冲突。标题头部 `[#cold-chain-release.policy]` 的 `.policy` 仍然投影为 heading 的 `aat:role "policy"`，因为 heading role 是标题分类，不是字段名。payload block 里的 `.release-policy-config` 在 `for` marker 语境下是 property role，承担字段名职责。相同的 AsciiDoc role 语法在不同源表面上有不同投影位置，这是由上下文决定的：heading metadata role 是 heading classification；node payload block role 是 heading complex-property name；edge payload block role 是 edge payload schema label。

`payloadKind "node"` 在新 node 侧也没有消费者动作授权。下游从 `aat:release-policy-config` 进入 value object，不需要再知道“这是 node payload”。它知道这是标题的 `release-policy-config` 属性值。这个 value object 需要的事实是如何解析 raw，即 `aat:format`；需要的证据是 raw 和 source coordinate；不需要一个 `node` 分类 literal。`payloadKind` 如果保留，只会服务一个假想的“通用枚举所有 node payload”工具。但当前样例、Python 消费脚本和书的真实消费动作都不是这个工具。公共投影不能为了未被观察到的工具动作增加机制字段。

`aat:forSelector` 是否保留，需要按同一准入规则处理。业务消费不需要它；`aat:release-policy-config` 已经表明绑定结果。但是 RDF12 projection 的另一个公共消费者是 source-aware authoring / audit 工具：它关心一个复杂属性是通过哪个 selector 绑定到 heading 的，尤其在 selector 与 heading headline、address label、local alias 之间需要审计时，`forSelector` 可以减少回源解析成本。这个字段不是业务字段，也不是属性名重复；它是绑定证据。保留它有消费者动作：诊断 selector binding、解释 attachment 来源、定位 source marker。无值 `for` 不输出 `aat:forSelector`，因为那里没有 selector literal。这个字段可以保留，但书里必须把它写成 binding fact，而不是 payload 内部字段。

所以 node value object 的字段应为：`aat:format`、`aat:raw`、`aat:relativePath`、`aat:startLine`、`aat:endLine`、`aat:contentStartLine`、`aat:contentEndLine`，以及带值 selector binding 时的 `aat:forSelector`。不输出 `aat:role`，不输出 `aat:payloadKind "node"`，不输出 `aat:payloadId`，不输出 `rdf:type aat:PayloadBlock`。value object 的 IRI 可以继续使用 `payload-l<line>-o<n>` 这种 resource identity；这只是图内指称，不构成业务字段。

边 payload 保持当前行为，因为边的领域事实不同。xref 是行内 edge evidence；edge payload block 在另一个源位置；两者之间必须由 xref 的 `payload=<source-payload-id>` 显式选择。edge payload 的公共入口是 xref edge evidence，而不是 source heading 或 target heading。因此 edge 侧继续使用：

```ttl
:xref-edge-l8-c12-o0 aat:payloadSelector "rel-release-temperature-audit" ;
    aat:payload :payload-l44-o0 .

:payload-l44-o0 aat:payloadId "rel-release-temperature-audit" ;
    aat:role "dependency-evidence" ;
    aat:format "yaml" ;
    aat:raw """...""" .
```

这里 `aat:role "dependency-evidence"` 有消费者动作授权，因为 edge 侧没有 role-named predicate；edge evidence 仍通过 generic `aat:payload` 连接 value object。下游如果要解释 edge payload，就需要知道这个 edge payload 的 schema label。`dependency-evidence` 不能移到 xref edge 上作为 `aat:dependency-evidence`，因为你已经限定边保持原行为，而且 edge payload 的选择机制围绕 `payload=<id>` 与 source payload id 成立。边 payload 的 role literal在这个模型里不是重复信息，它是 edge payload raw 的 schema label。

这正好解释 node 与 edge 的差异。node payload 的 role 已经成为 heading field predicate，所以 node value object 上再写 role 是重复。edge payload 的 role没有成为 edge predicate，所以 edge payload object 上保留 role 是必要 schema label。这个差异不是风格不统一，而是由两个归属机制推出的：node 侧是 heading 属性投影；edge 侧是 xref evidence 附属 payload。

`data` 仍然不进入契约。payload model name 和 transport format 是正交事实。`release-policy-config` / `review-playbook` / `dependency-evidence` 是模型或字段名；`json` / `yaml` 是 raw 的传输语法。下游先按 `aat:format` 把 raw parse 成内存数据结构，再按查询到的属性名或 edge role 选择模型解释。`data=toml` 这类字段会把传输格式放到第二个位置，制造冲突，不应出现在书的规范表面，也不应参与投影。

冷链 Python 脚本在新模型下应改为按字段取值，而不是枚举 `aat:payload`。策略报告可以写成两个明确查询：

```sparql
PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
SELECT ?policyPayload ?policyFormat ?policyRaw ?playbookPayload ?playbookFormat ?playbookRaw WHERE {
  ?heading aat:addressLabel "cold-chain-release" ;
           aat:release-policy-config ?policyPayload ;
           aat:review-playbook ?playbookPayload .
  ?policyPayload aat:format ?policyFormat ;
                 aat:raw ?policyRaw .
  ?playbookPayload aat:format ?playbookFormat ;
                   aat:raw ?playbookRaw .
}
```

脚本里不再需要对 node payload 读取 `aat:role`。`ReleasePolicyConfig` 对应 `aat:release-policy-config`，`ReviewPlaybook` 对应 `aat:review-playbook`。这条链路更短，语义更直：图查询拿到标题属性，Python 按该属性对应的数据模型解析 raw。边报告仍然读取 xref edge 的 `aat:payload`，再读取 edge payload 的 `aat:role "dependency-evidence"`，因为边侧保持原模型。

6 号书应按这个对象重修，而不是只把 `aat:payload` 例子替换成多一条谓词。具体修订面如下。

前言要写：标题节点保存直接属性和 role-named complex properties。复杂属性值保留 raw、format 和回源坐标。`payload` 这个词不作为标题节点上的业务字段名。交叉引用边证据保存 edge payload，edge payload 通过 `aat:payload` 与 edge evidence 相连。

术语表要把 `node payload` 改为 `heading complex property` 或至少定义为“投影成 heading role-named field 的复杂属性”。`payload role` 不能泛泛写成所有 payload object 的字段；要区分 node property role 和 edge payload role。node property role是 field name；edge payload role是 edge payload schema label。

第 1 章的构成性对象要改：payload block 不创建结构节点；node payload block 产生 heading complex-property predicate；edge payload block 产生 edge evidence 的 payload object。不要把 node 和 edge 都揉成 `aat:payload` 这一种公共关系。

第 2 章的 heading 属性说明要加一条：heading 的字段谓词可以指向 literal，也可以指向 raw value object。前者来自标题 metadata direct attributes；后者来自带 `for` marker 的 node payload block。字段谓词都使用同一套 field predicate 映射。

第 5 章保持 edge payload selector 模型：xref `payload` 字段保存为 `aat:payloadSelector`，唯一匹配 source payload id 时，xref edge evidence 通过 `aat:payload` 指向 edge payload object。这里不要把 node 侧的新 role-named predicate 推到 edge 侧。

第 6 章需要重写核心小节。直接属性小节保留。节点 payload 小节改名为“节点复杂属性”或明确写“node payload projects as role-named complex property”。规则顺序必须是：`for` marker 使 listing block 进入节点复杂属性语境；一个 property role 给出字段名；source block language 给出 format；block body 给出 raw；绑定目标给出 heading；heading 上输出 `aat:<property-role> valueObject`。然后写反例：没有 `for` 不是节点复杂属性；没有 property role 不能形成字段名；node value object 不输出 `aat:role`、`aat:payloadKind`、`aat:payloadId`。

第 7 章查询契约要重写 node payload 查询。旧查询：

```sparql
?heading aat:payload ?payload .
?payload aat:role "banana" .
```

应改为：

```sparql
?heading aat:banana ?payload .
?payload aat:format ?format ;
         aat:raw ?raw .
```

冷链样例则是 `aat:release-policy-config` 和 `aat:review-playbook`。查询章节不再教消费者“先枚举 payload 再过滤 role”。这种查询形态正是当前语义不干净的来源。

第 8 章 worked example 要把 canonical Turtle 改成：`配送策略` heading 有 `aat:banana :payload-l10-o0`，或者在冷链书面样例中有 `aat:release-policy-config :payload-l10-o0`。node value object 只保留 format/raw/span/forSelector。edge payload 示例保持 `xrefEdge aat:payload payload-l25-o0`，edge payload object 保留 `aat:role "pear"` 和 `aat:payloadId`。

README 和 `samples/cold-chain-payload/README.md` 要同步这个消费路径。结构覆盖表中“selector node payload”不应再写 `heading aat:payload -> node payload`，而应写“heading `aat:<payload-role>` -> raw value object”。`consume_payloads.py` 要同步为字段查询，展示下游确实不需要知道 node value 是 payload。输出文案里也不必写 `node payload release-policy-config`，可以写 `release-policy-config [json]`、`review-playbook [yaml]`。edge 部分可以继续写 `edge payload dependency-evidence [yaml]`，因为 edge 侧仍然以 payload 机制消费。

源码上，`payload-projector.ts` 的 node branch 不应调用固定 `aat:payload` predicate。它应从 node payload block 的唯一 property role 计算 `fieldPredicate(role)`，然后写 `ownerHeading fieldPredicate(role) payloadResource`。node branch 创建 payloadResource 后，不写 `payloadKind`、不写 `role`、不写 `payloadId`。它写 format/raw/span，带值 selector 时写 forSelector。edge branch 保持现有 `entry.iri aat:payload payloadResource`，并继续写 edge payload 的 role、payloadId、format/raw/span。这样代码里的差异和对象定义一致。

测试也必须围绕消费者动作写。node projector test 不再找 `onlyPayloadForOwner(..., aat("payload"))`，而是找 `onlyObjectIri(heading, aat("banana"))` 或 `aat("release-policy-config")`。断言 node value object 没有 `aat:role`、没有 `aat:payloadKind`、没有 `aat:payloadId`。edge projector test 继续从 xref edge 的 `aat:payload` 找 edge payload，并断言 edge payload 有 `aat:role`、`aat:payloadId`、`aat:format`、`aat:raw`。query-contract test 也要体现 node 和 edge 的不同入口。

这个模型满足你提出的“对现有功能没有破坏”的真实含义：功能不是保留每一个旧谓词；功能是下游能拿到同一份 raw、按同一份模型解析、保持同一份 source coordinate 和 edge evidence。node 侧查询会更短，业务语义更直接；edge 侧保持原模型，避免扩大边的设计面。旧的 `heading aat:payload payload` 如果继续存在，就会让两个入口并列，书里还要解释哪个是主语义入口、哪个是枚举入口，这又制造一个没有消费者动作支持的表面单位。因此 node 侧不保留 `aat:payload` 更干净。

最终收敛后的对象是：标题节点有普通字段和复杂字段；普通字段的值是 literal；复杂字段的值是 raw value object。复杂字段名来自 payload block 的 property role。`for` 是把 source block 投影为标题复杂字段的 marker 和绑定机制。raw value object 保存 raw、format 和坐标，不重复保存字段名，不声明自己是 node payload。交叉引用边仍然有 edge payload；edge payload 由 xref `payload=` selector 绑定 source payload id，并通过 `aat:payload` 挂在 xref edge evidence 上；edge payload object 保存 role、payloadId、format、raw 和坐标。这个推导来自当前消费脚本、字段谓词机制、源表面构成条件和边/节点归属差异，不依赖个人偏好。
</Assistant>

<User id="2">
你自己去理解。 好，我看你更加理解了。对于边，其实它不特殊。 你自己看啊，这个边是不是它是怎么声明的？它是不是也是用这个键值对去声明？那你有没有发现呢？你有没有发现一个问题？他本来就可以，就是边也可以表示很多个载荷一起挂上去，这本来就是自然而然，它没有什么特殊地方，我之前我自己都理解错了啊，你自己再想一下，你看它比如说可以写apple，然后等于某一个载荷，banana，等于某个载荷，那自然而然，那不就挂上去了吗？它就是这个它不就是这个name attributes吗？ ，它只不过说某这些代表比较特殊，里面东西可以展开比较多，仅此而已嘛，你再想想是不是。因为如果你这个边的载荷不改，那它的查询体验跟节点的查询体验，也就是标题节点的体验就会两套，就要学习两套，就会本身就很别扭。而且你会发现这个Payload在边的这个载荷里面没有无可替代的价值，它就是绕来绕去，就是很奇怪，就是不干净。你懂我意思吗？你自己再想一想是不是？要按照下游工具者消费的角度是一点，然后呢我们在本体表达，本身表达结构是否干净，是不是？我们的每个东西都要有人消费呀，没人消费的东西我们设计出来干嘛呢？是不是？
是不是你会发现这是同构的呀，就是一套数据嘛。是不是你标题的属性跟边的属性，那不都是属性吗？是不是？
你的 xref 你看呐，它不是可以自己自定义额外增加属性吗？那这里不是有键值对吗？不是有名字和值吗？哎呀，那个值绑定到一个复杂的载荷，那其实就是值比较复杂嘛。它本身的身份又没改变，是不是？你仔细想一想，想好之后再发个弹窗，看一下你有什么要补充说明的，或者说新的想法可以告诉我，不少于3000字或者更多，开始。 好的，那么回到你这个本次弹窗里其他讲的东西，我看过去没有什么问题，你这次比之前专业多了啊。那你继续再想象我刚才说的问题吧。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="3">
# 节点与边复杂属性的统一模型

你刚才对边的修正是成立的，而且会把整个模型从“node 一套、edge 一套”收敛成同一个对象：标题节点和交叉引用边证据都拥有属性；属性可以是简单 literal，也可以是复杂 raw value object。所谓 payload 不应作为公共字段名出现。它只是源表面里“用一个 source/listing block 承载复杂值”的实现机制，不是下游消费者要学习和查询的业务对象。

我重新看了当前 xref 模型。xref macro 本来就有 named attributes：

```asciidoc
xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, payload=rel-release-temperature-audit]
```

当前实现把 `rel` 和 `payload` 做成控制字段：`rel` 映射 relation predicate，同时保留 `aat:rel`；`payload` 被保存为 `aat:payloadSelector`，再由 `payload-projector.ts` 找到 `#rel-release-temperature-audit` 的 listing block，最后写 `xrefEdge aat:payload payloadObject`。这个模型的问题和 node 侧是同一个问题：真正的属性名被硬编码成 `payload`，业务名称只能躲到 payload object 的 `aat:role` 里。下游想读“dependency-evidence”，却必须先知道有个机制字段叫 payload，再读 object 的 role。

如果把 xref named attributes 当作边属性表面，这个特殊化就没有必要。边上本来就可以写多个 named attributes：`weight=0.9` 是简单边属性；`dependency-evidence=rel-release-temperature-audit` 就可以是复杂边属性；`risk-profile=rel-risk-profile`、`audit-record=rel-audit-record` 也同理。区别只在于简单属性的值是 literal，复杂属性的值是一个 source block selector，投影后成为 raw value object。这样边和标题完全同构：标题头部或 node payload block 提供 heading property；xref attribute 提供 edge property；属性名都来自作者写出的 name；属性值按形态分别投影为 literal 或 raw value object。

因此，规范表面应从：

```asciidoc
xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, payload=rel-release-temperature-audit]

[#rel-release-temperature-audit.dependency-evidence]
[source,yaml]
----
source: quality-sop-2026
...
----
```

收敛为：

```asciidoc
xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, dependency-evidence=rel-release-temperature-audit]

[#rel-release-temperature-audit]
[source,yaml]
----
source: quality-sop-2026
...
----
```

这里 `dependency-evidence` 是边属性名；`rel-release-temperature-audit` 是 source block id，是该复杂属性值的 selector。payload block 不需要 `.dependency-evidence` role，因为属性名已经在 xref named attribute 里出现了。和 node 侧一样，value object 上不需要再重复写 `aat:role "dependency-evidence"`。它只需要保存 format、raw、source coordinate，以及必要的 selector binding 证据。

对应 RDF 应是：

```ttl
:xref-edge-l8-c12-o0 aat:dependency-evidence :value-l44-o0 ;
    aat:weight "0.9" ;
    aat:rel "depends-on" ;
    aat:targetSelector "temperature-audit" ;
    aat:sourceHeading :heading-l5-o0 ;
    aat:targetHeading :heading-l55-o0 .

:value-l44-o0 aat:payloadId "rel-release-temperature-audit" ;
    aat:format "yaml" ;
    aat:raw """...""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 44 ;
    aat:endLine 53 ;
    aat:contentStartLine 47 ;
    aat:contentEndLine 52 .
```

这里是否继续叫 `payloadId` 也值得修正。既然公共对象是“复杂属性值”，更准确的字段名是 `aat:valueSelector`、`aat:sourceValueId` 或 `aat:sourcePayloadId`。如果书里仍然使用 payload 术语，就会把机制词重新带回消费者表面。我更倾向在规范层面使用 `source value id` 或 `source raw value id`。RDF 谓词可以是 `aat:sourceValueId`。它表达的是：这个 raw value object 来自源文档中 id 为 `rel-release-temperature-audit` 的 block。它不是业务属性名，也不是 object identity。

同样，`aat:payloadKind` 也不需要了。一个 value object 是 node complex property value 还是 edge complex property value，已经由 incoming predicate 的 subject 决定：subject 是 heading，就属于 heading property；subject 是 xref edge evidence，就属于 edge property。公共消费者如果真的拿到 value object 本身，可以沿 graph 反查 incoming edge；但业务消费不需要 kind。保留 `payloadKind` 又会引入一个“我需要区分 payload 类型吗”的公共投影单位。没有消费者动作，就不要输出。

这样，标题节点与边证据的统一模型是：

```ttl
:heading aat:release-policy-config :value1 .
:heading aat:review-playbook :value2 .
:xrefEdge aat:dependency-evidence :value3 .
:xrefEdge aat:risk-profile :value4 .
```

每个 `:valueN` 都是 raw value object：

```ttl
:valueN aat:format "json|yaml|..." ;
    aat:raw """...""" ;
    aat:relativePath "..." ;
    aat:startLine ... ;
    aat:endLine ... ;
    aat:contentStartLine ... ;
    aat:contentEndLine ... .
```

如果该 value object 是通过 selector 绑定到源 block 的，还输出 selector evidence：

```ttl
:valueN aat:sourceValueId "rel-release-temperature-audit" .
```

如果该 node value object 是通过 `for=...` 显式绑定 heading 的，还输出：

```ttl
:valueN aat:forSelector "cold-chain-release" .
```

无值 `for` 不输出 `forSelector`。这些 selector 字段是绑定证据，不是业务字段。

这个模型下，`payload` 这个词可以从公共规范核心退出。书可以用“raw value block”“complex property block”“source value block”来描述源表面。保留 payload 作为历史文件名或内部实现名都可以，但书的对象语言不应要求消费者学习 `payload`。如果还继续叫 payload，读者自然会问 `aat:payload` 在哪，`payloadKind` 是什么，payload role 是否保留。术语本身会把旧结构带回来。

这里要重新定义源表面。

标题复杂属性的源表面：

```asciidoc
[.release-policy-config, for=cold-chain-release]
[source,json]
----
{ ... }
----
```

解释：`.release-policy-config` 是 heading complex property name；`for=cold-chain-release` 是 heading binding marker；`[source,json]` 是 raw format；block body 是 raw value。投影为：

```ttl
:heading aat:release-policy-config :value .
:value aat:format "json" ; aat:raw """...""" ; aat:forSelector "cold-chain-release" ; ... .
```

无值 `for`：

```asciidoc
[.review-playbook, for]
[source,yaml]
----
...
----
```

解释：`.review-playbook` 是 heading complex property name；`for` 是 source ownership binding marker；不输出 empty selector。投影为：

```ttl
:heading aat:review-playbook :value .
:value aat:format "yaml" ; aat:raw """...""" ; ... .
```

边复杂属性的源表面：

```asciidoc
xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, dependency-evidence=rel-release-temperature-audit]

[#rel-release-temperature-audit]
[source,yaml]
----
...
----
```

解释：`dependency-evidence` 是 edge complex property name；`rel-release-temperature-audit` 是 source value id；`[source,yaml]` 是 raw format；block body 是 raw value。投影为：

```ttl
:xrefEdge aat:dependency-evidence :value .
:value aat:sourceValueId "rel-release-temperature-audit" ;
    aat:format "yaml" ;
    aat:raw """...""" ; ... .
```

这样，一个 xref edge 上挂多个复杂属性也很自然：

```asciidoc
xref:temperature-audit[
  温控审计规则,
  rel=depends-on,
  weight=0.9,
  dependency-evidence=rel-temperature-evidence,
  risk-profile=rel-temperature-risk,
  audit-playbook=rel-temperature-playbook
]
```

RDF 直接是：

```ttl
:xrefEdge aat:dependency-evidence :valueA ;
    aat:risk-profile :valueB ;
    aat:audit-playbook :valueC ;
    aat:weight "0.9" .
```

这比 `payload=...` 只能挂一个、再让 value object 里写 role 的模型干净得多。每个复杂属性都有自己的名字，查询者不用枚举 payload 后过滤 role。边和标题的查询体验一致：知道属性名，就直接查该属性谓词。

那么如何区分 xref named attribute 中哪些是 simple literal，哪些是 complex value selector？不能靠名字白名单，也不能靠 `payload=` 这个特殊字段。应由 selector 是否绑定到 source value block 来决定。对于 xref edge 的 named attribute：

- `rel` 是关系控制字段，决定 relation predicate，并可保留 `aat:rel`。它不是 ordinary property，也不是 complex property。
- `weight=0.9` 这种值如果没有绑定到 source value block，则按 direct literal field 投影为 `aat:weight "0.9"`。
- `dependency-evidence=rel-release-temperature-audit` 如果值唯一绑定到一个 source value block，则投影为 `aat:dependency-evidence :valueObject`，而不是 literal。
- 如果某个字段值看起来像 selector 但未绑定 source value block，就应按普通 literal 还是报诊断？这里需要看公共契约。为了避免把普通字符串误吞成复杂属性，绑定成功才升级为 complex value；绑定失败时保留 literal 更符合 named attribute 的一般语义。但如果作者预期它是复杂属性而写错 id，下游会拿不到 raw object。书可以规定：edge complex property requires its attribute value to match exactly one source value block id；unmatched value remains a literal field and diagnostic may be emitted. 如果当前图没有 diagnostics surface，就先保留 literal，不虚构 object。

标题复杂属性不一样，因为 `for` marker 明确声明这个 block 是 complex property source，不存在“误把 literal 升级”的问题。edge 侧没有额外 marker，xref named attribute 本身既可以是 literal，也可以是 value selector。因此 edge 侧需要“value binds source value block => complex；otherwise literal”的解释规则。这个规则与当前 direct attribute projection 可以统一：先建立 source value block id index，再投影 xref attributes；当 attribute name 不是控制字段且 value 绑定 source value block，就输出 object property；否则输出 string literal。

这也意味着当前 `payload-projector.ts` 的流程需要变化。现在 pipeline 是 xref projector 先写 `payloadSelector`，attributes projector 跳过 `payload`，payload projector 最后绑定 `aat:payload`。新模型应把 edge complex property binding 放在“xref attributes projection”这个层位，或者让 payload/raw-value projector 在 xrefIndex 上处理所有 named attributes。关键不是文件怎么切，而是对象职责：xref named attribute 的 name 决定 predicate；attribute value 如果绑定 source raw value block，就写 object；否则普通 attribute projector 写 literal。

source value block 如何识别？节点复杂属性 block 由 `for`/`forSelector` marker 识别；边复杂属性 value block 需要被 xref attribute value 指向。源 block 是否需要 role？不需要。边的属性名来自 xref attribute name，source block id只提供 selector target。source block role如果存在，只是 AsciiDoc 表面 role，不进入规范。为了避免重复和混淆，canonical sample 应去掉 `[#rel-release-temperature-audit.dependency-evidence]` 里的 `.dependency-evidence`，改成 `[#rel-release-temperature-audit]`。这样属性名只出现在一个地方：xref named attribute name。

节点 source block 仍然需要 role，因为 node 的属性名没有别的地方可写。`for=heading` 的 value 是绑定目标，不是属性名。所以 node 的 property name 来自 block role；edge 的 property name 来自 xref attribute name。这不是不统一，而是源表面语法不同：node 属性是块挂载，属性名写在 block role；edge 属性是 xref named attribute，属性名已经写在 attribute key。

这个模型也能解释为什么 `payload` 一词没有无可替代价值。对 node，它不是属性名，属性名是 block role。对 edge，它也不是属性名，属性名是 xref attribute key。对 raw value object，它不是需要消费者解释的业务类型，value object 只需 raw/format/span。对 source binding，它也不是唯一机制，node 用 `for`，edge 用 attribute value selector。于是 `payload` 只剩内部实现命名价值，不应进入公共 RDF 主契约。

如果书要保留术语，可以在术语表中把 payload 降级为“复杂属性值的旧称或非规范简称”吗？我不建议。6 号书承担截止当下的设计规范，不写时态和迁移。书里应直接使用当前对象语言：complex property、raw value object、source value block、property role、source value id。提交说明和 PR 描述再写“replace payload predicate contract with role/key-named complex properties”之类的变迁事实。书不写“废弃 payload”。

新的冷链消费脚本会更合理。策略节点：

```sparql
?heading aat:release-policy-config ?policyConfig ;
         aat:review-playbook ?reviewPlaybook .
?policyConfig aat:format "json" ; aat:raw ?policyRaw .
?reviewPlaybook aat:format "yaml" ; aat:raw ?playbookRaw .
```

关系边：

```sparql
?edge aat:sourceHeading ?source ;
      aat:targetHeading ?target ;
      aat:dependency-evidence ?evidence .
?evidence aat:format "yaml" ;
          aat:raw ?evidenceRaw .
```

这个查询体验完全同构。标题节点和边证据都像对象一样暴露属性。属性值可能是 literal，也可能是 raw value object。下游不需要写 `payloadKind`，不需要过滤 `role`，不需要知道 `payloadSelector`，不需要知道“payload 机制”。它只知道自己的数据模型属性名。

这里 `payloadSelector` 也应该退出公共主契约。edge attribute value selector 的证据可以保存在 value object 上：`aat:sourceValueId "rel-release-temperature-audit"`。xref edge 上不需要 `aat:payloadSelector`，因为不再有一个专门的 payload 控制字段。对于每一个复杂属性，selector 是该属性谓词指向的 value object 上的 source id 事实。若需要审计，可从 `?edge aat:dependency-evidence ?value . ?value aat:sourceValueId ?id` 读取。

`rel` 仍然特殊，因为它不是普通属性值，也不是复杂属性值。它决定主 relation triple 的 predicate。它可以继续保留 `aat:rel "depends-on"` 作为边证据字段。`targetSelector`、`sourceHeading`、`targetHeading`、official resolved facts也保持，因为它们是 xref edge evidence 的结构证据，不是普通 named attribute。

字段谓词规则仍用 `fieldPredicate()`。这解决所有属性名映射问题，没有单独的“payload role predicate”规则。标题 direct attribute、heading complex property role、xref direct attribute、xref complex property attribute key，都用同一套 field name -> aat predicate 规则。这样书里可以简单写：字段名映射为 `aat:` namespace 下的 field predicate；字段值若是 scalar，输出 literal；字段值若绑定 raw value object，输出 object IRI。没有特殊命名通道。

对象定义可以写成：

> Complex property is a field whose value is a raw value object. A raw value object preserves authored raw text, source block language, and source coordinates. Heading complex properties are introduced by source value blocks with `for` / `forSelector`; their field name comes from the block property role. Xref edge complex properties are introduced by xref named attributes whose value binds a source value block id; their field name comes from the xref attribute key.

中文书中可写：

> 复杂属性是值为 raw value object 的字段。raw value object 保存源文本 raw、source block language 和回源坐标。标题复杂属性由带 `for` / `forSelector` marker 的 source value block 创建，字段名来自该 block 的 property role。交叉引用边复杂属性由 xref named attribute 创建，字段名来自 attribute key，字段值通过 source value id 绑定 source value block。

然后接：

> raw value object 不展开内部字段。JSON/YAML/TOML 等 raw 内容由下游按字段名和 format 解释。RDF12 heading projection 不把 raw 内部字段投影为业务 RDF 谓词。

对 `cold-chain-release.adoc` 的改写，建议是：

```asciidoc
冷链出库放行策略依赖 xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, dependency-evidence=rel-release-temperature-audit]。

[.release-policy-config, for=cold-chain-release]
[source,json]
----
...
----

[.review-playbook, for]
[source,yaml]
----
...
----

[#rel-release-temperature-audit]
[source,yaml]
----
...
----
```

这里 `dependency-evidence` 只在 xref attribute key 出现一次。node 的 `release-policy-config` 和 `review-playbook` 只在 block role 出现一次。没有 `.dependency-evidence` role，没有 `payload=`，没有 `aat:payload`，没有 role literal，模型清楚。

对 `structural-payload.adoc` 的规范样例，可改成：

```asciidoc
配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, pear=rel-delivery]。

[.banana, for=delivery]
[source,json]
----
...
----

[#rel-delivery]
[source,yaml]
----
...
----
```

如果觉得 `pear` / `banana` 是示意名称，书里可以继续用它们展示“字段名与数据模型名由作者约定”。RDF：

```ttl
:deliveryHeading aat:banana :value-l10-o0 .
:xrefEdge aat:pear :value-l25-o0 .
```

这样结构最小、同构、可消费。

测试验收也应相应改成：

- heading complex property 从 `heading aat:banana value` 取得。
- edge complex property 从 `xrefEdge aat:pear value` 取得。
- value object 输出 format/raw/span。
- node value object 不输出 role、payloadKind、payloadId。
- edge value object不输出 role、payloadKind；输出 sourceValueId。
- xref edge 不输出 payloadSelector。
- xref named attribute 若未绑定 source value id，则按 literal direct attribute 输出。
- 一个 xref edge 可以有多个 complex property attributes，每个绑定到不同 source value block。
- 复杂属性 raw 不展开。

这个设计的成本也更低。它删除机制字段，而不是增加字段；统一 node 和 edge 的查询面；消除 role 重复；消除 payloadKind；消除 payloadSelector；让 direct attribute 与 complex attribute 共用 fieldPredicate。实现上会比当前特殊 payload selector 更一般：建立 source value block id index，然后在 xref attributes projection 中将绑定成功的 attribute value 升级为 raw value object。

最后，用 `Domain ∧ Specification ⊨ Requirements` 形式表达这次推导：

领域事实 D：AsciiDoc 标题和 xref 都有 attribute 表面；下游消费者知道业务模型字段名；复杂数据 raw 不适合展开成 RDF；source block 可以保存 raw、format、坐标；消费者通过 RDF 查询拿 raw 后用外部模型解析。

需求 R：消费者以同一方式读取标题和边上的复杂属性；查询不经过无业务含义的 `payload` 中间字段；公共图不输出没有消费者动作的重复 role/kind；复杂 raw 保持 opaque 且可回源。

规约 S：普通字段输出 literal；复杂字段输出 raw value object；标题复杂字段名来自 block property role；边复杂字段名来自 xref attribute key；raw value object保存 format/raw/span/sourceValueId/forSelector 等绑定证据；不输出 node/edge payload generic predicates。

由 D 和 S 可以推出 R。`payload=` 旧模型不能推出 R，因为它让边复杂属性回到特殊谓词和 role 过滤；`aat:payload` node 旧模型也不能推出 R，因为它让标题复杂属性失去字段名。统一的 role/key-named complex property 模型能推出 R，因为消费者直接按字段名取值，节点和边同构，raw 仍然 opaque。

所以新的收敛结论是：不仅 node payload 应改，edge payload 也应改。二者都不应叫 payload predicate。标题和边都暴露复杂属性；属性名分别来自 node block property role 与 xref named attribute key；属性值是 raw value object。`payload` 退出公共查询主路径。
</Assistant>

<User id="3">
“……如果某个字段值看起来像 selector 但未绑定 source value block，就应按普通 literal 还是报诊断？……”这里你想多了。在这里，我们已经没有作者主动的意图，我们根本不知道作者写下来的到底是Payload还是什么东西。不知道就不用管，我们这里是做不了错误诊断的，也没必要做。也就是我们就是模式匹配，你作者不按照约定，不按照这个形状写，那就没有，那就是没有，那就是普通呀，有什么问题吗？ 信息又不可能无中生有，是不是？你要不然作者主动写，我当前我就是要一个Payload，那我们才可以去检查，到底有没有绑上，绑成功。现在呢，就是普通的，你模式匹配匹配上了就有，没匹配上就没有嘛。我们根本就不知道啊，是不是？我们甚至都不知道一个block它到底是不是载荷呢？不知道，这件事情是完全不知道的。 而且我们这里根本不做linter。 你有没有越俎代庖呢？ Linter他们自己可以做。  什么意思？他们下游是不是？是明确知道哪些名字，它背后有Schema有数据模型，人家拉的那个去名字去扫，去扫，扫哪里？去扫block的这个角色名字，去扫交叉引用的名字，一扫人家就马上就能知道。你懂我意思吗？所以说，你要思考你能解决，你能做的事情在哪里？你手上的数据能解决什么问题？这个你到底有没有想明白呢？ 而且我感觉你好像总是有无中生有，你脑子里是爆炸还是什么东西啊？什么叫如果要保留术语？你告诉我是谁想要保留术语？是人还是开发者还是工具？你告诉我是谁想要？你是有被害妄想症吗？你这样子怎么去设计东西啊？左一个如果怎么样，右一个如果怎么样。你当前的所有资料，不管是文档还是书还是代码，都是玉皇大帝的圣旨吗？改了一下，世界上就要毁灭了吗？ 要什么就给什么，不干净的东西全部都要清出去，莫名其妙的，你是没有看到那个白熊效应跟粉色大象吗？你该说什么不该什么不知道吗？言语沟通没有看吗？\\wsl.localhost\Ubuntu\home\t103o\workbench\notes\0-我\关于言语沟通.adoc
\\wsl.localhost\Ubuntu\home\t103o\workbench\notes\0-我\粉色大象与白熊.md


哎呀，然后呢那什么香蕉梨子啊，那是故意随便写的。你自己换成更加符合的，就你精心要对例子进行设计嘛，是不是？ 好的，你仔细想一想哈，想一想，想好之后再用弹窗和我沟通，看一下你有什么想法、看法，或者说什么要补充说明的，想要和我说的。准备好了再跟我说哈，不少于3000字或者更多开始

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="4">
# 复杂属性模型最终收敛

这次收敛以后，对象边界已经更清楚：RDF12 heading projection 不识别“作者意图”，只识别源表面中已经出现并能被规则匹配的形状。投影器没有能力知道某个普通 named attribute 的值到底是不是作者心里的复杂载荷 selector；也没有责任替作者检查“本该绑定的东西为什么没绑定”。这不是 linter。它只做投影：形状成立，输出复杂属性；形状不成立，按普通字段或普通 source block 处理。信息不能无中生有。

因此，边复杂属性的规则不能写成“作者想声明复杂属性但没有绑定时如何报错”。投影器根本不知道作者是否想声明复杂属性。它只能看到：xref edge evidence 上有一个 named attribute；这个 attribute 的值是否与某个可承载 raw 的 source block id 精确匹配；匹配成立，attribute key 就是复杂属性名，attribute value 指向的 source block 就是该复杂属性的 raw value source；匹配不成立，该 named attribute 就是普通 literal 字段。这里没有错误诊断，没有补救推断，也没有“看起来像 selector”的判断。

这条规则直接消除上一版里多余的分支。边属性本来就是键值对。`weight=0.9` 是字段名 `weight`、字段值 `0.9`。`dependency-evidence=rel-release-temperature-audit` 也是字段名 `dependency-evidence`、字段值 `rel-release-temperature-audit`。不同之处不是字段身份不同，而是后者的值匹配到了一个 source value block，于是字段值从 literal 投影为 raw value object。没有匹配时，值就是字符串。投影器不进入作者心理，也不替下游做 schema lint。

这样，标题节点和边证据的模型完全同构：它们都有属性；属性名来自源表面的 name；属性值可以是简单 literal，也可以是 raw value object。

标题节点侧：

```asciidoc
[.release-policy-config, for=cold-chain-release]
[source,json]
----
{ ... }
----
```

`release-policy-config` 是标题节点上的复杂属性名。`for=cold-chain-release` 是把这个 source block 绑定到标题节点的 marker 和 selector。`json` 是 raw 的传输格式。block body 是 raw。

投影为：

```ttl
:releaseHeading aat:release-policy-config :releasePolicyConfigValue .

:releasePolicyConfigValue
    aat:format "json" ;
    aat:raw """...""" ;
    aat:forSelector "cold-chain-release" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 10 ;
    aat:endLine 32 ;
    aat:contentStartLine 13 ;
    aat:contentEndLine 31 .
```

无值 `for` 的标题复杂属性：

```asciidoc
[.review-playbook, for]
[source,yaml]
----
review_team: quality-ops
steps:
  - check last temperature checkpoint
----
```

`review-playbook` 是复杂属性名。`for` 是 source ownership marker。投影器按 source line 找 owning heading。没有 selector literal，所以不输出 `aat:forSelector`。

投影为：

```ttl
:releaseHeading aat:review-playbook :reviewPlaybookValue .

:reviewPlaybookValue
    aat:format "yaml" ;
    aat:raw """review_team: quality-ops\n...""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 34 ;
    aat:endLine 42 ;
    aat:contentStartLine 37 ;
    aat:contentEndLine 41 .
```

边证据侧：

```asciidoc
冷链出库放行策略依赖 xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, dependency-evidence=rel-release-temperature-audit]。

[#rel-release-temperature-audit]
[source,yaml]
----
source: quality-sop-2026
required_signals:
  - temperature_checkpoint
  - route_exception_log
risk_level: high
reason: 放行策略必须读取温控审计结果，才能判断冷链药品是否允许出库。
----
```

`dependency-evidence` 是边上的复杂属性名。`rel-release-temperature-audit` 是字段值，也是 source value block 的 id。这个 id 精确匹配到后面的 source block，所以 `dependency-evidence` 不投影为字符串 literal，而投影为指向 raw value object 的属性。

投影为：

```ttl
:xrefEdge aat:dependency-evidence :dependencyEvidenceValue ;
    aat:weight "0.9" ;
    aat:rel "depends-on" ;
    aat:sourceHeading :releaseHeading ;
    aat:targetHeading :temperatureAuditHeading ;
    aat:targetSelector "temperature-audit" .

:dependencyEvidenceValue
    aat:sourceValueId "rel-release-temperature-audit" ;
    aat:format "yaml" ;
    aat:raw """source: quality-sop-2026\n...""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 44 ;
    aat:endLine 53 ;
    aat:contentStartLine 47 ;
    aat:contentEndLine 52 .
```

这里没有 `aat:payload`，没有 `aat:payloadSelector`，没有 `aat:payloadKind`，没有 `aat:role`。属性名已经在 `aat:dependency-evidence` 上表达；值对象只承载 raw、format、selector evidence 和 source coordinate。下游消费者直接查 `aat:dependency-evidence`，拿到 raw 后按自己的 `DependencyEvidence` model 解析。这个查询动作和标题侧查 `aat:release-policy-config` 完全一致。

多个边复杂属性也自然成立：

```asciidoc
xref:temperature-audit[
  温控审计规则,
  rel=depends-on,
  weight=0.9,
  dependency-evidence=rel-release-temperature-audit,
  risk-assessment=rel-release-risk,
  review-procedure=rel-release-review
]
```

匹配到三个 source value block 时，投影为：

```ttl
:xrefEdge aat:dependency-evidence :dependencyEvidenceValue ;
    aat:risk-assessment :riskAssessmentValue ;
    aat:review-procedure :reviewProcedureValue ;
    aat:weight "0.9" .
```

没有哪个字段特殊。`dependency-evidence`、`risk-assessment`、`review-procedure` 都是边属性名。属性值匹配 source value block id，就变成 raw value object；不匹配，就按普通 literal 处理。投影器不判断作者本来是否想绑定。

这也解释了为什么不需要保留 payload 术语。公共图里不需要一个叫 payload 的谓词；也不需要一个 payload kind；也不需要一个 role literal 来重复属性名。消费者有属性名，属性名已经足够选择数据模型。`release-policy-config` 对应 `ReleasePolicyConfig`，`review-playbook` 对应 `ReviewPlaybook`，`dependency-evidence` 对应 `DependencyEvidence`。Python 脚本代表的消费链路就是这样：查 RDF 得 raw，按字段名对应的模型解析 raw。

原来的 Python 查询是：

```sparql
?heading aat:payload ?payload .
?payload aat:role ?role ;
         aat:format ?format ;
         aat:raw ?raw .
```

新模型下应当变成：

```sparql
?heading aat:addressLabel "cold-chain-release" ;
         aat:release-policy-config ?releasePolicyConfig ;
         aat:review-playbook ?reviewPlaybook .

?releasePolicyConfig aat:format "json" ;
                     aat:raw ?releasePolicyConfigRaw .

?reviewPlaybook aat:format "yaml" ;
                aat:raw ?reviewPlaybookRaw .
```

边证据查询应当变成：

```sparql
?edge aat:sourceHeading ?source ;
      aat:targetHeading ?target ;
      aat:dependency-evidence ?dependencyEvidence .

?dependencyEvidence aat:format "yaml" ;
                    aat:raw ?dependencyEvidenceRaw .
```

这个链路里没有任何消费者需要 `payload`。下游知道字段名；字段名就是 schema/model 的进入点。RDF 图负责把字段名连接到 raw value object，raw value object 负责保存 raw 和回源事实。模型解释属于下游。

这里还要收紧 source value block 的概念。source value block 是源文档中可承载 raw value 的 listing/source block。它本身不是结构节点。它只有在两类匹配中进入 RDF value object：第一，带 `for` / `forSelector` marker 并带 property role，被投影为 heading complex property；第二，它的 id 被 xref named attribute value 精确匹配，被投影为 edge complex property value。没有进入这两类匹配的 source block，就只是普通 AsciiDoc block；投影器不为它创建 raw value object。

标题侧为什么需要 `for`？因为 source block 位于标题切片内并不足以说明它是复杂属性。源文档里可以有示例 JSON、日志、命令、配置片段、文档示例。`for` marker 是作者主动给出的投影信号。没有 `for`，投影器不知道这个 block 是 heading property source，不能把它投影为标题复杂属性。

边侧为什么不需要额外 marker？因为 xref named attribute 的字段值已经提供了选择动作。`dependency-evidence=rel-release-temperature-audit` 这条边属性明确给出字段名和字段值；字段值匹配 source value block id 时，复杂属性形状成立。这里不需要在 block 上重复 `.dependency-evidence`。属性名已经在 xref attribute key 中出现，重复写在 block role 上只会制造第二个事实来源。

因此，冷链样例中的 edge block 应从：

```asciidoc
[#rel-release-temperature-audit.dependency-evidence]
[source,yaml]
----
...
----
```

改成：

```asciidoc
[#rel-release-temperature-audit]
[source,yaml]
----
...
----
```

`dependency-evidence` 只写在 xref attribute key 上。source block id 只负责让 edge attribute value 找到 raw source。这个分工干净。

标题复杂属性 block 的 property role 应使用业务字段名，不使用示意性的 banana/pear。冷链样例可以继续使用 `release-policy-config`、`review-playbook`、`dependency-evidence`。结构样例也应换成更可读的业务名，例如：

```asciidoc
[#delivery.policy, status=active, owner=ops]
== 配送策略

配送策略依赖 xref:capacity[运力规则, rel=depends-on, weight=0.8, relation-evidence=rel-delivery-capacity]。

[.policy-risk-profile, for=delivery]
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

[#rel-delivery-capacity]
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
```

对应 RDF：

```ttl
:deliveryHeading aat:policy-risk-profile :policyRiskProfileValue .
:xrefEdge aat:relation-evidence :relationEvidenceValue .
```

这样示例本身就教会读者：字段名应是业务模型名或业务属性名，不是 `payload`，也不是随机水果词。

关于普通 direct attribute 和 complex attribute 的统一规则，可以写成一条总规则：

> 字段名映射为 `aat:` namespace 下的 field predicate。字段值为 scalar 时输出 literal。字段值绑定 source value block 时输出 raw value object。raw value object 保存 format、raw 和 source coordinate。

标题侧的字段名来自两个位置：标题 metadata attrlist 的 named attributes 产生 literal 字段；node source value block 的 property role 产生 complex 字段。边侧的字段名来自 xref named attributes；值未匹配 source value block 时产生 literal 字段；值匹配 source value block 时产生 complex 字段。`rel` 是 relation control field，不按普通字段处理；xref target selector、source/target heading、official resolved facts 是 edge evidence 结构事实。

这个规则也让 `data` 彻底消失。format 只来自 source block language。`data` 不是格式控制字段，不是复杂属性 marker，不是 schema name。书里不用反复讲“不要用 data”。规范正面写清楚：raw value object 的 `aat:format` 来自 `[source,<language>]` 的 language。没有其它格式来源。该说的规则说完，不把白熊带回核心文本。

实现层的自然改法是：

1. 建立 source value block index。该 index 记录有 id、source language、raw、span 的 listing/source block。它不提前判断这些 block 是不是复杂属性，只提供可被匹配的 raw source。
2. 处理 heading complex property blocks。带 `for` / `forSelector` marker 的 source block需要一个 property role；绑定 heading 后写 `heading fieldPredicate(propertyRole) valueObject`。
3. 处理 xref named attributes。跳过 `rel` 等结构控制字段；对每个普通 named attribute，查 attribute value 是否唯一匹配 source value block id。匹配成功，写 `xrefEdge fieldPredicate(attributeName) valueObject`；匹配失败，写 `xrefEdge fieldPredicate(attributeName) stringLiteral(value)`。
4. valueObject 只写 raw、format、source coordinate 和必要的 binding evidence。heading selector binding 写 `forSelector`；edge selector binding 写 `sourceValueId`。

这里的“唯一匹配”不是 linter，而是投影确定性规则。一个 source value id 匹配多个 block时，投影器无法确定字段值对应哪个 raw source，于是不输出 complex object；该 named attribute按普通 literal 保存即可。投影器不报错，不猜测，不诊断。下游需要 stricter schema validation 时自己做 linter。

测试也应跟着消费动作改：

- heading complex property test：`heading aat:release-policy-config value` 存在；value 有 format/raw/span/forSelector；value 没有 role/payloadKind/payloadId。
- heading source-owner test：`heading aat:review-playbook value` 存在；value 没有 forSelector。
- edge complex property test：`xrefEdge aat:dependency-evidence value` 存在；value 有 sourceValueId/format/raw/span；xrefEdge 没有 payloadSelector；value 没有 role/payloadKind。
- literal fallback test：`weight=0.9` 保持 `aat:weight "0.9"`；某个 named attribute value 未匹配 source value block id 时保持 literal。
- multi complex edge properties test：同一个 xref edge 可以有 `aat:dependency-evidence`、`aat:risk-assessment`、`aat:review-procedure` 三个 value object。
- raw opacity test：value raw 内部字段不展开为 business predicates。

文档修订应只写当前对象，不写变迁史。6 号书中使用“复杂属性”“raw value object”“source value block”“source value id”“property role”“field predicate”。不在正文里解释旧的 `payload` 如何被替代，不写“废弃”，不写“兼容”，不写“以前”。这些变迁事实放 commit message 或 PR 描述。

最终对象定义是：

RDF12 heading projection 暴露 heading node 和 xref edge evidence。二者都有字段。字段名来自源表面的 name，并通过 field predicate 进入 `aat:` namespace。字段值可以是 literal，也可以是 raw value object。raw value object 保存源 block 的 raw、format 和 source coordinate，不展开内部字段。标题复杂字段由带 `for` marker 的 source value block创建；字段名来自 block property role。边复杂字段由 xref named attribute 创建；字段名来自 attribute key，字段值匹配 source value block id 时指向 raw value object。未匹配时就是普通 literal。投影器不做 linter，不推断作者意图，不制造诊断。

这个模型能同时满足本体表达和消费体验：标题与边都按属性读取；简单属性和复杂属性共用字段规则；复杂值保留 raw 和回源能力；下游按字段名选择模型，按 format 解析 raw；公共图不包含没有消费者动作的 payload 机制字段。
</Assistant>

<User id="4">
好，那我就采纳你的方案啊，采纳你的范围。那接下来你要思考啊，你要写一份非常详细的设计文档。这个设计文档它要达到什么效果？我会告诉你，一位新来的开发者是新的，这个开发者拿着你的文档，再加上现有的代码，他就能完美的丝滑开发下去，完整的兑现我们所需要的东西，我们的需求，我们的期望。 那你要思考这份文档你要怎么写？首先我会告诉你第一点，这份文档里面没有什么建议、大概、可能、至少，没有。你说一个苹果，人家就实现一个苹果。如果说你说是，至少两个苹果，人家就做半个呢？人家做100个呢？懂我意思吗？该讲的东西讲清楚。 然后呢？没有未来这种东西，没有。啊？他不需要知道未来，你告诉他也就是噪声，你只要告诉他目前现状是什么，期望的状态是什么，哎，就可以了，你不要告诉他什么，哎呀，未来怎么怎么样啊？ 他没有资格知道这些东西。你懂我意思吗？我跟你聊天，是不是聊天记录里面，弹窗里面，你可以跟我聊，未来发展方向怎么样啊？什么什么什么了，这些你可以跟我说。但是按照你刚才的计划，你思考这份设计文档，你就确定，就直接确定下来，做什么东西？当前的状态是什么？期望的状态是什么？

关于这一份设计文档，你要怎么写？啊？它是一个self-container的啊，因为我直接把它发给下一个开发者，我直接把当前代码库再加上你设计的这份文档一起给他，他就能开发，懂我意思吧？  你仔细思考一下啊，看一下你要怎么设计怎么安排，每一部分的内容、大纲是吧，以及为什么安排这个大纲的理由，设计依据、来源、理由、看法，以及你做这件事情的注意事项，等等等等，都告诉我。好，把你的这些东西都告诉我。就是你写这份文档，你要怎么做？你要怎么设计？和我对齐一下。啊，好，使用弹窗向我汇报不少于5,000字或者更多。啊，想好了再告诉我。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="5">
# 复杂属性设计文档写作方案

我会把这份设计文档写成一份 self-contained 的执行型设计规约。它的读者不是参与过我们讨论的人，而是一位只拿到当前代码库和这份文档的新开发者。文档不依赖聊天记录，不依赖口头背景，不要求读者猜测意图。读者读完以后，应能明确知道当前项目里哪个对象不成立、目标对象是什么、哪些文件要改、RDF 输出必须长什么样、测试如何验收、书籍和样例如何同步。

这份文档不会写成“方案 A / 方案 B / 取舍建议”。方案已经确定：RDF12 heading projection 以 heading node 和 xref edge evidence 为公共对象；二者都有字段；字段值可以是 literal，也可以是 raw value object；标题复杂字段由带 `for` marker 的 source value block 创建，字段名来自 block property role；边复杂字段由 xref named attribute 创建，字段名来自 attribute key，字段值匹配 source value block id 时指向 raw value object；没有匹配时就是普通 literal；投影器不做 linter，不推断作者意图，不输出 payload 机制字段。

这份文档也不会写“以后”“未来”“兼容旧模型”“废弃旧字段”这类时态叙述。设计文档可以记录“当前代码状态”和“目标状态”，因为开发者需要知道从哪里改到哪里；但对象定义本身只写当前目标契约。变迁解释放在提交说明或 PR 描述里，不进入 6 号书。设计文档里出现当前状态，是为了定位实现差距；6 号书里只出现目标对象事实。

我会把文档放在 `docs/plan/RDF12 payload相关设计/` 下，文件名使用确定的对象名，例如：

```text
docs/plan/RDF12 payload相关设计/RDF12-heading-and-xref-complex-property-design.md
```

虽然目录名里有 payload，这是现有计划目录的组织位置；文档正文会使用新的对象语言：复杂属性、raw value object、source value block、source value id、property role、field predicate。文档不会把 payload 作为公共 RDF 主契约。目录名不是规范术语来源。

## 一、文档目标

第一节写“文档目标”。这一节只做三件事。

第一，明确本文档是执行规约。它规定 RDF12 heading projection 中复杂属性的目标对象、源表面、RDF 输出、源码改造、测试改造、样例和书籍同步、验收命令。读者不需要读取讨论记录。

第二，明确完成标准。完成不是代码能跑一次，而是目标 RDF 事实、测试、书籍、README、样例和下游消费脚本同时一致。读者必须能用文档里的验收命令检查完成。

第三，明确本文档不是 6 号书。6 号书是最终规范书；本文档是把当前代码和公共资料同步到该规范对象的开发设计规约。本文档可以出现当前代码差距；6 号书不写过程语言。

这一节存在的理由是建立读者身份和文档类型。新开发者读执行规约时，先要知道文档的权力范围：它不是讨论稿，不是建议列表，不是未来规划，也不是 6 号书正文。它是开发输入。

## 二、对象语言

第二节写“对象语言”。这一节定义全文使用的术语，并且只定义会参与实现和测试的术语。

我会定义以下对象：

```text
field predicate
complex property
raw value object
source value block
source value id
property role
heading complex property
xref edge complex property
literal field
control field
binding evidence
```

每个定义都写成正面对象定义。例如：

> complex property 是值为 raw value object 的字段。字段名通过 `fieldPredicate()` 映射到 `aat:` namespace。字段 subject 可以是 heading node，也可以是 xref edge evidence。

> raw value object 是保存 source value block 的 raw、format 和 source coordinate 的 RDF resource。raw value object 不展开 raw 内部字段，不保存字段名，不保存 payload kind。

> source value block 是源文档中承载 raw value 的 listing/source block。source value block 只有在 heading complex property 或 xref edge complex property 规则匹配时进入 RDF 图。

> property role 是 heading complex property source block 上唯一承担字段名职责的 role token。property role 不投影为 `aat:role` literal。

> source value id 是 source value block 的本地 id。xref edge complex property 使用 named attribute value 匹配 source value id。匹配成功时，raw value object 输出 `aat:sourceValueId`。

这一节不会定义 payload、payload role、payload kind。因为这份新规约不把它们作为公共对象。旧目录名和现有代码文件名不进入对象语言。

这一节的理由是控制词义。没有稳定术语，开发者会继续把 payload、role、id、selector 混在一起。这里先定义对象，后面的源码和测试都引用这些术语。

## 三、当前代码状态

第三节写“当前代码状态”。这一节给开发者定位实现差距，不写情绪化评价，不写历史原因。

我会按文件列出当前事实。

### `src/rdf12-projection/field-predicate.ts`

当前已有 `fieldPredicate(fieldName)`。它把安全字段名映射为 `aat:<fieldName>`，否则映射为 `aat:field-<encoded>`。目标设计复用该函数；复杂属性字段名不引入新命名规则。

### `src/rdf12-projection/attributes.ts`

当前 direct attributes projector 把 heading metadata named attributes 和 xref ordinary named attributes 输出为 literal field。当前 `rel` 与 `payload` 是 xref control attributes。目标设计保留 `rel` 的控制职责，移除 `payload` 的特殊控制职责。xref named attribute 进入统一规则：值匹配 source value id 时输出 complex property；未匹配时输出 literal field。

### `src/rdf12-projection/xref-projector.ts`

当前 xref projector 读取 `payload` attribute，输出 `aat:payloadSelector`。目标设计不输出 `aat:payloadSelector`。xref projector 继续负责 xref edge evidence resource、source/target heading、target selector、official resolved facts、relation predicate 和 reifier。

### `src/rdf12-projection/payload-projector.ts`

当前 payload projector 处理 node payload 和 edge payload，输出 `aat:payload`、`aat:payloadKind`、`aat:role`、`aat:payloadId`、`aat:forSelector`。目标设计把该文件重构为 complex property / raw value projection。node 侧输出 `heading fieldPredicate(propertyRole) rawValueObject`。edge 侧输出 `xrefEdge fieldPredicate(attributeName) rawValueObject`。raw value object 不输出 role、payloadKind、payloadId；selector evidence 使用 `aat:forSelector` 和 `aat:sourceValueId`。

### `samples/cold-chain-payload/consume_payloads.py`

当前脚本通过 `aat:payload` 枚举 node payload，再读取 `aat:role` 选择 Pydantic model。目标脚本按字段名查询：`aat:release-policy-config`、`aat:review-playbook`、`aat:dependency-evidence`。

### 6 号书和 README

当前 6 号书已经把 payload 定义为复杂属性，但仍围绕 payload object、payload role、payload kind、`aat:payload` 表述。目标书籍要改成复杂属性模型：字段名直接投影，raw value object 只承载 raw、format 和坐标。

这一节存在的理由是让开发者知道从哪些文件动手。它不解释旧模型为什么出现，不讲变迁史，只给出当前差距。

## 四、目标对象模型

第四节写“目标对象模型”。这是文档的核心。

我会把目标对象写成总规则：

> RDF12 heading projection 暴露 heading node 与 xref edge evidence。二者都有字段。字段名来自源表面的 name，并通过 `fieldPredicate()` 映射为 `aat:` predicate。字段值为 scalar 时输出 literal；字段值由 source value block 承载时输出 raw value object。

然后拆成两个同构子模型。

### Heading Complex Property

定义：heading complex property 是 heading node 上值为 raw value object 的字段。

构成条件：

1. 源文档中存在 listing/source block。
2. 该 block 的 attrlist 存在 `for` 或 `forSelector` marker。
3. 该 block 有且只有一个 property role。
4. 该 block 有 source span 和 raw content。
5. marker 带值时，该值按 heading label space 绑定 heading；marker 无值时，按 source ownership 绑定 heading。

输出：

```ttl
:heading aat:<property-role> :rawValueObject .
:rawValueObject aat:format "..." ;
    aat:raw """...""" ;
    aat:relativePath "..." ;
    aat:startLine ... ;
    aat:endLine ... ;
    aat:contentStartLine ... ;
    aat:contentEndLine ... .
```

带值 marker 输出：

```ttl
:rawValueObject aat:forSelector "..." .
```

不输出：

```text
aat:payload
aat:payloadKind
aat:role
aat:payloadId
```

这一小节的理由是让开发者知道 node 侧不再是“payload object with role”，而是 heading field with raw value object。

### Xref Edge Complex Property

定义：xref edge complex property 是 xref edge evidence 上值为 raw value object 的字段。

构成条件：

1. xref occurrence 有 named attribute。
2. attribute key 不是结构控制字段 `rel`。
3. attribute value 精确匹配一个 source value block id。
4. 匹配的 source value block 有 source span、raw content 和 source block language。

输出：

```ttl
:xrefEdge aat:<attribute-key> :rawValueObject .
:rawValueObject aat:sourceValueId "..." ;
    aat:format "..." ;
    aat:raw """...""" ;
    aat:relativePath "..." ;
    aat:startLine ... ;
    aat:endLine ... ;
    aat:contentStartLine ... ;
    aat:contentEndLine ... .
```

未匹配 source value block id 的 xref named attribute 按 literal field 输出：

```ttl
:xrefEdge aat:<attribute-key> "<attribute-value>" .
```

不输出：

```text
aat:payload
aat:payloadSelector
aat:payloadKind
aat:role
aat:payloadId
```

这一小节的理由是让开发者理解边侧不特殊。边上的复杂属性也是 named attribute，只是值绑定了 raw value object。

## 五、源表面规范

第五节写“源表面规范”。这一节给开发者和文档作者具体例子。

我会使用冷链样例作为业务化主例，不用随机水果词。

### Heading Complex Property Source

```asciidoc
[.release-policy-config, for=cold-chain-release]
[source,json]
----
{
  "temperatureWindowCelsius": {
    "min": 2,
    "max": 8
  }
}
----
```

解释：

- `release-policy-config` 是 heading complex property name。
- `for=cold-chain-release` 是 heading binding marker 和 selector。
- `json` 是 raw format。
- block body 是 raw value。

### Source Ownership Heading Complex Property

```asciidoc
[.review-playbook, for]
[source,yaml]
----
review_team: quality-ops
steps:
  - check last temperature checkpoint
----
```

解释：

- `review-playbook` 是 heading complex property name。
- `for` 是 source ownership marker。
- 无值 marker 不输出 empty selector。

### Xref Edge Complex Property Source

```asciidoc
冷链出库放行策略依赖 xref:temperature-audit[温控审计规则, rel=depends-on, weight=0.9, dependency-evidence=rel-release-temperature-audit]。

[#rel-release-temperature-audit]
[source,yaml]
----
source: quality-sop-2026
risk_level: high
----
```

解释：

- `dependency-evidence` 是 xref edge complex property name。
- `rel-release-temperature-audit` 是 source value id。
- `weight=0.9` 未绑定 source value block，输出 literal。
- `rel=depends-on` 是 relation control field。

这一节存在的理由是把“长什么样”说清楚。开发者改测试和样例时直接照这个表面写。

## 六、RDF 输出契约

第六节写“RDF 输出契约”。这一节给出 canonical Turtle 片段，作为测试和书籍的共同依据。

我会写冷链标题输出：

```ttl
:heading-l5-o0 a aat:Heading ;
    aat:addressLabel "cold-chain-release" ;
    aat:role "policy" ;
    aat:status "active" ;
    aat:owner "quality-ops" ;
    aat:release-policy-config :value-l10-o0 ;
    aat:review-playbook :value-l34-o0 .
```

node raw value objects：

```ttl
:value-l10-o0 aat:forSelector "cold-chain-release" ;
    aat:format "json" ;
    aat:raw """...""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 10 ;
    aat:endLine 32 ;
    aat:contentStartLine 13 ;
    aat:contentEndLine 31 .

:value-l34-o0 aat:format "yaml" ;
    aat:raw """...""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 34 ;
    aat:endLine 42 ;
    aat:contentStartLine 37 ;
    aat:contentEndLine 41 .
```

xref edge：

```ttl
:xref-edge-l8-c12-o0 a aat:XrefEdge ;
    aat:sourceHeading :heading-l5-o0 ;
    aat:targetHeading :heading-l55-o0 ;
    aat:targetSelector "temperature-audit" ;
    aat:rel "depends-on" ;
    aat:weight "0.9" ;
    aat:dependency-evidence :value-l44-o0 .
```

edge raw value object：

```ttl
:value-l44-o0 aat:sourceValueId "rel-release-temperature-audit" ;
    aat:format "yaml" ;
    aat:raw """...""" ;
    aat:relativePath "samples/cold-chain-payload/cold-chain-release.adoc" ;
    aat:startLine 44 ;
    aat:endLine 53 ;
    aat:contentStartLine 47 ;
    aat:contentEndLine 52 .
```

然后列出禁止输出事实：

```text
heading 不输出 aat:payload 指向 node raw value object
xref edge 不输出 aat:payload 指向 edge raw value object
xref edge 不输出 aat:payloadSelector
raw value object 不输出 aat:payloadKind
raw value object 不输出 aat:role
raw value object 不输出 aat:payloadId
raw value object 不作为 aat:Heading
raw value object 不参与 aat:containsDirectly
raw value object 不输出 aat:documentOrder
raw 内部字段不展开为业务 RDF 谓词
```

这一节存在的理由是让测试作者不用从文字规则推测 RDF 形状。它直接给目标图。

## 七、匹配规则

第七节写“匹配规则”。这一节处理投影器能做什么、不能做什么。

### Source Value Block Index

定义 source value block index：从 document tree 中收集 listing/source blocks，记录 id、language、raw、span、contentSpan、relativePath。该 index 不判断 block 是否是复杂属性。它只提供可匹配的 raw source。

### Heading Binding

带 `for=<selector>`：selector 查询 heading projection label space。唯一绑定时输出 heading complex property。未绑定或多义绑定时不输出 heading complex property。raw value object 是否保留为孤立对象要由实现契约确定。我会规定不输出孤立 raw value object，因为没有 owning heading field 时它没有公共消费入口。source block 仍存在于 heading raw 中。

无值 `for`：按 source line 找 owning heading。找到 heading 时输出 heading complex property。找不到 heading 时不输出。

### Xref Attribute Matching

对每个 xref named attribute：

- key 是 `rel`：按 relation control field 处理。
- value 唯一匹配 source value block id：输出 xref edge complex property。
- value 不匹配：输出 literal field。
- value 匹配多个 source value blocks：输出 literal field。

这里明确：不输出诊断，不推断作者意图，不把 unmatched 当错误。

这一节存在的理由是防止开发者实现 linter 行为或模糊诊断逻辑。投影器只做模式匹配。

## 八、源码改造设计

第八节写“源码改造设计”。这一节按文件给出精确任务。

### `payload-projector.ts` 改造为 complex property projector

可以保留文件名，也可以在内部重命名类型。文档中规定行为，不规定必须改文件名。核心任务：

- 建立 source value block index。
- 识别 heading complex property blocks。
- 创建 raw value object。
- 写 heading `fieldPredicate(propertyRole)` -> raw value object。
- 处理 xref edge complex attributes。
- 写 xref edge `fieldPredicate(attributeName)` -> raw value object。
- 写 raw value object 的 format/raw/span/forSelector/sourceValueId。
- 删除 node/edge payload generic output。

### `attributes.ts`

调整 xref attributes projection。它不能先把所有 ordinary attributes 输出 literal，再让 complex projector 追加 object，否则同一个字段会同时有 literal 和 object。文档会规定两种实现方式中只选一种：把 xref attribute projection 交给 complex property projector统一处理。heading metadata direct attributes 仍由 `attributes.ts` 处理。

### `xref-projector.ts`

删除 `payload` special handling。不输出 `payloadSelector`。保留 `rel`、source/target heading、target selector、official facts、relation triple 和 reifier。

### `field-predicate.ts`

不改规则。复杂属性字段名复用 `fieldPredicate()`。

### `consume_payloads.py`

改为按 `aat:release-policy-config`、`aat:review-playbook`、`aat:dependency-evidence` 查询。

这一节存在的理由是让开发者直接定位文件和职责，避免把所有逻辑塞进错误位置。

## 九、测试改造设计

第九节写测试。测试不是补充，测试是目标对象的可执行投影。

我会列出必须改的测试文件和断言。

### `payload-projector.test.ts`

改为 complex property projector 单元测试：

- heading complex property with `for=delivery` 输出 `heading aat:release-policy-config value`。
- source-owner heading complex property with `[.review-playbook, for]` 输出 `heading aat:review-playbook value`。
- value object 有 format/raw/span/forSelector。
- value object 没有 role/payloadKind/payloadId。
- role-only listing 不输出 heading complex property。
- source-only listing 不输出 heading complex property。
- xref named attribute value 匹配 source value id 时输出 `xrefEdge aat:dependency-evidence value`。
- xref named attribute value 未匹配时输出 literal。
- xref named attribute value 多义匹配时输出 literal。
- 一个 xref edge 输出多个 complex properties。

### `payload.acceptance.test.ts`

改成 sample acceptance：

- `delivery` heading 有 `aat:policy-risk-profile` 或冷链对应字段。
- xref edge 有 `aat:relation-evidence` 或冷链对应字段。
- value objects 不输出 payload 机制字段。

### `query-contracts.test.ts`

改公共查询：

- heading complex property query 从 `?heading aat:<field> ?value` 开始。
- edge complex property query 从 `?edge aat:<field> ?value` 开始。
- 不出现 `aat:payload` 和 `aat:payloadSelector` 查询。

### `attributes.test.ts`

覆盖 xref attribute literal fallback 和 complex upgrade。

### `cold-chain` 脚本验收

运行 `uv run samples/cold-chain-payload/consume_payloads.py`，输出仍能打印三个模型，但 node 部分不再使用 role 枚举。

这一节存在的理由是把需求转成可执行检查。新开发者写完代码后按测试判断，不靠主观感觉。

## 十、样例与文档同步

第十节写样例和文档同步。

### `samples/cold-chain-payload/cold-chain-release.adoc`

改 xref：

```asciidoc
dependency-evidence=rel-release-temperature-audit
```

改 edge source block：

```asciidoc
[#rel-release-temperature-audit]
[source,yaml]
----
...
----
```

保留 heading complex blocks：

```asciidoc
[.release-policy-config, for=cold-chain-release]
[source,json]
----
...
----

[.review-playbook, for]
[source,yaml]
----
...
----
```

### `samples/structural-payload.adoc`

替换 `banana/pear` 为业务字段名，例如 `policy-risk-profile` 和 `relation-evidence`。

### `samples/cold-chain-payload/README.md`

更新结构覆盖表、Turtle、Python 输出和消费边界。表述改为 complex property，不再写 node payload / edge payload 查询入口。

### 项目 README

RDF12 Projection 章节的 preview 改为复杂属性模型。

### 6 号书

前言、术语表、第 1、2、5、6、7、8 章按对象模型同步。6 号书不写迁移和废弃。

这一节存在的理由是防止代码、测试、书、README、样例彼此打架。

## 十一、验收命令

第十一节列命令。命令必须具体。

```bash
pnpm vitest run test/rdf12-projection/payload-projector.test.ts
```

```bash
pnpm vitest run test/rdf12-projection/attributes.test.ts test/rdf12-projection/xref-projector.test.ts
```

```bash
pnpm vitest run test/rdf12-projection/payload.acceptance.test.ts test/rdf12-projection/query-contracts.test.ts test/rdf12-projection/heading-projection.acceptance.test.ts
```

```bash
pnpm vitest run test/rdf12-projection
```

```bash
pnpm --silent dev samples/cold-chain-payload/cold-chain-release.adoc --format rdf12
```

```bash
uv run samples/cold-chain-payload/consume_payloads.py
```

```bash
pnpm typecheck
pnpm lint
pnpm build
```

这一节存在的理由是给完成声明建立证据标准。

## 十二、完成定义

第十二节写 checklist。每项都是可检查事实。

示例：

```text
- [ ] heading complex property 使用 field predicate 输出 raw value object。
- [ ] xref edge complex property 使用 field predicate 输出 raw value object。
- [ ] unmatched xref named attribute value 输出 literal field。
- [ ] raw value object 输出 format/raw/source coordinate。
- [ ] raw value object 不输出 role/payloadKind/payloadId。
- [ ] xref edge 不输出 payloadSelector。
- [ ] heading 不通过 aat:payload 连接 node raw value object。
- [ ] xref edge 不通过 aat:payload 连接 edge raw value object。
- [ ] cold-chain consumer script 按 field predicate 查询 raw value objects。
- [ ] 6 号书使用 complex property / raw value object 对象语言。
- [ ] README 和 samples 与 6 号书一致。
```

这一节存在的理由是防止“实现了一部分”被误报完成。

## 十三、写作纪律

第十三节写文档写作纪律。这里会直接规定：

- 6 号书写对象事实，不写变迁过程。
- 设计文档写当前状态和目标状态，不写聊天过程。
- 提交说明写变迁事实。
- 不使用“建议、大概、可能、至少、未来、后续、兼容旧模型”作为对象规则。
- 每个公共输出字段必须有消费者动作。
- 不写 payload 术语作为公共主契约。
- 不写 linter 行为。
- 不写没有数据来源的诊断。

这一节存在的理由是保证新开发者修改文档时不把旧混乱重新带回正文。

## 十四、提交说明材料

最后一节给 commit message 内容。提交说明可以写变迁，因为 Git history 承担变更叙述。

提交标题：

```text
feat: project rdf12 complex properties as named raw values
```

提交正文要点：

```text
- project heading complex properties from for-marked source value blocks
- project xref edge complex properties from named attributes bound to source value ids
- represent complex property values as raw value objects with format and source coordinates
- remove generic payload predicates from the public RDF query path
- update samples, 6号书, README, and cold-chain consumer queries
```

这一节存在的理由是把时态信息放到该放的位置。

## 文档结构总览

最终文档大纲如下：

```text
# RDF12 Heading And Xref Complex Property Design

## 1. 文档目标
## 2. 对象语言
## 3. 当前代码状态
## 4. 目标对象模型
## 5. 源表面规范
## 6. RDF 输出契约
## 7. 匹配规则
## 8. 源码改造设计
## 9. 测试改造设计
## 10. 样例与文档同步
## 11. 验收命令
## 12. 完成定义
## 13. 写作纪律
## 14. 提交说明材料
```

这个结构按开发者实际行动排序：先知道文档身份，再学对象语言，再看当前代码差距，再理解目标模型，再看源表面和 RDF 输出，再按匹配规则改源码，再改测试和文档，最后验收和提交。它不是散文结构，也不是讨论结构。它是执行路径。

这份设计文档写完以后，新开发者拿着它和代码库，应能完成以下动作：定位旧 `payload` 特殊逻辑，建立 source value block index，把 heading 和 xref 的复杂属性都投影为 field predicate，更新 RDF 查询、样例、书籍、README 和 Python 消费脚本，运行验收命令，并提交只包含本任务路径的改动。
</Assistant>

<User id="5">
好的，我采纳你的 “复杂属性设计文档写作方案”
那么请开始高质量的撰写这份文档。把它放在 \\wsl.localhost\Ubuntu\home\t103o\workbench\micheng-ts\projects\asciidoc-abundant-tree\docs\plan 下面。
文章整体应详细、偏长。 写完之后呢，自己可以去按照这份约定以及呢一些写作规范去检查，看一下，比如说是否有有损压缩，是否有没有表达清楚的地方，自己检查，自己修复。你全部都做好之后，再发个弹窗来通知我来看。


Tip:
完成后记得使用弹窗与我沟通。
</User>
````
