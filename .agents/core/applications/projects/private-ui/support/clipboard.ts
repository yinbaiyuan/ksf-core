export async function copyText(value:string) {
  const owner=document.activeElement as HTMLElement|null;
  const ownerWindow=owner?.closest<HTMLElement>('[data-window-id]');
  if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(value);return;}catch{/* Fall back for local HTTP or denied clipboard permission. */}}
  if(ownerWindow&&!ownerWindow.classList.contains('is-active'))throw Error('原窗口已失活，请返回该窗口重试复制。');
  const input=document.createElement('textarea');input.value=value;input.readOnly=true;input.style.cssText='position:fixed;left:-9999px;top:0';(owner?.closest('[role="dialog"],[role="alertdialog"]')??document.body).append(input);
  try{input.select();if(!document.execCommand('copy'))throw new Error('复制失败，请选中内容后使用系统复制快捷键。');}finally{input.remove();if(owner?.isConnected&&!owner.closest('[inert]')&&(!ownerWindow||ownerWindow.classList.contains('is-active')))owner.focus();}
}
