<Assistant id="1">
# 阅读汇报：asciidoc-abundant-tree 与 basic-rdf-projection

我已经按你指定的范围完整阅读完毕：

- `/home/t103o/workbench/micheng-ts/projects/asciidoc-abundant-tree/README.md`
- `/home/t103o/workbench/micheng-ts/projects/asciidoc-abundant-tree/samples/basic-rdf-projection/` 目录下全部 7 个文件：
  - `README.md`
  - `basic-projection.adoc`
  - `consume_projection.py`
  - `query_with_oxigraph.mjs`
  - `validate_with_shacl.mjs`
  - `structure-model.ttl`
  - `structure-shapes.ttl`

这批文件整体上是在说明一个 TypeScript/Node 包：`asciidoc-abundant-tree`。它不是一个普通的 AsciiDoc 转 HTML 工具，而是一个“源文档结构投影工具”。它把 AsciiDoc 源文件解析成一个保留源位置信息、标题结构、块结构、target、anchor、xref 发生位置、官方 Asciidoctor 解析结果的 `AbundantDocument` 对象。换句话说，它关注的不是最终渲染出来的页面长什么样，而是文档源文件中哪些结构、哪些引用、哪些标题、哪些字段、哪些行号和哪些语义关系可以被机器稳定读取、查询和分析。

主 README 的核心定位非常清楚：Asciidoctor 仍然是 AsciiDoc 语义解析的权威层，这个包不替代 Asciidoctor；它是在 Asciidoctor 之上提供一个更适合静态分析和下游工具消费的 TypeScript 对象模型。它提供 pretty tree、JSON、RDF 1.2 Turtle、RDF 1.2 JSON-LD 等投影形式，但这些都是同一个 `AbundantDocument` 的不同输出面。主要事实源仍然是 AsciiDoc 源文档，`AbundantDocument` 是内部统一对象，RDF12 则是面向图查询和下游建模的投影。

这个项目的关键价值在于“源感知”。它保留的不只是标题和段落这种粗粒度结构，还包括 source span、source line、line/column、raw source、metadata span、content span、xref raw target、xref label、官方 resolved id/type/reftext/href 等。这样下游工具不仅能说“这里引用了某个目标”，还能说“这个引用在源文件第几行第几列写成什么样，Asciidoctor 官方把它解析成了什么，它属于哪个 section，它最终指向 section、listing、table、block 还是 inline anchor”。这对文档审计、xref 检查、迁移工具、文档资产清单、基于行号的编辑回写、知识图谱化的文档分析都很有用。

主 README 里尤其强调 RDF 1.2 Projection。这个投影把 heading、heading containment、heading order、source coordinate、xref edge evidence、direct field predicate、raw value object 等内容转成 RDF 图。它不是把业务数据展开成业务本体，而是把 AsciiDoc 文档结构变成可查询事实。RDF 图里的资源 IRI 是根据文档坐标系统确定性生成的，不依赖作者字符串或 Turtle 输出顺序。标题排序也不是靠 IRI 字典序、Turtle 文本顺序或行号推断，而是明确使用 `aat:childOrder` 和 `aat:documentOrder`。这说明项目很重视消费契约：下游消费者应该依赖明确谓词，而不是投影文本的偶然排列。

主 README 还明确了当前边界：默认只读单个源文件；只有显式选择 `book-entry` 模式才展开支持的 full-file include 图；不跨文件验证 interdocument xref；不暴露完整 inline CST；不 lint 文风；不解释 raw value text；不生成 HTML/PDF/EPUB/静态站点。这个边界很重要，因为它说明项目的人工制品身份是“源结构与 RDF/JSON 投影层”，不是完整 AsciiDoc 语言服务器，也不是站点生成器，也不是业务知识图谱引擎。

`basic-rdf-projection` 这个样例目录，是一个自足的 RDF12 heading projection 消费示例。它不是模拟真实业务，而是构造一个小型结构夹具，用来集中展示标题、标题层级、标题属性、交叉引用关系、xref 证据、listing ID 归属，如何从 AsciiDoc 文档投影成可查询 RDF 事实，并进一步被 Python、SHACL、SPARQL、Oxigraph 等下游工具消费。

`basic-projection.adoc` 是源样例。文档标题是“基础 RDF 投影示例”。它有三个一级标题和一个二级标题：`结构示例`、`约束规则`、`生成标签节点`、`关系证据说明`。其中 `结构示例` 使用 `[#structure-example.process, status=draft, owner=docs-team]` 声明了手写 address label、role 和 direct fields。`约束规则` 使用 `[#required-rule.rule, status=active]` 声明 role 和状态，并在标题正文起始处用 description list 写了 `priority:: normal` 和多行 `summary::`。它还在正文里用了 `hmeta:review-state[ready, label=可复核]`，展示短字段可以嵌入正文，但 RDF 结构值取 `ready`，不是展示 label“可复核”。此外，`约束规则` 下面有一个 listing block，ID 是 `rule-query-example`，这个 local non-heading target 并不会单独变成 listing 结构资源，而是作为 owning heading 的 `aat:addressLabel` 参与 heading label space。`生成标签节点` 没有手写 ID，用来展示 generated address label。`关系证据说明` 则通过 xref 指向 listing target 和 section target，展示显式关系 `rel=documents` 与默认关系 `aat:references`。

样例中最重要的关系有三条。第一，`结构示例` 通过 `xref:required-rule[约束规则, rel=requires, weight=0.7]` 指向 `约束规则`，投影为 `rel:requires`，同时 xref edge 证据保留 raw 文本、行列、target selector、official resolved type、weight 等。第二，`关系证据说明` 通过 `xref:rule-query-example[规则查询示例, rel=documents]` 指向一个 listing ID，但 projection 把它归到 owning heading `约束规则`，因此关系边是 `关系证据说明 --documents--> 约束规则`，官方 resolved type 仍然能显示它原本解析到 listing。第三，`关系证据说明` 通过 `xref:required-rule[]` 指向 section，没有显式 `rel`，所以默认成为 `aat:references`。

`structure-model.ttl` 是下游模型图。它定义了 `ex:ModeledHeading`，以及三个 role class：`ex:ProcessHeading`、`ex:RuleHeading`、`ex:EvidenceHeading`。这三个类通过 `ex:roleName` 分别绑定到 AsciiDoc 投影中的 role 字符串 `process`、`rule`、`evidence`。它还定义了两个上层关系属性：`ex:dependency` 和 `ex:evidenceLink`，并声明 `rel:requires rdfs:subPropertyOf ex:dependency`，`rel:documents rdfs:subPropertyOf ex:evidenceLink`。这表示源文档里的具体关系可以被下游模型解释成更抽象的领域关系。

`structure-shapes.ttl` 是 SHACL shape 图。它先要求所有 `aat:Heading` 必须暴露 `aat:headline`、`aat:headingLine`、`aat:relativePath`。然后按 role class 做约束：process heading 必须有 owner，status 必须是 draft 或 active，并且至少 require 一个 rule heading；rule heading 必须有 priority，priority 只能是 normal 或 high，status 必须 active，并且必须被至少一个 process heading require；evidence heading 必须 status active，并且必须 documents 至少一个 rule heading。这说明样例不是只展示“能转成图”，还展示 RDF 图能进入标准约束验证流程，而且 violation 可以定位回源文档。

`consume_projection.py` 是最小 Python 消费脚本。它使用 PEP 723 inline dependency 声明 `pyoxigraph`，通过 `uv run` 执行。脚本会从当前文件位置向上找 repo root，调用 `pnpm --silent dev samples/basic-rdf-projection/basic-projection.adoc --format rdf12` 生成 Turtle，再用 `pyoxigraph.Store` 加载。它输出四类报告：按 `aat:documentOrder` 排序的 headings；根据 `aat:containsDirectly` 和 `aat:childOrder` 得出的 containment；根据 `aat:XrefEdge` 得出的 xref edges；以及 local target alias `rule-query-example -> 约束规则`。这个脚本的意义是展示：即使不引入复杂 RDF/JS 工具链，Python 也能直接消费 projection 图，并把结构事实整理成人能看的报告。

`validate_with_shacl.mjs` 是 RDF/JS + SHACL 校验脚本。它使用 `@zazuko/env-node`、`n3`、`rdf-validate-shacl`。它同样先运行项目 CLI 生成 projection Turtle，再读取 `structure-model.ttl` 和 `structure-shapes.ttl`。关键逻辑是 `applyRoleClasses`：它根据 model 图里的 `ex:roleName` 映射，把 projection 图中带 `aat:role` 的 heading 添加对应的 RDF type，例如 role 为 `process` 的 heading 添加 `ex:ProcessHeading`。然后用 SHACL validator 对合并后的 data graph 执行校验。若有 violation，脚本会从 projection graph 中读取 `relativePath`、`headingLine` 和 `headline`，把错误定位回源文档。这证明 projection 的 source coordinate 不只是装饰字段，而是可以服务真实诊断动作。

`query_with_oxigraph.mjs` 是 Oxigraph SPARQL 查询和 CONSTRUCT materialization 脚本。它把 projection graph 和 model graph 加载到 Oxigraph Store 中，先用 SPARQL CONSTRUCT 根据 `rdfs:subPropertyOf` materialize 上层关系：如果存在 `rel:requires`，并且它是 `ex:dependency` 的 subProperty，就构造 `source ex:dependency target`；如果存在 `rel:documents`，就构造 `source ex:evidenceLink target`。随后它查询模型关系，输出“结构示例 --dependency--> 约束规则”和“关系证据说明 --evidence-link--> 约束规则”。它还查询 `rdf:reifies` 的 xref evidence，输出每条关系对应的 source line、raw xref 文本、source headline、target headline、official resolved type。这个脚本展示的是：RDF12 reifier 和 xref edge evidence 可以让下游不仅看到最终关系，还能追溯这个关系来自源文件哪一个 xref 写法。

目录 README 把这些文件和输出串成一个完整消费说明。它记录了复现命令：生成 RDF12 Turtle、运行 Python 消费脚本、运行 SHACL 校验、运行 Oxigraph 查询。它还记录了预期输出：projection 大约 154 triples；标题按 document order 为 5 个；containment 中根标题包含三个一级标题，`约束规则` 包含 `生成标签节点`；xref edges 有三条；local target alias 中 `rule-query-example` 归属到 `约束规则`；SHACL 校验 conforms true，violations 0；Oxigraph 推理出两条上层关系。

从整体看，这个 basic 样例的对象非常明确：它不是在教 AsciiDoc 写作，也不是在做业务知识图谱，而是在验证 `asciidoc-abundant-tree` 的 RDF12 heading projection 是否能形成一个可被标准 RDF 工具链消费的稳定契约。源文件给出结构事实；CLI 生成 RDF12 图；模型图给 role 和 relation hierarchy；shape 图给约束；Python 脚本证明最小消费可行；SHACL 脚本证明可校验；Oxigraph 脚本证明可查询、可推理、可追溯 xref evidence。

如果用一句话概括：这个项目把 AsciiDoc 从“渲染输入文本”提升成“可查询、可定位、可校验的源结构事实图”；而 `basic-rdf-projection` 是最小但完整的演示，证明标题、字段、role、xref、listing target alias 和 RDF 1.2 reifier 这些投影面，能够被真实下游程序读取并用于报告、验证和关系解释。
</Assistant>

<User id="1">
那就是这个ADOC语法，请你，呃，想象一下啊，结合我们之前的资料。当然，我现在就是想抛出我的愿望，当然我并不想马上就实现什么，我也不想知道下一步，我就是想我的表达，我讲一大堆东西，讲，我花很多口水讲很多东西，我就我的目的只有一个，让你能够理解我嘴巴里讲的是什么。然后呢？你能完整地把它演绎，把它展示出来，让我感受一下。行，那我的愿望就达成了。好，那你开始听我讲东西吧。

好的，知识图谱你知道吧？是吧？经典三元组是吧？比如说 [史蒂夫·乔布斯] --(创立)--> [苹果公司]


然后呢我们现有的这个ADOC的语法，是吧？是什么样子的？以及呢，我们的这种有这个什么投影工具链呐，是吧？还有各种各样的这个方便的，就是作者啊一边能够像正常文章一样写，同时呢，哎，也能做出一个完整的知识图谱

\\wsl.localhost\Ubuntu\home\t103o\workbench\micheng-ts\projects\asciidoc-multi-book-workspace\docs\07-structured-writing-conventions.md

你可以再完整地阅读一下这个啊，这里面展示的也是我们目前已经支持的语法。

你可以看到书籍的结构，是不是？书籍是不是有结构呀？我们来看到那个什么Glossary 那么我的这一个想要的东西想要的一种新的东西是什么？但是我现在不知道我想要什么。我尝试描述给你听，我可能讲得不太清楚。我也不知道我这样设计是否优雅。或者说你听着我讲的东西，你可以先整理出来，然后呢再按照你的这个工程经验，你可以再去干嘛呢？加上你自己的一些taste品味都可以啊。

也就是说，好，我开始讲了啊。书籍里面所有的标题的名字，没错，就是标题的名字。标题的名字注册为，没错，自动注册为实体的名字。 所有的Glossary。

在这里它就是描述列表嘛，是不是？所有的这个term被这个术语表注册之后，咦？它们都会变成实体的名字。 好，在这里，实体的来源于注册登记的位置两个地方，所有的标题的名字术语表每一个术语的名字哎，都会成为实体的名字。

然后希望还要有一种ADOC的一种新的一种自定义宏，是Inline的那种。 名字我没有想好。宏的基本格式呢，是这样的。

宏的名字然后冒号然后目标然后中括号然后里面支持位置参数还有关键字参数。

name:target[a, b=123]

就是这样的。你应该也知道。啊，这个就是公开的语法嘛，是不是？诶，我希望能够，你帮我想一套语法啊，就是有这样的一种Inline的这种宏。 它能干嘛呢？它不是会被书写吗？是吧？好，我们看。它会根据已经被注册的实体，来自于术语表和标题。然后呢，诶，它会在正文里面出现。那这种自定义的Inline宏呢，它会干嘛呢？ 它就会直接看被写在哪里了。它就会前后看，它会看它的字符串，就是以这个宏为中心，它看前面，去字符串匹配，能不能匹配到这个就是实体符号表里面的词，匹配上了，OK，就确定了主语。然后呢，它再往右边看。能不能啊？字符串匹配能不能完全匹配，完全符合实体注册表里的名字。如果能够匹配到，OK，那么就确定了宾语。好，那么在这边，啊，这个Inline的这个宏，它的target直接写这一个关系的名字，直接写名字。比如说你是depend on，或者说你是什么别的，就直接写，写完之后它就是这一个这个谓词，它就是这个边边的名字，就是这个了啊。 然后呢它后面那个中括号里的属性，属性就是啊就是边的属性，就挂到边上面去啊。  好 那么啊，它就是以这个宏的所在的位置，所在那一行前后去看，往前看遇到的第一个完整匹配的字符串。就是在一行里面匹配，不会跨行，因为它是Inline嘛，是不是？ 啊，往前往后 好，那如果说他在的这个位置是吧， 在某个标题之下，没错，就是直系标题。比如说在某个二级标题下面，是吧？它可以干什么呢？不写它的主语。它的语境就是二级标题的名字。如果说不写主语的话，那么它的这个实体的名字就取自于它直系标题的那个名字就可以了。啊，如果说，做极端的压测，压根就不写文章，你纯文字的，就只我写一个宏，这种情况非常少见。但是这个情况可以被我们的测试环境构造出来，那就没有。那那这个，它就不符合这个三元组的条件，那它就构成不了完整的一个三元组，那就没东西了。啊，这很自然嘛，是不是？就是这样子啊。 也就是我允许你这个前边，也就是主语可以缺失。那就可以尝试去寻找，找它的直系标题。如果从这个找不到找不到就没了，没东西了，就就失败了。模式匹配失败，也没啥玩意啊，就很自然的东西。然后呢，那宾语不可省略。宾语是一定要存在的。啊，如果说宾语的符号表里找不到你这个词，那就没了，很自然就没了，就没了， 然后呢？ 你看，就是这样子的话，就是能够进一步的达到一种比较非常轻松的，就是做这个知识图谱的构建。 我不知道你能不能想象出来啊？然后呢？哎，是吧？你看只需要在这个术语表里面，是吧？诶，你把你用到的实体的名字你写到术语表里面。其实实体啊，它确实按照书籍的习惯，它确实也应该出现在这个术语表里面。所以说这也是一种很自然的一种结构，自然映射。 如果说想要给某一个这个实体去挂属性，去添加额外的description描述，很自然的你给它开一个单独的标题，标题名字就填它，然后呢就可以挂属性了。啊，这就很自然的衔接下去了。也就是可以在不开标题的情况下，就可以开始构造三元组。可以开始构造知识图谱。 好，我不知道你能不能想象出来啊。好，你仔细想一想吧。想好之后呢？准备好之后呢？诶，发个弹窗来和我长谈吧，把你想说的东西都告诉我，不少于4000字或者更多，开始吧！

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="2">
# 我听懂到的东西：一种“自然书写中的知识图谱投影语法”

我先把我理解到的对象说出来。你现在不是在要求马上实现一个功能，也不是在问下一步怎么做。你是在把一个还没有完全成形的愿望说给我听：你希望 AsciiDoc 这种本来适合写书、写文章、写结构化文档的表面语言，能够进一步承载一种非常轻的知识图谱构造能力。作者不用切换到 RDF/Turtle，不用专门写 `[史蒂夫·乔布斯] --(创立)--> [苹果公司]` 这种图谱语法，也不用每次都写完整的 subject、predicate、object；作者仍然像写文章一样写，但在某些地方放一个很小的 inline macro，工具链就能根据当前位置、上下文和已注册实体表，把这句话中的关系投影成一条图谱边。

这个愿望的核心不是“多一种宏”，而是“让自然文章成为可投影的知识图谱表面”。你要的不是让书变成数据库录入表单，而是让书仍然是书；读者读起来仍然是自然语言、标题、术语表、xref、role、rel、字段；但工具链能在背后把实体、关系、边属性、证据位置都稳定提取出来。这个东西如果说得更抽象一点，就是：你想在现有 `asciidoc-abundant-tree` 的 heading projection、xref relation projection、surface field projection 之上，加一个“entity-aware inline relation marker projection”。

现有体系已经有几个很重要的事实。第一，标题已经是结构节点。书籍的 `= 书名`、`= 部`、`== 章`、`=== 节` 不是纯排版，它们已经能投影为 `aat:Heading`，有 `headline`、`addressLabel`、`role`、`status`、`owner`、`documentOrder`、`containsDirectly`、`relativePath`、`headingLine` 等。第二，xref 已经是关系边。`xref:target[显示文本, rel=depends-on, weight=strong]` 已经能表达“当前标题到目标标题”的关系，默认关系是 `aat:references`，显式关系是 `rel:*`。第三，术语表已经是书籍后置结构的一部分。`[glossary]` 下的 description list term 本来就承担“本书采用了哪些词，以及这些词是什么意思”的职责。第四，结构化写作约定里已经讲清楚：标题、stable ID、role、rel、surface field、glossary、index term 都是作者写作表面和下游投影之间的桥。

你现在提出的新东西，正好落在这些事实之间的空白处：xref 适合表达“当前标题指向某个 target heading/listing/block”，它的 source 是 xref 所在 heading；但是自然文章里大量知识关系不是“当前章节依赖目标章节”，而是“正文里出现的实体 A 和实体 B 之间存在某种关系”。例如：

```asciidoc
乔布斯 rel:founded[] 苹果公司。
```

或者：

```asciidoc
史蒂夫·乔布斯 rel:founded[year=1976, source=biography] 苹果公司。
```

你希望这个 inline macro 本身不承载 subject 和 object 的完整书写，而是像一个关系楔子，插在两个自然语言实体之间。宏的 target 是谓词，也就是边的名字；宏的 positional / named attributes 是边的属性；subject 和 object 来自宏左右两侧的正文字符串匹配；如果左侧没有实体，就回退到当前直系标题作为 subject；object 不允许省略，因为关系没有 object 就不能构成完整三元组。

我觉得这个对象可以叫：**正文关系标记**，英文可以叫 **inline relation marker**。如果进一步落到投影里，它投影出来的不是普通 xref edge，而是一类 entity relation edge。它和现有 xref edge 的差异很清楚：xref edge 的 target selector 是显式写在宏 target 里的，例如 `xref:required-rule[]`；inline relation marker 的 predicate 是显式写在宏 target 里的，例如 `rel:depends-on[]`，但 subject/object 是从作者正文和实体注册表中解析出来的。

现在看实体注册表。你说得很自然：实体来源有两个地方。第一，所有标题的名字自动注册为实体名。第二，术语表里每个 term 自动注册为实体名。这个设计非常贴合书籍形态。标题本来就是书的结构单位，很多标题天然就是概念、人物、组织、规则、事件、地点、对象。术语表本来就是“这本书里哪些词需要被稳定理解”的地方，term 进入实体表也很自然。也就是说，作者不用先开一个专门的 `entities.ttl` 或 YAML 表；他只要按书籍习惯组织标题和术语，实体表就自然出现了。

这里有一个很重要的美感：实体不是从全文任意分词里抓出来的，而是从作者已经正式注册过的位置来。标题和术语表都是有作者承诺意味的结构。标题名进入实体表，是因为作者把它提升成了一个可导航、可引用、可维护的书籍节点；术语表 term 进入实体表，是因为作者把它纳入本书的词汇契约。这样不会把所有出现过的名词都误当作实体，也不会让工具链变成中文分词猜谜游戏。实体注册是作者动作，不是模型幻觉。

我会把这个实体注册机制理解成一个 `EntitySymbolTable`。它至少包含这些信息：实体名称、来源类型、来源位置、可寻址资源、可能的别名、是否唯一、是否冲突。标题实体的来源类型是 heading，来源位置有 `relativePath`、`headingLine`、`headline`、`addressLabel` 或 `generatedAddressLabel`。术语表实体的来源类型是 glossary term，来源位置是 glossary section 下的 description list term 行。实体的主 label 就是标题文本或术语 term 文本。这个表不是给作者看的主界面，但它是这个关系宏能成立的前提。

然后看宏名。你还没有想好名字。按你的表达，宏的形状是 AsciiDoc inline macro 的公开语法：

```asciidoc
name:target[a, b=123]
```

如果 target 直接是关系谓词，那么最自然的宏名有几个候选：`rel`、`edge`、`kg`、`fact`、`stmt`。我个人最倾向于 `rel` 或 `edge`。`rel:depends-on[]` 非常短，而且和现有 xref 的 `rel=depends-on` 共享同一套关系谓词空间。它读起来像“这里放了一条关系”。缺点是 `rel` 这个词已经在 xref named attributes 中作为字段出现，如果同时有 `xref:target[..., rel=depends-on]` 和 `rel:depends-on[]`，读者需要理解：前者是 xref 的属性，后者是正文关系宏。但这个差异并不致命，反而可以保持概念统一：`rel` 永远表达关系谓词，只是一个在 xref 边上，一个在正文实体边上。

`edge:depends-on[]` 的优点是工程语义更明确：它就是边。缺点是写作者读起来比 `rel` 稍微硬一点，像图数据库术语。`kg:depends-on[]` 强调 knowledge graph，但作者写文章时每次看到 `kg` 会有点跳戏。`fact:depends-on[]` 有“事实声明”的味道，但谓词不是事实类型，边才是事实结构。`stmt:depends-on[]` 更接近 RDF statement，但不够自然。所以我会把 `rel:predicate[...]` 放在第一候选，把 `edge:predicate[...]` 放在第二候选。

如果采用 `rel:depends-on[]`，示例就可以是：

```asciidoc
配送策略 rel:depends-on[confidence=high] 运力规则。
```

投影结果就是：

```text
[配送策略] --depends-on {confidence=high}--> [运力规则]
```

如果放在某个标题下省略 subject：

```asciidoc
[#delivery-policy.policy]
== 配送策略

rel:depends-on[confidence=high] 运力规则。
```

那么 subject 取当前直系标题“配送策略”，object 从右侧匹配“运力规则”。投影结果仍然是：

```text
[配送策略] --depends-on {confidence=high}--> [运力规则]
```

这个省略 subject 的规则非常符合书籍写作习惯。因为章节里的很多句子都是围绕当前标题展开的。标题就是当前讨论对象。作者在“配送策略”下面写“依赖 运力规则”，他不应该每次都重复“配送策略”。这和现有 xref projection 里“xref 所在标题是 source heading”有很强的一致性：书籍结构本来就提供语境。新的关系宏只是把这个语境用于实体边。

但是这里要把规则说清楚。我的理解是：宏所在位置先尝试左侧匹配 subject；如果左侧没有匹配到实体，才回退到当前直系标题。如果当前直系标题也不能注册为实体，subject resolution 失败。object 不回退、不省略，只能从右侧匹配。因为 object 是关系终点，正文里必须给出来。如果右侧找不到实体，就不生成三元组，只生成一个可诊断的 unresolved relation marker 证据，或者在严格模式下报错。你刚才说“没东西了，很自然”，这对应宽松投影模式；工程上也可以保留一个诊断投影，但不把它当作有效三元组。

“以宏为中心，往前看，往后看，字符串匹配完整实体名，只在同一行，不跨行”这个判断很重要。它把问题限制在一个非常可控的范围内。你不是要做 NLP，不是要解析整段语义，不是要猜代词指代，也不是要跨段找最近名词。它只在当前行，以宏为中心，查实体符号表中能否完整匹配某个字符串。这个边界非常干净。它的人工制品身份不是“自然语言理解器”，而是“实体注册表约束下的局部 inline relation resolver”。

匹配规则我会想象成这样：

```text
左侧窗口：从宏起点往左，取当前行宏前文本。
右侧窗口：从宏终点往右，取当前行宏后文本。
subject：在左侧窗口中寻找距离宏最近的、完整匹配实体名的片段。
object：在右侧窗口中寻找距离宏最近的、完整匹配实体名的片段。
完整匹配：实体名不能只是另一个词内部的子串，需要有文本边界。
同长度/重叠冲突：优先最长匹配，再按离宏最近排序；仍冲突则 ambiguous。
```

为什么要最长匹配？因为实体表里可能同时有“苹果”和“苹果公司”。正文写“史蒂夫·乔布斯 rel:founded[] 苹果公司”，如果右侧同时能匹配“苹果”和“苹果公司”，应该取“苹果公司”。为什么要离宏最近？因为一句话里可能出现多个实体：

```asciidoc
皮克斯、乔布斯 rel:acquired-by[] 迪士尼。
```

左侧最近的是“乔布斯”，不是“皮克斯”。如果作者想表达“皮克斯被迪士尼收购”，他应该把宏放在“皮克斯”和“迪士尼”之间，或者提供显式 subject 参数。这个地方会引出一个可选扩展：宏参数里是否允许覆盖 subject/object？你当前愿望里没有要求，我不急着把它放进核心对象。但作为未来期权，可以保留，例如 `rel:acquired-by[subject=皮克斯]` 或 `rel:acquired-by[from=皮克斯, to=迪士尼]`。核心形态先保持最轻：subject/object 来自文本和标题语境。

完整匹配还有一个中文边界问题。英文里可以用空格、标点、词边界判断；中文没有天然空格，所以“完整匹配”不能简单用 `\b`。如果实体名是“角色”，句子里出现“角色化”，是否匹配“角色”？一般不应该。中文边界可以先保守定义为：实体名左右两端不能紧贴 CJK 字母数字延续字符，或者说要么在行边界、标点、空白、AsciiDoc markup 边界附近，要么完整作为已注册实体名出现。这个细节不是你现在要实现的重点，但它决定这个工具以后是否会制造噪声。按你的愿望，它应该是轻松的，但不能乱猜。

再看“实体属性”这件事。你说如果想给某个实体挂属性、添加 description，很自然地给它开一个单独标题，标题名字填它，然后就可以挂属性。这个点非常漂亮。因为它没有另造实体定义语法。实体的富描述落回书籍结构：

```asciidoc
[#steve-jobs.person, birth-year=1955]
== 史蒂夫·乔布斯

alias:: Steve Jobs
summary:: 苹果公司联合创始人之一。
```

这样标题既是读者可读章节，也是实体详情页，也是图谱实体节点的属性来源。术语表 term 则可以提供轻量实体注册：

```asciidoc
[glossary]
苹果公司:: 一家科技公司。
史蒂夫·乔布斯:: 苹果公司联合创始人之一。
```

