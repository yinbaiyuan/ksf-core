import {forwardRef,useEffect,useRef} from 'react';
import {useValue} from '../primitives/state';
import {useWindowContext} from '../window-context';
import './inputs.css';

function useWindowCancellation(cancel: () => void) {
  const context = useWindowContext(), latest = useRef(cancel); latest.current = cancel;
  useEffect(() => {if (!context.active || !context.enabled) latest.current();}, [context.active, context.enabled]);
}

export interface Seat {id: string; row: string; column: number; label: string; unavailable?: boolean}
export interface SeatMapProps {label: string; seats: readonly Seat[]; value?: readonly string[]; defaultValue?: readonly string[]; onValueChange?: (ids: readonly string[]) => void; disabled?: boolean}
export const SeatMap = forwardRef<HTMLDivElement, SeatMapProps>(function SeatMap({label, seats, value, defaultValue = [], onValueChange, disabled = false}, ref) {
  const [selected, setSelected] = useValue<readonly string[]>(value, defaultValue, onValueChange);
  const drag = useRef<{seat: Seat; initial: readonly string[]; adding: boolean} | null>(null), rows = [...new Set(seats.map(seat => seat.row))];
  useWindowCancellation(() => {drag.current = null;});
  const toggle = (seat: Seat) => {if (!disabled && !seat.unavailable) setSelected(selected.includes(seat.id) ? selected.filter(id => id !== seat.id) : [...selected, seat.id]);};
  const stranded = rows.some(row => {const line = seats.filter(seat => seat.row === row).sort((a,b) => a.column-b.column); return line.some((seat,i) => !seat.unavailable && !selected.includes(seat.id) && (i===0 || line[i-1].unavailable || selected.includes(line[i-1].id)) && (i===line.length-1 || line[i+1].unavailable || selected.includes(line[i+1].id)));});
  return <div ref={ref} className="ksf-seat-map" role="group" aria-label={label} onPointerMove={event => {const state = drag.current; if (!state || disabled) return; const target = event.currentTarget.ownerDocument.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-seat-id]'); if (!target || !event.currentTarget.contains(target)) return; const last = seats.find(seat => seat.id === target.dataset.seatId); if (!last || last.row !== state.seat.row) return; const range = seats.filter(seat => seat.row === last.row && seat.column >= Math.min(last.column,state.seat.column) && seat.column <= Math.max(last.column,state.seat.column) && !seat.unavailable).map(seat=>seat.id); setSelected(state.adding ? [...new Set([...state.initial,...range])] : state.initial.filter(id=>!range.includes(id)));}} onPointerUp={() => {drag.current=null;}} onPointerCancel={() => {drag.current=null;}}>
    <strong>{label}</strong><div className="ksf-seat-stage" aria-hidden="true">舞台 / 屏幕</div>{rows.map(row => <div className="ksf-seat-row" key={row}><span>{row}</span>{seats.filter(seat=>seat.row===row).sort((a,b)=>a.column-b.column).map(seat=><button key={seat.id} data-seat-id={seat.id} type="button" aria-label={seat.label} aria-pressed={selected.includes(seat.id)} disabled={disabled||seat.unavailable} onPointerDown={event=>{if(event.button!==0)return;drag.current={seat,initial:selected,adding:!selected.includes(seat.id)};event.currentTarget.setPointerCapture(event.pointerId);toggle(seat);}} onClick={event=>{if(event.detail===0)toggle(seat);}}>{seat.column}</button>)}</div>)}<span role="status">已选 {selected.length} 个{stranded?' · 请留意余下的单独座位':''}</span>
  </div>;
});

