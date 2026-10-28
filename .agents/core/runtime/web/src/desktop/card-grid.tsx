import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import GridLayout, { type EventCallback } from 'react-grid-layout';
import { createGridRefresh, refreshGridChild } from './grid-interaction';

type Props = Omit<ComponentProps<typeof GridLayout>, 'onDragStart' | 'onDrag' | 'onResizeStart' | 'onResize'> & { onInteractionChange?: (active: boolean) => void };

export function CardGrid({ children, onDragStop, onResizeStop, onInteractionChange, ...props }: Props) {
  const [frame, setFrame] = useState({ id: null as string | null, tick: 0 });
  const refresh = useMemo(() => createGridRefresh(id => setFrame(value => ({ id, tick: value.tick + 1 })), requestAnimationFrame, cancelAnimationFrame), []);
  useEffect(() => () => { refresh.stop(); onInteractionChange?.(false); }, [refresh, onInteractionChange, props.dragConfig?.enabled, props.resizeConfig?.enabled]);
  const start = useCallback<EventCallback>((_, __, item) => { if (item) { refresh.start(item.i); onInteractionChange?.(true); } }, [refresh, onInteractionChange]);
  const move = useCallback<EventCallback>(() => refresh.move(), [refresh]);
  const stopDrag = useCallback<EventCallback>((...args) => { refresh.stop(); onInteractionChange?.(false); setFrame(value => ({ id: null, tick: value.tick })); onDragStop?.(...args); }, [refresh, onDragStop, onInteractionChange]);
  const stopResize = useCallback<EventCallback>((...args) => { refresh.stop(); onInteractionChange?.(false); setFrame(value => ({ id: null, tick: value.tick })); onResizeStop?.(...args); }, [refresh, onResizeStop, onInteractionChange]);
  return <GridLayout {...props} onDragStart={start} onDrag={move} onDragStop={stopDrag} onResizeStart={start} onResize={move} onResizeStop={stopResize}>
    {refreshGridChild(children, frame.id)}
  </GridLayout>;
}