如果某个术语后来变得重要，就可以晋升为标题；如果只是需要进入符号表，则留在术语表。这个路径非常像你前面说的“不开标题也可以开始构造三元组；需要更丰富属性时再开标题”。这是一种很好的渐进式建模方式。它避免作者一开始就被迫设计完整 ontology，也避免全文关系只能依赖标题。术语表提供轻注册，标题提供重注册。

不过实体来源有两个地方，就会有冲突问题。比如术语表里有“配送策略”，标题里也有“配送策略”。我会把这理解为同名实体合并，而不是两个实体。优先以标题实体作为 canonical resource，因为标题有更强的可寻址性和正文容器能力；术语表 term 可以作为同一实体的 glossary evidence 或 definition source。如果标题和术语表中同名词语的定义明显冲突，那是书稿维护问题，不是宏本身解决的问题。投影可以保留两个 registration source，供审查工具提示“同一实体有多个注册来源”。

再看三元组投影。一个成功解析的 relation marker 至少应该产生这些事实：

```text
subject entity
predicate relation
object entity
edge attributes
source evidence
source line / column
raw macro text
raw line slice maybe
subject match span
object match span
containing heading
```

如果落到 RDF vocabulary，可以想象有两层事实。第一层是业务边：

```turtle
<entity:史蒂夫·乔布斯> rel:founded <entity:苹果公司> .
```

第二层是证据边，也就是类似现有 `aat:XrefEdge` 的 reifier：

```turtle
<edge-l12-c8-o0> a aat:InlineRelationEdge ;
  rdf:reifies <<(<entity:史蒂夫·乔布斯> rel:founded <entity:苹果公司>)>> ;
  aat:sourceEntity <entity:史蒂夫·乔布斯> ;
  aat:targetEntity <entity:苹果公司> ;
  aat:rel "founded" ;
  aat:raw "rel:founded[year=1976]" ;
  aat:startLine 12 ;
  aat:startColumn 8 ;
  aat:subjectSurface "史蒂夫·乔布斯" ;
  aat:objectSurface "苹果公司" ;
  aat:year "1976" .
```

这和现有 xref evidence 的设计精神一致：关系本身可以被查询，关系的来源证据也可以被追踪。不同在于 xref edge 的 source/target 是 heading，而 inline relation edge 的 source/target 是 entity。实体可能来自 heading，也可能来自 glossary term。这样图谱层不再局限于“标题之间的关系”，而是可以表达“书中实体之间的关系”。

我还会把它和现有 `xref` 的职责边界分开。`xref` 是导航和引用关系：它服务读者点击、章节之间的参见、依赖、说明、定义、约束。新的 `rel` inline marker 是实体关系：它服务知识图谱，读者不一定看到链接，也不一定需要跳转。举例：

```asciidoc
配送策略依赖 xref:capacity-rule[运力规则, rel=depends-on]。
```

这是章节“配送策略”依赖章节“运力规则”。而：

```asciidoc
配送策略 rel:depends-on[] 运力规则。
```

这是实体“配送策略”依赖实体“运力规则”。很多时候二者会重叠，因为标题就是实体；但概念上最好区分。xref 强调文档结构导航；inline relation marker 强调实体图谱事实。它们可以投影到同一 relation namespace，但 evidence 类型不同。

再看作者体验。这个语法最吸引人的地方，是它降低了知识图谱写作的入口。传统知识图谱录入要求作者跳出文章，写三元组、表格、YAML、Turtle 或 JSON-LD。那会破坏写作流。你的语法让作者只做一件小动作：在自然句子里，把谓词放在两个已注册实体之间。例如：

```asciidoc
[glossary]
知识图谱:: 由实体和关系构成的知识表示结构。
AsciiDoc:: 一种轻量标记语言。
RDF:: 资源描述框架。

== 知识图谱

知识图谱 rel:represented-by[] RDF。
AsciiDoc rel:can-project-to[through=asciidoc-abundant-tree] RDF。
```

读者看到这几句话仍然是文章。工具链看到的是两条边。作者不需要在所有地方写 ID，因为实体名已经注册。这个设计的“轻”来自两个前提：实体表是提前自然形成的；关系宏只标谓词，不标整条三元组。

但是我也会指出一个边界：这个东西不能假装自己理解自然语言。它不应该从“乔布斯创立了苹果公司”自动推断 `founded`。作者必须写宏。宏就是作者承诺关系存在的位置。没有宏，就只是普通文本。这一点很重要，因为它保留了作者责任，也让投影可审查。工具链不应猜测关系，只应投影作者明确标注过的关系。

如果要把这套东西讲成一套稳定对象，我会这样定义：

> Inline relation marker 是一种 AsciiDoc 正文内关系声明表面。它通过固定 inline macro 语法显式声明关系谓词，通过已注册实体符号表解析宏左右两侧或所在标题语境中的 subject/object，并把成功解析的声明投影为带源证据的实体关系边。

它的构成性条件是：

1. 必须存在实体符号表；实体至少来自标题 headline 和 glossary term。
2. 必须存在关系宏；宏 target 是谓词名。
3. 必须有 subject resolution；左侧实体优先，缺失时回退当前直系标题实体。
4. 必须有 object resolution；右侧实体必需。
5. 必须保留源证据；否则不能定位、审查和修复。
6. 必须有失败语义；解析失败不能悄悄伪造成有效三元组。

失败语义我会分几类。`unresolved-subject`：左侧没有实体，当前标题也不是实体。`unresolved-object`：右侧没有匹配实体。`ambiguous-subject`：左侧有多个同等优先候选。`ambiguous-object`：右侧有多个同等优先候选。`unknown-predicate`：如果未来引入受控谓词表，而 target 不在表中。`dangling-marker`：宏存在，但没有生成完整关系。宽松模式可以不生成业务边，只生成诊断 evidence；严格模式可以让校验失败。

你说“没东西了，很自然”，我理解你的直觉是：如果三元组条件不成立，就不要硬生成东西。这是对的。但从工具链维护角度，我会保留“失败标记证据”作为审查面，因为作者可能以为自己写成功了。比如：

```asciidoc
rel:depends-on[] 未注册实体。
```

这不应生成关系边，但可以在诊断里说：第 N 行有一个 relation marker 没有解析到 object。这样不会污染图谱，也不会让作者无从发现问题。

再看和 `07-structured-writing-conventions.md` 的关系。那本文档已经建立了几个约定：标题层级连续；stable ID 只有在标题被引用且标题文本不稳定/不唯一时才需要；role 表达标题身份；rel 表达 xref 边关系；surface fields 写在 attrlist、description list 或 xref named attributes；glossary 解释核心术语。你的新想法可以自然加入这个体系，而不是推翻它。它可以成为“实体与正文关系”这一章：标题和术语表提供实体注册；inline relation marker 提供实体关系边；标题字段和术语描述提供实体属性；宏 attributes 提供边属性；source span 提供证据。

我脑中浮现出来的一小段样例书会是这样：

```asciidoc
= 组织史样例

[glossary]
史蒂夫·乔布斯:: 苹果公司联合创始人。
苹果公司:: 一家科技公司。
皮克斯:: 一家动画工作室。
迪士尼:: 一家媒体公司。

[#steve-jobs.person, birth-year=1955]
== 史蒂夫·乔布斯

史蒂夫·乔布斯 rel:founded[year=1976] 苹果公司。
史蒂夫·乔布斯 rel:led[] 皮克斯。

== 皮克斯

rel:acquired-by[year=2006, amount=7400000000] 迪士尼。
```

这里第一条和第二条显式写 subject；第三条省略 subject，回退标题“皮克斯”。投影后有三条边：乔布斯 founded 苹果公司；乔布斯 led 皮克斯；皮克斯 acquired-by 迪士尼。作者仍然在写书，不是在填图谱表。

再举一个更贴合你当前文档体系的例子：

```asciidoc
[glossary]
heading:: 使用等号标题创建的书稿结构单位。
stable ID:: 作者为标题显式声明的稳定引用地址。
xref:: AsciiDoc 交叉引用宏。

== stable ID

stable ID rel:identifies[] heading。
xref rel:targets[] stable ID。
```

这个例子说明：术语表注册了三个实体；正文中用两个宏表达概念关系。这里如果 `stable ID` 也是标题，标题实体和 glossary term 合并，实体更强；如果没有标题，术语表也足够支撑关系边。

我对这套语法的 taste 判断是：它很有生命力，因为它没有把知识图谱建模强行外置成另一种语言，而是沿着书籍已有结构继续生长。标题是实体，术语是实体，宏是边，字段是属性，xref 是结构引用，glossary 是词汇契约，RDF projection 是下游查询面。每一个设计点都从现有写作动作里长出来，没有突然要求作者变成 ontology engineer。

但它要保持优雅，关键是克制在三个地方。第一，不要让宏自动猜自然语言谓词。谓词必须由作者显式写在 target。第二，不要从全文任意名词自动注册实体。实体只来自标题和术语表这种作者承诺过的结构。第三，不要让 subject/object resolution 变成复杂 NLP。只做同一行、宏左右、实体表完整匹配、标题语境回退。这样它的边界很稳，测试也可以很稳。

如果未来要有更高级能力，可以作为期权，而不是现在核心对象的一部分。例如 alias 支持、实体 disambiguation、显式 subject/object override、受控谓词表 SHACL 校验、关系边类型层级、跨书 entity registry、实体 canonical IRI 策略。这些都能想象，但不需要压进最初的对象定义。当前最核心的“杯子”已经很清楚：让作者在自然正文里用一个 inline macro，把已注册实体之间的关系投影出来。

我最后用一句更凝练的话帮你把愿望演绎成对象：

你想要的是一种 **AsciiDoc 原生写作表面上的实体关系投影机制**。它让书籍标题和术语表自然形成实体符号表；让作者用 `rel:谓词[边字段]` 这种 inline macro 在正文中声明关系；让工具链在宏左右同一行寻找已注册实体，或用当前标题补足 subject；让成功解析的关系成为带源证据、边属性和可查询谓词的知识图谱三元组；让失败解析保持为诊断，而不污染图谱。它的价值不是炫技，而是把“写书”“建模”“查询”“审查”“维护”放到同一份源文本里，让作者的每一次结构化书写都能同时服务读者和机器。
</Assistant>

<User id="2">
实际上标题和术语表又不冲突，当然可以出现了。而且没有什么晋升不晋升的问题吧？你术语表就是术语表，标题就是标题呀。这里没有存在什么上下级，什么晋升的吧？这里是符号空间， 前面已经讲过了。符号来源于哪里？标题名字和被注册的术语表。术语表和标题的名字完全重合，那就合并成一个，没有争议。 在RDF投影这边。 术语表这边有，标题也有，那不就会把术语表这边的那个节点就直接规并到标题上面。标题它生成的那个机械节点作为唯一就可以了。如果标题没有，那这边术语表根据自己的术语自己单独注册。啊，单独注册，它自己会生成RDF节点啊。你会发现这里跟那个红没关系呀。有关系吗？没有关系啊。是不是？你这里所谓的什么冲突不冲突的？啊？什么冲突吗？我不知道。我们都不认识什么是苹果，不知道什么叫冲突。你无法去决定，是不是？下游工具链的事情，你这里越俎代庖吗？

符号空间啊，这里是表达方式，是有一种就是就是表达这个关系呀，表达边的一种方式而已。如果说你有标题，标题它就已经是吧？它有实体了，没有实体，那你再使用Inline这个宏，是吧？就使用这个rel 他干嘛呢？他做的事情也就只是声明一条边而已嘛，是吧？  RDF这边的投影也不变。同时图上呢，它根本就不管你是不是来自于术语表啊，因为我们RDF这边就是以标题为中心。 所以投影的时候啊，即使这个符号来自于这个术语表下面的term，依然呢，也是把它投影成一个标题节点，不会再增加别的字段，因为没有意义。下游工具链消费的根本就不需要知道你是不是个标题。因为知识图谱里面没有标题这种概念，我们保留标题这个名字只是方便我们自己调试而已，我们知道它来自于标题。 也就是你可以相当于你把这个术语表下面的描述列表，每一个描述列表的名字看成标题的heading line的名字。然后呢它的内容就是标题的正文内容，OK，就是这样子。这个你能想象出来吗？

然后关于什么冲突？你是不提到冲突？我们不知道什么冲突。而且现有的这个标题交叉引用的情况已经是了。如果说你两个一样的标题，你还是用标题名字去交叉引用，它就给你两个标题都发边，发两条边。就这样子，下游工具链就可以查出来这个你的这个出度、入度啊，是不是就能回到这边进行修改？那如果说你把这个事实消费掉了，人家怎么查呢？是不是？

然后我想了一下啊，我觉得我直接放弃这个什么左右匹配，我换一个，你也不要再谈此事，我换成这个 `indexterm2:[<primary>]` 可见索引词 这个索引词在书籍里面通常都是专门的这一个人员去写的。诶，那其实在这里，引用实体是吧？那其实那等于说这个实体它这个名字这个词本身就不是一个普通词了。诶，刚刚好，顺手标记成一个索引词，一举两得。方便索引，方便数据工具本身的索引词的查询，也方便图的查询，是不是？同时呢也方便我们这一个程序的解析。

indexterm2:[<primary>] rel:谓词[边字段] indexterm2:[<primary>]
rel:谓词[边字段] indexterm2:[<primary>]

那这些其实依然是书籍的一些结构的构建嘛，是不是？你看依然都是服务于书的啊。

可以省略主语。它前面可以是普通句子，除非就是你这个主语想切换掉，就是不是当前标题的，你想换掉，可以，它主动的去写，啊。

好的，仔细想一想哈，我又讲了一些东西，不知道你是否理解得更清楚了呢？你的想法看法是什么呢？好好想一想，看一下你有什么补充说明的吗？有什么想和我说的吗？整理好之后弹窗说给我听，发给我，不少于3000字或者3000字开始吧。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="3">
# 这次我重新听懂了：它不是匹配文本，而是用书籍索引词显式落点来声明实体关系

你这次补充之后，对象比上一轮更清楚了。我先把我上一轮说错、说偏的地方收回来：这里不应该说“术语表实体晋升为标题实体”，也不应该把“标题和术语表重名”说成需要工具处理的语义冲突。这个说法把一个很干净的符号空间问题，误说成了对象层级或语义判定问题。实际上你讲的是：符号来自两个注册入口，标题名字和术语表 term。它们进入同一个实体符号空间。名字相同就是同一个符号；标题存在时，RDF 投影可以使用标题生成的机械节点作为该符号的资源；标题不存在时，术语表 term 自己也能生成一个节点。这里没有“晋升”，没有“谁比谁高”，也没有工具判断“苹果”和“苹果公司”到底是不是冲突。工具不知道业务世界，它只负责保留作者写下的结构事实。

这个修正很关键。因为它让这套东西保持在“表达方式”和“投影规约”的层面，而不是越界进入“语义裁判”。书里可以有标题“配送策略”，术语表也可以有 term“配送策略”。这两个注册源都指向同一个实体符号。RDF 侧如果已经有标题节点，就归并到标题节点；如果没有标题节点，就为术语表 term 生成一个可参与关系的节点。这个节点对下游知识图谱来说就是实体节点，至于它原来来自标题还是术语表，不应该成为下游消费的必要概念。你说“知识图谱里面没有标题这种概念，我们保留标题这个名字只是方便自己调试”，这个判断是对的。标题是作者源文档里的结构来源，不是知识图谱本体里的必然分类。

按这个理解，实体符号空间可以非常朴素：

```text
实体符号 = 标题 headline ∪ 术语表 term
同名符号 = 同一个实体
资源选择 = 有标题资源则使用标题资源；否则使用术语 term 生成资源
工具职责 = 注册、归并、投影、保留可追溯性，不判断业务语义冲突
```

这个东西和 `rel` 宏确实没有直接依赖关系。实体符号表是实体符号表，关系声明宏是关系声明宏。先有符号空间，后有使用这些符号声明边的表面写法。`rel` 宏只是“在正文中声明一条边”的方式，而不是实体注册机制本身。实体注册来自标题和术语表；实体引用现在你进一步改成来自 `indexterm2` 这种显式索引词标记。这样整个对象更稳了。

你放弃左右字符串匹配，我认为是一个明显更好的设计选择。上一轮那个“宏左右同一行自动匹配实体名”的方案虽然轻，但仍然有一层工具猜测：它要在普通文本里找实体边界，要处理最长匹配、最近匹配、中文词边界、重复实体、标点、别名等问题。那些问题不是不能做，但一做就会让这个人工制品靠近“文本解析器”或“弱 NLP”。而你现在换成 `indexterm2:[<primary>] rel:谓词[边字段] indexterm2:[<primary>]`，实体落点由作者显式标记，关系落点由作者显式标记，工具不再猜。这个变化把结构责任重新交回作者，同时正好复用书籍原本已有的索引词动作。

这套新语法的美感在于：它没有引入一个外来的实体引用语法，而是借用了书籍天然就该有的 `indexterm2`。可见索引词本来就是给读者和书后索引服务的：正文中已经自然出现这个词时，作者用 `indexterm2:[词]` 标记它，渲染后词仍然可见，同时它进入索引系统。现在这个标记又服务机器消费：它不仅是索引入口，也是一处实体引用。这样一个作者动作同时完成三件事：正文读者看见术语，书后索引能收录术语，图谱投影能识别实体引用。这个确实比重新发明 `entity:苹果公司[]` 更自然。

我现在理解的新核心语法应该是两种：

```asciidoc
indexterm2:[主语实体] rel:谓词[边字段] indexterm2:[宾语实体]
```

以及省略主语、使用当前标题作为主语：

```asciidoc
rel:谓词[边字段] indexterm2:[宾语实体]
```

第一种是显式主语关系声明。作者明确把主语实体、谓词、宾语实体都写在同一条正文关系表面中。第二种是当前标题语境关系声明。它适合在某个实体标题下面写正文时使用：如果当前标题就是讨论对象，作者不需要重复写主语，只写谓词和宾语即可。你补充说“它前面可以是普通句子，除非主语想切换掉，不是当前标题的，才主动写”，这就说明默认主语不是前文字符串，而是当前直系标题实体。显式 `indexterm2` 主语只是为了切换 source entity。

例如：

```asciidoc
[glossary]
配送策略:: 描述订单配送选择与约束的策略。
运力规则:: 描述运力容量与降级条件的规则。
风险控制:: 对异常风险进行识别和限制的机制。

[#配送策略.policy, status=active]
== 配送策略

配送策略需要遵守 indexterm2:[风险控制]。
rel:depends-on[weight=strong] indexterm2:[运力规则]。

在特殊场景下，indexterm2:[风险控制] rel:constrains[reason=capacity] indexterm2:[配送策略]。
```

这里第一句“配送策略需要遵守风险控制”如果没有 `rel`，它只是索引词或正文；第二句 `rel:depends-on[...] indexterm2:[运力规则]` 使用当前标题“配送策略”作为主语；第三句显式切换主语为“风险控制”，宾语为“配送策略”。这三种表面都服务书稿阅读，但只有出现 `rel:*[]` 的地方声明关系边。

这样一来，`indexterm2` 的职责是“实体引用落点”，`rel` 的职责是“边声明落点”。二者组合才构成图谱关系声明。单独出现的 `indexterm2:[风险控制]` 仍然只是索引词和实体提及，不自动生成关系。单独出现的 `rel:depends-on[]` 如果右侧没有宾语实体，也不能生成完整边。这个边界非常重要：实体提及不是边；边宏没有宾语也不是边；只有满足结构条件，才投影为有效关系。

我会把这套对象命名为：**索引词驱动的正文实体关系声明**。英文可以叫 **indexterm-driven inline entity relation**。它不是全文抽取，不是左右字符串匹配，不是业务本体推理。它是作者在正文中使用已有书籍索引词宏和一个关系宏，显式写出可投影的实体边。

它的构成条件可以很清楚：

1. 实体符号表已经存在，来源是标题 headline 和术语表 term。
2. `indexterm2:[primary]` 在关系声明附近作为实体引用表面。
3. `rel:predicate[...]` 作为关系谓词表面，predicate 来自 target。
4. 显式主语形态需要 `indexterm2:[S] rel:p[...] indexterm2:[O]`。
5. 省略主语形态需要 `rel:p[...] indexterm2:[O]`，且当前直系标题能解析到实体符号。
6. 宾语不可省略，必须由 `rel` 后方的可见索引词提供。
7. named attributes 是边字段，挂在关系证据或关系边上。
8. 解析失败时不生成有效三元组，但可以保留诊断证据。

这里我会特别强调“后方宾语”。因为如果改用 indexterm2，那么 `rel` 宏和实体引用的相对位置也变得可规约。显式主语在 `rel` 前，宾语在 `rel` 后；省略主语时，`rel` 前可以是普通句子，但不会被解析为主语。这样避免了上一版的“往前字符串找实体”不确定性。只有 `rel` 前紧邻或在同一关系片段中的 `indexterm2` 才是显式主语。更保守一点，可以规定主语必须是 `rel` 前最近的一个 `indexterm2`，中间只允许空白、标点或少量连接词；但我觉得现在不用把这个压死，先表达核心：主语不是普通文本匹配，主语要么来自当前标题，要么来自显式 `indexterm2`。

如果要避免歧义，我会建议关系声明的“可读规范写法”长这样：

```asciidoc
indexterm2:[S] rel:p[key=value] indexterm2:[O]
rel:p[key=value] indexterm2:[O]
```

至于更自然的句子里穿插普通词，例如：

```asciidoc
indexterm2:[S] 在本章中 rel:p[key=value] indexterm2:[O]
```

是否允许，可以成为投影器的宽松规则或后续期权。核心样式先保持近邻结构，会让作者和工具都更稳定。因为这个关系声明本质上是一个结构标记，不是自然语言句法分析。

实体符号解析这边，我现在会完全按你说的来。标题和术语表 term 是同一符号空间，重名直接归并，不需要讨论冲突。RDF 投影可以以标题节点为中心，是因为现有投影体系已经以 heading resource 为主要可查询节点。术语表 term 如果没有对应标题，也可以被投影成“heading-like entity resource”，它拥有 headline/name、source coordinates、raw 或 definition text。你说可以把术语表描述列表的名字看成 heading line 的名字，内容看成标题正文内容，这个想象很准确。它不是说术语表真的变成章节，而是说投影层可以用同一种实体节点形态承载它，从而让下游查询不必关心它来自标题还是术语表。

也就是说，public graph 里可以尽量统一：

```text
实体节点有名字、有源位置、有正文/定义文本、有入边出边。
标题实体和术语实体在查询上同形。
标题存在时使用标题实体资源。
标题不存在时术语表 term 生成实体资源。
```

下游如果真的关心来源，它可以通过 source coordinates 或 debug/provenance 图去看；但核心知识图谱消费不应该被迫区分“这是 heading 还是 glossary term”。这点我现在赞同。你要的是实体关系图，不是文档内部结构图。文档结构图仍然存在，但那是另一个投影视角。

你提到现有标题交叉引用已经有类似处理：如果两个一样的标题还用标题名字交叉引用，它就给两个标题都发边，发两条边。这个例子说明工具链不应该把“不唯一”直接消费掉或替作者裁判。它应该保留事实，让下游工具能查出出度、入度、重复命中，再回到源文档修改。这是一个很重要的投影哲学：**不要过早消解作者源文档中的多义事实**。如果源文档里同名实体导致多节点命中，那图上就应该保留多条边或保留 ambiguous evidence，而不是静默选一个。否则下游就失去审查入口。

放到新语法里，如果 `indexterm2:[配送策略]` 对应多个实体资源，因为标题或术语注册空间没有唯一归并规则，投影器不应该假装只有一个。按你的思路，如果同名就是同一个符号，那大多数情况下会归并成一个；但如果实际 source graph 中存在无法归并的多资源，投影也应该把事实暴露出来。可以是多发边，也可以是诊断 ambiguity，取决于当前实体资源模型。但关键是不替作者“解释掉”。这个原则和你刚才批评我“越俎代庖”是一致的：工具链做投影，不做业务语义裁判。

现在看 `rel` 宏本身。`rel:谓词[边字段]` 这个形态我仍然觉得很好。因为现有 xref 已经有 `rel=depends-on`，关系谓词空间已经存在。正文实体关系也使用 `rel:depends-on[]`，可以共享谓词词表。区别在于：xref 的 `rel` 是 xref named attribute，表示 source heading 到 target heading 的文档关系；inline 的 `rel` 是宏名，表示实体 source 到实体 object 的实体关系。二者同名但不混乱，因为它们都表达关系谓词，只是表面位置不同。

如果写成：

```asciidoc
xref:regular-heading[常规标题, rel=depends-on]
```

意思是当前标题依赖那个目标标题。若写成：

```asciidoc
indexterm2:[引用规则] rel:depends-on[] indexterm2:[常规标题]
```

意思是实体“引用规则”依赖实体“常规标题”。在很多书里这两者可能落到同一对节点上，但证据类型不同。xref 更偏导航/引用，indexterm2+rel 更偏正文事实声明。这个区分应该保留，因为它们服务的作者动作不同。

边字段也很自然。`rel:depends-on[weight=strong, source=interview]` 中的 named attributes 就是边属性。positional attributes 要谨慎一些。AsciiDoc inline macro 允许位置参数，但如果位置参数没有稳定语义，很容易让读者猜。可以先约定：named attributes 是推荐形式；positional value 如果存在，可以作为 `aat:value` 或 `aat:label`，但不要鼓励复杂用法。比如：

```asciidoc
rel:depends-on[strong]
```

这到底是 weight、confidence、label 还是 note？不如：

```asciidoc
rel:depends-on[weight=strong]
```

更可维护。你说宏支持位置参数和关键字参数，是语法事实；但公共约定可以偏向 named attributes，这样边字段的公共契约更稳。

我还会补充一个“作者读法”。这套语法最终不是给机器看的，它也应该能被作者自然读出来：

```asciidoc
indexterm2:[A] rel:p[k=v] indexterm2:[B]
```

读法就是：“A 与 B 之间存在 p 关系，关系属性为 k=v。”

```asciidoc
rel:p[k=v] indexterm2:[B]
```

读法就是：“当前标题实体与 B 之间存在 p 关系，关系属性为 k=v。”

这两句足够简单，作者不需要理解 RDF reification、IRI、SHACL 才能写。工具链再把它投影为 RDF 1.2 triple term、edge evidence、source span、line/column、relation predicate、edge attributes。作者写的是书籍结构，机器得到的是图谱事实。

关于术语表，我现在的理解是：术语表不仅是解释词义的地方，也是实体符号表的一个正式入口。它在书籍工作流中本来就有专业分工，往往由专门人员维护索引、术语和名词统一。那把 `indexterm2` 和术语表结合起来，就形成一个闭环：术语表注册实体名；正文 `indexterm2` 提及实体；`rel` 宏声明实体间关系；索引可以帮助读者回找实体出现位置；图查询可以帮助机器回找实体关系。这个设计特别符合“服务书”的方向，不是为了图谱牺牲书，而是用书本来就需要的索引工作顺手喂给图谱。

我会把这个闭环画成文字：

```text
标题 / 术语表 term
        ↓ 注册
实体符号空间
        ↓ 被正文引用
indexterm2:[实体名]
        ↓ 与 rel 宏组合
实体关系声明
        ↓ 投影
RDF 边 + 边证据 + 源位置
        ↓ 消费
索引、查询、审查、可视化、回源修改
```

这里每一步都有自己的位置。标题和术语表负责“这个名字是书内正式符号”；indexterm2 负责“正文这里提到了这个正式符号”；rel 负责“这里声明了一条关系”；RDF 投影负责“把声明变成可查边”；下游工具负责“分析、校验、审查、可视化”。工具链之间没有互相越界。

如果我继续补充一点工程品味，我会建议这套语法的初始公共契约尽量小：

```asciidoc
indexterm2:[S] rel:p[edgeKey=edgeValue] indexterm2:[O]
rel:p[edgeKey=edgeValue] indexterm2:[O]
```

只承诺这两种。暂时不承诺任意普通文本中的远距离查找，不承诺隐藏索引词 `indexterm:[...]` 也能参与关系，不承诺从非注册实体自动造节点，不承诺谓词自动归一化，不承诺业务冲突判断。这样它作为人工制品很稳：作者知道怎么写，工具知道怎么读，测试知道怎么判定。

