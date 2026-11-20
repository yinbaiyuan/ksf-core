import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import GridLayout, { type EventCallback } from 'react-grid-layout';
import { createGridRefresh, refreshGridChild } from './grid-interaction';

type Props = ComponentProps<typeof GridLayout> & { onInteractionChange?: (active: boolean) => void };

export function CardGrid({ children, className, onDragStart, onDrag, onResizeStart, onResize, onDragStop, onResizeStop, onInteractionChange, ...props }: Props) {
  const [frame, setFrame] = useState({ id: null as string | null, tick: 0 });
  const [animating, setAnimating] = useState(false);
  const motionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motion = useCallback((active: boolean) => {
    if (motionTimer.current !== null) clearTimeout(motionTimer.current);
    motionTimer.current = null;
    if (active) setAnimating(true);
    // Keep the transition for the final snap after mouse-up, then disable it
    // so initial layout and viewport changes never animate the grid.
    else motionTimer.current = setTimeout(() => { motionTimer.current = null; setAnimating(false); }, 200);
  }, []);
  const refresh = useMemo(() => createGridRefresh(id => setFrame(value => ({ id, tick: value.tick + 1 })), requestAnimationFrame, cancelAnimationFrame), []);
  useEffect(() => {
    setAnimating(false);
    return () => { refresh.stop(); if (motionTimer.current !== null) clearTimeout(motionTimer.current); onInteractionChange?.(false); };
  }, [refresh, onInteractionChange, props.dragConfig?.enabled, props.resizeConfig?.enabled]);
  const start = useCallback<EventCallback>((_, __, item) => { if (item) { motion(true); refresh.start(item.i); onInteractionChange?.(true); } }, [refresh, onInteractionChange, motion]);
  const startDrag = useCallback<EventCallback>((...args) => { start(...args); onDragStart?.(...args); }, [start, onDragStart]);
  const moveDrag = useCallback<EventCallback>((...args) => { onDrag?.(...args); refresh.move(); }, [refresh, onDrag]);
  const startResize = useCallback<EventCallback>((...args) => { start(...args); onResizeStart?.(...args); }, [start, onResizeStart]);
  const moveResize = useCallback<EventCallback>((...args) => { onResize?.(...args); refresh.move(); }, [refresh, onResize]);
  const stopDrag = useCallback<EventCallback>((...args) => { refresh.stop(); motion(false); onInteractionChange?.(false); setFrame(value => ({ id: null, tick: value.tick })); onDragStop?.(...args); }, [refresh, onDragStop, onInteractionChange, motion]);
  const stopResize = useCallback<EventCallback>((...args) => { refresh.stop(); motion(false); onInteractionChange?.(false); setFrame(value => ({ id: null, tick: value.tick })); onResizeStop?.(...args); }, [refresh, onResizeStop, onInteractionChange, motion]);
  return <GridLayout {...props} className={[className, animating ? 'has-grid-motion' : ''].filter(Boolean).join(' ')} onDragStart={startDrag} onDrag={moveDrag} onDragStop={stopDrag} onResizeStart={startResize} onResize={moveResize} onResizeStop={stopResize}>
    {refreshGridChild(children, frame.id)}
  </GridLayout>;
}
