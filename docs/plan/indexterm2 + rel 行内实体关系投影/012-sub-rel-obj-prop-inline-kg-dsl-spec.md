# AsciiDoc 行内知识图谱标注规范

## 1. 对象定义

AsciiDoc 行内知识图谱标注是一套写在正文行内的结构标记。它使用 AsciiDoc inline macro 的表面形式，把自然语言句子中的实体、关系、属性和事件引用显式写入源文档，使同一份文本能够生成阅读投影和知识图谱投影。

该标注表面服务四类消费者。

作者消费源文本。作者在维护文档时需要看到可读的自然语言句子，并能从行内标记看出主体、关系、客体、属性和事件引用。

读者消费渲染文本。渲染器可隐藏宏外壳，显示宏的目标文本或显示别名，使阅读结果保持自然语言形态。

解析器消费结构 token。解析器读取宏名称、宏目标、方括号参数、命名字段和当前行 token 序列，生成 RDF triple、RDF 1.2 quoted triple、关系证据和诊断。

审计工具消费回源证据。审计工具需要知道每条关系来自哪一行、哪个宏、哪个行内片段、哪些字段和哪些端点。

该标注表面的基本目标是结构信息内嵌。自然语言提供内容信息；行内宏补充机器无法稳定推断的结构信息。正文词汇尽量被复用为图谱标识。控制字段保持短小、稳定、面向机器。

## 2. 宿主语法

标注表面借用 AsciiDoc inline macro 形态：

```asciidoc
macro:target[arguments]
```

`macro` 是宏名称。`target` 是宏目标。`[` 与 `]` 包围宏参数。`]` 是该宏 token 的结束边界。

本规范要求核心宏始终书写方括号。无显示别名时使用空方括号：

```asciidoc
sub:Jobs[]
rel:found[]
obj:Apple_Inc[]
prop:time[1985]
```

方括号承担两个职责。第一，方括号承载显示别名和命名字段。第二，方括号给解析器提供 token 终结边界。中文文本没有稳定空格分词，解析器不得把空格当作 token 分隔条件。

以下中文表面可被稳定识别：

```asciidoc
sub:乔布斯[]rel:创立[]了obj:苹果公司[苹果]。
```

解析器识别三个 token：

```text
S(乔布斯)
R(创立)
O(苹果公司, display=苹果)
```

以下表面也可被稳定识别：

```asciidoc
但这番sub:创立[]却rel:耗尽[]了obj:乔布斯[]的精力。
```