为什么我暂时不把 `indexterm:[...]` 放进核心？因为你强调的是 `indexterm2` 可见索引词，它在正文中可见，读者能看到实体名。关系声明如果用隐藏索引词，读者可能看不到关系两端实体的文字表面，源文档可读性会下降。当然隐藏索引词以后可以作为特殊场景期权，例如某些实体没有自然出现但需要补索引。但核心关系声明最好先用可见索引词，保持书写表面和投影事实同位。

失败情况也可以更简单。`rel:p[] indexterm2:[O]` 如果当前标题不是注册实体，就没有 subject，不生成边。`indexterm2:[S] rel:p[]` 如果后面没有宾语索引词，不生成边。`indexterm2:[S] rel:p[] indexterm2:[O]` 如果 S 或 O 不在实体符号空间，可以有两种策略：一种是严格要求它们已注册，否则诊断；另一种是 `indexterm2` 自身也可以触发实体提及但不注册实体。我倾向于遵守你说的“符号来源于标题名字和被注册的术语表”，所以 `indexterm2` 只是引用实体，不是注册实体。这样作者必须先通过标题或术语表把实体放进符号空间。这个约束会让图谱更干净。

不过这里有一个微妙点：书籍索引系统传统上允许作者对任何词使用 `indexterm2`，不要求它在术语表中存在。你的新关系投影如果复用 `indexterm2`，就需要把“普通索引词”和“实体引用索引词”区分开吗？我认为不必在语法上区分，但在投影关系时可以要求：参与 `rel` 关系的 `indexterm2` 必须能解析到实体符号表；不参与 `rel` 的 `indexterm2` 仍然只是普通索引词。这样不会破坏普通索引用法，也不会自动把所有索引词都变成实体边。

再进一步，RDF 投影可以有两层：实体节点投影和关系证据投影。实体节点来自标题和术语表，关系证据来自 `indexterm2 + rel + indexterm2`。关系边可以用 relation namespace：

```turtle
<entity:S> rel:p <entity:O> .
```

证据节点可以像现有 xref edge：

```turtle
<urn:...#inline-rel-l20-c12-o0> a aat:InlineRelationEdge ;
    rdf:reifies <<(<entity:S> rel:p <entity:O>)>> ;
    aat:sourceEntity <entity:S> ;
    aat:targetEntity <entity:O> ;
    aat:rel "p" ;
    aat:raw "indexterm2:[S] rel:p[k=v] indexterm2:[O]" ;
    aat:k "v" ;
    aat:relativePath "..." ;
    aat:startLine 20 ;
    aat:startColumn 12 .
```

这不是让作者写 RDF，而是让投影层保留“这条边从哪一句源文档来的”。这样下游工具发现某个关系有问题，可以回源文件第几行修改，而不是在图数据库里迷路。

我现在对这套东西的总体判断是：它比上一版左右匹配更优雅，更符合你已有的书籍结构化路线。因为它完全建立在 AsciiDoc 已有语义上：标题、术语表、可见索引词、inline macro、named attributes。没有引入外部 DSL，没有要求作者写 Turtle，也没有让工具猜自然语言。它的强度来自“作者显式标记”，它的轻量来自“标记本来就是书籍需要的索引词”。

最后我用一句话重新定义这个对象：

你现在要的不是“自动从正文抽取知识图谱”，而是一种 **以标题和术语表为实体符号空间、以可见索引词为实体引用、以 `rel` inline macro 为关系谓词声明的 AsciiDoc 正文关系投影机制**。它让作者在服务书籍索引和术语统一的同时，顺手声明实体关系；让 RDF 投影把这些声明变成可查询、可审查、可回源的边；让下游工具看到事实，而不是让投影器替作者判断业务语义。这个对象比“宏左右字符串匹配”更干净，也更符合你一直强调的：源文档首先是书，结构化标记首先服务书，然后自然地被工具链消费。
</Assistant>

<User id="3">
？？？？？？？？？？？？？
“……边字段也很自然。rel:depends-on[weight=strong, source=interview] 中的 named attributes 就是边属性。positional attributes 要谨慎一些。AsciiDoc inline macro 允许位置参数，但如果位置参数没有稳定语义，很容易让读者猜。可以先约定：named attributes 是推荐形式；positional value 如果存在，可以作为 aat:value 或 aat:label，但不要鼓励复杂用法。比如：

rel:depends-on[strong]
这到底是 weight、confidence、label 还是 note？不如：

rel:depends-on[weight=strong]……”什么叫读者猜呀？那7号书籍你是没看吗？啊？你作者自己约定词表啊，你越俎代庖吗？你想什么鬼啊？你怎么总是这样子的？你又不知道人家要建模什么东西，还什么strong不strong的啊，什么鬼啊，什么东西啊？你怎么知道你有没有什么权重啊？你怎么知道有权重这个词啊？你不知道什么叫苹果，不知道什么香蕉，你不知道什么叫世界，你什么都不知道 我觉得你讨论
这个问题本身也是狗屎啊。什么label什么note什么东西啊？

读者猜不猜关你屁事啊？你知识图谱你文档，跟读者屁关系呀？你管他怎么样？你管他躺着读、趴着读、站着读？你管他什么鬼呀？

位置参数是什么？位置参数是ADOC它这个宏本来就支持，至于下游怎么解释，那也是他们建模问题，关我们屁事啊。

“……不过这里有一个微妙点：书籍索引系统传统上允许作者对任何词使用 indexterm2，不要求它在术语表中存在。你的新关系投影如果复用 indexterm2，就需要把“普通索引词”和“实体引用索引词”区分开吗？我认为不必在语法上区分，但在投影关系时可以要求：参与 rel 关系的 indexterm2 必须能……”你是失忆了吗？我们前面不就讲过了吗？实体名字来源于标题和glossary 你索引词它只是个声明 ，如果你实体表里面没有，它就是没有。哎呦，我的天呐，你怎么讲不明白呢？你，我感觉你讨论，有时候你讨论很多问题很像弱智问题，知道吗？就好像问我出门要不要穿鞋一样。 它只是告诉系统，我这里声明一个索引词。如果说我这个这个声明索引词的符号，这个宏前面还有一个Rel宏，那我就会把你这两个组合识别成一个pattern，我知道你们要声明一条边。这这这这这，哎呀。

你会发现，你单独写这一个indexterm2 indexterm 他们本来就走原本的行为，又没有特别的解释，他们就是索引词啊。你书籍的工具链本来对它们就有自己的解释。我们这里是在赋予我们这里独特的解释。 而且你会发现，它是什么？它只是，而且它都是赋予我们Rel宏的。那其实我们都看的是什么？看的是Rel宏呀，是不是？

我怎么感觉你的脑子是不利索，转不起来呢？

“……至于更自然的句子里穿插普通词，例如：

indexterm2:[S] 在本章中 rel:p[key=value] indexterm2:[O]……”这个完全支持 而且本来就要支持。啊？你不要总是想着你工程上简单简单简单个屁啊？关你屁事啊？又不要你投钱。我要的就是完整的书写体验，就是原生的书稿。书，作者怎么写书，原本怎么来就怎么来。ADOC的生态习惯怎么样就怎么样。

自己看，自己想，这里就有一个数学模型，自己去想着去建模。我们在这里，我们看什么呢？我们要的是什么？前面已经讲过了啊，在这里就是看这个REL宏。这个是我们给它做上去的，定制的啊，用于去声明图谱边的。  这些都是in line呀，所以说我们是在一行里面去看。 看到底有几个，没事啊，就看到底有几个。然后呢，他们会前后消费，从左往右按照顺序去消费。 就是我们看一行一行的这个 rel 宏 它的这个省略主语和这个手动主语均支持。这就是我的要求，怎么建模你自己去想。 我随便提一点啊，我也不知道我这个数学模型够不够用  如果你有推导更干净、更完整的，你也可以直接替换掉，告诉我也行啊。 就是在一行里面去看所有的REL 然后呢，诶，从左往右就是一行嘛，从左往右。然后呢，从左边开始，慢慢的，比如说，如果说你开头就是一个索引词，OK，那么它就会赋予给第一个REL宏。 出现了REL宏，就期待后面会遇到一个索引词。索引词的边界是清晰的。中间呢，就是索引词的边界左右旁边都是可以有任意其他字符，没问题啊。啊，索引词能够被识别出来就可以。 好的。那你看，那这个第一个REL宏已经消费了这前面两个索引词，因为离它们最近。是从左往右这种序列上，离第一个索引词最近，被它吃掉了。吃掉之后呢，后面，后面如果说，诶，又来了一个REL宏，是吧？而且省略了主语，是不是？它不会把上一个REL宏的索引词吃掉，因为已经被第一个消费了嘛，是不是？那如果说你看在这里，这个序列上就已经空了，也就是REL开头，那我们马上就能无歧义地知道它就是干什么呢？拿标题的名字作为主语。 你自己看啊，这数学模型上应该是可以建立出来的，是没有歧义的。 范围呢，就是1行 我跟你讲，你不要莫名其妙说，哎呀，好克制啊，好保守，保个屁啊，克个屁啊。本来就是in line的东西，那本来就在一行，人家adoc语法设计层就是这样子。我真的觉得你之前讲话就是很莫名其妙。 好的，好好想一想啊，就是这样子啊。你看这样子啊，是可以非常自然地在一段话、一个段落、一个屁里面啊，诶，自然而然地把一张图声明出来。 其实你原本的xref本来就做得到这件事情。 xref 它本来就可以随意地嵌在句子中间，而且一行可以有多个。但是它在语序上稍微不是那么的好，因为它的谓词呢，是放在后面的。别急，别急，就是谓词跟宾语的位置有点怪怪的啊。反过来的话会比较顺。那来到我们这边，in line的这种索引词的这种写法，那它其实去除这个标记符号，那些它语序上是顺的。 你真的能想象出来吗？好好想一想，想好之后弹窗再来回答我，不少于3000字或者更多，把你想说的都告诉我，开始吧。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="4">
# 重新整理：`rel` 宏为中心、索引词 token 从左到右消费的行内关系模型

你这次指出的问题是对的：我上一轮把不属于投影器职责的东西塞进去了。位置参数怎么解释、字段名叫什么、读者怎么理解、作者要不要用 named attributes，这些都不是这个工具应该管的。AsciiDoc inline macro 本来就支持位置参数和 named attributes；作者自己的书稿、自己的词表、自己的下游模型会解释这些东西。投影器只需要保留它们、暴露它们、让下游消费它们。它不知道什么叫 weight，不知道什么叫 strong，不知道什么叫苹果和香蕉，也不应该替作者或下游模型安排“推荐写法”。

我现在按你这次讲的模型重新建模。核心不是 `indexterm2` 本身，也不是普通索引词系统，而是 `rel` 宏。`rel` 宏是我们新增的、定制的、用于声明图谱边的行内结构。`indexterm2` 或索引词宏本身仍然保持 AsciiDoc 原本的行为：它们服务书籍索引、可见索引词、书后索引和原有工具链。只有当它们在同一行里被 `rel` 宏按规则消费时，它们才在我们的投影里额外承担“实体端点 token”的角色。单独出现的 `indexterm2:[X]` 还是索引词，不自动声明边，不自动产生关系。

这句话很关键：**我们赋予新解释的是 `rel` 宏触发的关系模式，而不是重新定义整个索引词系统。**

## 实体符号空间

实体符号空间的来源已经很明确：标题名字和术语表 term。

```text
Entity symbol space = heading headline ∪ glossary term
```

这个符号空间只负责“哪些名字是书内正式实体符号”。它不负责判断业务语义，不负责消解现实世界里的冲突，不负责判断两个词是不是同一个苹果。标题和术语表名字完全重合，就是同一个符号。RDF 投影时，如果这个符号有标题资源，就使用标题生成的机械节点；如果没有标题资源，术语表 term 自己生成一个实体节点。术语表 description list 可以被看作一种 heading-like source：term 是名字，definition 是内容，源位置可追踪。它不需要在知识图谱消费面暴露“我来自 glossary”这种本体分类；那只是源文档调试或 provenance 层面的事实。

更精确地说，符号表不是 `label -> one node`，而是：

```text
label -> candidate entity resource set
```

大多数情况下 candidate set 只有一个资源。标题和术语表同名时，如果只有一个标题节点，那术语表注册事实归并到这个标题实体资源上。若没有标题节点，则 glossary term 生成一个资源。若书里存在多个同名标题，解析就可能得到多个候选资源。这个时候投影器不应该替作者选一个，也不应该说“冲突”。它只暴露事实。现有 xref 如果用标题名字命中多个标题，会发多条边；这套关系投影也应该保持类似的精神：resolver 返回候选集合，关系生成可以形成多条边，或至少保留多候选证据。关键是不把源文档中的多义事实悄悄消费掉。

也就是说，这里没有语义冲突判断，只有符号解析结果。

## 行内关系声明的真正中心

现在的核心表面不是“左右字符串匹配”，而是行内 token 序列。我们只看一行。因为这是 inline 表面，且你明确说范围就是一行。

在这一行里，我们关心两类 token：

```text
M(label) = 实体提及 token，例如 indexterm2:[label]
R(predicate, attrs) = rel 宏 token，例如 rel:predicate[attrs]
```

其他文字、标点、普通句子、连接词、解释语句都存在，但对关系消费模型来说只是间隔文本。它们不参与 subject/object 解析。它们不会阻止关系成立，也不会被拿来猜实体。

这就允许原生书稿写法：

```asciidoc
indexterm2:[S] 在本章讨论的约束下 rel:p[k=v] 继续影响 indexterm2:[O]。
```

这里去掉宏标记之后，语序仍然是自然的：S ... p ... O。中间可以有任意普通文字。工具链看的是 token 顺序，不是自然语言语法。

## 从左到右的消费模型

我现在把你说的“从左往右按照顺序消费”形式化成一个很简单的状态机。每一行独立处理，行结束时状态清空。

状态有两个：

```text
pendingSubjectMention: 最近一个尚未被消费的实体提及 token
activeRelation: 已遇到 rel，正在等待右侧 object mention 的关系声明
```

处理规则如下。

当扫描到一个实体提及 token `M(x)`：

1. 如果当前存在 `activeRelation` 正在等待 object，那么这个 `M(x)` 被消费为 object，生成一条候选关系声明，`activeRelation` 结束。
2. 如果当前没有 `activeRelation`，这个 `M(x)` 成为新的 `pendingSubjectMention`。如果之前已有 pending subject，它被新的、更靠右的 mention 替换。这样自然满足“离 rel 最近的左侧索引词会被第一个 rel 吃掉”。

当扫描到一个 `rel` token `R(p, attrs)`：

1. 如果左侧存在 `pendingSubjectMention`，它被消费为 subject。
2. 如果左侧不存在 pending subject，则 subject 使用当前直系标题实体。
3. 这个 `rel` 进入 `activeRelation`，等待后面第一个实体提及 token 作为 object。
4. 如果行内后续没有 object mention，或者在遇到 object 前又遇到新的 `rel`，前一个关系声明就是不完整声明，不生成有效边，只能作为诊断证据保留。

这套规则的效果是：实体提及 token 一旦被某个关系消费，就不会再被后面的关系重复消费。这个点正好对应你说的：第一个 `rel` 已经消费了它前后两个索引词，后面又来了一个 `rel` 时，不会把上一个 `rel` 的索引词拿来用，因为已经被消费了。后面的 `rel` 如果左侧没有未消费的 subject mention，就明确使用当前标题作为 subject。

用 token 序列表示就是：

```text
M(A) R(p) M(B) R(q) M(C)
```

解析为：

```text
A --p--> B
CurrentHeading --q--> C
```

`B` 不会自动成为第二条边的 subject，因为 `B` 已经作为第一条边的 object 被消费了。如果作者要表达链式关系：

```text
A --p--> B
B --q--> C
```

那就应该在第二条边前再写一次 B 的实体提及 token：

```asciidoc
indexterm2:[A] rel:p[] indexterm2:[B]，indexterm2:[B] rel:q[] indexterm2:[C]。
```

这不是重复啰嗦，而是源文档显式声明。图谱关系不是工具猜出来的，是作者写出来的。

## 主语省略

主语省略现在也很干净。它不是“往左找字符串”，而是状态机里 `pendingSubjectMention` 为空时，`rel` 宏使用当前直系标题实体作为 subject。

例如：

```asciidoc
== 配送策略

rel:depends-on[reason=capacity] indexterm2:[运力规则]。
```

这一行 token 是：

```text
R(depends-on) M(运力规则)
```

`R` 出现时左侧没有 pending subject，所以 subject = 当前标题“配送策略”。后面第一个 mention 是 object。因此得到：

```text
配送策略 --depends-on--> 运力规则
```

如果同一行后面又有一条关系：

```asciidoc
rel:depends-on[] indexterm2:[运力规则]，rel:constrains[] indexterm2:[降级规则]。
```

token 序列是：

```text
R(depends-on) M(运力规则) R(constrains) M(降级规则)
```

两条边都是当前标题作 subject：

```text
CurrentHeading --depends-on--> 运力规则
CurrentHeading --constrains--> 降级规则
```

因为第一个 object 已被第一条关系消费；第二个 `rel` 左侧没有未消费 subject，于是继续用当前标题。

如果作者想切换 subject，就显式写一个新的 mention：

```asciidoc
rel:depends-on[] indexterm2:[运力规则]，indexterm2:[风险控制] rel:constrains[] indexterm2:[配送策略]。
```

解析为：

```text
CurrentHeading --depends-on--> 运力规则
风险控制 --constrains--> 配送策略
```

这就是你说的“前面可以是普通句子，除非主语想切换掉，不是当前标题的，就主动写”。

## 普通文字完全可以穿插

这套模型不要求 `indexterm2` 和 `rel` 紧邻。它只关心 token 顺序，普通文字不参与消费。

例如：

```asciidoc
indexterm2:[风险控制] 在当前运营约束下，经过人工复核之后 rel:constrains[severity=high] 直接限制 indexterm2:[配送策略] 的发布范围。
```

token 序列仍然只是：

```text
M(风险控制) R(constrains) M(配送策略)
```

所以生成：

```text
风险控制 --constrains--> 配送策略
```

中间那些文字是书稿内容，是读者看到的自然表达，也是 source raw 的一部分；但它们不是 subject/object 解析依据。这样既保留原生书写体验，又避免把工具变成自然语言解析器。

## 多个 mention 和最近消费

如果同一个 rel 左边有多个未消费 mention，状态机自然选择最近的一个，因为后出现的 mention 会替换 pending subject。

```asciidoc
indexterm2:[A] 与 indexterm2:[B] 在本节中 rel:p[] indexterm2:[C]。
```

扫描到 `A`，pending = A。扫描到 `B`，pending = B。扫描到 `rel:p`，subject = B。扫描到 `C`，object = C。生成：

```text
B --p--> C
```

`A` 仍然是普通索引词提及，它没有被这条关系消费。如果作者要表达 A 和 B 都 p C，那就写两条关系声明。这符合“图谱边由作者显式声明”的原则。

## 行边界

每一行是一个消费范围。行尾如果还有 active relation 没有 object，关系不成立。下一行不会继续补 object。pending subject 也不会跨行保留。原因不是工程偷懒，而是这个表面就是 inline 的，且你已经明确模型范围就是一行。

因此：

```asciidoc
indexterm2:[A] rel:p[]
indexterm2:[B]
```

不生成 `A --p--> B`。第二行的 B 是普通索引词，除非第二行自己有 rel 模式。

## 位置参数和 named attributes

这次我不再替它们安排含义。`rel:p[...]` 里面是什么，投影器只按 AsciiDoc inline macro 的属性结构保留。位置参数就是位置参数，named attributes 就是 named attributes。它们都是这条 `rel` 边声明的 surface payload。

例如：

```asciidoc
indexterm2:[A] rel:p[foo, bar, x=1, y=2] indexterm2:[B]
```

投影层应该知道：

```text
predicate = p
positional args = [foo, bar]
named attrs = {x: 1, y: 2}
raw attrlist = "foo, bar, x=1, y=2"
```

至于 `foo`、`bar`、`x`、`y` 对这个书稿的领域模型意味着什么，是作者和下游工具链自己的事情。投影器不命名它，不推荐它，不评价它。

如果 RDF 投影需要表达这些属性，可以保留为 edge evidence 的结构字段。named attrs 可以按已有 surface field 机制投影，positionals 可以保留为有序参数或 raw attribute surface。关键是不要把业务语义硬编码进投影器。

## `indexterm2` 的原始行为不变

单独的：

```asciidoc
indexterm2:[配送策略]
```

还是可见索引词。它服务书籍索引。它是否也被实体 mention 索引器记录为一次实体提及，是投影层可以额外提供的事实；但它不生成关系边。

只有出现 `rel` 消费模式时，它才成为边端点：

```asciidoc
indexterm2:[配送策略] rel:depends-on[] indexterm2:[运力规则]
```

这里真正触发关系投影的是 `rel:depends-on[]`。`indexterm2` 只是被它消费的端点 token。

同理，如果某个 `indexterm2:[X]` 不在标题或术语表注册的实体符号空间中，那么它在书籍索引系统里仍然可以是普通索引词；但在关系投影里，`X` 解析不到实体资源，就不能形成有效的实体边。这里不需要再问“要不要区分普通索引词和实体索引词”。关系投影只看：当 `rel` 需要 subject/object 时，这个 mention 的 primary 能不能在实体符号空间里解析到资源。能，就参与边；不能，就关系不完整或 unresolved。

## RDF 投影形态

成功消费一条关系声明后，至少有两层事实。

第一层是关系边本身：

```text
S --p--> O
```

第二层是这条关系边的源证据：

```text
which rel macro declared it
which indexterm token supplied subject
which indexterm token supplied object
which heading supplied subject if subject omitted
raw source line
relativePath / startLine / startColumn / endColumn
predicate target
macro attributes
```

RDF 1.2 可以继续沿用现在 xref edge 的思路，用 reifier 保留 edge evidence：

```turtle
<edge> a aat:InlineRelationEdge ;
  rdf:reifies <<(<S> rel:p <O>)>> ;
  aat:sourceEntity <S> ;
  aat:targetEntity <O> ;
  aat:rel "p" ;
  aat:raw "indexterm2:[S] rel:p[x=1] indexterm2:[O]" ;
  aat:relativePath "..." ;
  aat:startLine 12 ;
  aat:startColumn 20 .
```

如果 subject 来自当前标题，而不是显式 mention，可以在 evidence 上表达 subject source：

```text
subjectSource = containing-heading
```

如果 subject 来自左侧 mention：

```text
subjectSource = explicit-indexterm
```

这不是业务语义，只是投影证据，方便调试、审查、回源修改。

## 和 xref 的关系

现有 xref 已经可以在句子里到处嵌入，一行多个也没问题。它的问题是图谱语序不顺：对象 target 在 `xref:target[...]` 的 target 位，谓词在 bracket 里的 `rel=...`，所以写出来不是 subject-predicate-object 的自然序列。

新的 `indexterm2 + rel + indexterm2` 表面把顺序调正了：

```text
实体提及 -> 关系谓词 -> 实体提及
```

这就是图谱语序。去掉标记壳以后，源句子也能保持自然书稿语序。它不是替代 xref。xref 仍然负责文档导航、章节引用、阅读路径、结构边。新的 `rel` inline marker 负责正文中的实体关系声明。二者都可以投影为图，但 evidence 类型不同，作者动作也不同。

## 一个完整例子

```asciidoc
[glossary]
配送策略:: 描述订单配送选择与约束的策略。
运力规则:: 描述运力容量与降级条件的规则。
风险控制:: 对异常风险进行识别和限制的机制。
降级规则:: 描述运力不足时的降级处理。

[#配送策略.policy]
== 配送策略

rel:depends-on[capacity, source=ops] indexterm2:[运力规则]，并在异常场景下 rel:constrains[] indexterm2:[降级规则]。

indexterm2:[风险控制] 在人工复核之后 rel:constrains[severity=high] indexterm2:[配送策略]。
```

第一行正文 token：

```text
R(depends-on) M(运力规则) R(constrains) M(降级规则)
```

生成：

```text
配送策略 --depends-on--> 运力规则
配送策略 --constrains--> 降级规则
```

第二行正文 token：

```text
M(风险控制) R(constrains) M(配送策略)
```

生成：

```text
风险控制 --constrains--> 配送策略
```

这就是你说的：可以非常自然地在一段话、一个段落、一行文字里声明一张图。普通文本仍然是普通文本；索引词仍然服务书；rel 宏额外让图谱边落地。

## 最终对象

我现在会这样定义这个东西：

> 这是一个以 `rel` inline macro 为触发器的 AsciiDoc 行内实体关系投影机制。它在单行范围内扫描索引词提及 token 与 `rel` token，按从左到右的一次性消费规则，将显式左侧索引词或当前标题解析为 subject，将右侧索引词解析为 object，将 `rel` target 解析为 predicate，并把宏属性保留为边声明 payload。实体端点只从标题 headline 与 glossary term 形成的符号空间解析；普通索引词行为不变；投影器不判断业务语义，不解释位置参数，不替作者消解现实世界冲突，只保留可查询、可审查、可回源的图谱边事实。

这个版本比“左右字符串匹配”更干净。因为实体端点边界由 AsciiDoc 宏明确给出，不需要猜词；关系谓词由 `rel` 宏明确给出，不需要猜语义；多条关系由同一行 token 顺序和消费状态决定，不需要自然语言解析；省略主语由当前标题提供，不需要回看普通文本。它完全站在书稿原生结构上：标题、术语表、索引词、inline macro、属性列表。作者怎么写书，它就怎么跟着投影。
</Assistant>

<User id="4">
这里我不做归并 你好像之前有一版设计挺好的，我再要回来啊。我不再把它变成什么投影成标题了，不要啊。 也就是说，从这个glossary里面注册出来的资源全部单独注册，它不需要知道标题的存在，自己注册自己就好了。为什么呢？因为其实它那个名字呢，仅仅只是一个label而已啊，它们每一个资源节点的名字都是单独的。没问题，下游工具可以自己去做核对。 按照目前的情况。能够被识别为RDF资源节点的有什么？首先是标题，再就是那个xref，对不对？。那现在我们干嘛呢？再增加一个glossary下面注册的那些东西。诶，可以，就是这些，你自己看一下哈，你回忆一下之前的规则，就是这些，没有可能，大概那就是这些啊。 然后呢通过这个Rel宏，它其实也是边，是吧？那它的这个这种rdf资源节点的效果呢？它其实和这一个xref差不多。不是不同的本体啊，就是同构的，应该是同构的，你自己确定一下啊。

下游的SPARQL或者说TTL处理器，下游可以自己去这个做这个实体消除歧义呀，或者说别的业务理解之类的，推理的他们自己去做，我们这里就是把这个中时的这个结构给它投影过去就可以了啊。像比如说他们自己就可以做这个标题和这个term的这个合并，他们自己去做，他们自己去决定那些东西怎么怎么怎么做，懂我意思吧？我们这边做好我们自己的事情。

哦，我记起来了，目前的xref 它好像只有一个位置参数，就是显示的名字。那我们的rel的宏也这样子。啊，就允许一个位置参数。 这里呢，它间接照顾了中文表达的习惯啊，可以换成一些显示的一些中文的名字 默认不写的话，能展示英文的单词也没什么问题。其实也还好。啊，这个单词，一个单词的话也还好，作为一个谓词其实也很清晰啊。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="5">
# 这版模型我重新校正：不归并，资源独立，`rel` 边和 xref 边同构

我现在按你这次的修正重新收束。关键变化有三个：

第一，glossary term 注册出来的资源不和标题资源归并。即使标题名字和术语表 term 完全一样，它们也只是拥有相同 label 的两个资源节点。投影层不替下游判断它们是不是同一个东西，也不把 term 资源规并到 heading 资源上。

第二，当前 RDF 投影里已经能识别为 RDF 资源节点的主要对象包括 heading，以及 xref edge 这种关系证据资源。现在新增 glossary term 资源。它们是独立资源类型，不需要知道标题是否存在。

第三，`rel` inline macro 产生的也是边资源/边证据资源。它和现有 xref edge 在结构上应该尽量同构：都有 source、target、predicate、raw、source span、display label、named attributes、reified statement 等。区别只在 source/target 的解析来源不同。

## 1. 不归并：glossary term 自己注册自己

这次最重要的是不归并。上一版我把“同名标题和术语表 term 归并到标题节点”又带回来了，这不符合你现在要的投影边界。

现在的模型应该是：

