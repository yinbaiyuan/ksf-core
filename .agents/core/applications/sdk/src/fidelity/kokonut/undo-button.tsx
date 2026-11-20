import {AnimatePresence} from '../motion-provider';
import '../styles/undo-button.css';
// Adapted for KSF from the free MIT Kokonut UI source.
// Source commit: 655ec61161aff87721e4c60c3cc4dc3329f3e80e
// Copyright (c) 2025 kokonutUI. Full license: ../../../THIRD_PARTY_NOTICES.txt
import {useScopedEffect as useEffect, useScopedLayoutEffect as useLayoutEffect, useScopedReducedMotion as useReducedMotion} from "../scope";
"use client";

/**
 * @author: @dorianbaffier
 * @description: Undo Button
 * @version: 1.0.0
 * @date: 2026-10-16
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { Archive, Check, Undo2 } from "lucide-react";
import {motion} from 'motion/react';
import {type PointerEvent, useCallback, useRef, useState} from "react";
import {useLayoutEffect as useRawLayoutEffect,type Ref,type ComponentType,type SVGProps} from "react";
import {useWindowContext} from "../../window-context";
import { cn } from "../../lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const STROKE = 1.5;
const APPLE_PLATFORM = /Mac|iPhone|iPad/;
// One owner per shortcut: focused undo first, then the newest pending action in this window.
const undoScopes=new WeakMap<HTMLElement,Set<{button:HTMLButtonElement}>>();

export type Phase = "idle" | "pending" | "done";

export interface UndoButtonProps {
  phase:Phase;remaining:number;seconds:number;disabled?:boolean;onHoverChange?:(hovered:boolean)=>void;controlRef?:Ref<HTMLButtonElement>;
  /** What the button does, e.g. "Archive". */
  label?: string;
  /** The same action in the past tense, e.g. "Archived". */
  doneLabel?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** How long the action can be undone, in ms. */

  /**
   * After the action commits, go back to the start after this many ms.
   * Pass `null` to stay on the done state.
   */

  /** Called when the button is pressed and the undo window opens. */
  onAction?: () => void;
  /** Called when the window closes without an undo: do the real work here. */

  onUndo?: () => void;
  className?: string;
}

