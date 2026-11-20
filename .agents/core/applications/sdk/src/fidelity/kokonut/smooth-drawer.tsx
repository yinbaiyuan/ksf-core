import {AnimatePresence} from '../motion-provider';
import '../styles/smooth-drawer.css';
// Adapted for KSF from the free MIT Kokonut UI source.
// Source commit: 655ec61161aff87721e4c60c3cc4dc3329f3e80e
// Copyright (c) 2025 kokonutUI. Full license: ../../../THIRD_PARTY_NOTICES.txt
import {FidelityPortalFrame, useScopedEffect as useEffect, useScopedReducedMotion as useReducedMotion} from "../scope";
"use client";

/**
 * @author: @dorianbaffier
 * @description: Smooth Drawer
 * @version: 2.0.0
 * @date: 2026-10-16
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { ChevronUp, CreditCard } from "lucide-react";
import {animate, useMotionValue, motion, type Variants} from 'motion/react';
import {useEffect as useGeometryEffect, type PointerEvent, useCallback, useId, useMemo, useRef, useState} from "react";
import {Button} from '../primitives';
import {WindowLayer} from '../../overlays/window-layer';
import {useWindowContext} from '../../window-context';
import { cn } from "../../lib/utils";

export interface OrderItem {
  id: string;
  name: string;
  /** Variant line, e.g. "Sand · M". */
  detail?: string;
  /** Unit price. */
  price: number;
  quantity?: number;
}

export type DeliverySpeed = "standard" | "express";

export interface OrderSummary {
  delivery: DeliverySpeed;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
}

export interface SmoothDrawerProps {
  title?: string;
  /** Line under the title. Defaults to the item count and arrival estimate. */
  description?: string;
  items?: OrderItem[];
  /** Tax rate applied to the subtotal. */
  taxRate?: number;
  /** ISO 4217 currency code. */
  currency?: string;
  triggerLabel?: string;
  confirmLabel?: string;
  /** Called with the final breakdown; the sheet closes afterwards. */
  onConfirm?: (summary: OrderSummary) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const DEFAULT_ITEMS: OrderItem[] = [
  { id: "overshirt", name: "Linen overshirt", detail: "Sand · M", price: 88 },
  {
    id: "socks",
    name: "Merino crew socks",
    detail: "Charcoal · 2 pairs",
    price: 14,
    quantity: 2,
  },
  { id: "tote", name: "Canvas tote", detail: "Natural", price: 32 },
];

const DELIVERY = {
  standard: { label: "Standard", price: 0, eta: "3–5 business days" },
  express: { label: "Express", price: 12, eta: "Tomorrow" },
} as const;

/** Visible height of the sheet at its first snap point. */
const PEEK_HEIGHT = 200;
/** Tallest the sheet gets, and the gap it keeps from the top of the screen. */
const MAX_SHEET_HEIGHT = 680;
const TOP_GAP = 24;

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Each digit slides in the direction the total moved. */
const digitVariants = {
  enter: (direction: number) => ({ y: `${direction * 70}%`, opacity: 0 }),
  center: { y: "0%", opacity: 1 },
  exit: (direction: number) => ({ y: `${direction * -70}%`, opacity: 0 }),
} satisfies Variants;

const fadeVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
} satisfies Variants;