[//]: # (这里似乎存在错误，宾语应该是精力，而不是乔布斯，例如 << :乔布斯 :创立了 :苹果公司 >> :消耗了 :精力 . 然后就可以通过 SELECT * WHERE { <<?s ?p ?o>> :消耗了 :精力 . } 的语句轻松查询出到底是哪一个动作耗尽了精力。)

`sub:创立[]` 从 `sub:` 开始，到 `]` 结束。它前后的中文字符属于普通文本。

## 3. 核心宏

核心宏包括 `sub`、`rel`、`obj`、`prop`。

### 3.1 `sub`

`sub:target[display?, attrs...]` 声明一个主体端点。

`target` 是主体资源标识。`display` 是渲染显示文本。`display` 缺省时，渲染器显示 `target`。

示例：

```asciidoc
sub:Jobs[]
sub:乔布斯[]
sub:乔布斯[他]
```

`sub:乔布斯[他]` 的结构标识是 `乔布斯`，渲染显示是 `他`。这种写法用于原文需要代词、简称或别称，同时图谱需要规范实体。

### 3.2 `obj`

`obj:target[display?, attrs...]` 声明一个客体端点。

示例：

```asciidoc
obj:Apple_Inc[Apple]
obj:苹果公司[苹果]
obj:乔布斯[him]
```

`obj` 与 `sub` 的 target/display 规则相同。差异在图谱角色：`obj` 进入 object 端点候选。

### 3.3 `rel`

`rel:target[display?, attrs...]` 声明关系谓词，并触发三元组消费。

`target` 是关系谓词标识。它可映射到项目关系命名空间、CURIE 或 IRI。`display` 是渲染显示文本。`attrs` 中包含控制字段和边字段。

示例：

```asciidoc
rel:found[]
rel:found[created]
rel:occupy[link=pair]
rel:exhaust[sub=$prev]
```

`rel` 是唯一的边生成触发器。单独出现的 `sub`、`obj`、`prop` 不生成关系边。它们等待 `rel` 消费，或作为源文本结构证据保留。

### 3.4 `prop`

`prop:target[display?, attrs...]` 声明当前行内悬浮属性。

`target` 是属性键，推荐英文单词或连字符英文短语。`display` 是文本显示值，也可作为属性值。`attrs` 可提供规范值、数据类型或来源字段。

示例：

```asciidoc
prop:time[1985]
prop:location[Cupertino]
prop:certainty[possible]
prop:source[annual-report]
```

`prop` 进入当前行环境缓存。解析器生成关系边时，把当前环境缓存复制到该边的证据或边属性中。

## 4. 参数规则

方括号内第一个未命名参数是显示别名。后续命名参数使用 `key=value`。

```asciidoc
rel:found[created, source=biography, certainty=high]
```

解释：

```text
target = found
display = created
source = biography
certainty = high
```

字段名推荐英文：

```text
time
location
certainty
source
reason
condition
topic
link
sub
obj
subjects
objects
```

字段值可为英文、中文、数字、日期、CURIE、IRI 或字符串。需要逗号、右方括号或复杂字符串时，由 AsciiDoc 参数转义规则处理。解析器应保留 raw 参数文本，便于审计。

## 5. 行作用域

消费范围是一行。每一行有独立状态。换行清空该行的结构缓冲、属性缓存、事件历史和局部事件表。

普通文字、标点、连接词和空格不构成结构 token。它们参与渲染文本和 raw surface，默认不参与端点选择。

行作用域的公共契约：

```text
一行内的核心宏按源顺序扫描。
宏 token 由 macro:target[...] 识别。
普通文本保留为 surface。
关系消费不跨行。
```

句号、逗号、分号可用于人类阅读。核心解析规则不依赖这些标点。实现可在编辑器 lint 中把句号作为软提示边界；关系生成仍以 token 状态为准。

## 6. 内部状态

解析器逐行维护以下状态：

```text
subjectBuffer      当前可消费主体候选
objectBuffer       当前可消费客体候选
envProps           当前行悬浮属性表
activeRelation     当前关系帧
tripleHistory      当前行已生成三元组栈
localEventTable    当前行谓词到事件的局部映射
diagnostics        当前行诊断列表
```

`subjectBuffer` 保存 `sub` token 解析结果。`objectBuffer` 保存 `obj` token 解析结果。`envProps` 保存 `prop` token 产生的键值。`activeRelation` 保存正在等待端点的 `rel`。`tripleHistory` 支持 `$prev`。`localEventTable` 支持中文谓词名物化回指。`diagnostics` 保存结构失败和歧义。

token 抽象：

```text
S(id, display, attrs) = sub:id[...]
R(id, display, attrs) = rel:id[...]
O(id, display, attrs) = obj:id[...]
P(id, display, attrs) = prop:id[...]
```

## 7. 扫描规则

### 7.1 处理 `prop`

遇到 `P(key, display, attrs)`：

```text
value = display if display exists
value = attrs.value if display missing and value exists
value = key if display and value both missing
envProps[key] = { value, attrs, raw }
```

同一行内同名 key 后写覆盖前写。覆盖点之后生成的关系使用新值。

### 7.2 处理 `sub`

遇到 `S(id, display, attrs)`：

```text
resolved = resolveResourceOrEvent(id)
subjectBuffer.append(resolved)
```

`resolveResourceOrEvent(id)` 先查当前行 `localEventTable`。如果 `id` 唯一命中前序关系事件，则返回该 quoted triple。若命中多个事件，记录 `inline-kg.ambiguous-event-reference`。若未命中，返回实体资源标识。

该局部事件解析只改变该 token 的可消费对象。它不会单独生成关系。

### 7.3 处理 `obj`

遇到 `O(id, display, attrs)`：

```text
resolved = resolveResourceOrEvent(id)
objectBuffer.append(resolved)
if activeRelation waiting for object and completion condition met:
    emit activeRelation
```

object 可出现在 relation 前，用于主题前置、被动句或倒装表面。object 也可出现在 relation 后，作为通常的 object。

### 7.4 处理 `rel`

遇到 `R(pred, display, attrs)`：

```text
if activeRelation exists and incomplete:
    record interrupted-relation

relationFrame = parseRelation(pred, display, attrs)
subjects = resolveSubjects(relationFrame)
objects = resolveObjectsIfExplicit(relationFrame)

if relationFrame already has objects:
    emit relationFrame
else:
    activeRelation = relationFrame
    wait for object tokens
```

`resolveSubjects` 优先读取 `rel` 字段中的 `sub=...`。没有显式 `sub` 时，使用 `subjectBuffer`。若 `subjectBuffer` 为空，记录 `inline-kg.missing-subject`。

`resolveObjectsIfExplicit` 优先读取 `rel` 字段中的 `obj=...`。没有显式 `obj` 时，使用已存在的 `objectBuffer` 或等待后续 `obj` token。若 relation 到行尾仍无 object，按关系类型决定诊断或生成无 object 事件。默认关系需要 object。

## 8. Emit 规则

一次 relation emit 输入：

```text
subjects
predicate
objects
linkMode
envProps
rawSurface
```

默认分配模式为 `cross`：

```text
for s in subjects:
  for o in objects:
    emit (s, predicate, o)
```

每个 triple 生成后：

```text
attach envProps to edge evidence
push triple to tripleHistory
localEventTable[predicate].append(triple)
clear objectBuffer entries consumed by this relation
retain subjectBuffer when continuation is safe
```

“continuation is safe” 表示当前关系之后没有新的显式 subject frame，且 subjectBuffer 中的承接对象唯一或由控制字段明确。多 subject、被动句、前置 object 和事件引用混合时，应倾向诊断或要求显式标记。

## 9. 控制字段

### 9.1 `link`

`link` 控制多端点分配。

`link=cross` 是缺省模式。它生成 subjects 与 objects 的笛卡尔积。

`link=pair` 表示一一配对。subjects 与 objects 数量必须相同。

`link=mutual` 表示主体集合内部互相连线。它通常不需要 object。

示例：

```asciidoc
sub:A[]和sub:B[]分别rel:manage[link=pair]obj:X[]和obj:Y[]。
```

生成：

```text
(A, manage, X)
(B, manage, Y)
```

示例：

```asciidoc
sub:A[]与sub:B[]rel:ally[link=mutual]。
```

生成：

```text
(A, ally, B)
(B, ally, A)
```

### 9.2 `sub`

`sub` 覆盖当前 relation 的 subject。

可用值：

```text
$prev
$null
resource-id
```

`sub=$prev` 指向当前行上一条已生成 triple。输出 RDF 1.2 quoted triple。

```asciidoc
sub:Jobs[]rel:found[]obj:Apple_Inc[Apple], and this rel:exhaust[sub=$prev]obj:Jobs[him].
```

生成：

```text
(Jobs, found, Apple_Inc)
(<<Jobs found Apple_Inc>>, exhaust, Jobs)
```

`sub=$null` 显式切断 subject 继承。是否生成事件记录由关系类型和实现策略决定。

`sub=resource-id` 显式指定资源。该字段适合从句、被动句、倒装句和特殊英文结构。正文中已经自然出现的实体，推荐直接用 `sub:resource-id[...]` 标在文本位置。

### 9.3 `obj`

`obj` 覆盖当前 relation 的 object。

可用值：

```text
$prev
$next
$null
resource-id
```

`obj=$prev` 把上一条 triple 作为 object。`obj=$next` 挂起当前 relation，等待后续 relation 完成后回填 object。`$next` 需要 look-ahead，实现复杂度高，宜作为高级能力。

示例：

```asciidoc
sub:Board[]rel:decide[obj=$next],sub:Jobs[]rel:leave[]obj:Apple_Inc[Apple].
```

生成：

```text
(Jobs, leave, Apple_Inc)
(Board, decide, <<Jobs leave Apple_Inc>>)
```

## 10. 事件引用

事件引用用于把一个完整 triple 当作另一个 triple 的 subject 或 object。RDF 1.2 quoted triple 是该投影的 RDF 表达。

### 10.1 显式事件引用

显式事件引用使用 `$prev`：

```asciidoc
sub:乔布斯[]rel:创立[]了obj:苹果公司[苹果]，但这rel:耗尽[sub=$prev]了obj:乔布斯[他]的精力。
```

生成：

```turtle
kg:乔布斯 rel:创立 kg:苹果公司 .
<< kg:乔布斯 rel:创立 kg:苹果公司 >> rel:耗尽 kg:乔布斯 .
```

该模式适合英文 `this`、`it`、`that` 和中文“这”“此举”“这件事”等事件代词。

### 10.2 谓词名物化回指

中文中常见“这番创立”“此次裁员”“这场北伐”。该表面可使用 `sub` 或 `obj` 宏标注名物化谓词：

```asciidoc
sub:乔布斯[]rel:创立[]了obj:苹果公司[]，但这番sub:创立[]却rel:耗尽[]了obj:乔布斯[]的精力。
```

解析规则：

```text
当前行已有唯一 triple T，其 predicate target 为 创立。
后续出现 sub:创立[]。
sub:创立[] 被解析为 quotedTriple(T)。
```

生成：

```turtle
kg:乔布斯 rel:创立 kg:苹果公司 .
<< kg:乔布斯 rel:创立 kg:苹果公司 >> rel:耗尽 kg:乔布斯 .
```

唯一性是该机制的准入条件。同一行内若 `rel:创立[]` 生成多条事件，后续 `sub:创立[]` 进入歧义诊断。作者可断行、改写、使用 `$prev`，或引入后续事件命名机制。

## 11. RDF 投影

标准关系投影：

```text
S = subject resource
P = predicate IRI
O = object resource
```

生成：

```turtle
S P O .
```

quoted triple 投影：

```turtle
<< S1 P1 O1 >> P2 O2 .
S2 P3 << S1 P1 O1 >> .
```

关系证据资源保存源文档坐标和 raw surface：

```turtle
<#edge-l12-c8-o0-p0> a aat:InlineRelationEdge ;
  rdf:reifies <<(kg:Jobs rel:found kg:Apple_Inc)>> ;
  aat:sourceResource kg:Jobs ;
  aat:targetResource kg:Apple_Inc ;
  aat:rel "found" ;
  aat:raw "rel:found[]" ;
  aat:relationSurfaceRaw "sub:Jobs[]rel:found[]obj:Apple_Inc[Apple]" ;
  aat:startLine 12 ;
  aat:startColumn 8 .
```

属性可写入 evidence：

```turtle
<#edge-l12-c8-o0-p0> aat:time "1985" ;
  aat:certainty "possible" .
```

实现也可使用 RDF-star annotation 表达边属性。证据资源仍应保留，便于回源、审计和诊断。

## 12. 诊断面

结构失败产生诊断。诊断服务编辑器、审计工具和作者修订。

|代码|条件|
|---|---|
|`inline-kg.invalid-macro`|核心宏缺少闭合 `]` 或参数无法解析。|
|`inline-kg.invalid-predicate`|`rel` target 无法映射为 predicate。|
|`inline-kg.missing-subject`|`rel` 需要 subject，subjectBuffer 为空，且无 `sub=`。|
|`inline-kg.missing-object`|`rel` 需要 object，objectBuffer 为空，且无 `obj=`。|
|`inline-kg.interrupted-relation`|relation 等待 object 时遇到新 relation 或行结束。|
|`inline-kg.pair-cardinality-mismatch`|`link=pair` 下 subject 与 object 数量不同。|
|`inline-kg.ambiguous-event-reference`|谓词名物化回指命中多个前置事件。|
|`inline-kg.unresolved-prev`|使用 `$prev` 时 tripleHistory 为空。|
|`inline-kg.unresolved-next`|使用 `$next` 时后续没有可回填事件。|
|`inline-kg.alias-heavy-surface`|同一片段大量 target/display 分离，源文本可维护性下降。|

诊断不判断事实真假。诊断只说明当前标注表面无法按公共契约稳定投影。

## 13. 等价类测试

### 13.1 基础英文关系

输入：

```asciidoc
sub:Jobs[]rel:found[]obj:Apple_Inc[Apple].
```

期望：

```text
display: Jobs found Apple.
triple: (Jobs, found, Apple_Inc)
```

覆盖：SRO 标准关系，display label。

### 13.2 基础中文关系

输入：

```asciidoc
sub:乔布斯[]rel:创立[]了obj:苹果公司[苹果]。
```

期望：

```text
display: 乔布斯创立了苹果。
triple: (乔布斯, 创立, 苹果公司)
```

覆盖：中文无空格，方括号终结 token。

### 13.3 空方括号边界

输入：

```asciidoc
sub:A[]rel:p[]obj:B[]。
```

期望：

```text
tokens: S(A), R(p), O(B)
triple: (A, p, B)
```

覆盖：空 `[]` 仍然是合法参数边界。

### 13.4 属性挂载

输入：

```asciidoc
prop:time[1985]obj:Jobs[]was sub:Apple_Inc[Apple]rel:expel[].
```

期望：

```text
triple: (Apple_Inc, expel, Jobs)
edge.time: 1985
```

覆盖：prop 缓存与被动句角色标注。

### 13.5 连续谓词承接

输入：

```asciidoc
sub:Microsoft[]rel:develop[]obj:Windows[]and rel:acquire[]obj:LinkedIn[].
```

期望：

```text
(Microsoft, develop, Windows)
(Microsoft, acquire, LinkedIn)
```

覆盖：唯一 subject 的安全承接。

### 13.6 默认多端点 cross

输入：

```asciidoc
sub:Jobs[]and sub:Wozniak[]rel:build[]obj:Apple_I[]and obj:Apple_II[].
```

期望：

```text
(Jobs, build, Apple_I)
(Jobs, build, Apple_II)
(Wozniak, build, Apple_I)
(Wozniak, build, Apple_II)
```

覆盖：默认笛卡尔积。

### 13.7 `link=pair`

输入：

```asciidoc
sub:Cao_Cao[]and sub:Sun_Quan[]respectively rel:occupy[link=pair]obj:North[]and obj:Jiangdong[].
```

期望：

```text
(Cao_Cao, occupy, North)
(Sun_Quan, occupy, Jiangdong)
```

覆盖：分别配对。

### 13.8 `link=pair` 数量错误

输入：

```asciidoc
sub:A[]and sub:B[]and sub:C[]rel:manage[link=pair]obj:X[]and obj:Y[].
```

期望：

```text
diagnostic: inline-kg.pair-cardinality-mismatch
```

覆盖：数量校验。

### 13.9 `link=mutual`

输入：

```asciidoc
sub:Newton[]and sub:Leibniz[]rel:dispute[link=mutual].
```

期望：

```text
(Newton, dispute, Leibniz)
(Leibniz, dispute, Newton)
```

覆盖：主体内部互相关系。

### 13.10 `$prev` 事件主语

输入：

```asciidoc
sub:Jobs[]rel:found[]obj:Apple_Inc[Apple],and this rel:exhaust[sub=$prev]obj:Jobs[him].
```

期望：

```text
(Jobs, found, Apple_Inc)
(<<Jobs found Apple_Inc>>, exhaust, Jobs)
```

覆盖：RDF 1.2 quoted triple 作为 subject。

### 13.11 `$prev` 缺失

输入：

```asciidoc
This rel:exhaust[sub=$prev]obj:Jobs[him].
```

期望：

```text
diagnostic: inline-kg.unresolved-prev
```

覆盖：事件历史栈为空。

### 13.12 中文谓词名物化回指

输入：

```asciidoc
sub:乔布斯[]rel:创立[]了obj:苹果公司[]，但这番sub:创立[]却rel:耗尽[]了obj:乔布斯[]的精力。
```

期望：

```text
(乔布斯, 创立, 苹果公司)
(<<乔布斯 创立 苹果公司>>, 耗尽, 乔布斯)
```

覆盖：`sub:创立[]` 命中局部事件表。

### 13.13 谓词名物化歧义

输入：

```asciidoc
sub:刘备[]rel:起兵[]obj:荆州[]，sub:曹操[]rel:起兵[]obj:中原[]，这场sub:起兵[]rel:影响[]obj:天下格局[]。
```

期望：

```text
(刘备, 起兵, 荆州)
(曹操, 起兵, 中原)
diagnostic: inline-kg.ambiguous-event-reference
```

覆盖：同名谓词多事件时停止推断。

### 13.14 单独 subject 不生成关系

输入：

```asciidoc
sub:乔布斯[]rel:创立[]obj:苹果公司[]，因为他深知sub:创业[]远比守成艰难。
```

期望：

```text
(乔布斯, 创立, 苹果公司)
no triple for sub:创业[]
```

覆盖：`rel` 是边生成触发器。

### 13.15 主题前置

输入：

```asciidoc
这本obj:红楼梦[]，sub:曹雪芹[]rel:write[]了prop:duration[ten years]。
```

期望：

```text
(曹雪芹, write, 红楼梦)
edge.duration: ten years
```

覆盖：object 可前置入 buffer。

### 13.16 被动句后续主语重置

输入：

```asciidoc
obj:项羽[]被sub:韩信[]rel:defeat[]于prop:location[垓下]，最终sub:项羽[]rel:suicide[obj=$null]。
```

期望：

```text
(韩信, defeat, 项羽) with location=垓下
(项羽, suicide, $null)
```

覆盖：被动句后续动作显式重置 subject。

### 13.17 `$next` 事件宾语

输入：

```asciidoc
sub:Board[]rel:decide[obj=$next],sub:Jobs[]rel:leave[]obj:Apple_Inc[Apple].
```

期望：

```text
(Jobs, leave, Apple_Inc)
(Board, decide, <<Jobs leave Apple_Inc>>)
```

覆盖：relation 挂起与前瞻回填。

### 13.18 属性覆盖

输入：

```asciidoc
prop:time[1976]sub:Jobs[]rel:found[]obj:Apple_Inc[Apple],prop:time[1985]rel:leave[]obj:Apple_Inc[Apple].
```

期望：

```text
(Jobs, found, Apple_Inc) with time=1976
(Jobs, leave, Apple_Inc) with time=1985
```

覆盖：同名 prop 覆盖后续关系。

## 14. 推荐表面

稳定表面：

```asciidoc
sub:乔布斯[]rel:创立[]了obj:苹果公司[苹果]。
```

代词别名：

```asciidoc
sub:乔布斯[]rel:创立[]了obj:苹果公司[苹果]，这rel:耗尽[sub=$prev]了obj:乔布斯[他]的精力。
```

中文名物化事件：

```asciidoc
sub:乔布斯[]rel:创立[]了obj:苹果公司[]，但这番sub:创立[]却rel:耗尽[]了obj:乔布斯[]的精力。
```

英文从句显式绑定：

```asciidoc
sub:Apple_Inc[Apple], which was rel:found[sub=Jobs,obj=Apple_Inc] by sub:Jobs[], rel:release[] obj:iPhone[].
```

属性悬浮：

```asciidoc
prop:time[1985]obj:Jobs[]was sub:Apple_Inc[Apple]rel:expel[].
```

分配关系：

```asciidoc
sub:A[]and sub:B[]respectively rel:manage[link=pair]obj:X[]and obj:Y[].
```

互相关系：

```asciidoc
sub:A[]and sub:B[]rel:ally[link=mutual].
```

## 15. 设计点准入

每个设计点进入规范前需满足五个条件。

第一，有明确消费者。`[]` 服务解析器边界和渲染器参数；`prop` 服务边属性投影；`$prev` 服务事件引用；`link=pair` 服务多端点分配。

第二，有明确结构缺口。自然语言词序无法稳定表达的关系转折，才进入控制字段。文本中已经出现的实体，优先用 `sub` 或 `obj` 标在文本位置。

第三，有确定解释规则。每个字段都必须能被状态机解释。无法给出状态转移的字段保留为未来候选。

第四，有可诊断失败面。数量不等、事件引用多义、缺 subject、缺 object、宏未闭合都需要明确诊断。

第五，有可测试等价类。规范中的每个机制都应至少有一个正例和必要的反例。

## 16. 规范摘要

核心表面：

```asciidoc
sub:S[display]rel:P[display, fields]obj:O[display]
```

核心输出：

```text
(S, P, O)
```

属性表面：

```asciidoc
prop:key[value]
```

核心行为：

```text
key=value 挂到当前行后续生成的关系边。
```

事件引用表面：

```asciidoc
rel:P[sub=$prev]
```

核心输出：

```text
(<<previous triple>>, P, O)
```

中文事件回指表面：

```asciidoc
sub:谓词名[]
```

核心条件：

```text
当前行该谓词名唯一对应一个已生成 triple。
```

核心输出：

```text
sub:谓词名[] 解析为 quoted triple。
```

token 识别边界：

```text
macro:target[...] 是完整 token。
空格不参与 token 分割。
中文字符不影响宏识别。
```

单行边界：

```text
换行清空状态。
关系消费不跨行。
```