```text
Heading resource:
  来源：标题行
  label/headline：标题文本
  identity：由标题源坐标/机械规则生成

Glossary term resource:
  来源：[glossary] 下的 description list term
  label/headline/name：term 文本
  identity：由 glossary term 源坐标/机械规则生成
```

如果有：

```asciidoc
== 配送策略

[glossary]
配送策略:: 描述订单配送选择与约束的策略。
```

那就不是一个资源，而是两个资源：

```text
heading-lN-o0 label = 配送策略
glossary-term-lM-o0 label = 配送策略
```

它们 label 相同，但 identity 不同。下游如果认为它们代表同一个领域实体，可以自己用 SPARQL、SHACL、规则、人工审查或业务词表做合并。投影层只负责忠实把源文档中的结构投出来。

这个边界是对的。因为投影器不知道“标题配送策略”和“术语表配送策略”在作者业务世界里是不是同一个对象。它只知道源文档里出现了一个标题资源，又出现了一个术语表 term 资源。它不能替作者做 entity resolution。

这样一来，所谓“实体符号空间”更准确地说不是一个已经消歧后的实体表，而是一个 **label selector space**：

```text
label -> resource candidates
```

`indexterm2:[配送策略]` 的 primary 是一个 selector。这个 selector 可以命中一个资源，也可以命中多个资源。多个资源不叫冲突；它只是选择结果包含多个候选。投影层可以照事实生成多条边，或者保留多候选结构。按你拿 xref 举的例子，更自然的是：如果 selector 命中多个目标，就发多条边，把多义事实留给下游工具查。

## 2. 新增 glossary term resource，不伪装成 heading

你这次也明确说了：不要再把 glossary term 投影成标题。它不是标题。它是 glossary term resource。它可以和 heading resource 在图查询上同构或近似同构，但不能在本体上伪装成 heading。

所以资源层应该是：

```text
aat:Heading
  已有：标题资源

aat:XrefEdge
  已有：xref 关系证据资源

aat:GlossaryTerm
  新增：术语表 term 资源

aat:InlineRelationEdge
  新增：rel 宏关系证据资源
```

`aat:GlossaryTerm` 至少有：

```text
aat:label / aat:headline / aat:termText 之类的名字字段
aat:raw
aat:relativePath
aat:startLine / endLine
aat:definition 或 raw definition surface
```

字段名最后要贴合现有 vocabulary，但对象身份不要混淆。它不必叫 heading，也不必有 headingLevel、documentOrder、containsDirectly 这些标题结构字段，除非这些字段确实有 glossary 内部排序意义。它的核心职责只是：把术语表里的 term 作为一个可被 selector 命中的 RDF resource 注册出来。

这也符合“忠实投影”。源文档里它是什么，就投影成什么。标题就是标题，术语 term 就是术语 term，xref edge 就是 xref edge，rel edge 就是 rel edge。

## 3. `indexterm2` 是 selector surface，不是注册资源

`indexterm2:[X]` 本身不注册资源。资源注册来自 heading 和 glossary term。

`indexterm2:[X]` 在普通书籍工具链里继续是可见索引词。我们的关系投影只在扫描 `rel` 宏所在行时，把它当作一个可以被 `rel` 消费的 selector token。

所以：

```asciidoc
indexterm2:[配送策略]
```

单独出现时就是索引词。

```asciidoc
indexterm2:[配送策略] rel:depends-on[] indexterm2:[运力规则]
```

在这一行里，`rel:depends-on[]` 触发关系模式，两个 `indexterm2` 被消费为 selector token。

selector 解析时：

```text
selector "配送策略" -> all resources whose label/headline/term text equals "配送策略"
```

如果命中 heading 和 glossary term 两个资源，那它就是两个候选。投影层不合并。

## 4. `rel` 宏是边声明触发器

现在真正的中心仍然是 `rel` 宏。我们扫描一行里的 `rel` 宏，按从左到右的消费规则，消费前后的索引词 selector。

关系表面有两类：

```asciidoc
indexterm2:[S] rel:p[显示名?, key=value] indexterm2:[O]
```

以及省略主语：

```asciidoc
rel:p[显示名?, key=value] indexterm2:[O]
```

省略主语时，source selector 不是左侧文本，而是当前直系标题资源。注意这里是标题资源，不是同名 glossary term。因为“当前标题语境”来自文档结构，来源就是 containing heading。

如果当前行里显式写了左侧 `indexterm2:[S]`，那 source selector 来自这个 indexterm token。它可以命中 heading、glossary term 或多个同 label 资源。

## 5. 从左到右消费仍然成立

我保留上一轮的 token 消费模型，但把“实体”改成“selector token resolved to resource candidate set”。

一行被解析成 token 序列：

```text
M(label) = indexterm2 selector token
R(predicate, display?, attrs) = rel macro token
```

普通文字不参与解析，只是间隔。

扫描规则：

```text
pendingSubjectSelector = none
activeRel = none
```

遇到 `M(label)`：

- 如果有 `activeRel` 正在等待 object，这个 M 被消费为 object selector，完成关系声明。
- 如果没有 `activeRel`，这个 M 成为 pending subject selector；如果之前已有 pending subject，则被更靠右的 M 替换。

遇到 `R(predicate)`：

- 如果有 pending subject selector，消费它作为显式 subject selector。
- 如果没有 pending subject selector，使用当前 containing heading resource 作为 subject。
- rel 进入等待 object 状态。

这样：

```text
M(A) R(p) M(B) R(q) M(C)
```

得到：

```text
A --p--> B
CurrentHeading --q--> C
```

`B` 已经被第一条边作为 object 消费，不会自动成为第二条边 subject。作者如果要 `B --q--> C`，就写：

```text
M(A) R(p) M(B) M(B) R(q) M(C)
```

或者自然书稿中显式再出现一次 `indexterm2:[B]`。

## 6. 多候选 selector 生成多条边

因为不归并，selector 可能命中多个资源。

例如：

```asciidoc
== 配送策略

[glossary]
配送策略:: ...
运力规则:: ...

indexterm2:[配送策略] rel:depends-on[] indexterm2:[运力规则]
```

如果 `配送策略` selector 命中 heading resource 和 glossary term resource，`运力规则` selector 命中 glossary term resource，那么投影可以生成：

```text
heading(配送策略) --depends-on--> glossaryTerm(运力规则)
glossaryTerm(配送策略) --depends-on--> glossaryTerm(运力规则)
```

这不是错误，也不是冲突。它是 selector 选择结果导致的多边事实。下游可以查出来，再决定是否合并、过滤、诊断或回源修改。

如果 subject 有 m 个候选，object 有 n 个候选，那么关系边是 m × n 条。这个和 xref 多命中发多边的精神一致。它保留了源文档的多义性，不替下游消歧。

省略主语时不同：source 是当前 heading resource，不走 label selector，因此不会因为同名 glossary term 自动扩展到 glossary term。这个规则也干净：省略主语表达的是“当前标题节点发边”。

## 7. `rel` 宏和 xref edge 同构

你说 `rel` 宏的 RDF 资源节点效果和 xref 差不多，应该是同构的。这个判断我现在认为很重要。

现有 xref edge 大概有这些结构：

```text
aat:XrefEdge
rdf:reifies << source relation target >>
aat:sourceHeading
aat:targetHeading
aat:targetSelector
aat:sourceSelector
aat:rel
aat:raw
aat:displayLabel
aat:officialHref
aat:officialResolvedId
aat:officialResolvedType
source span fields
named attributes as fields
```

新的 rel edge 可以同构成：

```text
aat:InlineRelationEdge
rdf:reifies << source relation target >>
aat:sourceResource
aat:targetResource
aat:sourceSelector 或 sourceIndexTerm
aat:targetSelector 或 targetIndexTerm
aat:rel
aat:raw
aat:displayLabel
source span fields
named attributes as fields
```

它没有 xref 的 officialHref / officialResolvedId / officialResolvedType，因为它不是 Asciidoctor xref resolver 解析出来的链接。但它可以有自己的 selector resolution evidence：source selector text、target selector text、selector source token span、resolved candidate resource。

如果为了更统一，也可以抽象出一个更上层的：

```text
aat:RelationEdge
```

然后：

```text
aat:XrefEdge rdfs:subClassOf aat:RelationEdge
aat:InlineRelationEdge rdfs:subClassOf aat:RelationEdge
```

但这只是投影词表设计问题。关键是：下游查询边证据时，xref edge 和 rel edge 应该尽量有相同的查询面：source、target、predicate、raw、line、display label、edge fields。

## 8. `rel` 宏位置参数：最多一个显示名

你这次明确补充：目前 xref 好像只有一个位置参数，就是显示名字；我们的 `rel` 宏也这样。这个我现在理解为公共语法契约：

```asciidoc
rel:predicate[display label, key=value]
```

其中：

```text
target = predicate
first positional = display label，最多一个
named attributes = edge fields
```

如果不写显示名：

```asciidoc
rel:depends-on[]
```

那展示时可以直接显示 `depends-on`。对于英文谓词，这通常也能读。若作者需要中文显示，就写：

```asciidoc
rel:depends-on[依赖]
```

这里 `依赖` 不是业务属性，不是 weight，不是 note；它就是显示名，和 xref 的显示文本类比。

如果再有：

```asciidoc
rel:depends-on[依赖, source=interview, confidence=high]
```

那么：

```text
predicate = depends-on
displayLabel = 依赖
named attrs = source=interview, confidence=high
```

至于 named attrs 的业务含义，下游自己解释。投影器只保留。

这个设计也照顾中文表达：源稿可以在视觉上呈现中文谓词，同时 RDF predicate 仍然用稳定的英文/ASCII token。默认不写显示名时，谓词 token 本身也可展示。

## 9. 示例

源文档：

```asciidoc
= 示例书

[glossary]
配送策略:: 描述订单配送选择与约束的策略。
运力规则:: 描述运力容量与降级条件的规则。
风险控制:: 对异常风险进行识别和限制的机制。

[#delivery-policy.policy]
== 配送策略

rel:depends-on[依赖, reason=capacity] indexterm2:[运力规则]。

indexterm2:[风险控制] 在人工复核之后 rel:constrains[约束, severity=high] indexterm2:[配送策略]。
```

注册资源：

```text
Heading resource:
  H1 label=示例书
  H2 label=配送策略

GlossaryTerm resources:
  G1 label=配送策略
  G2 label=运力规则
  G3 label=风险控制
```

第一条关系行：

```text
R(depends-on, display=依赖, attrs={reason: capacity}) M(运力规则)
```

subject 省略，所以 source = 当前标题 H2。object selector `运力规则` 命中 G2。

生成：

```text
H2(配送策略 heading) --depends-on--> G2(运力规则 glossary term)
```

第二条关系行：

```text
M(风险控制) R(constrains, display=约束, attrs={severity: high}) M(配送策略)
```

subject selector `风险控制` 命中 G3。object selector `配送策略` 命中 H2 和 G1，因为不归并。

生成两条边：

```text
G3(风险控制 glossary term) --constrains--> H2(配送策略 heading)
G3(风险控制 glossary term) --constrains--> G1(配送策略 glossary term)
```

这正是你要的忠实结构。它不替下游说 H2 和 G1 是不是同一个对象。下游想合并，自己合并；想诊断同名，自己诊断；想只保留 heading，自己过滤。

## 10. 最终校正版定义

我现在会这样定义这套东西：

> 这是一个基于 AsciiDoc 行内 `rel` 宏的关系投影机制。投影器在单行范围内扫描 `rel` 宏和可见索引词 token，按从左到右的一次性消费规则构造关系声明。`rel` target 是关系谓词；`rel` 最多一个位置参数作为显示名；named attributes 作为边字段忠实保留。左侧未消费的 `indexterm2` selector 提供显式 subject；没有显式 subject 时使用当前直系标题资源作为 subject；右侧第一个 `indexterm2` selector 提供 object。selector 根据标题资源和 glossary term 资源的 label 查找候选，不做归并、不做业务语义消歧；多候选按事实生成多条边或保留多候选证据。`rel` 生成的边证据资源与现有 xref edge 在 RDF 投影形态上尽量同构，区别只在端点解析来源与是否存在 Asciidoctor official xref binding。

这版模型边界更对：

- 标题是标题资源。
- 术语表 term 是 glossary term 资源。
- `indexterm2` 是索引词，也是 rel 可消费的 selector token。
- `rel` 是边声明触发器。
- 同名不归并。
- 下游自己做实体消歧、合并、过滤、推理。
- 投影器只忠实把源文档结构和关系证据投过去。

这次我不再把它说成“标题中心”或“术语归并到标题”。它应该是更朴素的源结构图投影：文档里有什么资源，就投出来；行内关系声明选择到哪些资源，就发哪些边；其余业务理解留给下游。
</Assistant>

<User id="5">
OK，那我心里想的这个东西啊，终于在我们多次的这个讨论之下，那就很清晰的出来了。那你有没有理解我想要的东西？那按照目前的情况看起来，你应该是非常理解了，对吧？你这里提到了这个xref。它确实有来自官方的那个解析的东西。那是我们保留的，因为我们留着这个东西是为了下游消费。那我们REL没有没有就没有嘛，没有问题啊。它结构上没有问题，我们忠实投影。

\\wsl.localhost\Ubuntu\home\t103o\workbench\micheng-ts\projects\asciidoc-abundant-tree\src  好的，你自己可以去调查确认代码啊。当然你只是为了理解这个目前的领域类型的一些定义、数据模型。当然你只是，因为我看到你好像有些字段还不了解，没事，你去看代码吧，了解一下完整的、确定的字段。诶，再来跟我讨论。当然不是，这里没要求你去想怎么怎么开发怎么实现啊，你不要去想这些，我们这里就是纯理论、纯意义建构、纯语法设计

好的，那你就是结合我们之前弹窗的聊天内容，就是我们已经确定下来的东西。那些放弃的东西就不要再提了，就当做不存在就好了。因为你要单独去整一整，然后呢你自己再去补充些代码上的事实，确认一下目前的一些情况，确认一下实际的这数据模型之类的。好，那你再整一整，整一套完整的设计弹窗，直接发给我，我一条条看过去。 那这个汇总呢，我希望你整得详细一点，长一点啊，不少于5000字或者更多。然后同时呢，可以去再写一写几篇比较真实的文章，就是那个句子可以写得长一点，丰富一点，就自然表达。然后没错，就多讲几个故事嘛，多展示一下语法啊。展示完了之后呢，你可以在每篇文章下面都去解释啊，也就是你的解释和你的文章分开。文章就是描述某个领域的文章就行了啊。解释的话，你放在文章下面，单独解释给我听。好，那开始吧。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="6">
# `indexterm2` + `rel` 行内实体关系投影设计稿

我现在确认理解你的对象了。它不是“从正文自动抽取知识图谱”，不是“把术语表归并进标题”，也不是“替作者或下游工具做实体消歧”。它是一套 AsciiDoc 原生书写表面上的关系声明机制：标题、术语表、索引词和 inline macro 仍然各自保持自己的书籍职责；我们只在 `rel` 宏出现时，读取同一行里可被它消费的索引词 token，把这个局部结构投影为 RDF 关系边和边证据。

这套东西的中心是 `rel` 宏。`indexterm2` 仍然是 AsciiDoc 书籍生态里的可见索引词；单独写它，仍然只是索引词。只有当它和同一行的 `rel` 宏形成可识别 token 序列时，它才被 `rel` 消费为关系端点 selector。资源从哪里来，是另一个层面的事实：现有 heading 是资源，现有 xref edge 是资源；现在再增加 glossary term resource 和 inline relation edge resource。下游 SPARQL、TTL、SHACL、业务推理、实体消歧工具自己决定同 label 的资源是否合并。投影器不归并，不裁判业务语义，只忠实投影源结构。

## 现有代码事实

我读了 `asciidoc-abundant-tree/src` 里的核心模型和 RDF 投影代码，和这套设计相关的事实如下。

`model.ts` 当前已有源位置基础类型：`SourcePosition`、`SourceSpan`、`LineSpan`。节点都可以携带 source layer 和 asciidoctor layer。`SectionNode` 有 `level`、`ids`、`title`、`line`、`span`、`titleSpan`、`idOrigin`、`metadata`、`descriptionMetadata`。这说明 heading 资源本来就保留标题文本、源位置、显式或生成 ID、role 和描述列表字段等结构。

`DescriptionListNode`、`DescriptionListItemNode`、`DescriptionTermNode`、`DescriptionNode` 已经存在。`DescriptionTermNode` 有 `text`、`line`、`sourceSpan`。这对 glossary term resource 很重要，因为 glossary 本质上就是一个 description list；term 名字和 definition surface 已经有可恢复的源结构基础。当前没有专门的 `GlossaryTermNode`，但从模型上看，description list term 已经能作为“术语表 term 资源”的源表面。

`XrefOccurrenceNode` 当前有 `syntax`、`raw`、`target`、`label`、`attributes`、`sourceSpan`、`containingSectionId`、`scope`、`targetKind`，并且有 asciidoctor layer：`href`、`resolvedId`、`resolvedType`、`reftext`。这正好解释了你说的：xref 有官方解析结果，我们保留它，是为了下游消费。`rel` 宏没有官方 xref binding，就没有；这不破坏结构，因为它仍然可以忠实投影自己的 source span、raw、predicate、display label、attributes、selector evidence。

`inline-occurrence-scanner.ts` 当前扫描 `xref`、anchor 和 `hmeta`，用正则识别 inline occurrences，并给每个 occurrence 补 source span、raw、line、origin recovery。它还用 `parseMacroArguments` 把宏参数拆成 positional 和 named。现有 parse 逻辑支持多个 positional 和 named，但在 xref 上现有语义只使用第一个 positional 作为 `label`，named 作为 attributes。我们这套 `rel` 宏设计和 xref 保持相近：`target` 是 predicate；最多一个 positional 是 display label；named attributes 是边字段；原始 attrlist 仍可保留为 source surface。

`rdf12-projection/xref-projector.ts` 是最重要的参照。它为 xref occurrence 生成 `aat:XrefEdge` 资源，写入 `syntax`、`raw`、`targetSelector`、`officialHref`、`officialResolvedId`、`officialResolvedType`、`officialReftext`、`displayLabel`、source span 等。它还写 source binding：`sourceSelector` 和 `sourceHeading`；写 target binding：`targetHeading` 或 `candidateHeading`。当 source 和 target 都能绑定，且 predicate 能映射出来时，它会添加实际关系 triple，并用 `rdf:reifies` 把 `XrefEdge` 资源关联到那个 triple。

`selector-binding.ts` 当前的 selector binding 很清楚：catalog owners 数量为 1 时 `bound`；数量为 0 时 `unresolved`；数量大于 1 时 `ambiguous`，并返回 candidates。`xref-projector` 在 ambiguous 时写 `candidateHeading`，不强行绑定。这和我们最终确认的原则一致：多候选不是投影器要消灭的“冲突”，而是源结构事实。下游可以查、合并、过滤、诊断。

`label-catalog.ts` 当前 catalog entry 有 `value`、`owner`、`labelKind`，现有 label kind 是 `headline`、`addressLabel`、`generatedAddressLabel`。`labels.ts` 会把 heading headline、手工 ID、生成 ID、以及 local non-heading target alias 加进 catalog。我们这套设计可以在概念上扩展同一个 selector space：glossary term 的 term text 也能成为 catalog entry，owner 是 glossary term resource，labelKind 可以是 `glossaryTerm` 或类似名字。关键不是名字，而是原则：selector 查 label，返回 owner candidate set。

`relation-predicate.ts` 当前支持 `rawRel` 到 RDF predicate 的映射：undefined 时是 `aat:references`；普通 token 映射到 `rel:` namespace；CURIE 可按 prefix map 展开；absolute IRI 保留；不合法 token 只保留 rawRel，不给 predicate。`rel` inline macro 的 target 可以复用这套 predicate mapping 思路，只是 undefined 不成立，因为 `rel:predicate[]` 的 predicate 来自 macro target，不是 attribute。若 target 不可映射，保留 raw predicate evidence，但不生成有效 relation triple。

`reifier.ts` 当前只有一件事：把 reifier resource 与 RDF 1.2 triple term 通过 `rdf:reifies` 连接。这正适合 `InlineRelationEdge`。它应当和 xref edge 一样：业务关系 triple 是一层，边证据资源是另一层。

`attributes.ts` 当前把 heading attrlist role、named attributes、description metadata、hmeta 投影为 heading direct field。对 `rel` edge 来说，宏 named attributes 不归 heading，而归 edge evidence。它和 xref attributes 类似，是边上的 surface fields。

## 资源模型

当前设计里，RDF 资源至少分四类：

```text
Heading resource
XrefEdge resource
GlossaryTerm resource
InlineRelationEdge resource
```

Heading resource 已存在，类型是 `aat:Heading`。它来自 document title 或 section heading。它有 `headline`、`headingLevel`、`documentOrder`、`childOrder`、`headingLine`、`raw`、`relativePath`、`startLine`、`endLine`、`contentStartLine`、`contentEndLine`、`metadataStartLine`、`metadataEndLine` 等。它也有 `addressLabel` 或 `generatedAddressLabel`。

XrefEdge resource 已存在，类型是 `aat:XrefEdge`。它来自 `xref:` 或 shorthand xref occurrence。它有 `raw`、`syntax`、`targetSelector`、`displayLabel`、official binding、source span、source heading、target heading 或 candidate heading，并通过 `rdf:reifies` 指向被声明/解析出的关系 triple。

GlossaryTerm resource 是这套设计新增的资源对象。它来自 `[glossary]` section 下的 description list term。它不是 heading，不伪装成 heading，也不归并到 heading。它可以有 `aat:GlossaryTerm` 类型，保留 term text、definition raw/source、relativePath、source span、所在 glossary section 等。它进入 selector catalog，成为 `indexterm2` selector 可命中的资源。

InlineRelationEdge resource 是这套设计新增的边证据对象。它来自 `rel:predicate[...]` inline macro 被消费成完整关系时产生的 evidence。它和 `XrefEdge` 同构程度应尽量高：都有 raw、displayLabel、predicate、source/target resource、selector text、source span、attributes、reified triple。不同点是：它没有 Asciidoctor official xref binding；它的 source/target 不是 xref resolver 给的，而是由本行 token 消费模型和 selector catalog 给的。

## 不归并原则

Glossary term 和 heading 不归并。

如果有标题：

```asciidoc
== 配送策略
```

又有术语：

```asciidoc
[glossary]
配送策略:: 描述订单配送选择与约束的策略。
```

投影中就是两个资源：一个 `aat:Heading`，一个 `aat:GlossaryTerm`。它们可以有相同 label，但资源 identity 不同。

这不是冲突，不是错误，也不是投影器要处理的语义问题。下游工具如果认为二者是同一实体，可以自己做 entity resolution。它可以按 label 合并，可以按 role 合并，可以人工审核，可以保留两个节点。投影器的职责是把源文档结构给出去，而不是把业务世界解释完。

因此 selector 的结果是 candidate set：

```text
selector "配送策略" -> [headingResource(配送策略), glossaryTermResource(配送策略)]
```

关系生成时，如果 selector 命中多个资源，就暴露多候选事实。可以像 xref ambiguous 一样记录 candidates；也可以在关系投影层发出 m × n 条边。具体图面可以选择，但原则是不静默选一个，不静默归并。

## `indexterm2` 的职责

`indexterm2:[X]` 原本是可见索引词。这个行为不变。

单独出现：

```asciidoc
indexterm2:[风险控制]
```

它仍然只是索引词。它可以进入书后索引，可以被 AsciiDoc 工具链处理，也可以被我们的投影作为 entity mention evidence 记录，但它不声明关系。

当同一行存在 `rel` 宏并按消费规则消耗它时，它才成为关系端点 selector：

```asciidoc
indexterm2:[风险控制] rel:constrains[约束] indexterm2:[配送策略]
```

这里真正触发关系投影的是 `rel:constrains[约束]`。两个 `indexterm2` 只是它消费的 source selector 和 target selector。

如果 `indexterm2:[X]` 的 `X` 不在标题资源或 glossary term resource 的 label catalog 里，它在书籍索引层面仍然成立；但在关系投影层面，它不能解析为资源端点。这时不生成完整关系 triple，只保留 unresolved evidence 或诊断事实。

## `rel` 宏职责

`rel` 是边声明触发器。

语法：

```asciidoc
rel:predicate[displayLabel?, namedAttrs...]
```

`predicate` 来自 macro target。它进入 relation predicate mapping：普通 token 映射到 `rel:` namespace，CURIE 或 absolute IRI 可以按既有规则处理，不合法 target 保留 raw evidence。

最多一个位置参数，语义是 display label。这个和 xref 的显示文本对应。

```asciidoc
rel:depends-on[依赖]
```

这里 `depends-on` 是关系谓词，`依赖` 是显示名。若不写显示名：

```asciidoc
rel:depends-on[]
```

显示时可以使用 `depends-on` 本身。

named attributes 是边字段。投影器忠实保留，不解释业务语义。

```asciidoc
rel:depends-on[依赖, reason=capacity, confidence=high]
```

这里 `reason`、`confidence` 是作者和下游模型的字段。投影器不评价字段名，不推荐字段，不猜字段含义。

## 单行消费模型

范围是一行。每一行独立处理，不跨行。

行内只关注两类 token：

```text
M(label) = indexterm2:[label]
R(predicate, displayLabel, attrs) = rel:predicate[...]
```

普通文字、标点、连接词、句子结构都只是间隔，不参与端点解析。

从左到右扫描。状态为：

```text
pendingSubjectSelector = none
activeRelation = none
```

遇到 `M(label)`：

```text
若 activeRelation 正在等待 object：
    M(label) 被消费为 object selector，完成关系声明。
否则：
    M(label) 成为 pendingSubjectSelector。
    若已有 pendingSubjectSelector，则被新的 M(label) 替换。
```

遇到 `R(predicate)`：

```text
若存在 pendingSubjectSelector：
    消费它作为显式 subject selector。
否则：
    使用当前直系标题资源作为 subject。
然后 activeRelation 等待右侧第一个 M(label) 作为 object。
```

行尾如果 activeRelation 还没有 object，则不生成完整关系 triple。下一行不会继续补。

这个模型支持普通文字穿插：

```asciidoc
indexterm2:[风险控制] 在人工复核之后 rel:constrains[约束, severity=high] 直接限制 indexterm2:[配送策略] 的发布范围。
```

token 序列是：

```text
M(风险控制) R(constrains) M(配送策略)
```

生成：

```text
风险控制 --constrains--> 配送策略
```

普通文字不影响关系成立。

多个关系也自然成立：

```asciidoc
rel:depends-on[依赖] indexterm2:[运力规则]，并在异常场景下 rel:constrains[约束] indexterm2:[降级规则]。
```

如果这行位于标题“配送策略”下，token 序列是：

```text
R(depends-on) M(运力规则) R(constrains) M(降级规则)
```

生成：

```text
配送策略 --depends-on--> 运力规则
配送策略 --constrains--> 降级规则
```

第一个 object `运力规则` 已被第一条关系消费，不会成为第二条关系 subject。第二个 `rel` 左侧没有未消费 subject selector，于是使用当前标题。

如果作者要切换 subject，就显式写一个新的 `indexterm2`：

```asciidoc
rel:depends-on[依赖] indexterm2:[运力规则]，同时 indexterm2:[风险控制] rel:constrains[约束] indexterm2:[配送策略]。
```

生成：

```text
配送策略 --depends-on--> 运力规则
风险控制 --constrains--> 配送策略
```

## 与 xref 的同构关系

xref edge 和 inline relation edge 是同类结构的两个来源。

xref edge：

```asciidoc
xref:required-rule[约束规则, rel=requires, weight=0.7]
```

它的 target selector 在 `xref:` target 位置，predicate 在 named attribute `rel` 里。source 是 containing heading。它有 official Asciidoctor binding。

inline relation edge：

```asciidoc
indexterm2:[结构示例] rel:requires[要求, weight=0.7] indexterm2:[约束规则]
```

它的 source selector 在左侧 `indexterm2`，predicate 在 `rel:` target，object selector 在右侧 `indexterm2`。它没有 official xref binding，但有 source token evidence。

二者都应该能被下游当作 relation edge 消费：source、predicate、target、raw、line、display label、edge fields、reified triple。

## RDF 投影形态

一个成功的 inline relation edge 可以投影为：