// A pill outline that starts at the top centre and runs clockwise, so the
// countdown drains back toward where it began.
function pillPath(width: number, height: number) {
  const s = STROKE / 2;
  const r = height / 2 - s;
  const left = s + r;
  const right = width - s - r;
  return [
    `M ${width / 2} ${s}`,
    `H ${right}`,
    `A ${r} ${r} 0 0 1 ${right} ${height - s}`,
    `H ${left}`,
    `A ${r} ${r} 0 0 1 ${left} ${s}`,
    "Z",
  ].join(" ");
}

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export default function UndoButton({
  phase,remaining,seconds,disabled,onHoverChange,controlRef,
  label = "Archive",
  doneLabel = "Archived",
  icon: Icon = Archive,
  onAction,
  onUndo,
  className,
}: UndoButtonProps) {
  const owner=useWindowContext();
  const [width, setWidth] = useState<number>();
  const [isMac, setIsMac] = useState(true);
  const reduceMotion = useReducedMotion();

  const buttonRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const hoveredRef = useRef(false);

  const remainingRef = useRef(1);

  const callbacks = useRef({ onAction, onUndo });
  callbacks.current = { onAction, onUndo };

  useEffect(() => {
    setIsMac(APPLE_PLATFORM.test(buttonRef.current?.ownerDocument.defaultView?.navigator.platform??""));
  }, []);

  // The button's width follows its label, so the pill grows into
  // "Archived | Undo 5" instead of jumping.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    // +2 for the 1px border on each side.
    const observer = new ResizeObserver(() =>
      content.offsetWidth>0&&setWidth(content.offsetWidth + 2)
    );
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Dashes in real lengths rather than pathLength, which Chrome scales
  // inconsistently once the path changes size.
  const paint = useCallback(() => {
    const path = pathRef.current;
    if (!path) {
      return;
    }
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length * remainingRef.current} ${length}`;
  }, []);

  // Keep the outline glued to the button while its width animates.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if(!button.offsetWidth||!button.offsetHeight)return;
      pathRef.current?.setAttribute(
        "d",
        pillPath(button.offsetWidth, button.offsetHeight)
      );
      paint();
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, [paint]);

  const undo = useCallback(() => {
    callbacks.current.onUndo?.();
  }, []);

  useRawLayoutEffect(()=>{remainingRef.current=Math.max(0,Math.min(1,Number.isFinite(remaining)?remaining:0));paint();},[remaining,phase,paint]);
  useEffect(()=>{
    if(phase!=="pending"||disabled)return;
    const root=owner.root?.current??buttonRef.current,button=buttonRef.current;
    if(!root||!button)return;
    let entries=undoScopes.get(root);if(!entries){entries=new Set();undoScopes.set(root,entries);}
    const entry={button};entries.add(entry);
    const onKeyDown=(event:globalThis.KeyboardEvent)=>{
      if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.repeat)return;
      if(!((event.metaKey||event.ctrlKey)&&!event.shiftKey&&event.key.toLowerCase()==="z")||isEditable(event.target))return;
      const candidates=[...(undoScopes.get(root)??[])];
      const target=event.target as Node|null,focused=button.ownerDocument.activeElement;
      const chosen=candidates.find(candidate=>target&&candidate.button.contains(target))??candidates.find(candidate=>focused&&candidate.button.contains(focused))??candidates.at(-1);
      if(chosen!==entry)return;
      event.preventDefault();undo();
    };
    root.addEventListener('keydown',onKeyDown as EventListener);
    return()=>{root.removeEventListener('keydown',onKeyDown as EventListener);entries.delete(entry);if(!entries.size)undoScopes.delete(root);};
  },[phase,disabled,owner.root,undo]);

  const handleClick = () => {
    if(disabled)return;
    if (phase === "idle") {
      callbacks.current.onAction?.();
    } else if (phase === "pending") {
      undo();
    }
  };

  const setHovered = (event: PointerEvent, value: boolean) => {
    if (event.pointerType === "mouse") {
      hoveredRef.current = value;onHoverChange?.(value);
    }
  };

  const swap = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: EASE_OUT };

  const ariaLabel = {
    idle: label,
    pending: `${doneLabel}. Undo, ${seconds} second${seconds === 1 ? "" : "s"} left`,
    done: doneLabel,
  }[phase];

  return (
    <span className="relative inline-flex">
      <motion.button
        animate={{ width: width ?? "auto" }}
        disabled={disabled} aria-disabled={phase === "done"||disabled}
        aria-label={ariaLabel}
        className={cn(
          "relative inline-flex h-10 select-none items-center justify-center overflow-hidden whitespace-nowrap rounded-full border font-medium text-sm outline-none",
          "transition-[background-color,border-color,color] duration-150 ease-out",
          "focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950",
          phase === "done"
            ? "cursor-default border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
            : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:active:bg-zinc-800 dark:hover:bg-zinc-900",
          className
        )}
        initial={false}
        onClick={handleClick}
        onPointerEnter={(event) => setHovered(event, true)}
        onPointerLeave={(event) => setHovered(event, false)}
        ref={node=>{buttonRef.current=node;if(typeof controlRef==='function')return controlRef(node);if(controlRef)controlRef.current=node;}}
        transition={swap}
        type="button"
      >
        <span className="inline-flex px-4" ref={contentRef}>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              className="inline-flex items-center gap-2"
              exit={{ opacity: 0, y: -8, filter: "blur(2px)" }}
              initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
              key={phase}
              transition={swap}
            >
              {phase === "idle" && (
                <>
                  <Icon aria-hidden className="size-4" />
                  {label}
                </>
              )}
              {phase === "pending" && (
                <>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {doneLabel}
                  </span>
                  <span
                    aria-hidden
                    className="h-4 w-px bg-zinc-200 dark:bg-zinc-800"
                  />
                  <Undo2 aria-hidden className="size-4" />
                  Undo
                  <Countdown reduceMotion={!!reduceMotion} value={seconds} />
                  <kbd className="hidden rounded border border-zinc-200 px-1 font-sans text-[11px] text-zinc-500 sm:inline dark:border-zinc-800 dark:text-zinc-400">
                    {isMac ? "⌘Z" : "Ctrl Z"}
                  </kbd>
                </>
              )}
              {phase === "done" && (
                <>
                  <Check aria-hidden className="size-4" />
                  {doneLabel}
                </>
              )}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.button>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
      >
        <title>Time left to undo</title>
        <motion.path
          animate={{ opacity: phase === "pending" ? 1 : 0 }}
          className="stroke-zinc-900 dark:stroke-zinc-100"
          fill="none"
          initial={false}
          ref={pathRef}
          strokeLinecap="round"
          strokeWidth={STROKE}
          transition={{ duration: phase === "pending" ? 0.15 : 0.2 }}
        />
      </svg>
      <span aria-live="polite" className="sr-only">
        {phase === "pending" &&
          `${doneLabel}. Press the button or ${isMac ? "Command" : "Control"} Z to undo.`}
        {phase === "done" && doneLabel}
      </span>
    </span>
  );
}

function Countdown({
  value,
  reduceMotion,
}: {
  value: number;
  reduceMotion: boolean;
}) {
  return (
    <span className="relative inline-flex h-5 min-w-[1ch] justify-center overflow-hidden text-zinc-500 tabular-nums dark:text-zinc-400">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          animate={{ y: 0, opacity: 1 }}
          className="leading-5"
          exit={{ y: -10, opacity: 0 }}
          initial={{ y: 10, opacity: 0 }}
          key={value}
          transition={
            reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
