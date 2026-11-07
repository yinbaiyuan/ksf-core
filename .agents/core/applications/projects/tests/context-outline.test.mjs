import test from 'node:test';
import assert from 'node:assert/strict';
import {markdownOutline} from '../context-outline.js';

test('outline uses Markdown headings, skips metadata and fenced samples, and preserves distinct source lines',()=>{
  const text='\uFEFF---\r\nnotes: |\r\n  # 元数据样本\r\n---\r\n# **概述** [链接](./file.md)\r\n\r\n'
    +'```markdown\r\n# 代码里的标题\r\n```\r\n\r\n'
    +'## 重复标题\r\n\r\n## 重复标题\r\n\r\n下划线标题\r\n---\r\n\r\n> ### 引用标题\r\n';
  assert.deepEqual(markdownOutline(text),[
    {level:1,text:'概述 链接',line:5},
    {level:2,text:'重复标题',line:11},
    {level:2,text:'重复标题',line:13},
    {level:2,text:'下划线标题',line:15},
    {level:3,text:'引用标题',line:18},
  ]);
});
