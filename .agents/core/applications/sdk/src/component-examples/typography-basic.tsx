import {useRef} from 'react';
import {View} from '@ksf/sdk/view';
import {Heading, Text, InlineCode} from '@ksf/sdk/typography';

export function TypographyBasicExample() {
  const paragraph = useRef<HTMLElement>(null);
  return <View style={{gap: 20}}>
    <Heading level={2}>把内容表达清楚</Heading>
    <Text as="p" ref={paragraph}>正文保持清晰的阅读节奏。使用 <InlineCode>Text</InlineCode> 呈现文字，用 <InlineCode>Heading</InlineCode> 表达标题层级。</Text>
    <Text as="p" size="small" tone="muted">辅助说明补充上下文，不抢占正文的注意力。</Text>
    <Text size="caption" tone="muted">注释与来源 · 11px</Text>
    <View style={{gap: 10, paddingTop: 12}}>
      <Heading level={3}>三级标题</Heading>
      <Heading level={4}>四级标题</Heading>
      <Text as="p">原生 <strong>重点</strong>、<em>强调</em> 和中文标点自然组合；长内容可在窄窗口换行。</Text>
    </View>
  </View>;
}
