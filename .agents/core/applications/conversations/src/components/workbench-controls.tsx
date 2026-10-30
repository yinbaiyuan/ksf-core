import { useMemo } from 'react';
import { useApplicationSDK } from '@ksf/sdk/react';
import { useAppData } from '../api';
import type { TaskList, TaskTarget } from '../types';
export { PaneResize, Highlight } from '@ksf/sdk/components/workbench-controls';
export function useTargetSearch(_targets: TaskTarget[], q: string) {
  const sdk = useApplicationSDK(), state = new URLSearchParams(sdk.getSnapshot().search).get('chatState') ?? 'active';
  const data = useAppData<{ groups: Record<string, TaskList>; errors: {message?:string}[] }>(q ? 'chats.search' : null, { state, q }, 15000);
  return { groups: useMemo(() => new Map(Object.entries(data.data?.groups ?? {})), [data.data]), loading: !!q && data.loading, errors: data.error ? [data.error] : (data.data?.errors ?? []).map(e => e.message ?? '部分聊天无法读取') };
}