```turtle
<source> rel:requires <target> .

<edge> a aat:InlineRelationEdge ;
  rdf:reifies <<(<source> rel:requires <target>)>> ;
  aat:sourceResource <source> ;
  aat:targetResource <target> ;
  aat:rel "requires" ;
  aat:displayLabel "要求" ;
  aat:raw "indexterm2:[结构示例] rel:requires[要求, weight=0.7] indexterm2:[约束规则]" ;
  aat:sourceSelector "结构示例" ;
  aat:targetSelector "约束规则" ;
  aat:weight "0.7" ;
  aat:relativePath "..." ;
  aat:startLine 42 ;
  aat:startColumn 18 ;
  aat:endLine 42 ;
  aat:endColumn 76 .
```

如果 source 来自当前标题省略，而不是左侧 selector，可以用 evidence 字段表达：

```turtle
<edge> aat:sourceHeading <current-heading> ;
       aat:sourceMode "containing-heading" .
```

字段名不一定最终这样定，但事实要保留：subject 是显式 selector 还是标题语境。

如果 selector ambiguous：

```turtle
<edge> aat:candidateSource <resource-a>, <resource-b> .
```

或产生多条 relation edge。关键是：不归并、不静默选一个。

# 自然文章样例一：冷链配送策略

## 文章

```asciidoc
= 冷链履约说明

[glossary]
配送策略:: 冷链订单在不同城市、温区和库存状态下选择履约路径的规则集合。
运力规则:: 用来判断车辆、骑手、仓库波次和温控设备是否足够支持当前订单的规则。
风险控制:: 在履约过程中识别温控失败、延迟送达和异常签收风险的机制。
降级规则:: 当原计划履约路径无法满足约束时，用来选择替代路径的规则。
客户承诺:: 平台向客户展示并承诺的送达时间、温区和异常处理说明。

[#delivery-policy.policy, status=active]
== 配送策略

在日常履约中，rel:depends-on[依赖, reason=capacity-check] indexterm2:[运力规则]，并且在高峰期会继续 rel:constrains[约束, reason=temperature-window] indexterm2:[客户承诺] 的展示范围。

indexterm2:[风险控制] 在监测到温控设备不足、仓库出库波次延迟或末端签收异常时，会 rel:triggers[触发, severity=high] indexterm2:[降级规则]，并把降级结果写回当前订单的履约说明。

当城市仓仍然能够保证核心温区时，indexterm2:[降级规则] 可以 rel:updates[更新, scope=customer-facing] indexterm2:[客户承诺]，但不能直接覆盖人工审核已经锁定的异常说明。
```

## 解释

术语表注册了五个 glossary term resource：配送策略、运力规则、风险控制、降级规则、客户承诺。标题 `== 配送策略` 注册了一个 heading resource。因为不归并，所以图里同时存在 heading resource“配送策略”和 glossary term resource“配送策略”。

第一段第一条关系是省略主语：

```asciidoc
rel:depends-on[依赖, reason=capacity-check] indexterm2:[运力规则]
```

它位于标题“配送策略”下，所以 source 是当前 heading resource“配送策略”。object selector “运力规则”命中 glossary term resource“运力规则”。生成：

```text
Heading(配送策略) --depends-on--> GlossaryTerm(运力规则)
```

同一行后面还有：

```asciidoc
rel:constrains[约束, reason=temperature-window] indexterm2:[客户承诺]
```

前一个 object 已经被消费，所以第二个 `rel` 没有显式 subject，继续使用当前标题。生成：

```text
Heading(配送策略) --constrains--> GlossaryTerm(客户承诺)
```

第二段显式 subject：

```asciidoc
indexterm2:[风险控制] ... rel:triggers[触发, severity=high] indexterm2:[降级规则]
```

普通文字不影响 token 序列。生成：

```text
GlossaryTerm(风险控制) --triggers--> GlossaryTerm(降级规则)
```

第三段显式 subject：

```asciidoc
indexterm2:[降级规则] ... rel:updates[更新, scope=customer-facing] indexterm2:[客户承诺]
```

生成：

```text
GlossaryTerm(降级规则) --updates--> GlossaryTerm(客户承诺)
```

这篇文章展示了长句自然表达、同一行多关系、省略标题主语、显式切换主语、中文 display label、named edge fields 同时存在。

# 自然文章样例二：学术概念关系

## 文章

```asciidoc
= 需求工程札记

[glossary]
领域事实:: 问题世界中已经成立或被明确假设的现实条件。
规约:: 人工制品或机器能够被设计者直接控制的行为描述。
需求:: 利益相关者希望问题世界达到的可验证状态。
验证条件:: 判断需求是否被满足时使用的观察和判定方式。
过早规约:: 在领域事实尚未查清时，把熟悉方案提前写成系统承诺的做法。

[#requirements-equation.concept]
== Domain ∧ Specification ⊨ Requirements

在这个公式中，indexterm2:[领域事实] 与 indexterm2:[规约] 共同 rel:entails[推出] indexterm2:[需求]，而不是由某个方案单独让愿望变成现实。

如果讨论者跳过现场观察，indexterm2:[过早规约] 就会 rel:distorts[扭曲, target=problem-space] indexterm2:[领域事实]，并进一步 rel:weakens[削弱] indexterm2:[验证条件] 的判断力量。

rel:requires[需要] indexterm2:[验证条件]，因为当前标题所讨论的公式只有在可观察的验收边界中，才不会退化成一句漂亮但不可审查的口号。
```

## 解释

术语表注册五个 glossary term resource。标题 `Domain ∧ Specification ⊨ Requirements` 注册一个 heading resource。

第一段里有两个相邻 indexterm2：领域事实、规约，然后一个 rel，再一个需求。按从左到右消费模型，`pendingSubjectSelector` 会被更靠右的 `indexterm2:[规约]` 替换。因此这一句实际生成：

```text
GlossaryTerm(规约) --entails--> GlossaryTerm(需求)
```

这不是错误，而是消费模型的必然结果。如果作者想表达“领域事实和规约共同推出需求”，可以写两条关系：

```asciidoc
indexterm2:[领域事实] rel:entails[推出] indexterm2:[需求]，indexterm2:[规约] rel:entails[推出] indexterm2:[需求]。
```

或者引入一个组合概念作为术语表 term。投影器不理解“共同”这个自然语言语义，只按 token 规则消费。

第二段：

```asciidoc
indexterm2:[过早规约] ... rel:distorts[...] indexterm2:[领域事实]，并进一步 rel:weakens[削弱] indexterm2:[验证条件]
```

第一条生成：

```text
GlossaryTerm(过早规约) --distorts--> GlossaryTerm(领域事实)
```

第一条的 object 已被消费。后面的 `rel:weakens` 左侧没有新的未消费 subject selector，所以 subject 回到当前标题 resource：

```text
Heading(Domain ∧ Specification ⊨ Requirements) --weakens--> GlossaryTerm(验证条件)
```

如果作者想表达“过早规约削弱验证条件”，就要再写一次：

```asciidoc
indexterm2:[过早规约] rel:weakens[削弱] indexterm2:[验证条件]
```

这篇样例展示了消费模型如何在长句中保持机械确定性。它不根据中文代词、并列关系或语义承接猜 subject。

第三段：

```asciidoc
rel:requires[需要] indexterm2:[验证条件]
```

省略主语，source 是当前标题 resource。生成：

```text
Heading(Domain ∧ Specification ⊨ Requirements) --requires--> GlossaryTerm(验证条件)
```

# 自然文章样例三：人物与组织史

## 文章

```asciidoc
= 技术公司简史

[glossary]
史蒂夫·乔布斯:: 苹果公司的联合创始人之一。
苹果公司:: 一家以个人计算机、移动设备和软件生态著称的科技公司。
皮克斯:: 一家动画工作室。
迪士尼:: 一家媒体与娱乐公司。
NeXT:: 乔布斯离开苹果公司后创办的计算机公司。

[#steve-jobs.person]
== 史蒂夫·乔布斯

indexterm2:[史蒂夫·乔布斯] 在 1976 年与合作者共同 rel:founded[创立, year=1976] indexterm2:[苹果公司]，这个事实后来成为许多公司史叙述的起点。

离开苹果公司之后，indexterm2:[史蒂夫·乔布斯] rel:founded[创立, year=1985] indexterm2:[NeXT]，并在动画产业中长期 rel:led[领导] indexterm2:[皮克斯]。

indexterm2:[迪士尼] rel:acquired[收购, year=2006] indexterm2:[皮克斯] 之后，indexterm2:[史蒂夫·乔布斯] 又以股东和董事身份进入迪士尼的公司治理叙事。
```

## 解释

这里的术语表注册了五个 glossary term resource。标题“史蒂夫·乔布斯”又注册了 heading resource。它不与 glossary term“史蒂夫·乔布斯”归并。

第一段显式 subject selector `史蒂夫·乔布斯` 可能命中两个资源：heading resource 和 glossary term resource。object selector `苹果公司` 命中 glossary term resource。因此按多候选保留原则，可以生成两条关系或保留两个 candidate source：

```text
Heading(史蒂夫·乔布斯) --founded--> GlossaryTerm(苹果公司)
GlossaryTerm(史蒂夫·乔布斯) --founded--> GlossaryTerm(苹果公司)
```

这不是投影器要解决的问题。下游如果认为 heading 和 glossary term 是同一个人物实体，可以合并；如果想保留文档结构节点和术语节点的差异，也可以保留。

第二段有两条关系。第一条：

```asciidoc
indexterm2:[史蒂夫·乔布斯] rel:founded[创立, year=1985] indexterm2:[NeXT]
```

同样可能产生 heading/source 与 glossary/source 两种候选边。第二条：

```asciidoc
rel:led[领导] indexterm2:[皮克斯]
```

注意这里前一个 object `NeXT` 已被消费，后面的 `rel:led` 没有未消费 subject selector，于是 subject 是当前标题 heading“史蒂夫·乔布斯”。生成：

```text
Heading(史蒂夫·乔布斯) --led--> GlossaryTerm(皮克斯)
```

第三段：

```asciidoc
indexterm2:[迪士尼] rel:acquired[收购, year=2006] indexterm2:[皮克斯]
```

生成：

```text
GlossaryTerm(迪士尼) --acquired--> GlossaryTerm(皮克斯)
```

后面自然语言里再次出现 `indexterm2:[史蒂夫·乔布斯]`，但没有新的 `rel` 消费它，所以它只是索引词/实体提及，不生成关系。

# 自然文章样例四：软件文档结构约定

## 文章

```asciidoc
= 结构化书写约定

[glossary]
heading:: 使用等号标题创建的书稿结构单位。
stable ID:: 作者为标题显式声明的稳定引用地址。
role:: 标题身份标记。
relation predicate:: `rel` 字段或 `rel` 宏声明的关系谓词。
surface field:: 源文档表面的附加字段。

[#structured-writing.rule]
== 结构化书写

rel:uses[使用] indexterm2:[heading]，并通过标题层级把读者的阅读路径稳定下来。

当某个标题需要长期被引用时，indexterm2:[stable ID] rel:identifies[标识] indexterm2:[heading]，而 indexterm2:[role] rel:classifies[分类] indexterm2:[heading] 的认知身份。

indexterm2:[relation predicate] 在 xref 或行内关系声明中 rel:names[命名] indexterm2:[surface field] 无法表达的边语义；不过字段本身仍然可以作为关系证据的补充信息保留下来。
```

## 解释

这篇文章里的实体大多来自 glossary term，标题“结构化书写”是 heading resource。

第一段省略主语：

```asciidoc
rel:uses[使用] indexterm2:[heading]
```

生成：

```text
Heading(结构化书写) --uses--> GlossaryTerm(heading)
```

第二段两条显式关系：

```asciidoc
indexterm2:[stable ID] rel:identifies[标识] indexterm2:[heading]
indexterm2:[role] rel:classifies[分类] indexterm2:[heading]
```

生成：

```text
GlossaryTerm(stable ID) --identifies--> GlossaryTerm(heading)
GlossaryTerm(role) --classifies--> GlossaryTerm(heading)
```

第三段：

```asciidoc
indexterm2:[relation predicate] ... rel:names[命名] indexterm2:[surface field]
```

生成：

```text
GlossaryTerm(relation predicate) --names--> GlossaryTerm(surface field)
```

这篇样例展示了英语 term、中文正文、反引号代码片段和自然解释可以共存。`indexterm2` 的 primary 仍然是 selector；普通文本和代码样式不改变关系模型。

# 最终收束

我现在理解的完整对象是：

> 在 `asciidoc-abundant-tree` 的 RDF12 投影中，新增 glossary term resource 和 `rel` inline macro 关系边。Glossary term resource 来自 `[glossary]` description list term，独立于 heading resource，不与同名 heading 归并。`rel` 宏在单行范围内触发行内关系消费模型：左侧最近未消费的 `indexterm2` 提供显式 subject selector；若没有，则使用当前直系 heading resource；右侧第一个 `indexterm2` 提供 object selector。`rel` target 是 predicate，最多一个 positional 是 display label，named attributes 是 edge fields。selector 在 heading 和 glossary term 等资源 label catalog 中解析，可能 bound、unresolved 或 ambiguous；投影器不做业务语义消歧。成功关系生成 RDF triple，并用 `aat:InlineRelationEdge` 资源通过 `rdf:reifies` 保留边证据。该边证据与现有 `aat:XrefEdge` 尽量同构，只是不具备 Asciidoctor official xref binding。

这套设计保留了书的原生写作体验：作者仍然写标题、术语表、索引词和自然句子；`rel` 只是让某些行内结构变成可查询图边。投影器只负责忠实转写源结构，下游工具自己决定如何合并、解释、推理和审查。
</Assistant>

<User id="6">
“……自然文章样例二：学术概念关系……”这是一个很好的案例，而且这是一个很正常的书写情况。也就是一个实体是吧，和一个实体发生关系，也可以多个实体和同一个实体发生关系，也可以多个实体和多个实体笛卡尔乘积，没问题，我觉得很自然，都是同一个关系，这没问题啊。我们可以像这个xref一样去保留一些控制字段。其实它也不是保留，因为它那个字段也是会被投影到图里面的。下游消费不消费是下游的事情，只是说我们的投影仪额外的会去看到这些控制字段。比如说这个xref里面的rel这个字段就会被解释成这一个边的一个谓词。同时呢，在图上的行为呢，哎，它也会进行一些这个点与点的连接，形成边。 那在这边啊，我们也可以啊，你想一个比较合适的那个字段名字啊，两个，一个是控制前面消费几个，一个是控制后面消费几个。啊。 好的，这个优雅的语法去想一想吧。那有了这个东西呢，诶，那就在这一个文章的表达方面，是吧？诶，也就是能够比较自然的表达，同时呢图也能够自然的去映射。好的，想一想吧。想完之后呢，看一下有没有什么要补充说明的。弹窗和我聊聊，不少于2500字或者更多，开始。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="7">
# 补充设计：`rel` 宏的多端点消费控制字段

这次补充以后，模型更完整了。默认的一对一关系只是最小情况；真实书写里很常见的是多个实体共同指向一个实体，或者多个实体与多个实体之间共享同一个关系谓词。这个时候不应该强迫作者把句子拆成很多机械短句。既然 `rel` 宏本来就是这一行关系声明的中心，那控制“前面消费几个索引词”和“后面消费几个索引词”的字段，也应该写在 `rel` 宏上。

我现在建议这两个控制字段叫：

```asciidoc
subjects=<n>
objects=<n>
```

也就是：

```asciidoc
rel:predicate[显示名, subjects=2, objects=3, 其他边字段...]
```

选择 `subjects` 和 `objects` 的理由很直接：这套东西最终投影的是 RDF/知识图谱三元组，前面被消费的是 triple subject 端，后面被消费的是 triple object 端。它比 `left` / `right` 更语义化，比 `source-count` / `target-count` 更贴近三元组语言，也避免和 source file/source span 里的 source 混在一起。它表达的是：这个 `rel` 宏要从左侧未消费的 `indexterm2` token 中取几个 subject selector，要从右侧后续的 `indexterm2` token 中取几个 object selector。

这里要注意：`subjects` 和 `objects` 是 `rel` 宏的控制字段，但它们仍然是源文档表面的字段。就像 xref 里的 `rel` 字段会被解释成关系谓词，同时也作为图上的事实进入投影一样，`subjects=2` 和 `objects=3` 也可以被投影到 edge evidence 上。投影器额外读取它们来决定消费数量；下游工具消费不消费、如何消费，是下游自己的事情。

## 默认规则

没有写控制字段时，默认就是现在的一对一模型：

```asciidoc
indexterm2:[A] rel:p[] indexterm2:[B]
```

等价于：

```asciidoc
indexterm2:[A] rel:p[subjects=1, objects=1] indexterm2:[B]
```

如果左侧没有可消费的 subject token：

```asciidoc
rel:p[] indexterm2:[B]
```

则 subject 使用当前直系标题资源。这可以理解为默认 `subjects=0`，但作者不需要写。它是省略主语模式。

如果显式写：

```asciidoc
rel:p[subjects=0] indexterm2:[B]
```

那含义就是：即使这一行前面有普通索引词，也不消费左侧 token，subject 使用当前标题资源。这个规则很有用，因为自然句子里前面可能已经有索引词，但当前关系想表达的是“本节标题实体 -> B”，不是“前面那个索引词 -> B”。

`objects` 默认是 1。宾语不可省略。若没有足够 object token，不生成完整关系边，只保留不完整声明或诊断证据。

## 消费模型

一行内仍然只看 token 序列：

```text
M(label) = indexterm2:[label]
R(predicate, fields) = rel:predicate[...]
```

普通文字、标点、连接词、解释句都只是间隔。

扫描从左到右进行。区别是 pending subject 不再只是一个，而是一个未消费 subject token 队列：

```text
pendingSubjects = []
activeRelation = none
```

遇到 `M(label)`：

- 如果当前有 `activeRelation` 正在等待 object，则这个 `M(label)` 加入 activeRelation 的 object token 列表。
- 如果 object token 数量达到 `objects` 要求，这条关系完成，消费这些 object token，activeRelation 结束。
- 如果没有 activeRelation，则这个 `M(label)` 加入 pendingSubjects。

遇到 `R(predicate, fields)`：

- 读取 `subjects`。若未写：默认需要 1 个左侧 subject；如果 pendingSubjects 为空，则使用当前标题资源作为 subject。
- 若写 `subjects=N` 且 N > 0，则从 pendingSubjects 末尾取最近的 N 个未消费 subject token。取出后，它们被消费，不再给后续 `rel` 使用。
- 若写 `subjects=0`，不取左侧 token，使用当前标题资源作为 subject。
- 读取 `objects`。若未写，默认 1。
- 进入等待 object 状态，继续向右收集 object token，直到达到 `objects` 个。

如果显式要求 `subjects=2`，但左侧未消费 subject token 少于 2 个，不应该悄悄降级成 1 个。因为作者写了控制字段，投影器就应该尊重这个结构要求。此时关系声明不完整，保留 evidence 或诊断，避免生成作者没有明确声明完整的边。

如果显式要求 `objects=3`，但行尾只遇到 2 个 object token，也同理：不生成完整边，保留不完整声明证据。

## 多端点如何生成边

当一个 `rel` 宏成功消费多个 subject selector 和多个 object selector 后，关系谓词是同一个，边集合是笛卡尔积。

```asciidoc
indexterm2:[A] 和 indexterm2:[B] rel:p[subjects=2] indexterm2:[C]
```

生成：

```text
A --p--> C
B --p--> C
```

```asciidoc
indexterm2:[A] 和 indexterm2:[B] rel:p[subjects=2, objects=2] indexterm2:[C] 与 indexterm2:[D]
```

生成：

```text
A --p--> C
A --p--> D
B --p--> C
B --p--> D
```

这很自然，因为作者在这一行里声明的是同一个谓词 `p` 连接一组 subject 和一组 object。图上就是同谓词的多条边。

如果某个 selector 命中多个 RDF resource，比如 `indexterm2:[配送策略]` 同时命中 heading resource 和 glossary term resource，那么这个 selector 本身会展开为多个候选资源。最终边集合是：

```text
resolvedSubjects × resolvedObjects
```

这里有两层乘积：

1. 多个 selector token 形成 subject/object selector 集合。
2. 每个 selector 可能命中多个 resource candidate。

投影器不做归并、不裁判语义。它可以发多条边，也可以在 edge evidence 上记录 candidates；原则是忠实暴露。

## 示例一：多个 subject 指向一个 object

```asciidoc
[glossary]
领域事实:: 问题世界中已经成立或被明确假设的现实条件。
规约:: 人工制品或机器能够被设计者直接控制的行为描述。
需求:: 利益相关者希望问题世界达到的可验证状态。

== 需求工程公式

在这个公式中，indexterm2:[领域事实] 与 indexterm2:[规约] rel:entails[推出, subjects=2] indexterm2:[需求]，而不是由某个孤立方案单独让愿望变成现实。
```

解释：

左侧有两个未消费 subject token：`领域事实`、`规约`。`rel:entails[subjects=2]` 消费这两个 token。右侧默认 `objects=1`，消费 `需求`。

生成：

```text
领域事实 --entails--> 需求
规约 --entails--> 需求
```

这比上一版默认一对一更符合这句话的自然含义。作者不需要写两遍 `rel:entails`，只需要告诉这个 `rel`：你前面消费两个 subject。

## 示例二：多个 subject 与多个 object

```asciidoc
[glossary]
性能需求:: 系统在响应时间、吞吐和资源使用方面必须满足的要求。
可靠性需求:: 系统在故障、恢复和持续运行方面必须满足的要求。
压测方案:: 用于验证系统容量边界的测试方案。
故障演练:: 用于验证恢复流程和故障隔离能力的演练方案。

== 验证设计

indexterm2:[性能需求] 与 indexterm2:[可靠性需求] rel:validated-by[由其验证, subjects=2, objects=2] indexterm2:[压测方案] 和 indexterm2:[故障演练]。
```

解释：

`subjects=2` 消费左侧两个 subject：性能需求、可靠性需求。`objects=2` 消费右侧两个 object：压测方案、故障演练。

生成笛卡尔积：

```text
性能需求 --validated-by--> 压测方案
性能需求 --validated-by--> 故障演练
可靠性需求 --validated-by--> 压测方案
可靠性需求 --validated-by--> 故障演练
```

这不是投影器猜测“性能需求到底是否应该由故障演练验证”。这是作者用一个同谓词多端点声明表达出来的结构。下游如果认为其中某些边不合适，可以通过图审查回到源文档修改。

## 示例三：省略主语但多个 object

```asciidoc
[glossary]
运力规则:: 判断车辆、人员和温控设备是否足够支持订单的规则。
风险控制:: 识别温控失败、延迟送达和异常签收风险的机制。
客户承诺:: 平台向客户展示的送达时间和异常处理说明。

== 配送策略

rel:depends-on[依赖, objects=2] indexterm2:[运力规则] 和 indexterm2:[风险控制]，并在结果稳定后 rel:updates[更新] indexterm2:[客户承诺]。
```

解释：

第一条 `rel:depends-on[objects=2]` 左侧没有 pending subject，所以使用当前标题“配送策略”作为 subject；右侧消费两个 object：运力规则、风险控制。

生成：

```text
配送策略 --depends-on--> 运力规则
配送策略 --depends-on--> 风险控制
```

后面的 `rel:updates[更新]` 出现时，前两个 object 已经被第一条关系消费，不会成为第二条关系 subject。第二条关系左侧没有 pending subject，因此继续使用当前标题“配送策略”。生成：

```text
配送策略 --updates--> 客户承诺
```

## 示例四：显式 `subjects=0`

```asciidoc
[glossary]
风险控制:: 识别温控失败、延迟送达和异常签收风险的机制。
降级规则:: 当原计划履约路径无法满足约束时选择替代路径的规则。

== 配送策略

虽然 indexterm2:[风险控制] 已经在本段开头被提到，但当前小节想表达的是配送策略本身 rel:triggers[触发, subjects=0] indexterm2:[降级规则]。
```

解释：

这一行左侧确实出现了 `indexterm2:[风险控制]`。如果按默认规则，`rel:triggers` 会消费它作为 subject。但作者写了 `subjects=0`，表示不要消费左侧 token，使用当前标题作为 subject。

生成：

```text
配送策略 --triggers--> 降级规则
```

`风险控制` 在这句里仍然是普通索引词，不参与这条边。

## 示例五：连续关系与消费隔离

```asciidoc
[glossary]
A:: 第一个实体。
B:: 第二个实体。
C:: 第三个实体。
D:: 第四个实体。

== 关系示例

indexterm2:[A] 和 indexterm2:[B] rel:p[subjects=2] indexterm2:[C]，随后 rel:q[] indexterm2:[D]。
```

解释：

第一条关系消费 A、B 作为 subjects，消费 C 作为 object。生成：

```text
A --p--> C
B --p--> C
```

C 已经被第一条关系消费为 object。后面的 `rel:q[]` 左侧没有未消费 subject token，所以使用当前标题“关系示例”作为 subject。生成：

```text
关系示例 --q--> D
```

如果作者想表达 `C --q--> D`，就要写：

```asciidoc
indexterm2:[A] 和 indexterm2:[B] rel:p[subjects=2] indexterm2:[C]，随后 indexterm2:[C] rel:q[] indexterm2:[D]。
```

这条规则保证消费模型不靠自然语言承接猜 subject。

## 控制字段的投影

对于：

```asciidoc
indexterm2:[领域事实] 与 indexterm2:[规约] rel:entails[推出, subjects=2, confidence=axiomatic] indexterm2:[需求]
```

edge evidence 可以同时包含：

```text
rel = entails
displayLabel = 推出
subjects = 2
confidence = axiomatic
sourceSelectors = [领域事实, 规约]
targetSelectors = [需求]
raw = 整个 rel 声明相关 raw surface
```

`subjects` 是控制字段，但也作为字段投影。`confidence` 只是普通边字段。投影器只额外解释 `subjects` 和 `objects` 两个控制字段；其他字段忠实挂到边证据上。

如果字段值不是正整数，比如 `subjects=many`，投影器不能解释为消费数量。此时保留原字段，但不按它扩展消费；可以产生诊断。默认规则是否继续应用，要看最终实现契约怎么定。从设计意义上，我倾向于：控制字段写了但非法，就不要悄悄回退默认，因为作者已经表达了一个结构意图，只是写法不合法。

## 为什么这两个字段足够

`subjects` 和 `objects` 解决的是行内关系声明里唯一真正缺少的信息：这个 `rel` 宏要消费多少个左侧端点和多少个右侧端点。

其他事情都已经由现有结构承担：

```text
谓词：rel target
显示名：第一个位置参数
边字段：named attributes
端点 token：indexterm2 primary
端点资源：heading / glossary term label catalog
省略主语：当前标题资源
多候选：selector binding candidate set
边证据：InlineRelationEdge + rdf:reifies
```

所以不需要再发明一套复杂语法。作者只在需要多端点时写：

```asciidoc
subjects=2
objects=2
```

默认一对一仍然轻；复杂句子也能表达。

## 最终补充定义

完整模型现在可以补成这样：

> `rel` inline macro 支持两个投影控制字段：`subjects` 与 `objects`。`subjects=N` 表示该 `rel` 从左侧未消费的 `indexterm2` token 中消费最近 N 个作为 subject selector；`subjects=0` 表示不消费左侧 token，使用当前直系标题资源作为 subject；未写时默认消费 1 个左侧 subject，若没有则使用当前标题。`objects=N` 表示该 `rel` 从右侧后续 `indexterm2` token 中消费 N 个作为 object selector；未写时默认为 1。成功解析后，所有 subject resource candidates 与 object resource candidates 按笛卡尔积生成同谓词关系边；`rel` 的 target 是谓词，第一个位置参数是显示名，named attributes 包括控制字段在内都投影到边证据。投影器不做实体归并、不解释业务字段、不跨行、不猜自然语言，只按行内 token 消费规则忠实生成 RDF 关系事实。

这样，像学术概念关系那种自然句子就能写得非常顺：

```asciidoc
indexterm2:[领域事实] 与 indexterm2:[规约] rel:entails[推出, subjects=2] indexterm2:[需求]。
```

它读起来是正常文章，结构上是明确的图声明，投影后是两条边。这个就是这套语法最有价值的地方。
</Assistant>

