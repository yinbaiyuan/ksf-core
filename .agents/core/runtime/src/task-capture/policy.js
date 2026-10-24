// Enabling capture supplies the default consent for ordinary post-baseline turns.
// A restriction cue only suspends that default; the Agent's signed policy resolves
// its meaning, so quoted examples are never turned into permanent exclusions.
export function hasCaptureRestriction(messages) {
  const chinese = /(?:不|不要|别|禁止|停止|暂停|暂不|无需)(?:再|继续|自动)?(?:记录|归档|采集|保存|存储|留存)(?:(?:本轮|这轮|这一轮|本次|这次|本聊天|这个聊天|当前聊天|此次|这段|我们的|我的)的?)?(?:对话|聊天|会话)|(?:不|不要|别|禁止|暂不)(?:记录|归档|采集|保存|存储|留存)(?:本轮|这轮|这一轮)|(?:本轮|这轮|这一轮|本次对话|这次对话)(?:先|暂时)?(?:不|不要|别|禁止|暂不)(?:记录|归档|采集|保存|存储|留存)|(?:对话|聊天|会话)(?:记录|采集|归档)(?:功能)?(?:暂停|关闭|停止)|(?:关闭|暂停|停止|禁用)(?:本|当前|这个|此)?(?:聊天|对话|会话)的?(?:记录|归档|采集)/;
  const english = /\b(?:do\s+not|don't|dont|stop|pause|disable)\s+(?:the\s+)?(?:(?:record(?:ing)?|archiv(?:e|ing)|captur(?:e|ing)|sav(?:e|ing)|stor(?:e|ing))\s+(?:(?:this|the|my|our|current)\s+)?(?:chat|conversation|dialogue|turn)|(?:chat|conversation|dialogue)\s+(?:recording|archiving|capture))\b/i;
  return messages.some(message => message.role === 'user' && message.content.some(block =>
    typeof block.text === 'string' && (chinese.test(block.text.replace(/\s+/g, '')) || english.test(block.text))));
}

export function capturePolicy({ old, messages, declarations, paused = false, held = false }) {
  const input = [...messages, ...(old?.messages ?? [])];
  const capturePolicyHeld = !declarations.length && Boolean(old?.capturePolicyHeld || hasCaptureRestriction(input));
  let chatPaused = paused, chatPolicyHeld = held || capturePolicyHeld;
  let policy = input.some(m => m.role === 'user') || old?.policy === 'capture' ? 'capture' : 'pending';
  for (const declaration of declarations) {
    if (declaration.policy === 'pause') { policy = 'exclude'; chatPaused = true; }
    else if (declaration.policy === 'resume') { chatPaused = false; chatPolicyHeld = false; policy = 'capture'; }
    else if (declaration.policy === 'exclude') policy = 'exclude';
    else if (!chatPaused && !chatPolicyHeld) policy = 'capture';
  }
  // Only explicit signed exclusions become irreversible body-free tombstones.
  const explicitExcluded = Boolean(old?.explicitExcluded || declarations.some(d => d.policy === 'exclude' || d.policy === 'pause'));
  if (chatPolicyHeld) policy = 'pending';
  if (explicitExcluded || chatPaused) policy = 'exclude';
  return { policy, chatPaused, explicitExcluded, capturePolicyHeld, chatPolicyHeld };
}
