/** Host bootstrap only: existing Radix scroll locks use get-nonce's global fallback. */
export function initializeStyleNonce():void {
  const nonce=document.querySelector<HTMLMetaElement>('meta[name="ksf-style-nonce"]')?.content;
  if(nonce)(globalThis as typeof globalThis&{__webpack_nonce__?:string}).__webpack_nonce__=nonce;
}