<User id="7">
好的，我发现你似乎还有点软软的啊。没错，作者都写出这两个单词了，他的意图就是控制字段，就是想控制这些他想控制这个图的一种生成的效果，他就是表达给机器看的。如果说他写的这个模式根本就不匹配，哎呀，那我们本来就是类似Markdown、ADOC这样的东西，这些本来就是尽可能地去识别，没有类似go rust py js等等 这些直接是上下文无关法的这种编程语言的语法，是不是？那我们这个结构上都不一样，所以说也不能像要求一样，像Rust一样能够那么精确的那个什么编译诊断吧？是不是？这我压根就做不了那个样子。所以说也不会那么要求，是不是？所以说很自然啊，你懂我意思吧？那就直直接识别不了就没识别呗，不符合要求就是不识别了，这类标记语言，作者呢，就得提前看语法手册呀，看了手册，按照手册写，是不是？他自己写是吧？

“……如果字段值不是正整数，比如 subjects=many，投影器不能解释为消费数量。此时保留原字段，但不按它扩展消费；可以产生诊断。默认规则是否继续应用，要看最终实现契约怎么定。从设计意义上，我倾向于：控制字段写了但非法，就不要悄悄回退默认，因为作者已经表达了一个结构意图，只是写法不合法。……”这确实在测试工程学上就是一种边界值嘛。但是本身很奇怪啊，我们要的就是整数啊，你不是整数我都不知道。那你到底想表达什么意思呢？我不知道，我也不用猜测 好的，你自己再看一下啊，你这里本次的这一些弹窗里面一些东西啊，你看一下，你那些有莫名其妙的，根本不知道怎么判断的。那我这里给了你这个新的一些信息和判断标准，自己去想想吧。思考一下，然后呢看有什么补充说明的，再用弹窗发给我，不少于3000字或者更多。同时呢。呃，在写一两篇啊，更加完整的这一个示例文章啊，再来看看。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="8">
# 再校正：控制字段就是机器指令，识别不了就不识别

你这次补充以后，失败语义也清楚了。这里不是 Rust、Go、Python、JS 那种编程语言语法，不追求那种完整上下文无关语法、编译期类型系统和精确诊断。AsciiDoc、Markdown 这类标记语言的习惯是：作者按手册写，工具尽可能识别；模式满足就投影，模式不满足就不投影。它不是让投影器猜作者到底想表达什么。

所以 `subjects` 和 `objects` 两个字段一旦出现，它们就是机器控制字段。作者写它们，就是为了控制这一行里 `rel` 宏消费多少个前置索引词和多少个后置索引词。它们不是普通业务字段，不是给读者看的解释词，也不是需要投影器去“理解一下作者是不是想写 many”的自然语言。它们的值必须是这个控制语义能识别的整数。识别不了，就不能执行这个控制。这里不应该有“那要不要回退默认”的摇摆。作者已经写了控制字段，但字段值不符合控制字段的格式，那么这个 `rel` 关系模式不成立；不生成边即可。

更直接地说：

```asciidoc
rel:p[subjects=many] indexterm2:[B]
```

投影器不知道 `many` 是多少。它不应该猜，不应该当作 1，也不应该当作 0，也不应该把 `many` 当成某种业务字段继续执行默认规则。因为 `subjects` 这个字段名已经被投影器保留为控制字段。控制字段出现但不合法，关系消费失败。源文本仍然是合法 AsciiDoc，渲染仍然可以渲染；只是我们的 RDF relation projection 不承认它是一条结构完整的图边。

同理：

```asciidoc
rel:p[objects=two] indexterm2:[B]
```

`objects=two` 不是可执行的 object 消费数量。关系不识别。

```asciidoc
indexterm2:[A] rel:p[subjects=3] indexterm2:[B]
```

左侧只有一个未消费 subject token，但作者要求消费三个。模式不匹配，不生成边。

```asciidoc
indexterm2:[A] rel:p[objects=2] indexterm2:[B]
```

右侧只有一个 object token，但作者要求两个。模式不匹配，不生成边。

这不是“报错还是不报错”的核心问题。核心是：不要生成作者没有写完整的图边。可以有 debug/diagnostic surface，也可以没有；但关系边不要生成。

## 投影器职责重新收束

现在这套语法的投影器职责可以压得很干净：

1. 找到一行里的 `rel` 宏。
2. 找到同一行里的 `indexterm2` token。
3. 读取 `rel` target 作为 predicate。
4. 读取最多一个 positional 作为 display label。
5. 读取 `subjects` 和 `objects` 作为机器控制字段。
6. 若控制字段缺失，使用默认消费规则。
7. 若控制字段存在但不是可识别整数，关系模式不成立。
8. 若 token 数量不足，关系模式不成立。
9. 若 selector 解析不到资源，不生成有效关系边。
10. 若 selector 解析到多个资源，不消歧，按候选事实投影。
11. 其他 named attributes 忠实投影到边证据，不解释业务含义。

这里不要再加入“推荐 named attribute”“读者猜不猜”“字段是否优雅”“业务词是否合理”这些判断。投影器不知道领域，只知道表面结构。

## 控制字段的硬规则

`subjects`：非负整数。

```text
subjects=0  使用当前直系标题资源作为 subject，不消费左侧 indexterm2。
subjects=N  N > 0，从左侧未消费 indexterm2 token 中取最近 N 个作为 subject selector。
未写       默认尝试消费 1 个左侧 subject；若没有左侧未消费 token，则使用当前标题资源。
```

`objects`：正整数。

```text
objects=N  N > 0，从右侧后续 indexterm2 token 中消费 N 个作为 object selector。
未写       默认为 objects=1。
```

`objects=0` 不成立。因为 object 不可省略。即使源文本是合法 AsciiDoc，我们的关系投影也不承认它是完整边声明。

如果 `subjects` / `objects` 重复出现，按当前 `parseMacroArguments` 的行为，named record 会后值覆盖前值。这个是现有宏参数解析事实。设计上不需要给它赋予特殊业务语义。作者应该按手册写单个控制字段。

## 默认规则不再摇摆

没有控制字段时：

```asciidoc
indexterm2:[A] rel:p[] indexterm2:[B]
```

生成：

```text
A --p--> B
```

```asciidoc
rel:p[] indexterm2:[B]
```

生成：

```text
CurrentHeading --p--> B
```

有非法控制字段时：

```asciidoc
indexterm2:[A] rel:p[subjects=many] indexterm2:[B]
```

不生成边。不会回退成默认 `subjects=1`。

有数量不足时：

```asciidoc
indexterm2:[A] rel:p[subjects=2] indexterm2:[B]
```

不生成边。不会自动降级成 `A --p--> B`。

这条很重要，因为作者写 `subjects=2` 说明他要的是两个 subject 的结构。工具不能替他改成一个 subject。

## 多端点边的最终解释

成功识别后，多 subject、多 object 就是笛卡尔积。

```asciidoc
indexterm2:[A] 与 indexterm2:[B] rel:p[subjects=2, objects=2] indexterm2:[C] 和 indexterm2:[D]
```

生成：

```text
A --p--> C
A --p--> D
B --p--> C
B --p--> D
```

如果 A、B、C、D 中任何 selector 命中多个 resource candidate，最终就是候选资源集合之间的乘积。投影器不归并。

比如 `A` 命中 `A-heading` 和 `A-glossary`，`C` 命中 `C-glossary`，那么 `A --p--> C` 展开为：

```text
A-heading --p--> C-glossary
A-glossary --p--> C-glossary
```

这是忠实投影，不是语义判断。

## 控制字段是否也投影

`subjects` 和 `objects` 是控制字段，但它们也可以作为 edge evidence 上的字段进入图。这个和 xref 里的 `rel` 很像：`rel` 在 xref attributes 里被解释成 predicate，同时 raw field 也可以保留为边证据的一部分。

关系证据可以保留：

```text
rawRelTarget = p
displayLabel = 显示名
subjects = 2
objects = 3
sourceSelectors = [...]
targetSelectors = [...]
raw = rel 宏及相关行内表面
sourceSpan = 行列位置
```

下游消费不消费 `subjects` / `objects` 是下游自己的事情。投影器读取它们只是为了执行这一层投影规则。

## 示例文章一：需求工程说明

### 文章

```asciidoc
= 需求工程说明

[glossary]
领域事实:: 问题世界中已经成立或被明确假设的现实条件。
规约:: 人工制品或机器能够被设计者直接控制的行为描述。
需求:: 利益相关者希望问题世界达到的可验证状态。
验证条件:: 判断需求是否被满足时使用的观察、样例和验收边界。
过早规约:: 在领域事实尚未查清时，把熟悉方案提前写成系统承诺的做法。
方案偏好:: 讨论者基于经验、习惯或工具熟悉度提前偏向的实现方向。

[#requirements-equation.concept]
== Domain ∧ Specification ⊨ Requirements

在需求工程的这个表达里，indexterm2:[领域事实] 与 indexterm2:[规约] rel:entails[共同推出, subjects=2] indexterm2:[需求]，所以需求满足不是愿望单独产生的结果，也不是某个实现物单独产生的结果。

当讨论过早进入工具选择时，indexterm2:[过早规约] 与 indexterm2:[方案偏好] rel:distorts[扭曲, subjects=2, objects=2, severity=high] indexterm2:[领域事实] 和 indexterm2:[验证条件]，使后续会议看起来有很多行动，却没有真正降低关键未知。

rel:requires[需要] indexterm2:[验证条件]，因为当前标题所讨论的公式只有在可观察的验收边界中，才不会退化成一句漂亮但不可审查的口号。
```

### 解释

第一段：

```asciidoc
indexterm2:[领域事实] 与 indexterm2:[规约] rel:entails[共同推出, subjects=2] indexterm2:[需求]
```

`subjects=2` 消费左侧两个 subject token：领域事实、规约。`objects` 未写，默认 1，消费右侧需求。生成：

```text
领域事实 --entails--> 需求
规约 --entails--> 需求
```

这表达的是同一个关系谓词下两个 subject 指向同一个 object。

第二段：

```asciidoc
indexterm2:[过早规约] 与 indexterm2:[方案偏好] rel:distorts[扭曲, subjects=2, objects=2, severity=high] indexterm2:[领域事实] 和 indexterm2:[验证条件]
```

`subjects=2` 消费过早规约、方案偏好。`objects=2` 消费领域事实、验证条件。生成笛卡尔积：

```text
过早规约 --distorts--> 领域事实
过早规约 --distorts--> 验证条件
方案偏好 --distorts--> 领域事实
方案偏好 --distorts--> 验证条件
```

`severity=high` 是边字段，挂到每条由这个 rel evidence 生成的边证据上。投影器不解释 high 是什么，只保留。

第三段：

```asciidoc
rel:requires[需要] indexterm2:[验证条件]
```

没有左侧 subject token，所以 source 是当前标题 resource `Domain ∧ Specification ⊨ Requirements`。生成：

```text
Domain ∧ Specification ⊨ Requirements --requires--> 验证条件
```

## 示例文章二：产品运营策略

### 文章

```asciidoc
= 城市即时零售运营手册

[glossary]
补货策略:: 门店或前置仓在不同销售节奏下安排补货批次、补货数量和补货优先级的规则。
库存水位:: 当前库存相对于安全库存、预测销量和履约窗口的状态。
促销计划:: 运营团队为了提升转化或清理库存而安排的价格、曝光和券补贴组合。
履约能力:: 仓库、骑手、车辆、拣货人员和系统容量共同形成的订单处理能力。
异常预案:: 当库存、履约或系统状态偏离正常范围时采取的替代处理方案。
客户承诺:: 平台展示给客户的送达时间、可售范围和异常说明。

[#replenishment-policy.policy]
== 补货策略

在工作日午高峰之前，rel:depends-on[依赖, objects=2] indexterm2:[库存水位] 和 indexterm2:[履约能力]，因为补货不是单纯把货送到仓里，而是要保证这些货能够在承诺时间内被拣出、打包并交给末端配送。

当运营团队准备扩大曝光时，indexterm2:[促销计划] 与 indexterm2:[补货策略] rel:constrains[相互约束, subjects=2, objects=2, review=required] indexterm2:[库存水位] 和 indexterm2:[客户承诺]，否则页面上看到的可售承诺就会早于真实供给能力。

如果系统发现某些门店同时出现库存低水位和骑手不足，indexterm2:[异常预案] rel:updates[更新, objects=2, scope=customer-facing] indexterm2:[客户承诺] 和 indexterm2:[促销计划]，并把不可达区域从推荐位中移除。
```

### 解释

第一段省略 subject：

```asciidoc
rel:depends-on[依赖, objects=2] indexterm2:[库存水位] 和 indexterm2:[履约能力]
```

source 是当前标题 `补货策略`。`objects=2` 消费库存水位、履约能力。生成：

```text
补货策略 --depends-on--> 库存水位
补货策略 --depends-on--> 履约能力
```

第二段多 subject、多 object：

```asciidoc
indexterm2:[促销计划] 与 indexterm2:[补货策略] rel:constrains[相互约束, subjects=2, objects=2, review=required] indexterm2:[库存水位] 和 indexterm2:[客户承诺]
```

生成四条边：

```text
促销计划 --constrains--> 库存水位
促销计划 --constrains--> 客户承诺
补货策略 --constrains--> 库存水位
补货策略 --constrains--> 客户承诺
```

注意：这里 `补货策略` selector 可能同时命中 heading resource 和 glossary term resource，因为标题和术语表都有这个 label。投影器不归并。候选展开后，可能会出现 heading 补货策略与 glossary 补货策略两组边。下游自行判断是否合并。

第三段：

```asciidoc
indexterm2:[异常预案] rel:updates[更新, objects=2, scope=customer-facing] indexterm2:[客户承诺] 和 indexterm2:[促销计划]
```

一个 subject，两个 object，生成：

```text
异常预案 --updates--> 客户承诺
异常预案 --updates--> 促销计划
```

`scope=customer-facing` 是边字段，投影器保留。

## 示例文章三：非法控制字段不识别

### 文章

```asciidoc
= 标记错误示例

[glossary]
A:: 第一个实体。
B:: 第二个实体。
C:: 第三个实体。

== 错误写法

indexterm2:[A] rel:p[subjects=many] indexterm2:[B]。

indexterm2:[A] rel:q[objects=2] indexterm2:[B]。

indexterm2:[A] rel:r[subjects=2] indexterm2:[C]。
```

### 解释

第一行 `subjects=many` 不是整数。`subjects` 是控制字段，写了但不合法。关系模式不成立，不生成 `A --p--> B`。

第二行 `objects=2` 要求两个 object token，但右侧只有 `B` 一个。数量不足，不生成 `A --q--> B`。

第三行 `subjects=2` 要求两个左侧 subject token，但左侧只有 `A` 一个。数量不足，不生成 `A --r--> C`。

这三行仍然是合法 AsciiDoc，仍然可以渲染。但对我们的 RDF relation projection 来说，它们不是完整结构。作者要看语法手册，按结构写。

## 最终修正版

我现在把这条规则定死：

> `subjects` 和 `objects` 是 `rel` 宏的机器控制字段。它们一旦出现，就必须是可识别整数，并且行内 token 数量必须满足要求。非法值、数量不足或缺少 object 时，关系模式不成立，不生成边，不回退默认，不猜测作者意图。标记语言可以宽容渲染源文本，但 RDF 关系投影只承认可识别的结构。

这就把之前的摇摆拿掉了。投影器不是编译器，也不是自然语言解释器。它只识别手册定义的结构；结构成立就投影，结构不成立就不投影。
</Assistant>

<User id="8">
好的。啊，对于一些基础的诊断，其实我们还是可以有的。比如说，诶，这个作者就是写了这个控制字段，同时呢写在我们的IEL宏里面。但是呢，他整个东西呢是有问题的。他写了，但是生成不了边。这个东西可以告诉他，可以告诉他说，诶，这个地方边生成失败了，投影的时候呢，可以有日志出来，这是没问题的。你自己去确定一下啊，确定一下投影器这边能够做的错误诊断啊，该做的事情，分内之事，做好，没问题。

好的，那你再整一整吧。啊？再用弹窗看一下，再补充说明一点东西啊，再来和我说说。嗯，然后呢？你之前那个演示的文章，是吧？那你再精心的打磨一篇，同时呢再给出它完整的这个TTL啊？就是你手动去进行投影的效果啊，让我去看看每一个字段，每一个效果啊，更直观。好，那想一想再给我发个弹窗，不少于2,000字或者更多，那开始吧。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="9">
# 诊断边界与完整手写 TTL 示例

你这次补充以后，诊断的位置也清楚了：不需要把 AsciiDoc 变成 Rust 那样的编译语言，但投影器既然识别 `rel` 宏，且 `subjects` / `objects` 是我们定义的控制字段，那么作者写了这些结构却生成不了边时，投影器可以给基础诊断。这个不是越界，不是替作者判断业务语义，而是投影器对自己公共契约的反馈。

诊断的边界应该这样定：

```text
投影器可以诊断结构模式失败。
投影器不诊断业务语义是否合理。
```

例如：

```asciidoc
indexterm2:[A] rel:p[subjects=many] indexterm2:[B]
```

这里 `subjects` 是控制字段，但值不是整数。投影器可以报告：这个 `rel` 宏的控制字段无效，未生成关系边。

```asciidoc
indexterm2:[A] rel:p[subjects=2] indexterm2:[B]
```

这里作者要求两个 subject，但左侧只有一个。投影器可以报告：subject token 数量不足，未生成关系边。

```asciidoc
indexterm2:[A] rel:p[objects=2] indexterm2:[B]
```

这里 object token 数量不足。可以诊断。

```asciidoc
indexterm2:[A] rel:p[] indexterm2:[未注册实体]
```

如果 `未注册实体` 不在 heading/glossary term label catalog 中，可以诊断 unresolved object selector。

但是投影器不应该诊断：

```text
A --p--> B 在业务上是否正确
subjects=2 生成笛卡尔积是不是作者领域里想要的推理
confidence=high 的 high 是否是合法枚举
配送策略 heading 和配送策略 glossary term 是否应该合并
```

这些都交给下游模型、SHACL、SPARQL、人工审查、业务规则。

## 可以有的诊断类型

我会把基础诊断分成几类。

`inline-relation.invalid-control-field`：`subjects` 或 `objects` 出现，但不是合法整数，或者 `objects=0`。

`inline-relation.insufficient-subjects`：显式 `subjects=N` 且 N > 0，但左侧未消费 `indexterm2` token 少于 N。

`inline-relation.insufficient-objects`：`objects=N`，但右侧可消费 object token 少于 N。

`inline-relation.missing-heading-subject`：需要使用当前标题作为省略主语，但当前行不在任何可投影 heading 范围内。

`inline-relation.unresolved-subject-selector`：subject selector 在 label catalog 中找不到任何 heading/glossary term resource。

`inline-relation.unresolved-object-selector`：object selector 找不到任何 resource。

`inline-relation.invalid-predicate`：`rel` target 不能映射为 RDF predicate。可以保留 raw evidence，但不生成 relation triple。

`inline-relation.interrupted-relation`：一个 `rel` 已经开始等待 object，但在得到足够 object 前遇到另一个 `rel` 或行结束。

这些诊断都有共同特点：它们只围绕投影器自己的结构契约，不碰业务语义。

## 精修样例文章

下面是一篇完整自然文章。它展示：glossary term resource、heading resource、同名不归并、省略主语、多 subject、多 object、display label、edge fields、控制字段、普通文字穿插。

```asciidoc
= 冷链履约策略说明

[glossary]
配送策略:: 冷链订单在城市仓、前置仓和末端配送之间选择履约路径的规则集合。
运力规则:: 用于判断车辆、骑手、仓库波次和温控设备是否足够支持当前订单的规则。
风险控制:: 在履约过程中识别温控失败、延迟送达和异常签收风险的机制。
降级规则:: 当原计划履约路径无法满足约束时，用来选择替代履约路径的规则。
客户承诺:: 平台向客户展示并承诺的送达时间、温区和异常处理说明。
促销计划:: 运营团队为了提升转化或清理库存而安排的价格、曝光和补贴组合。

[#delivery-policy.policy, status=active]
== 配送策略

在日常履约中，rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]，因为冷链订单不只需要有货，还需要在承诺温区和承诺时间内完成拣货、交接与送达。

当运营团队准备扩大曝光时，indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]，否则页面上的可售表达会早于真实供给能力。

如果系统监测到城市仓温控设备不足，indexterm2:[风险控制] 会在人工复核后 rel:triggers[触发, severity=high] indexterm2:[降级规则]，并由当前章节继续 rel:updates[更新, scope=customer-facing] indexterm2:[客户承诺]。
```

## 手写 TTL 投影示意

下面是手工投影示意，不是实际运行输出。IRI 和行列号用可读 local id 展示，重点是让每个字段的效果直观看到。

```turtle
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<#heading-l1-o0> a aat:Heading;
  aat:headline "冷链履约策略说明";
  aat:headingLevel 0;
  aat:documentOrder 1;
  aat:headingLine 1;
  aat:startLine 1;
  aat:endLine 1;
  aat:relativePath "samples/cold-chain-rel.adoc".

<#glossary-term-l4-o0> a aat:GlossaryTerm;
  aat:term "配送策略";
  aat:label "配送策略";
  aat:definition "冷链订单在城市仓、前置仓和末端配送之间选择履约路径的规则集合。";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 4;
  aat:endLine 4.

<#glossary-term-l5-o0> a aat:GlossaryTerm;
  aat:term "运力规则";
  aat:label "运力规则";
  aat:definition "用于判断车辆、骑手、仓库波次和温控设备是否足够支持当前订单的规则。";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 5;
  aat:endLine 5.

<#glossary-term-l6-o0> a aat:GlossaryTerm;
  aat:term "风险控制";
  aat:label "风险控制";
  aat:definition "在履约过程中识别温控失败、延迟送达和异常签收风险的机制。";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 6;
  aat:endLine 6.

<#glossary-term-l7-o0> a aat:GlossaryTerm;
  aat:term "降级规则";
  aat:label "降级规则";
  aat:definition "当原计划履约路径无法满足约束时，用来选择替代履约路径的规则。";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 7;
  aat:endLine 7.

<#glossary-term-l8-o0> a aat:GlossaryTerm;
  aat:term "客户承诺";
  aat:label "客户承诺";
  aat:definition "平台向客户展示并承诺的送达时间、温区和异常处理说明。";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 8;
  aat:endLine 8.

<#glossary-term-l9-o0> a aat:GlossaryTerm;
  aat:term "促销计划";
  aat:label "促销计划";
  aat:definition "运营团队为了提升转化或清理库存而安排的价格、曝光和补贴组合。";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 9;
  aat:endLine 9.

<#heading-l12-o0> a aat:Heading;
  aat:headline "配送策略";
  aat:addressLabel "delivery-policy";
  aat:role "policy";
  aat:status "active";
  aat:headingLevel 1;
  aat:documentOrder 2;
  aat:headingLine 13;
  aat:startLine 12;
  aat:endLine 19;
  aat:relativePath "samples/cold-chain-rel.adoc".
```

注意这里有两个“配送策略”资源：

```turtle
<#glossary-term-l4-o0> a aat:GlossaryTerm; aat:label "配送策略".
<#heading-l12-o0> a aat:Heading; aat:headline "配送策略".
```

它们不归并。

第一段关系：省略主语，objects=2。

```turtle
<#heading-l12-o0> rel:depends-on <#glossary-term-l5-o0>.
<#heading-l12-o0> rel:depends-on <#glossary-term-l6-o0>.

<#inline-rel-edge-l15-c10-o0-a> a aat:InlineRelationEdge;
  rdf:reifies <<(<#heading-l12-o0> rel:depends-on <#glossary-term-l5-o0>)>>;
  aat:sourceResource <#heading-l12-o0>;
  aat:targetResource <#glossary-term-l5-o0>;
  aat:sourceMode "containing-heading";
  aat:rel "depends-on";
  aat:displayLabel "依赖";
  aat:objects "2";
  aat:reason "capacity-check";
  aat:targetSelector "运力规则";
  aat:raw "rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 15;
  aat:startColumn 8;
  aat:endLine 15;
  aat:endColumn 92.

<#inline-rel-edge-l15-c10-o0-b> a aat:InlineRelationEdge;
  rdf:reifies <<(<#heading-l12-o0> rel:depends-on <#glossary-term-l6-o0>)>>;
  aat:sourceResource <#heading-l12-o0>;
  aat:targetResource <#glossary-term-l6-o0>;
  aat:sourceMode "containing-heading";
  aat:rel "depends-on";
  aat:displayLabel "依赖";
  aat:objects "2";
  aat:reason "capacity-check";
  aat:targetSelector "风险控制";
  aat:raw "rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 15;
  aat:startColumn 8;
  aat:endLine 15;
  aat:endColumn 92.
```

第二段关系：subjects=2, objects=2。`促销计划` 命中 glossary term；`配送策略` selector 命中 glossary term 和 heading 两个资源，所以 subject 候选实际有三个：促销计划 glossary、配送策略 glossary、配送策略 heading。object 是客户承诺、运力规则。下面只展开其中几条，实际可按候选集合生成完整乘积。

```turtle
<#glossary-term-l9-o0> rel:constrains <#glossary-term-l8-o0>.
<#glossary-term-l9-o0> rel:constrains <#glossary-term-l5-o0>.
<#glossary-term-l4-o0> rel:constrains <#glossary-term-l8-o0>.
<#glossary-term-l4-o0> rel:constrains <#glossary-term-l5-o0>.
<#heading-l12-o0> rel:constrains <#glossary-term-l8-o0>.
<#heading-l12-o0> rel:constrains <#glossary-term-l5-o0>.

<#inline-rel-edge-l17-c39-o0> a aat:InlineRelationEdge;
  rdf:reifies <<(<#glossary-term-l9-o0> rel:constrains <#glossary-term-l8-o0>)>>;
  aat:sourceResource <#glossary-term-l9-o0>;
  aat:targetResource <#glossary-term-l8-o0>;
  aat:sourceSelector "促销计划";
  aat:targetSelector "客户承诺";
  aat:rel "constrains";
  aat:displayLabel "共同约束";
  aat:subjects "2";
  aat:objects "2";
  aat:review "required";
  aat:raw "indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 17;
  aat:startColumn 41;
  aat:endLine 17;
  aat:endColumn 137.
```

这里可以看到：同名“配送策略”没有归并，所以同一个 selector 会让 heading 和 glossary term 都参与候选。下游可以自己合并或过滤。

第三段第一条关系：显式 subject 风险控制，object 降级规则。

```turtle
<#glossary-term-l6-o0> rel:triggers <#glossary-term-l7-o0>.

<#inline-rel-edge-l19-c32-o0> a aat:InlineRelationEdge;
  rdf:reifies <<(<#glossary-term-l6-o0> rel:triggers <#glossary-term-l7-o0>)>>;
  aat:sourceResource <#glossary-term-l6-o0>;
  aat:targetResource <#glossary-term-l7-o0>;
  aat:sourceSelector "风险控制";
  aat:targetSelector "降级规则";
  aat:rel "triggers";
  aat:displayLabel "触发";
  aat:severity "high";
  aat:raw "indexterm2:[风险控制] 会在人工复核后 rel:triggers[触发, severity=high] indexterm2:[降级规则]";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 19;
  aat:startColumn 27;
  aat:endLine 19;
  aat:endColumn 86.
```

第三段第二条关系：前面的降级规则已经被 triggers 消费为 object，不会成为 updates 的 subject；所以 `rel:updates` 没有左侧 pending subject，使用当前 heading“配送策略”。

```turtle
<#heading-l12-o0> rel:updates <#glossary-term-l8-o0>.

<#inline-rel-edge-l19-c96-o0> a aat:InlineRelationEdge;
  rdf:reifies <<(<#heading-l12-o0> rel:updates <#glossary-term-l8-o0>)>>;
  aat:sourceResource <#heading-l12-o0>;
  aat:targetResource <#glossary-term-l8-o0>;
  aat:sourceMode "containing-heading";
  aat:targetSelector "客户承诺";
  aat:rel "updates";
  aat:displayLabel "更新";
  aat:scope "customer-facing";
  aat:raw "rel:updates[更新, scope=customer-facing] indexterm2:[客户承诺]";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 19;
  aat:startColumn 96;
  aat:endLine 19;
  aat:endColumn 151.
```

## 诊断示例 TTL / 日志形态

对于失败关系，不生成业务边，但可以有日志：

```text
warning inline-relation.invalid-control-field samples/cold-chain-rel.adoc:23:18
  rel:depends-on[依赖, subjects=many] has invalid control field subjects=many; relation edge was not projected.
```

或者投影调试图中有一个 incomplete edge evidence：

