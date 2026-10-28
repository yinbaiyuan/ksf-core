export interface WorkbenchSession { instanceId: string; token: string; nonce: string; sessionId: string;capabilities?:string[] }
export class APIError extends Error {
  code: string;
  data?: any;
  constructor(message: string, code: string, data?: any) { super(message); this.code = code; this.data = data; }
}

export function createWorkbenchClient(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let session: Promise<WorkbenchSession> | undefined;
  let initial: WorkbenchSession | undefined;
  function getSession(): Promise<WorkbenchSession> {
    if (!session) {
      const pending = request<WorkbenchSession>('/api/workbench/session').then(fresh => {
        if (initial && fresh.instanceId !== initial.instanceId) throw new APIError('工作台已切换到其他实例，请重新打开文档；未保存草稿仍保留在原实例。', 'WORKBENCH_INSTANCE_CHANGED');
        initial ??= fresh;
        // The document's CSP stays in force until navigation, even after a restart.
        return { ...fresh, nonce: initial.nonce };
      }).catch(error => {
        if (session === pending) session = undefined;
        throw error;
      });
      session = pending;
    }
    return session;
  }
  async function renewSession(previous: WorkbenchSession) {
    const cached = session;
    // A late rejection from an old request must not discard a newer session.
    if (cached && await cached === previous && session === cached) session = undefined;
    return getSession();
  }
  async function request<T>(url: string, input?: unknown, signal?: AbortSignal): Promise<T> {
    let auth = input !== undefined ? await getSession() : null;
    const payload = auth ? JSON.stringify(input) : undefined;
    for (let attempt = 0; ; attempt++) {
      const response = await fetcher(url, { method: auth ? 'POST' : 'GET', cache: 'no-store', signal,
        headers: auth ? { 'Content-Type': 'application/json', 'X-KSF-Token': auth.token } : undefined,
        body: payload });
      const body = await response.json();
      if (response.ok && body.ok !== false) return body.data ?? body;
      const code = body.error?.code ?? 'REQUEST_FAILED';
      // Only explicit pre-write authentication rejections are safe to replay.
      // WEB_WRITE_FORBIDDEN also supports pages talking to an older local server.
      if (auth && attempt === 0 && response.status === 403 && ['WEB_SESSION_EXPIRED', 'WEB_WRITE_FORBIDDEN'].includes(code)) {
        signal?.throwIfAborted();
        const fresh = await renewSession(auth);
        if (fresh.token !== auth.token) { auth = fresh; continue; }
      }
      throw new APIError(body.error?.message ?? body.errors?.[0]?.message ?? '操作失败', code, body.data);
    }
  }
  return { getSession, request };
}