function RollingAmount({ value, format }: { value: number; format: string }) {
  const reduceMotion = useReducedMotion();
  const previous = useRef(value);
  const direction = value >= previous.current ? 1 : -1;

  useEffect(() => {
    previous.current = value;
  }, [value]);

  const chars = format.split("");

  return (
    <span className="relative inline-flex tabular-nums">
      <span className="sr-only">{format}</span>
      <span aria-hidden="true" className="inline-flex">
        {chars.map((char, index) => {
          // Keyed from the right so cents stay put when dollars gain a digit.
          const slot = chars.length - index;
          if (char < "0" || char > "9") {
            return <span key={`s${slot}`}>{char}</span>;
          }
          return (
            <span
              className="relative inline-flex overflow-hidden"
              key={`d${slot}`}
            >
              <AnimatePresence
                custom={direction}
                initial={false}
                mode="popLayout"
              >
                <motion.span
                  animate="center"
                  className="inline-block"
                  custom={direction}
                  exit="exit"
                  initial="enter"
                  key={char}
                  transition={{ duration: 0.24, ease: EASE_OUT }}
                  variants={reduceMotion ? fadeVariants : digitVariants}
                >
                  {char}
                </motion.span>
              </AnimatePresence>
            </span>
          );
        })}
      </span>
    </span>
  );
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export default function SmoothDrawer({
  title = "Order summary",
  description,
  items = DEFAULT_ITEMS,
  taxRate = 0.08,
  currency = "USD",
  triggerLabel = "Review order",
  confirmLabel = "Confirm order",
  onConfirm,
  open,
  defaultOpen = false,
  onOpenChange,
}: SmoothDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const [expanded, setExpanded] = useState(false);
  const [delivery, setDelivery] = useState<DeliverySpeed>("standard");
  const [viewportHeight, setViewportHeight] = useState(0);
  const owner=useWindowContext(),marker=useRef<HTMLSpanElement>(null),sheetRef=useRef<HTMLDivElement>(null);
  const titleId=useId(),descriptionId=useId(),y=useMotionValue(0),drag=useRef<{id:number;start:number;y:number;at:number}|null>(null),animation=useRef<ReturnType<typeof animate>|null>(null),[rest,setRest]=useState(0);
  const detailsRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const reduceMotion = useReducedMotion();
  const deliveryName = useId();

  useGeometryEffect(()=>{const root=owner.root?.current??marker.current?.closest<HTMLElement>('.ksf-sdk-surface')??marker.current?.parentElement;if(!root)return;const measure=()=>{const height=root.getBoundingClientRect().height;if(height>0)setViewportHeight(height);};measure();const observer=new ResizeObserver(measure);observer.observe(root);return()=>observer.disconnect();},[owner.root]);

  const money = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency }),
    [currency]
  );

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * (item.quantity ?? 1),
    0
  );
  const shipping = DELIVERY[delivery].price;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = subtotal + shipping + tax;
  const itemCount = items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  const arrival =
    delivery === "express" ? "Arrives tomorrow" : "Arrives in 3–5 days";

  const sheetHeight=Math.max(PEEK_HEIGHT,Math.min(MAX_SHEET_HEIGHT,viewportHeight-TOP_GAP));

  const handleOpenChange = (next: boolean) => {
    if (open === undefined) {
      setInternalOpen(next);
    }
    if (next) {
      setExpanded(false);
    }
    onOpenChange?.(next);
  };

  const clearDragStyles = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const details = detailsRef.current;
    if (details) {
      details.style.transition = "";
      details.style.opacity = "";
      details.style.translate = "";
    }
  }, []);

  // Hand the details back to their class-driven transition.
  const setSnap = (next: boolean) => {
    clearDragStyles();
    setExpanded(next);
  };

  useEffect(()=>{animation.current?.stop();drag.current=null;const target=expanded?0:sheetHeight-PEEK_HEIGHT;if(reduceMotion)y.jump(target);else animation.current=animate(y,target,{duration:0.5,ease:[0.32,0.72,0,1]});return()=>{animation.current?.stop();drag.current=null;clearDragStyles();};},[isOpen,expanded,sheetHeight,reduceMotion,rest]);
  const handlePointerDown=(event:PointerEvent<HTMLDivElement>)=>{if(event.button!==0||event.target instanceof Element&&event.target.closest('button,input,select,textarea,a,[data-order-details]'))return;animation.current?.stop();drag.current={id:event.pointerId,start:event.clientY,y:y.get(),at:performance.now()};event.currentTarget.setPointerCapture(event.pointerId);};
  const handlePointerMove=(event:PointerEvent<HTMLDivElement>)=>{const held=drag.current;if(!held||held.id!==event.pointerId)return;const next=Math.max(0,Math.min(sheetHeight,held.y+event.clientY-held.start));y.set(next);const details=detailsRef.current;if(details){const progress=clamp01(1-next/Math.max(1,sheetHeight-PEEK_HEIGHT));details.style.transition='none';details.style.opacity=String(progress);details.style.translate=reduceMotion?'':`0 ${(1-progress)*12}px`;}};
  // Match the fixed upstream Vaul 1.1.2 snap thresholds using the KSF window's height.
  const handlePointerEnd=(event:PointerEvent<HTMLDivElement>)=>{
    const held=drag.current;if(!held||held.id!==event.pointerId)return;drag.current=null;clearDragStyles();
    const distance=held.start-event.clientY,velocity=Math.abs(distance)/Math.max(1,performance.now()-held.at),up=distance>0;
    if(velocity>2){if(up)setSnap(true);else handleOpenChange(false);}
    else if(velocity>0.4&&Math.abs(distance)<viewportHeight*0.4){if(up)setSnap(true);else if(expanded)setSnap(false);else handleOpenChange(false);}
    else setSnap(y.get()<(sheetHeight-PEEK_HEIGHT)/2);
    setRest(value=>value+1);
  };
  const handlePointerCancel=()=>{drag.current=null;clearDragStyles();setRest(value=>value+1);};

  const handleConfirm = () => {
    onConfirm?.({ delivery, subtotal, shipping, tax, total });
    handleOpenChange(false);
  };

  return (
    <><span hidden ref={marker}/><Button className="h-10 rounded-lg px-4" variant="outline" onClick={()=>handleOpenChange(true)}>{triggerLabel}</Button>
    <WindowLayer open={isOpen} onClose={()=>handleOpenChange(false)} presentation="drawer" side="bottom" initialFocus={sheetRef} interactionElement={sheetRef} aria-labelledby={titleId} aria-describedby={descriptionId} style={{width:'100%',height:'100%',maxHeight:'100%',maxWidth:'100%',display:'flex',alignItems:'flex-end',justifyContent:'center',padding:0,border:0,background:'transparent',boxShadow:'none',overflow:'hidden',pointerEvents:'none'}}>
    <FidelityPortalFrame style={{width:'100%',maxWidth:420,pointerEvents:'none'}}>
      <motion.div
        className={cn(
          "mx-auto w-full max-w-[420px] rounded-t-2xl border border-zinc-200 border-b-0 bg-white outline-none dark:border-zinc-800 dark:bg-zinc-950",
          "mb-0! data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-none data-[vaul-drawer-direction=bottom]:rounded-t-2xl",
          // Sit flush on the bottom edge even if the host styles dialogs with a
          // margin. Swap the stock wide handle for a small pill.
          ""
        )}
        onPointerDown={handlePointerDown}
        onPointerCancel={handlePointerCancel}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        ref={sheetRef} tabIndex={-1}
        style={{ height: sheetHeight,y,pointerEvents:'auto',touchAction:'pan-y' }}
      >
        <div className="flex h-full flex-col">
          <div
            aria-hidden="true"
            style={{touchAction:'none'}}
            className="flex h-6 shrink-0 items-center justify-center"
          >
            <span className="h-1 w-9 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          </div>

          <div className="shrink-0 px-5 pt-1" style={{touchAction:'none'}}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id={titleId} className="font-semibold text-[15px] text-zinc-900 tracking-tight dark:text-zinc-50">
                  {title}
                </h2>
                <p id={descriptionId} className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                  {description ??
                    `${itemCount} ${itemCount === 1 ? "item" : "items"} · ${arrival}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  Total
                </p>
                <p className="mt-0.5 font-semibold text-lg text-zinc-900 leading-6 tracking-tight dark:text-zinc-50">
                  <RollingAmount format={money.format(total)} value={total} />
                </p>
              </div>
            </div>

            <button
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 font-medium text-sm text-white outline-none transition-colors duration-150 ease-out hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:active:bg-zinc-300 dark:focus-visible:ring-offset-zinc-950 dark:hover:bg-zinc-200"
              onClick={handleConfirm}
              type="button"
            >
              {confirmLabel}
            </button>

            <button
              aria-expanded={expanded}
              className="mt-1 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-[13px] text-zinc-500 outline-none transition-colors duration-150 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-400 dark:hover:text-zinc-100"
              onClick={() => setSnap(!expanded)}
              type="button"
            >
              {expanded ? "Hide details" : "Order details"}
              <ChevronUp
                aria-hidden="true"
                className={cn(
                  "size-3.5 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                  expanded && "rotate-180"
                )}
              />
            </button>
          </div>

          <div
            className={cn(
              "min-h-0 flex-1 px-5 pb-6",
              "transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:translate-y-0",
              expanded
                ? "translate-y-0 overflow-y-auto opacity-100"
                : "translate-y-3 overflow-hidden opacity-0"
            )}
            data-order-details=""
            inert={!expanded}
            ref={detailsRef}
          >
            <div className="border-zinc-200 border-t pt-4 dark:border-zinc-800">
              <ul className="space-y-3">
                {items.map((item) => (
                  <li className="flex items-center gap-3" key={item.id}>
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 font-medium text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                      {item.name.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm text-zinc-900 dark:text-zinc-100">
                        {item.name}
                      </p>
                      {item.detail ? (
                        <p className="truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                          {item.detail}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-sm text-zinc-900 tabular-nums dark:text-zinc-100">
                      {money.format(item.price * (item.quantity ?? 1))}
                    </span>
                  </li>
                ))}
              </ul>

              <fieldset className="mt-5">
                <legend className="font-medium text-[13px] text-zinc-500 dark:text-zinc-400">
                  Delivery
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(Object.keys(DELIVERY) as DeliverySpeed[]).map((speed) => {
                    const option = DELIVERY[speed];
                    const checked = delivery === speed;
                    return (
                      <label
                        className={cn(
                          "relative flex cursor-pointer flex-col rounded-xl border px-3 py-2.5 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-zinc-400",
                          checked
                            ? "border-zinc-900 bg-zinc-50 dark:border-zinc-200 dark:bg-zinc-900"
                            : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                        )}
                        key={speed}
                      >
                        <input
                          checked={checked}
                          className="sr-only"
                          name={deliveryName}
                          onChange={() => setDelivery(speed)}
                          type="radio"
                          value={speed}
                        />
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                            {option.label}
                          </span>
                          <span className="text-[13px] text-zinc-900 tabular-nums dark:text-zinc-100">
                            {option.price === 0
                              ? "Free"
                              : money.format(option.price)}
                          </span>
                        </span>
                        <span className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                          {option.eta}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <dl className="mt-5 space-y-1.5 text-sm tabular-nums">
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                  <dt>Subtotal</dt>
                  <dd>{money.format(subtotal)}</dd>
                </div>
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                  <dt>Delivery</dt>
                  <dd>{shipping === 0 ? "Free" : money.format(shipping)}</dd>
                </div>
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                  <dt>Estimated tax</dt>
                  <dd>{money.format(tax)}</dd>
                </div>
                <div className="flex justify-between border-zinc-200 border-t pt-2 font-medium text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
                  <dt>Total</dt>
                  <dd>{money.format(total)}</dd>
                </div>
              </dl>

              <div className="mt-5 flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
                <CreditCard
                  aria-hidden="true"
                  className="size-4 text-zinc-500 dark:text-zinc-400"
                />
                <span className="flex-1 text-sm text-zinc-900 dark:text-zinc-100">
                  Visa ending 4242
                </span>
                <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  Default
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </FidelityPortalFrame></WindowLayer></>
  );
}