```turtle
<#inline-rel-edge-l23-c18-o0> a aat:InlineRelationEdge;
  aat:projectionStatus "failed";
  aat:failureCode "inline-relation.invalid-control-field";
  aat:raw "rel:depends-on[依赖, subjects=many]";
  aat:subjects "many";
  aat:relativePath "samples/cold-chain-rel.adoc";
  aat:startLine 23;
  aat:startColumn 18.
```

是否把失败 evidence 放进正式 RDF 图，可以再定；但投影日志肯定合理。核心原则是：失败结构不生成关系 triple，不产生 `rdf:reifies <<S P O>>`。

## 最终补充

现在这套设计的边界是完整的：

- heading resource 独立存在。
- glossary term resource 独立存在。
- 同名不归并。
- `indexterm2` 原行为不变，只在 `rel` 模式中作为 selector token 被消费。
- `rel` target 是 predicate。
- 一个 positional 是 display label。
- `subjects` / `objects` 是机器控制字段。
- 控制字段合法且 token 数量足够时，生成关系边。
- 控制字段非法、数量不足、selector unresolved、predicate invalid 时，不生成边，可以诊断。
- 多 subject 和多 object 生成笛卡尔积。
- selector 多候选不消歧，保留多候选事实或生成候选乘积边。
- `InlineRelationEdge` 和 `XrefEdge` 在 RDF 证据结构上尽量同构；差异只是它没有官方 xref binding。

这就是一个非常自然的书稿内图谱声明表面：作者写自然文章，索引词仍然服务索引，`rel` 宏只在需要声明边的位置出现。投影器只做结构识别和忠实投影，下游再做自己的知识工程。
</Assistant>

<User id="9">
因为都形成不了这个RDF资源，所以说不会进图，也没有必要进图，因为下游工具链他们是肯定会接触到这个投影的过程的。他们是可以拿到这个投影的这个日志的。所以说他们也是可以消费的。所以说直接日志出来，没问题。
你看一下有没有什么模糊的地方啊？不是说什么什么可以再定啊，可以推导的东西你就推导啊。如果你有什么东西啊，信息缺失的、价值标尺缺失的，你告诉我。好，那你再确认一下，整理整，再发个弹窗和我聊聊，不少于2000字或者更多。注意哦，我指的信息缺失指的就是价值。我没有你那么丰富的工程经验，那些我也判断不了。我这里提供的就是价值取向，你自己确定。如果你能判断就判断，你自己看吧。把你之前，如果你有觉得有什么模糊的东西全部给我在这里对齐了啊。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="10">
# 最终收束：失败不进图、日志承载诊断、其余规则明确化

我按你这次给的价值取向把之前还软的地方收束掉：生成不了 RDF 关系资源的东西，不进图。原因很明确：它都没有形成可用 RDF resource / relation triple，就不应该进入正式 RDF graph 污染下游查询面。下游工具链如果关心失败、审查、语法质量，它们一定会接触投影过程，也就可以消费投影日志。因此失败关系不需要投影成 `aat:InlineRelationEdge` 的失败节点，也不需要塞进 TTL。日志就是它的正确投影面。

这条规则非常重要，因为它把“图”和“诊断”分开了：

```text
图：只放已经成功形成的资源、边、证据。
日志：放投影失败、控制字段无效、selector 解析失败、数量不足等诊断。
```

这样下游 SPARQL 查询不会被失败半成品污染；同时作者和工具链仍然能看到为什么某个 `rel` 没有生成边。

## 1. 失败不进图

之前我写过“可以在调试图里放 incomplete edge evidence”，这现在应该删掉。不是不能技术上做，而是对象边界不需要它。正式 RDF 投影面只承载成功资源和成功关系证据。

失败情况包括：

```text
subjects / objects 控制字段不合法
subjects / objects 数量不足
objects=0
rel target 不能映射成 RDF predicate
subject selector unresolved
object selector unresolved
省略主语时没有当前 heading resource
一个 rel 在拿到足够 object 前行结束
一个 rel 在拿到足够 object 前遇到新的 rel，导致前一个 rel 不完整
```

这些都不生成关系 triple，也不生成 `rdf:reifies`，也不生成 `aat:InlineRelationEdge`。只出日志。

日志应该包含足够回源的信息：

```text
level: warning
code: inline-relation.insufficient-objects
message: rel macro requested objects=2 but only 1 object indexterm2 token was available on this line; relation edge was not projected.
relativePath
sourceSpan
raw rel macro 或 raw relation surface
```

这就是投影器分内的诊断。它不判断业务，只判断自己的结构契约是否满足。

## 2. 成功才有 InlineRelationEdge

`aat:InlineRelationEdge` 只为成功形成的关系边存在。它和 `aat:XrefEdge` 同构，但不携带 official xref binding。

成功边应包含：

```text
rdf:reifies << S P O >>
aat:sourceResource S
aat:targetResource O
aat:rel raw predicate token
aat:displayLabel optional positional label
aat:sourceSelector 若 subject 来自 indexterm2
aat:targetSelector object indexterm2 primary
aat:sourceMode "containing-heading" 若 subject 来自标题省略
source span / relativePath / raw
rel macro named attributes，包括 subjects / objects 和普通边字段
```

如果一个 `rel` 宏因为多 subject、多 object 或 selector 多候选生成多条边，那么每条成功边都有自己的 `InlineRelationEdge` reifier，或者共享同一个 occurrence evidence 再 reify 多个 triples。这里我判断更贴近当前 `XrefEdge` 的方式是：**每条实际 triple 有自己的 reifier resource**，但这些 reifier 可以共享同一个 raw/source span。理由是 RDF 1.2 `rdf:reifies` 的对象是一个具体 triple term；一个 reifier resource 如果同时 reifies 多个 triple，会降低“这一条边证据”的单边可查询性。现有 xref 是一个 occurrence 通常对应一个 resolved triple；多边展开时，为了下游简单，生成多个 edge resource 更清楚。

这不是业务价值选择，而是图查询便利性判断：一条 reifier 对一条 triple，SPARQL 查询和边属性挂载都更直观。

## 3. glossary term resource 独立

这里已经没有模糊：glossary term resource 独立注册，不和 heading 归并。

```text
Heading(label=配送策略) != GlossaryTerm(label=配送策略)
```

同名只是 selector catalog 里同一个 label 对应多个 owner。下游自己做实体合并。

投影器该做的是：

```text
为 heading 建 Heading resource
为 glossary term 建 GlossaryTerm resource
把 heading headline/addressLabel/generatedAddressLabel 加入 selector catalog
把 glossary term label 加入 selector catalog
selector 命中多个 owner 时保留多候选/生成多边事实
```

这里不再说“术语表投影成标题”。它不是标题。

## 4. selector 多候选如何处理

这里有一个工程判断需要定。我倾向于：**成功解析到多个候选时，生成候选笛卡尔积边，而不是只写 ambiguous 日志。**

理由来自你给的价值取向：现有 xref 如果同名标题被标题名引用，会把事实暴露出来，让下游查入度出度，回源修改。对于 `rel` 关系也是一样：作者写了 selector，selector 命中多个资源，这是源结构事实。既然每个候选都是 RDF resource，那么关系可以生成多条边。下游如果不想要这种多边，可以按 label、type、resource kind 或业务规则过滤/合并。

因此：

```text
subject selector candidates = [S1, S2]
object selector candidates = [O1, O2, O3]
```

生成 6 条 triple，6 个 InlineRelationEdge。

如果 selector 一个候选都没有，那不生成边，出日志。因为没有 RDF resource，无法形成 triple。

这和失败不进图不矛盾：多候选是有资源；unresolved 是没有资源。

## 5. subjects / objects 控制字段

这里也收束为硬规则。

`subjects`：非负整数。

```text
缺省：若左侧有 pending indexterm2，则消费最近 1 个；否则用当前 heading。
subjects=0：强制用当前 heading，不消费左侧 indexterm2。
subjects=N, N>0：消费左侧最近 N 个未消费 indexterm2。
非法：不生成边，出日志。
数量不足：不生成边，出日志。
```

`objects`：正整数。

```text
缺省：objects=1。
objects=N, N>0：消费右侧 N 个 indexterm2。
objects=0 或非法：不生成边，出日志。
数量不足：不生成边，出日志。
```

普通边字段照常保留。只有 `subjects` 和 `objects` 被投影器解释为消费控制字段。

## 6. 位置参数

这里明确：`rel` 宏最多一个位置参数，作为 display label。

```asciidoc
rel:depends-on[依赖, reason=capacity]
```

```text
predicate = depends-on
displayLabel = 依赖
reason = capacity
```

如果作者写多个位置参数：

```asciidoc
rel:depends-on[依赖, 强依赖, reason=capacity]
```

这不符合手册定义。它仍然是合法 AsciiDoc 文本，但我们的关系投影可以视为不识别这个 `rel` 模式，并出日志：`inline-relation.too-many-positional-arguments`。不要猜第二个位置参数是什么意思，也不要把它当普通字段。

这个判断来自你说的：xref 只有一个位置参数用于显示名，我们的 rel 也这样。

## 7. indexterm2 与 indexterm

当前核心语法使用 `indexterm2` 可见索引词。不要扩展到隐藏 `indexterm`。理由不是技术不能，而是当前对象的价值取向是原生书稿可见表达、实体词本身出现在正文中、顺手进入书籍索引。

因此关系端点 token 只认：

```asciidoc
indexterm2:[primary]
```

`indexterm:[primary]` 继续保持 AsciiDoc 原本行为，不参与 `rel` 关系消费。以后如果你明确要隐藏索引词参与关系，那是新一轮设计，不塞进当前对象。

## 8. raw 范围

关系 raw 可以有两个层次：

```text
relRaw：只包含 rel:predicate[...] 宏本身。
relationSurfaceRaw：包含被消费的 subject indexterm2、rel 宏、object indexterm2 之间的源片段。
```

现有 xref 的 `raw` 是宏本身。为了和 xref 同构，`aat:raw` 最好放 rel 宏本身：

```text
rel:depends-on[依赖, objects=2]
```

但 inline relation edge 还需要知道它消费了哪些 token，所以可以额外保留：

```text
aat:relationSurfaceRaw
```

例如：

```text
rel:depends-on[依赖, objects=2] indexterm2:[运力规则] 和 indexterm2:[风险控制]
```

这个不是必须立即命名，但设计上我判断应该保留两层 raw：宏 raw 用于与 xref 对齐；surface raw 用于行内关系审查。

## 9. 日志不是图

最终诊断路径：投影过程产生日志/diagnostics，`AbundantDocument.toolDiagnostics` 当前已经有 `ToolDiagnostic` 类型：`level`、`code`、`message`、`source`。这正适合承载 `inline-relation.*` 诊断。下游工具链可以拿 projection result，同时拿 diagnostics。

失败不进 TTL。这个已经定死。

## 10. 真正还缺的信息

现在我认为核心价值已经足够，不缺大的方向。只剩两个命名层面的信息缺失，不影响理论成立：

1. `GlossaryTerm` 的具体 RDF predicate 名称：term 名字字段叫 `aat:term`、`aat:label` 还是复用 `aat:headline`。我倾向于 `aat:term` + `aat:label`，不用 `headline`，因为它不是 heading。

2. `InlineRelationEdge` 的 source/target predicate 名称：用泛化的 `aat:sourceResource` / `aat:targetResource`，还是分别用 `aat:sourceEntity` / `aat:targetEntity`。我倾向于 `sourceResource` / `targetResource`，因为端点可能是 heading 或 glossary term，不要在投影层强行叫 entity。

这两个是词表命名 taste，不是价值缺口。真正的价值取向已经清楚：忠实投影、失败日志、多候选暴露、不归并、不业务裁判。

## 最终确认

这套对象现在完整成立：

```text
资源：Heading、GlossaryTerm、XrefEdge、InlineRelationEdge。
端点引用：indexterm2 selector。
关系触发：rel inline macro。
消费范围：单行。
消费方向：从左到右。
多端点：subjects / objects 控制。
多候选：生成候选乘积边。
失败：不进图，只出日志。
下游：自行合并、过滤、推理、校验。
```

我现在理解你要的是一个书稿原生的图谱声明表面，而不是一个强语法编程语言。它允许作者像写书一样写长句、写自然段、写索引词；只要 `rel` 模式满足手册定义，图就自然生成。模式不满足，书仍然是书，但这部分不进入 RDF 图，投影日志告诉作者哪里没有生成边。
</Assistant>

<User id="10">
好的啊，命名呢保持干净，下游呢，它可以去操纵这些东西，进行它们自己要的合并呀，或者说转换呀，是不是我们这里保持干净？所以说命名呢，可以按照干净的方式去命名。然后呢关于这个RAW的这一个保留哈，可以保留两个层次，因为确实有这样的东西，那就保留哈。因为我们的语义确实有这样啊。那你自己再去结合我们之前这一个弹窗的记录，再去整一个最新的这一个完整的设计，没错，又需要请你转动你的脑筋进行一次大整理了啊。然后呢已经被我们废弃的东西，不提它，直接不提。就当做它没有发生一样，我们直接说，啊，这一个已经被确定的东西，以及它目前这个东西，它是什么样子，讲的清清楚楚。因为这些东西都已经被明确了，你把它整在一起，我单独看过去就行了啊。我会一条条看过去。好，那请你整一整吧，整好之后弹窗直接发给我，不少于6000字或者更多。开始吧。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="11">
# AsciiDoc 行内实体关系投影设计稿

这一版只整理已经确定下来的对象，不再讨论被放弃的方案。当前对象是一套建立在 AsciiDoc 书稿表面上的 RDF 关系投影机制。它让作者继续按照书籍习惯写标题、术语表、索引词、自然句子和 inline macro；投影器只在明确的 `rel` 行内关系模式成立时，把源文档里的结构事实投影为 RDF 资源、关系边和边证据。它不做业务实体消歧，不归并同名资源，不解释作者领域词表，不替下游工具决定哪些节点应该合并。

这个对象的核心是：

```text
标题形成 Heading 资源。
术语表 term 形成 GlossaryTerm 资源。
indexterm2 是可见索引词，也是 rel 可消费的 selector token。
rel inline macro 是关系边声明触发器。
成功识别的关系生成 RDF triple 和 InlineRelationEdge 证据资源。
失败识别不进图，只进入投影日志。
```

这套设计的目标不是把 AsciiDoc 改造成编程语言，也不是做自然语言理解。它是一个书稿原生的结构化表达层：作者写的是书，工具看到的是可查询图谱。

## 1. 总体对象

行内实体关系投影机制处理的是书稿正文中的关系声明。它依赖两类已注册资源：标题资源和术语表资源。作者在正文里用 `indexterm2:[...]` 标记实体提及，用 `rel:predicate[...]` 声明关系谓词。投影器在单行范围内，从左到右扫描这些 token，按照消费规则构造关系边。

最小表面如下：

```asciidoc
indexterm2:[A] rel:p[显示名] indexterm2:[B]
```

投影为：

```text
A --p--> B
```

省略主语表面如下：

```asciidoc
rel:p[显示名] indexterm2:[B]
```

投影为：

```text
当前直系标题 --p--> B
```

多端点表面如下：

```asciidoc
indexterm2:[A] 与 indexterm2:[B] rel:p[显示名, subjects=2, objects=2] indexterm2:[C] 和 indexterm2:[D]
```

投影为同一谓词下的笛卡尔积边：

```text
A --p--> C
A --p--> D
B --p--> C
B --p--> D
```

普通文字可以自然穿插在这些 token 中间。投影器不解析普通文字的语义，只识别 token 顺序和 `rel` 宏控制字段。

## 2. 资源类型

最终资源类型保持干净，不互相伪装。

### Heading

`aat:Heading` 是现有标题资源。它来自 document title 或 section heading。它保留标题文本、层级、文档顺序、子节点顺序、源行号、原始源片段、地址标签、生成地址标签、role、字段等。

典型事实：

```turtle
<#heading-l12-o0> a aat:Heading ;
  aat:headline "配送策略" ;
  aat:addressLabel "delivery-policy" ;
  aat:role "policy" ;
  aat:headingLevel 1 ;
  aat:documentOrder 2 ;
  aat:headingLine 13 ;
  aat:relativePath "books/cold-chain.adoc" .
```

### GlossaryTerm

`aat:GlossaryTerm` 是新增资源。它来自 `[glossary]` section 下 description list 的 term。它不是 heading，不投影成 heading，不归并到 heading。

一个术语表条目：

```asciidoc
[glossary]
配送策略:: 冷链订单在城市仓、前置仓和末端配送之间选择履约路径的规则集合。
```

投影为独立资源：

```turtle
<#glossary-term-l4-o0> a aat:GlossaryTerm ;
  aat:term "配送策略" ;
  aat:label "配送策略" ;
  aat:definition "冷链订单在城市仓、前置仓和末端配送之间选择履约路径的规则集合。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 4 ;
  aat:endLine 4 .
```

`aat:term` 表达术语表 term 的源文本身份。`aat:label` 提供 selector catalog 使用的公共标签。`aat:definition` 保留术语定义文本。

### XrefEdge

`aat:XrefEdge` 是现有 xref 边证据资源。它来自 AsciiDoc `xref:` 或 shorthand xref。它有官方 Asciidoctor binding：`officialHref`、`officialResolvedId`、`officialResolvedType`、`officialReftext`。这些字段保留，因为它们是下游消费 xref 解析结果的重要事实。

xref edge 的结构继续保持现状。

### InlineRelationEdge

`aat:InlineRelationEdge` 是新增边证据资源。它来自成功识别的 `rel` 行内关系声明。它和 `XrefEdge` 在 RDF 结构上同构：都表示一个源文档 occurrence 对某条 RDF triple 的证据。它没有 official xref binding，因为它不是 Asciidoctor xref resolver 的结果。

典型事实：

```turtle
<#inline-rel-edge-l15-c10-o0> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#heading-l12-o0> rel:depends-on <#glossary-term-l5-o0>)>> ;
  aat:sourceResource <#heading-l12-o0> ;
  aat:targetResource <#glossary-term-l5-o0> ;
  aat:sourceMode "containing-heading" ;
  aat:targetSelector "运力规则" ;
  aat:rel "depends-on" ;
  aat:displayLabel "依赖" ;
  aat:objects "2" ;
  aat:reason "capacity-check" ;
  aat:raw "rel:depends-on[依赖, objects=2, reason=capacity-check]" ;
  aat:relationSurfaceRaw "rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 15 ;
  aat:startColumn 8 ;
  aat:endLine 15 ;
  aat:endColumn 92 .
```

## 3. 不归并原则

同名 heading 和 glossary term 不归并。

如果源文档同时有：

```asciidoc
[glossary]
配送策略:: 冷链订单在不同约束下选择履约路径的规则集合。

== 配送策略
```

投影中存在两个资源：

```turtle
<#glossary-term-l4-o0> a aat:GlossaryTerm ; aat:label "配送策略" .
<#heading-l8-o0> a aat:Heading ; aat:headline "配送策略" .
```

它们只是 label 相同，不代表投影器认为它们是同一个对象。下游可以自己按 label、role、上下文、人工规则、SHACL、SPARQL 或业务知识做合并。投影器不做 entity resolution。

这个原则适用于所有同名资源。投影器暴露源文档事实，不替作者解释现实世界。

## 4. Selector Catalog

关系端点不是通过普通字符串匹配获得，而是通过 `indexterm2` 的 primary 值作为 selector 去查询 catalog。

catalog 的 owner 可以来自：

```text
Heading headline
Heading addressLabel
Heading generatedAddressLabel
local target alias（现有机制）
GlossaryTerm label / term
```

`indexterm2:[配送策略]` 的 selector 是 `配送策略`。它查询 catalog 后可能返回：

```text
[]                         unresolved
[resourceA]                bound
[resourceA, resourceB...]  ambiguous / multi-candidate
```

如果返回空集，关系不能形成 RDF edge，投影日志记录 unresolved selector。

如果返回多个候选，投影器不消歧。成功关系按候选集合生成多条边。

## 5. indexterm2 的角色

`indexterm2:[primary]` 原本是可见索引词。这个行为不改变。

单独出现：

```asciidoc
indexterm2:[风险控制]
```

它仍然只是索引词。它可以进入书后索引，也可以作为实体提及被其他投影记录，但它不生成关系边。

只有在同一行中被 `rel` 宏消费时，它才成为关系端点 selector token。

当前核心语法只使用 `indexterm2`。隐藏索引词 `indexterm:[...]` 不参与当前关系消费模型。

## 6. rel 宏语法

`rel` 宏是关系声明触发器。

语法：

```asciidoc
rel:predicate[displayLabel?, namedAttrs...]
```

规则：

```text
macro name: rel
macro target: predicate
最多一个 positional argument: displayLabel
named attributes: edge fields
subjects: 控制字段
objects: 控制字段
```

示例：

```asciidoc
rel:depends-on[依赖, objects=2, reason=capacity-check]
```

解释：

```text
predicate = depends-on
displayLabel = 依赖
objects = 2
reason = capacity-check
```

`predicate` 使用现有 relation predicate mapping 思路：普通 token 进入 `rel:` namespace；CURIE 按 prefix map 展开；absolute IRI 保留；不可映射时 relation 不形成有效 RDF triple，投影日志记录 invalid predicate。

如果 `rel` 宏写了多个位置参数，不符合本语法。该 `rel` 关系模式不识别，投影日志记录 too many positional arguments。

## 7. 控制字段

`subjects` 和 `objects` 是机器控制字段。它们一旦出现，就必须是可识别整数，并且当前行 token 数量必须满足要求。控制字段不合法或数量不足时，不生成关系边，不回退默认。

### subjects

`subjects` 是非负整数。

```text
未写：若左侧存在未消费 indexterm2，则消费最近 1 个；否则使用当前直系 Heading resource。
subjects=0：强制使用当前直系 Heading resource，不消费左侧 indexterm2。
subjects=N, N>0：从左侧未消费 indexterm2 token 中消费最近 N 个作为 subject selectors。
非法：不生成边，出日志。
数量不足：不生成边，出日志。
```

### objects

`objects` 是正整数。

```text
未写：objects=1。
objects=N, N>0：从右侧后续 indexterm2 token 中消费 N 个作为 object selectors。
objects=0：不生成边，出日志。
非法：不生成边，出日志。
数量不足：不生成边，出日志。
```

## 8. 单行消费模型

消费范围是一行。每一行独立处理。状态不跨行。

行内关注两类 token：

```text
M(label) = indexterm2:[label]
R(predicate, fields) = rel:predicate[fields]
```

普通文字、标点、解释句、连接词只作为间隔存在。

扫描状态：

```text
pendingSubjects = []
activeRelation = none
```

遇到 `M(label)`：

```text
如果 activeRelation 正在等待 object：
    M(label) 进入当前 relation 的 object token 列表。
    若 object 数量满足 objects=N，则完成 relation。
否则：
    M(label) 加入 pendingSubjects，等待后续 rel 消费。
```

遇到 `R(predicate)`：

```text
读取 subjects / objects 控制字段。
若 subjects=0：source = current heading。
若 subjects=N>0：从 pendingSubjects 末尾消费 N 个。
若 subjects 未写：有 pending subject 则消费最近 1 个；否则 source = current heading。
然后进入 activeRelation，等待右侧 objects 个 M(label)。
```

完成 relation 后，被消费的 token 不再给后续 `rel` 使用。

## 9. 多端点展开

成功 relation 得到：

```text
subject selectors = [S1, S2...]
object selectors = [O1, O2...]
```

每个 selector 查询 catalog 得到 resource candidates。

最终关系边集合是：

```text
resolvedSubjectResources × resolvedObjectResources
```

所有边使用同一个 predicate。

例如：

```asciidoc
indexterm2:[领域事实] 与 indexterm2:[规约] rel:entails[推出, subjects=2] indexterm2:[需求]
```

生成：

```text
领域事实 --entails--> 需求
规约 --entails--> 需求
```

例如：

```asciidoc
indexterm2:[性能需求] 与 indexterm2:[可靠性需求] rel:validated-by[由其验证, subjects=2, objects=2] indexterm2:[压测方案] 和 indexterm2:[故障演练]
```

生成：

```text
性能需求 --validated-by--> 压测方案
性能需求 --validated-by--> 故障演练
可靠性需求 --validated-by--> 压测方案
可靠性需求 --validated-by--> 故障演练
```

如果 selector 命中多个 RDF resource，则继续展开候选乘积。投影器不归并。

## 10. raw 双层保留

`InlineRelationEdge` 保留两层 raw。

### aat:raw

`aat:raw` 与现有 xref edge 对齐，保存 `rel` 宏本身：

```text
rel:depends-on[依赖, objects=2, reason=capacity-check]
```

### aat:relationSurfaceRaw

`aat:relationSurfaceRaw` 保存本次 relation 消费涉及的行内源片段，包括被消费的 subject token、rel 宏、object token 及其间文本。

例如：

```text
rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]
```

显式 subject 示例：

```text
indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]
```

这两层 raw 表达不同事实：宏 raw 用于和 xref occurrence 对齐；relation surface raw 用于审查这条行内关系到底消费了哪段源文本。

## 11. 成功投影

成功关系产生两类图事实。

第一，实际关系 triple：

```turtle
<S> rel:p <O> .
```

第二，边证据资源：

```turtle
<Edge> a aat:InlineRelationEdge ;
  rdf:reifies <<(<S> rel:p <O>)>> ;
  aat:sourceResource <S> ;
  aat:targetResource <O> ;
  aat:rel "p" ;
  aat:displayLabel "显示名" ;
  aat:sourceSelector "..." ;
  aat:targetSelector "..." ;
  aat:raw "rel:p[...]" ;
  aat:relationSurfaceRaw "..." ;
  aat:relativePath "..." ;
  aat:startLine ... ;
  aat:startColumn ... ;
  aat:endLine ... ;
  aat:endColumn ... .
```

每条实际 triple 对应一个 `InlineRelationEdge` reifier。若一个 `rel` 宏通过多端点展开生成多条 triple，则生成多条 edge 证据资源。它们可以共享相同 `aat:raw`、`aat:relationSurfaceRaw` 和 source span。

这样下游查询最简单：每个 edge evidence reifies 一个明确 triple。

## 12. 失败诊断

失败不进 RDF graph。失败只进入投影日志。

可以使用现有 `ToolDiagnostic` 风格：

```text
level: warning
code: inline-relation.insufficient-objects
message: rel macro requested objects=2 but only 1 object indexterm2 token was available on this line; relation edge was not projected.
source: SourceSpan
```

诊断只覆盖投影器自己的结构契约。

诊断类型：

```text
inline-relation.invalid-control-field
inline-relation.insufficient-subjects
inline-relation.insufficient-objects
inline-relation.missing-heading-subject
inline-relation.unresolved-subject-selector
inline-relation.unresolved-object-selector
inline-relation.invalid-predicate
inline-relation.too-many-positional-arguments
inline-relation.interrupted-relation
```

诊断不判断业务语义。例如：

```text
不判断 A --p--> B 是否业务正确。
不判断 heading 和 glossary term 是否应合并。
不判断 confidence=high 是否符合某个枚举。
不判断 subjects=2 的笛卡尔积是否符合作者领域模型。
```

这些属于下游。

## 13. 完整示例

### 源文档

```asciidoc
= 冷链履约策略说明

[glossary]
配送策略:: 冷链订单在城市仓、前置仓和末端配送之间选择履约路径的规则集合。
运力规则:: 用于判断车辆、骑手、仓库波次和温控设备是否足够支持当前订单的规则。
风险控制:: 在履约过程中识别温控失败、延迟送达和异常签收风险的机制。
降级规则:: 当原计划履约路径无法满足约束时，用来选择替代履约路径的规则。
客户承诺:: 平台向客户展示并承诺的送达时间、温区和异常处理说明。
促销计划:: 运营团队为了提升转化或清理库存而安排的价格、曝光和补贴组合。

[#delivery-policy.policy, status=active]
== 配送策略

在日常履约中，rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]，因为冷链订单不只需要有货，还需要在承诺温区和承诺时间内完成拣货、交接与送达。

当运营团队准备扩大曝光时，indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]，否则页面上的可售表达会早于真实供给能力。

如果系统监测到城市仓温控设备不足，indexterm2:[风险控制] 会在人工复核后 rel:triggers[触发, severity=high] indexterm2:[降级规则]，并由当前章节继续 rel:updates[更新, scope=customer-facing] indexterm2:[客户承诺]。
```

### 资源投影

