// 预处理指令行的形状，照 Asciidoctor 2.0.26 rx.rb 的 IncludeDirectiveRx 与 ConditionalDirectiveRx（4.1.1 的 rx.js 相同）。
// 两条都从第 1 列匹配：行首有空白的 `  include::x[]` 在 Asciidoctor 里是普通文字，代码清单里的 diff 上下文常有这种行。
// 行尾空白不必另判：Reader 读 AsciiDoc 文件时先去掉行尾空白，调用方传入的是源行，这里容忍行尾空白以得到同一结果。
export const includeDirectivePattern =
	/^(?<escape>\\?)include::(?<target>[^\s[](?:[^[]*[^\s[])?)\[(?<attrlist>.*)\]\s*$/u;

export const conditionalDirectivePattern =
	/^(?<escape>\\?)(?:ifdef|ifndef|ifeval|endif)::\S*?(?:[,+]\S*?)?\[.*\]\s*$/u;