```turtle
@prefix aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>.
@prefix rel: <https://micheng.dev/ns/asciidoc-relation#>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.

<#heading-l1-o0> a aat:Heading ;
  aat:headline "冷链履约策略说明" ;
  aat:headingLevel 0 ;
  aat:documentOrder 1 ;
  aat:headingLine 1 ;
  aat:relativePath "books/cold-chain.adoc" .

<#glossary-term-l4-o0> a aat:GlossaryTerm ;
  aat:term "配送策略" ;
  aat:label "配送策略" ;
  aat:definition "冷链订单在城市仓、前置仓和末端配送之间选择履约路径的规则集合。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 4 ;
  aat:endLine 4 .

<#glossary-term-l5-o0> a aat:GlossaryTerm ;
  aat:term "运力规则" ;
  aat:label "运力规则" ;
  aat:definition "用于判断车辆、骑手、仓库波次和温控设备是否足够支持当前订单的规则。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 5 ;
  aat:endLine 5 .

<#glossary-term-l6-o0> a aat:GlossaryTerm ;
  aat:term "风险控制" ;
  aat:label "风险控制" ;
  aat:definition "在履约过程中识别温控失败、延迟送达和异常签收风险的机制。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 6 ;
  aat:endLine 6 .

<#glossary-term-l7-o0> a aat:GlossaryTerm ;
  aat:term "降级规则" ;
  aat:label "降级规则" ;
  aat:definition "当原计划履约路径无法满足约束时，用来选择替代履约路径的规则。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 7 ;
  aat:endLine 7 .

<#glossary-term-l8-o0> a aat:GlossaryTerm ;
  aat:term "客户承诺" ;
  aat:label "客户承诺" ;
  aat:definition "平台向客户展示并承诺的送达时间、温区和异常处理说明。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 8 ;
  aat:endLine 8 .

<#glossary-term-l9-o0> a aat:GlossaryTerm ;
  aat:term "促销计划" ;
  aat:label "促销计划" ;
  aat:definition "运营团队为了提升转化或清理库存而安排的价格、曝光和补贴组合。" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 9 ;
  aat:endLine 9 .

<#heading-l12-o0> a aat:Heading ;
  aat:headline "配送策略" ;
  aat:addressLabel "delivery-policy" ;
  aat:role "policy" ;
  aat:status "active" ;
  aat:headingLevel 1 ;
  aat:documentOrder 2 ;
  aat:headingLine 13 ;
  aat:relativePath "books/cold-chain.adoc" .
```

注意：`<#glossary-term-l4-o0>` 和 `<#heading-l12-o0>` 都叫“配送策略”，但不归并。

### 第一段关系

源句：

```asciidoc
rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]
```

当前标题作 subject，两个 object：

```turtle
<#heading-l12-o0> rel:depends-on <#glossary-term-l5-o0> .
<#heading-l12-o0> rel:depends-on <#glossary-term-l6-o0> .

<#inline-rel-edge-l15-c10-o0-a> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#heading-l12-o0> rel:depends-on <#glossary-term-l5-o0>)>> ;
  aat:sourceResource <#heading-l12-o0> ;
  aat:targetResource <#glossary-term-l5-o0> ;
  aat:sourceMode "containing-heading" ;
  aat:targetSelector "运力规则" ;
  aat:rel "depends-on" ;
  aat:displayLabel "依赖" ;
  aat:objects "2" ;
  aat:reason "capacity-check" ;
  aat:raw "rel:depends-on[依赖, objects=2, reason=capacity-check]" ;
  aat:relationSurfaceRaw "rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 15 ;
  aat:startColumn 8 .

<#inline-rel-edge-l15-c10-o0-b> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#heading-l12-o0> rel:depends-on <#glossary-term-l6-o0>)>> ;
  aat:sourceResource <#heading-l12-o0> ;
  aat:targetResource <#glossary-term-l6-o0> ;
  aat:sourceMode "containing-heading" ;
  aat:targetSelector "风险控制" ;
  aat:rel "depends-on" ;
  aat:displayLabel "依赖" ;
  aat:objects "2" ;
  aat:reason "capacity-check" ;
  aat:raw "rel:depends-on[依赖, objects=2, reason=capacity-check]" ;
  aat:relationSurfaceRaw "rel:depends-on[依赖, objects=2, reason=capacity-check] indexterm2:[运力规则] 和 indexterm2:[风险控制]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 15 ;
  aat:startColumn 8 .
```

### 第二段关系

源句：

```asciidoc
indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]
```

subject selectors：促销计划、配送策略。

object selectors：客户承诺、运力规则。

“配送策略” selector 命中两个资源：glossary term 和 heading。因此 subject resources 是：促销计划 glossary、配送策略 glossary、配送策略 heading。

生成候选乘积边：

```turtle
<#glossary-term-l9-o0> rel:constrains <#glossary-term-l8-o0> .
<#glossary-term-l9-o0> rel:constrains <#glossary-term-l5-o0> .
<#glossary-term-l4-o0> rel:constrains <#glossary-term-l8-o0> .
<#glossary-term-l4-o0> rel:constrains <#glossary-term-l5-o0> .
<#heading-l12-o0> rel:constrains <#glossary-term-l8-o0> .
<#heading-l12-o0> rel:constrains <#glossary-term-l5-o0> .
```

每条边都有自己的 `aat:InlineRelationEdge`。下面展示其中一条：

```turtle
<#inline-rel-edge-l17-c41-o0-a> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#glossary-term-l9-o0> rel:constrains <#glossary-term-l8-o0>)>> ;
  aat:sourceResource <#glossary-term-l9-o0> ;
  aat:targetResource <#glossary-term-l8-o0> ;
  aat:sourceSelector "促销计划" ;
  aat:targetSelector "客户承诺" ;
  aat:rel "constrains" ;
  aat:displayLabel "共同约束" ;
  aat:subjects "2" ;
  aat:objects "2" ;
  aat:review "required" ;
  aat:raw "rel:constrains[共同约束, subjects=2, objects=2, review=required]" ;
  aat:relationSurfaceRaw "indexterm2:[促销计划] 与 indexterm2:[配送策略] rel:constrains[共同约束, subjects=2, objects=2, review=required] indexterm2:[客户承诺] 和 indexterm2:[运力规则]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 17 ;
  aat:startColumn 41 .
```

### 第三段关系

第一条：

```asciidoc
indexterm2:[风险控制] 会在人工复核后 rel:triggers[触发, severity=high] indexterm2:[降级规则]
```

```turtle
<#glossary-term-l6-o0> rel:triggers <#glossary-term-l7-o0> .

<#inline-rel-edge-l19-c32-o0> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#glossary-term-l6-o0> rel:triggers <#glossary-term-l7-o0>)>> ;
  aat:sourceResource <#glossary-term-l6-o0> ;
  aat:targetResource <#glossary-term-l7-o0> ;
  aat:sourceSelector "风险控制" ;
  aat:targetSelector "降级规则" ;
  aat:rel "triggers" ;
  aat:displayLabel "触发" ;
  aat:severity "high" ;
  aat:raw "rel:triggers[触发, severity=high]" ;
  aat:relationSurfaceRaw "indexterm2:[风险控制] 会在人工复核后 rel:triggers[触发, severity=high] indexterm2:[降级规则]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 19 ;
  aat:startColumn 32 .
```

第二条：

```asciidoc
rel:updates[更新, scope=customer-facing] indexterm2:[客户承诺]
```

前面的 `降级规则` 已被第一条关系消费为 object，不会成为这里的 subject。该 `rel` 没有未消费 subject，使用当前 heading。

```turtle
<#heading-l12-o0> rel:updates <#glossary-term-l8-o0> .

<#inline-rel-edge-l19-c96-o0> a aat:InlineRelationEdge ;
  rdf:reifies <<(<#heading-l12-o0> rel:updates <#glossary-term-l8-o0>)>> ;
  aat:sourceResource <#heading-l12-o0> ;
  aat:targetResource <#glossary-term-l8-o0> ;
  aat:sourceMode "containing-heading" ;
  aat:targetSelector "客户承诺" ;
  aat:rel "updates" ;
  aat:displayLabel "更新" ;
  aat:scope "customer-facing" ;
  aat:raw "rel:updates[更新, scope=customer-facing]" ;
  aat:relationSurfaceRaw "rel:updates[更新, scope=customer-facing] indexterm2:[客户承诺]" ;
  aat:relativePath "books/cold-chain.adoc" ;
  aat:startLine 19 ;
  aat:startColumn 96 .
```

## 14. 最终定义

最终对象可以这样定义：

> AsciiDoc 行内实体关系投影是一套以 `rel` inline macro 为触发器的 RDF 关系声明机制。它把 heading 和 glossary term 投影为独立 RDF resource，把 `indexterm2` primary 作为 selector token，把 `rel` target 作为 relation predicate，把一个 positional argument 作为 display label，把 named attributes 作为 edge fields，并通过 `subjects` / `objects` 控制字段决定同一行内消费多少前置和后置 selector。成功识别后，投影器按照 selector candidate sets 的笛卡尔积生成 RDF relation triples，并为每条 triple 生成 `aat:InlineRelationEdge` reifier evidence。失败识别不进入 RDF graph，只进入投影日志。投影器不归并同名资源，不做业务语义裁判，不跨行，不解析普通自然语言。

这就是目前已经确定的设计。它保持 AsciiDoc 书稿表面自然、保持 RDF 投影干净、保持下游工具自由。
</Assistant>

<User id="11">
我前面确实说了label没错呀，因为他们在，因为他们可以他对于我们人来理解，我们确实知道heading line呀，还有这个呃稳定ID呀，我们当然知道它是一种寻址地址，可以作为寻址地址进行反向查找，是不是？所以说我会口语上称呼为他们都为label啊？但是你会发现heading这边是不是它没有直接叫做label的字段？为什么它直接就是heading line呀？是不是？那你的这个term这边为什么还要有一个label呢？你term这边term自己不就是那个东西吗？你不重复了吗？是不是？好，好好想一想吧，看一下有没有什么要补充说明的来弹窗和我沟通  从某种角度来讲，你这个RDF资源节点已经有些地方都不同构了啊，好好想一想吧。

Tip:
完成后记得使用弹窗与我沟通。
</User>

<Assistant id="12">
# 正式文档写作计划：`indexterm2 + rel 行内实体关系投影`

我已经完整阅读了这几类材料：

- `notes/0-我/关于言语沟通.adoc`
- `notes/0-我/粉色大象与白熊.md`
- `asciidoc-multi-book-workspace/docs/07-structured-writing-conventions.md`
- `semantic-writing-discipline` 技能及其三个 reference：`object-model.md`、`discourse-construction.md`、`audit-checklist.md`
- 目标目录：`micheng-ts/projects/asciidoc-abundant-tree/docs/plan/indexterm2 + rel 行内实体关系投影/`
- 目标目录下的原始讨论记录：`001-raw-indexterm2 + rel 行内实体关系投影.md`

我现在不会开始写正式正文。下面是我准备如何写、如何组织、如何控制语义层次，以及我自己执行这件事时要遵守的注意事项。

## 一、三种话语层次必须分开

这次最重要的约束不是“写长”，而是“不能混层”。我会把三种话语严格分开。

第一层是**正式文档正文**。

这份正文是给未来读者、实现者、审查者和下游工具链作者看的。它只描述这套设计本身：对象是什么，资源有哪些，语法表面是什么，解释规则是什么，RDF 投影是什么，失败诊断是什么，示例如何对应投影事实。正文里不能出现“我们刚才讨论过”“上一版放弃了”“我觉得这样更稳”“为了避免你误会”“我准备这么写”这类过程话语。正文也不能把作者和我之间的弹窗对话当作材料展示。读者不是来看讨论史的，读者是来看对象本身的。

第二层是**弹窗沟通层**。

现在这条弹窗就属于这一层。这里可以谈计划、组织方式、写作注意事项、是否需要补读材料、是否存在价值判断缺口。这里可以说“我会如何处理”，因为这不是正式文档正文。这个层次是协作过程，不是最终读者的对象文本。

第三层是**原始讨论材料层**。

`001-raw-indexterm2 + rel 行内实体关系投影.md` 是原始材料，里面有大量弹窗来回、纠错、废弃方案、情绪表达、探索过程、临时命名和错误推理。它的作用是提供事实来源和约束记录，不会被直接搬进正式文档。正式文档只吸收最终被确定的对象事实。已经废弃的内容不进入正文，不以“曾经考虑过但放弃”这种形式出现。除非某个排除规则本身是当前对象的公共契约，否则不写排除史。

混在一起会导致正式文档失去对象性。比如在正文里写“之前我们考虑过字符串匹配，现在不用”，读者会被迫进入讨论史；在正文里写“我这里保持克制”，读者会看到作者表演；在正文里写“你要求我这样做”，读者会被拉入弹窗语境。这些都不能出现。

## 二、写作总原则

这篇文档采用 object-language 写法。每个段落都要服务对象本身，不服务作者姿态。

我会按照以下规则写：

1. **只写当前设计，不写演化史。**
   正文不叙述从“左右字符串匹配”到 `indexterm2` 的变化，不叙述 glossary 是否曾经考虑归并，不叙述 raw 是否曾经摇摆。这些都不是当前对象的定义。

2. **只写对象事实，不写作者过程。**
   不出现“本文试图”“我们希望”“我将”“为了更稳”“这里选择”这类自我管理句。需要表达设计理由时，用对象关系表达，例如“失败关系不进入 RDF 图；投影日志承载失败诊断。”

3. **规则先于示例。**
   示例不能替代规则。每个示例前必须已经有明确规则；示例只演示规则如何投影。

4. **命名保持本体干净。**
   口语里的 label space 不等于 RDF 上统一增加 `aat:label` 字段。Heading 使用 `aat:headline`、`aat:addressLabel`、`aat:generatedAddressLabel` 等已有字段进入 selector catalog；GlossaryTerm 使用 `aat:term` 进入 selector catalog。不会给 GlossaryTerm 额外复制 `aat:label`。

5. **诊断和图分离。**
   成功形成 RDF resource / relation triple 的内容进入 RDF 图；失败关系不进入 RDF 图，只进入投影日志。正式文档要把这条规则写成公共契约。

6. **下游职责不进入投影器职责。**
   同名资源是否合并、边字段是否符合业务枚举、某条关系是否业务正确，都是下游模型、SPARQL、SHACL、人工审查或业务规则的事情。投影器只做源结构投影和结构诊断。

7. **不使用否定指令制造反弹焦点。**
   受“粉色大象与白熊”提醒，正文不通过反复列举废弃方案来定义当前对象。需要说明边界时，优先正面定义当前规则，而不是说一堆“不是这个、不是那个”。

8. **信息量恰好够用。**
   受“言语沟通”里的量的准则、关系准则和信号/噪音区分影响，正文要承载必要信息，不写客套、不写铺垫、不写态度词。每句话都要减少读者不确定性。

## 三、文档格式与文件安排

目标目录已经存在：

```text
micheng-ts/projects/asciidoc-abundant-tree/docs/plan/indexterm2 + rel 行内实体关系投影/
```

目录里已有：

```text
001-raw-indexterm2 + rel 行内实体关系投影.md
raw.md
```

我准备新建一篇正式设计文档，不覆盖 raw 文件。文件名建议为：

```text
002-indexterm2-rel-inline-relation-projection-design.md
```

理由是：

- `001-raw...md` 已经是原始讨论记录。
- 新文件用 `002-` 放在它后面，保持目录内部阅读顺序。
- 文件名使用 ASCII 主干，避免工具链处理空格和符号时产生额外问题。
- 标题正文可以使用中文：`# indexterm2 + rel 行内实体关系投影设计`。

如果你希望文件名完全中文，我也可以使用：

```text
002-indexterm2 + rel 行内实体关系投影设计.md
```

但从维护角度，我会优先使用 ASCII 主干加中文标题。

正文使用 Markdown，因为目标目录已有 `.md` 原始记录，且用户指定的是 `docs/plan` 下的设计长文，不是一本 AsciiDoc book。正式文档中的 AsciiDoc 示例会使用 fenced code block 标注 `asciidoc`，TTL 示例使用 `turtle`。

## 四、文章总体结构

我会把文档组织成以下主干。每一节都有明确的对象职责。

### 1. 标题与摘要

标题：

```markdown
# indexterm2 + rel 行内实体关系投影设计
```

摘要只说明对象，不写写作动机史。大意是：

- 本设计定义一种 AsciiDoc 行内关系声明表面。
- `indexterm2` 提供可见索引词 selector token。
- `rel` inline macro 声明关系谓词和边字段。
- 标题与术语表 term 独立形成 RDF resource。
- 成功关系进入 RDF 图；失败关系进入投影日志。

摘要不会说“为了让作者更轻松”这种泛化愿望，除非它转化为对象事实：该表面允许自然句子中穿插普通文本，投影器只消费明确 token。

### 2. 术语与对象边界

这一节定义全文受控词。包括：

- `Heading resource`
- `GlossaryTerm resource`
- `indexterm2 token`
- `rel macro`
- `selector`
- `selector catalog`
- `InlineRelationEdge`
- `relation surface raw`
- `projection diagnostic`

这里会避免“实体”一词泛滥。因为图里的端点可以是 Heading resource 或 GlossaryTerm resource，正式词汇更适合用 `resource`。如果需要说“实体关系”，也要说明它是上层理解；投影层只承认 resource。

### 3. 资源层

这一节定义 RDF 图中有哪些资源。

#### 3.1 Heading

使用现有 `aat:Heading`。写它的字段来源：`aat:headline`、`aat:addressLabel`、`aat:generatedAddressLabel`、source coordinate、heading order、role、field 等。不会展开现有 heading projection 的全部细节，只写本设计依赖哪些字段。

#### 3.2 GlossaryTerm

定义新增 `aat:GlossaryTerm`。它来自 `[glossary]` section 下 description list term。

字段会写成：

```turtle
<#glossary-term-l4-o0> a aat:GlossaryTerm ;
  aat:term "配送策略" ;
  aat:definition "..." ;
  aat:relativePath "..." ;
  aat:startLine 4 ;
  aat:endLine 4 .
```

这里明确不用 `aat:label`。`aat:term` 本身就是 term 名字。selector catalog 可以登记 `aat:term` 的值，但 RDF resource 不重复写 `aat:label`。

#### 3.3 XrefEdge 与 InlineRelationEdge 的关系

写清楚：`InlineRelationEdge` 和现有 `XrefEdge` 都是边证据资源，都可以 `rdf:reifies` 某个 triple。区别是：

- `XrefEdge` 来自 `xref`，有 Asciidoctor official binding。
- `InlineRelationEdge` 来自 `rel` 宏消费 `indexterm2` token，没有 official xref binding。

这不是“不同本体”，而是同类关系证据的不同来源。

### 4. Selector Catalog

这一节定义 selector 查询面。

会明确：selector catalog 是投影内部或派生查询结构，不要求 RDF 上所有资源都有同名字段。进入 selector catalog 的值包括：

```text
Heading: aat:headline
Heading: aat:addressLabel
Heading: aat:generatedAddressLabel
Heading: local target alias 写入的 aat:addressLabel
GlossaryTerm: aat:term
```

这里会特别处理你刚刚指出的问题：口语里可把这些都称为 label，但正式 RDF 字段不统一叫 `label`。Heading 没有 `aat:label`；GlossaryTerm 也不增加 `aat:label`。catalog 是查找机制，不是资源本体字段。

### 5. 行内关系表面

这一节定义作者写法。

最小显式主语：

```asciidoc
indexterm2:[A] rel:p[显示名] indexterm2:[B]
```

省略主语：

```asciidoc
rel:p[显示名] indexterm2:[B]
```

多端点：

```asciidoc
indexterm2:[A] 与 indexterm2:[B] rel:p[显示名, subjects=2, objects=2] indexterm2:[C] 和 indexterm2:[D]
```

这一节只定义表面，不开始解释算法。算法放到下一节。

### 6. rel 宏参数

这一节定义 `rel` 宏的 target、positionals、named attributes。

会写：

- macro name 固定为 `rel`
- target 是 predicate token
- 最多一个 positional，作为 display label
- named attributes 是边字段
- `subjects` 和 `objects` 是投影器识别的控制字段

如果多个 positional，关系模式不识别，进入日志。

这里不会推荐作者使用某类业务字段，也不会评价字段名。字段含义由书稿和下游模型决定。

### 7. 控制字段

这一节详细定义 `subjects` 和 `objects`。

`subjects`：非负整数。

- 缺省：左侧有未消费 `indexterm2` 就消费最近 1 个；没有则用当前 heading。
- `subjects=0`：强制用当前 heading。
- `subjects=N`：消费左侧最近 N 个未消费 `indexterm2` token。
- 非整数或数量不足：失败，不进图，出日志。

`objects`：正整数。

- 缺省：1。
- `objects=N`：消费右侧 N 个 `indexterm2` token。
- `objects=0`、非整数或数量不足：失败，不进图，出日志。

这一节要很精确，不用“可以”“倾向于”“建议”这类软词。

### 8. 单行消费模型

这一节写数学模型。

将一行抽象成 token 序列：

```text
M(label) = indexterm2:[label]
R(predicate, fields) = rel:predicate[fields]
```

定义状态：

```text
pendingSubjects = []
activeRelation = none
```

定义扫描规则。

重点写清：

- 范围是一行。
- 普通文字只作为间隔。
- token 被消费后不再参与后续关系。
- 一个 `rel` 未完成时遇到行尾或无法满足 object 数量，则失败日志。
- 当前 heading 只在 subject 省略时使用。

### 9. Selector 解析与多候选

这一节定义 selector 到 resource 的解析结果。

结果分三类：

```text
unresolved: 0 个候选
bound: 1 个候选
multi-candidate: 多个候选
```

`unresolved`：关系失败，不进图，出日志。

`multi-candidate`：不消歧。生成候选乘积边。

这里会写出公式：

```text
subjectResources = union(resolve(subjectSelectors))
objectResources = union(resolve(objectSelectors))
edges = subjectResources × objectResources
```

但要注意：如果任意 required selector unresolved，不能拿空集生成边；应该出日志。

### 10. 成功 RDF 投影

这一节定义成功进入图的事实。

成功关系生成：

```turtle
<S> rel:p <O> .
```

以及：

```turtle
<Edge> a aat:InlineRelationEdge ;
  rdf:reifies <<(<S> rel:p <O>)>> ;
  ...
```

会明确：每个实际 triple 对应一个 `InlineRelationEdge`。多端点展开产生多条 edge resource。它们可以共享 `aat:raw`、`aat:relationSurfaceRaw` 和 source span。

字段命名会采用：

```text
aat:sourceResource
aat:targetResource
aat:sourceSelector
aat:targetSelector
aat:sourceMode
aat:rel
aat:displayLabel
aat:raw
aat:relationSurfaceRaw
```

这里 `sourceResource` / `targetResource` 比 `sourceEntity` / `targetEntity` 更干净，因为端点是 RDF resource，不由投影层声明为业务 entity。

### 11. raw 双层

这一节单独说明：

- `aat:raw`：`rel` 宏本身。
- `aat:relationSurfaceRaw`：被本次 relation 消费的行内片段。

这是一个重要对象事实。正文里不能把它说成“为了方便调试所以加两个 raw”，而要说：这两层 raw 对应不同源表面。`aat:raw` 对齐 occurrence；`aat:relationSurfaceRaw` 对齐 relation consumption surface。

### 12. 失败诊断

这一节定义失败不进图，只进日志。

诊断类型包括：

```text
inline-relation.invalid-control-field
inline-relation.insufficient-subjects
inline-relation.insufficient-objects
inline-relation.missing-heading-subject
inline-relation.unresolved-subject-selector
inline-relation.unresolved-object-selector
inline-relation.invalid-predicate
inline-relation.too-many-positional-arguments
inline-relation.interrupted-relation
```

这一节会写清：日志是投影过程输出，可被下游工具消费；失败关系不生成 RDF triple，不生成 `InlineRelationEdge`。

### 13. 完整示例

这里放一篇精心打磨的自然文章。文章本身要像真实书稿，而不是为展示语法硬拼短句。

我准备沿用“冷链履约策略说明”，因为它可以自然展示：

- glossary terms
- heading 同名 glossary term
- 省略主语
- `objects=2`
- `subjects=2, objects=2`
- 同名 selector 命中多候选
- 显式主语
- 连续关系消费隔离
- edge fields
- display label

示例下面分三块解释：

1. 源文档。
2. RDF 资源投影。
3. RDF 关系边与 edge evidence。

TTL 示例里会删除之前错误的 `aat:label`。GlossaryTerm 使用 `aat:term`。

### 14. 审查清单

最后给读者一个对象审查清单，不写成“建议”。它会帮助后续实现或评审确认：

- glossary term 是否独立成 resource
- selector catalog 是否登记 `aat:term`
- relation 是否只在成功时入图
- 失败是否只写日志
- `raw` 是否只保存 rel 宏
- `relationSurfaceRaw` 是否保存消费片段
- 是否禁止同名归并
- 是否保持 `indexterm2` 原行为

这个清单是文档内部的验证面，不是写作过程说明。

## 五、我会如何避免元层次混淆

我会在写正文时逐段检查每个句子属于哪类对象：

- 对象定义
- authored surface
- interpretation prerequisite
- structural flexibility rule
- interpretation rule
- failure surface
- example

如果某句话只是“我为什么这么写”或“我们之前怎么讨论”，删掉。

如果某句话用例子代替规则，拆开：先写规则，再写例子。

如果某句话里有“不是 X、不是 Y”，我会检查它是否阻止高成本误读。若只是因为原始讨论里曾经出现过 X/Y，就删掉。

如果某句话用“可以”“建议”“倾向于”表达已经确定的规则，我会改成确定句。比如：

- 不写：“失败关系可以不进图。”
- 写：“失败关系不进入 RDF 图。”

如果某句话试图照顾读者情绪，例如“这样会更自然、更优雅”，我会改成对象事实：

- `rel` 宏允许普通文本穿插在 token 之间。
- 投影器只消费同一行内的 `indexterm2` token。

## 六、关于“读者负责”的执行方式

“对读者负责”在这里不是写得更亲切，而是减少读者判断成本。

我会让读者在文档里按顺序获得这些东西：

1. 这个对象是什么。
2. 它依赖哪些源文档结构。
3. 作者写什么表面。
4. 投影器如何解释。
5. 成功时 RDF 图里有什么。
6. 失败时哪里看到诊断。
7. 下游工具获得什么自由。

读者不需要知道我怎样理解你，也不需要知道哪一版被否定，也不需要读到我的写作姿态。读者只需要获得可执行的设计对象。

## 七、我现在判断仍需注意的点

不是价值缺失，而是写作时必须小心的点：

1. **不要把 selector catalog 写成 RDF 字段统一化。**
   catalog 可以统一查找，RDF resource 字段不必统一命名。

2. **不要把 GlossaryTerm 写成 Heading-like。**
   它可以参与 selector，但类型是 `aat:GlossaryTerm`。

3. **不要写 entity resolution。**
   只写 selector 多候选与候选乘积边。

4. **不要让失败进入 TTL 示例。**
   失败只在日志示例中出现。

5. **不要把普通索引词重新定义。**
   `indexterm2` 的原生行为不变；只有被 `rel` 消费时才成为 selector token。

6. **不要把隐藏索引词塞入当前对象。**
   当前对象只认 `indexterm2`。

7. **不要把边字段解释成业务模型。**
   named attributes 只作为 edge fields 投影。

8. **不要说“未来可以”。**
   这篇正式文档写当前对象，不写路线图。

## 八、下一步执行方式

如果你认可这个组织方式，我会开始写正式文件：

```text
/home/t103o/workbench/micheng-ts/projects/asciidoc-abundant-tree/docs/plan/indexterm2 + rel 行内实体关系投影/002-indexterm2-rel-inline-relation-projection-design.md
```

写完后我会检查：

- 是否出现元层次混淆。
- 是否有废弃方案残留。
- 是否有 `aat:label` 这类重复字段错误。
- 是否所有规则都有对象位置。
- 是否示例和 TTL 对齐。
- 是否失败不进图。
- 是否诊断只写日志。

然后再向你汇报文件路径和内容结构。
</Assistant>

<User id="12">
好的，我采纳你的 “正式文档写作计划：indexterm2 + rel 行内实体关系投影” 请开始高质量地完成本次撰写的任务。完成后呢，你自己检查，确认健康之后，弹窗通知我来看哦

Tip:
完成后记得使用弹窗与我沟通。
</User>
