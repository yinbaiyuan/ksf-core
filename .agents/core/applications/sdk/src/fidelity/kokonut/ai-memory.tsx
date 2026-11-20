import {AnimatePresence, MotionConfig} from '../motion-provider';
import '../styles/ai-memory.css';
// Adapted for KSF from the free MIT Kokonut UI source.
// Source commit: 655ec61161aff87721e4c60c3cc4dc3329f3e80e
// Copyright (c) 2025 kokonutUI. Full license: ../../../THIRD_PARTY_NOTICES.txt
import {useScopedEffect as useEffect, useScopedReducedMotion as useReducedMotion} from "../scope";
"use client";

/**
 * @author: @kokonutui
 * @description: AI Memory
 * @version: 1.1.0
 * @date: 2026-10-21
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { ArrowUp, Bookmark, Check, Pencil, Trash2 } from "lucide-react";
import {motion} from 'motion/react';
import {useMemo, useRef, useState} from "react";
import {useLayoutEffect as useRawLayoutEffect,type Ref} from "react";
import { cn } from "../../lib/utils";

export interface MemoryItem {
  id: string;
  text: string;
  group: string;
  /** When it was saved, in words, e.g. "Today" or "Sep 12". */
  saved: string;
}

export interface MemoryChange {
  reply: string;
  /** A fact to save. With `replaces`, it takes the place of an older one. */
  memory?: { text: string; group: string; replaces?: string };
}

export interface AIMemoryProps {
  title?: string;
  /** What the assistant opens with. */
  greeting?: string;
  /** Your saved memories, read once on mount. */
  initialMemories?: MemoryItem[];
  /** Messages offered as one-tap replies. */
  suggestions?: string[];
  /**
   * Answers a message and decides what to remember, from the memories in
   * the panel. Return the change or a Promise of it; the assistant shows it
   * thinking until it resolves. Throw and the reply shows the error's
   * message. Demo when omitted.
   */
  remember?: (
    text: string,
    memories: MemoryItem[]
  ) => MemoryChange | Promise<MemoryChange>;
  /** A memory was saved. With `replaced`, it took that one's place. */
  onSave?: (memory: MemoryItem, replaced?: MemoryItem) => void;
  /** A memory was edited by hand. */
  onEdit?: (memory: MemoryItem) => void;
  /** A memory was forgotten, once its Undo has passed. */
  onForget?: (memory: MemoryItem) => void;
  className?: string;controlRef?:Ref<HTMLDivElement>;workspace?:{rows:Row[];messages:ChatMessage[];draft:string;enabled:boolean;busy:boolean;thinking?:boolean;suggestions:string[];undo?:MemoryItem;onDraftChange:(text:string)=>void;onEnabledChange:(value:boolean)=>void;onSend:(text:string)=>void;onEdit:(id:string,text:string)=>void;onForget:(id:string)=>void;onUndo:()=>void};
}

type RowState = "live" | "new" | "replaced";

interface Row extends MemoryItem {
  state: RowState;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** The reply failed; text says why. */
  error?: boolean;
  /** Id of the memory this reply saved. */
  saved?: string;
  savedText?: string;
  replaced?: string;
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const WORDS = /\S+\s*/g;
const GROUPS = ["About you", "Food", "Work"];

const DEMO_MEMORIES: MemoryItem[] = [
  { id: "name", text: "Goes by Samantha", group: "About you", saved: "Aug 3" },
  { id: "city", text: "Lives in Berlin", group: "About you", saved: "Aug 3" },
  { id: "diet", text: "Is pescatarian", group: "Food", saved: "Sep 12" },
  {
    id: "spice",
    text: "Likes food very spicy",
    group: "Food",
    saved: "Sep 12",
  },
  {
    id: "job",
    text: "Product designer at Fieldwork",
    group: "Work",
    saved: "Jul 28",
  },
  {
    id: "tone",
    text: "Wants short, direct answers",
    group: "Work",
    saved: "Jul 28",
  },
];

const DEMO_REPLIES: Record<string, MemoryChange> = {
  "I just moved to Lisbon": {
    reply:
      "Congrats on the move! I'll plan around Lisbon from now on, so weather, events and dinner ideas will be local.",
    memory: {
      text: "Lives in Lisbon, moved Oct 2026",
      group: "About you",
      replaces: "city",
    },
  },
  "I'm vegetarian now": {
    reply:
      "Noted. Recipes and restaurant picks will be vegetarian from here on, still spicy.",
    memory: { text: "Is vegetarian", group: "Food", replaces: "diet" },
  },
  "Please call me Sam": {
    reply: "Sure thing, Sam.",
    memory: { text: "Goes by Sam", group: "About you", replaces: "name" },
  },
  "I started at Linear as a design engineer": {
    reply:
      "Big news, congrats! I'll keep that in mind when you ask about design systems or code.",
    memory: {
      text: "Design engineer at Linear",
      group: "Work",
      replaces: "job",
    },
  },
  "My daughter Ava starts school next year": {
    reply:
      "Exciting! I'll remember that when you ask about schools or planning next year.",
    memory: {
      text: "Has a daughter, Ava, starting school next year",
      group: "About you",
    },
  },
};

const demoRemember = (text: string): MemoryChange =>
  DEMO_REPLIES[text] ?? {
    reply: "Got it. Nothing in that I need to remember.",
  };

let counter = 0;
const uid = (prefix: string) => {
  counter += 1;
  return `${prefix}-${counter}`;
};

const reasonOf = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Try again.";

const toItem = ({ state: _, ...item }: Row): MemoryItem => item;

export default function AIMemory({title='Assistant',className,controlRef,workspace}:AIMemoryProps){
 const state=workspace!,rows=state.rows,messages=state.messages,draft=state.draft,enabled=state.enabled,busy=state.busy,thinking=state.thinking,left=state.suggestions,undo=state.undo?{row:state.undo}:null;
 const threadRef=useRef<HTMLDivElement>(null),memoryRef=useRef<HTMLElement>(null),undoRef=useRef<HTMLButtonElement>(null),[flash,setFlash]=useState<string|null>(null),focusNext=useRef<'undo'|{row:string}|null>(null);
 const setDraft=state.onDraftChange,setEnabled=(update:(value:boolean)=>boolean)=>state.onEnabledChange(update(enabled));
 const last=messages.at(-1),words=last?.text.match(WORDS)??[],[shown,setShown]=useState(Number.POSITIVE_INFINITY),lastAssistant=useRef(last?.id),reduce=useReducedMotion(),live=rows.filter(row=>row.state!=='replaced'),groups=[...new Set(rows.map(row=>row.group))];
 const streaming=!!last&&last.role==='assistant'&&shown<words.length;
 useRawLayoutEffect(()=>{if(last?.role==='assistant'&&last.id!==lastAssistant.current){lastAssistant.current=last.id;setShown(reduce?Number.POSITIVE_INFINITY:0);}else if(reduce)setShown(Number.POSITIVE_INFINITY);},[last?.id,reduce]);
 useEffect(()=>{if(!streaming)return;const id=setTimeout(()=>setShown(value=>value+1),45);return()=>clearTimeout(id);},[shown,streaming]);
 const send=(raw:string)=>{if(raw.trim()&&!busy&&!streaming)state.onSend(raw.trim());},forget=(row:Row)=>{if(memoryRef.current?.contains(memoryRef.current.ownerDocument.activeElement))focusNext.current='undo';state.onForget(row.id);},restoreRow=()=>{state.onUndo();};
 useEffect(()=>{if(!flash)return;const id=setTimeout(()=>setFlash(null),1200);return()=>clearTimeout(id);},[flash]);
 useEffect(()=>{if(focusNext.current==='undo'&&undo){focusNext.current=null;undoRef.current?.focus();}},[undo]);
 const count=messages.length,lastText=last?.text;
 useEffect(()=>{const el=threadRef.current;if(el&&count>1)el.scrollTo({top:el.scrollHeight,behavior:'smooth'});},[count,lastText]);

  return (
    <>
      <div
        className={cn(
          "@container w-full max-w-3xl overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.08] dark:bg-zinc-900 dark:ring-white/10",
          className
        )}
        data-state={busy ? "busy" : "idle"} ref={controlRef} role="region" aria-label={title}
      >
        <div className="grid @xl:grid-cols-[minmax(0,1fr)_17.5rem]">
          <section
            aria-label="Chat"
            className="flex min-w-0 flex-col border-black/[0.06] @xl:border-r border-b @xl:border-b-0 dark:border-white/[0.08]"
          >
            <header className="flex h-11 items-center border-black/[0.06] border-b px-4 dark:border-white/[0.08]">
              <h2 className="font-medium text-[13px] text-zinc-900 dark:text-zinc-100">
                {title}
              </h2>
            </header>
            <div
              className="h-80 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-width:thin]"
              ref={threadRef}
            >
              {messages.map((message) => {
                if (message.role === "user") {
                  return (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-end"
                      initial={{ opacity: 0, y: 8 }}
                      key={message.id}
                      transition={{ duration: 0.25, ease: EASE_OUT }}
                    >
                      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-3.5 py-2 text-[13px] text-zinc-800 leading-snug dark:bg-zinc-800 dark:text-zinc-100">
                        {message.text}
                      </p>
                    </motion.div>
                  );
                }
                const isLast = message === last;
                const text = isLast
                  ? words.slice(0, shown).join("")
                  : message.text;
                return (
                  <div className="space-y-2" key={message.id}>
                    <p
                      className={cn(
                        "text-[13px] leading-relaxed",
                        message.error
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-zinc-800 dark:text-zinc-200"
                      )}
                      role={message.error ? "alert" : undefined}
                    >
                      {text}
                    </p>
                    <AnimatePresence>
                      {message.saved && (
                        <motion.button
                          animate={{ opacity: 1, y: 0 }}
                          className="flex max-w-full items-center gap-1.5 rounded-md py-0.5 pr-1.5 text-left text-[12px] text-zinc-500 transition-colors duration-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                          initial={{ opacity: 0, y: 4 }}
                          onClick={() => setFlash(message.saved ?? null)}
                          transition={{ duration: 0.25, ease: EASE_OUT }}
                          type="button"
                        >
                          <Bookmark
                            aria-hidden="true"
                            className="size-3 shrink-0 fill-current"
                          />
                          <span className="truncate">
                            {message.replaced
                              ? "Memory updated"
                              : "Saved to memory"}
                            <span className="text-zinc-400 dark:text-zinc-500">
                              {" "}
                              · {message.savedText}
                            </span>
                          </span>
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              {thinking ? <Thinking /> : null}
            </div>
            <div className="space-y-2 p-2 pt-0">
              <AnimatePresence initial={false} mode="popLayout">
                {left.length > 0 && (
                  <motion.div
                    className={cn(
                      "flex flex-wrap gap-1.5 px-1 transition-opacity duration-150",
                      busy && "opacity-40"
                    )}
                    exit={{ opacity: 0 }}
                    key="chips"
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {left.slice(0, 3).map((s) => (
                        <motion.button
                          animate={{ opacity: 1 }}
                          className="h-7 max-w-full truncate rounded-full px-3 text-[12px] text-zinc-600 ring-1 ring-black/[0.08] transition-colors duration-100 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200/80 dark:text-zinc-300 dark:ring-white/10 dark:active:bg-white/[0.12] dark:hover:bg-white/[0.07] dark:hover:text-white"
                          disabled={busy||streaming}
                          exit={{ opacity: 0, transition: { duration: 0.12 } }}
                          initial={{ opacity: 0 }}
                          key={s}
                          layout
                          onClick={() => send(s)}
                          transition={{ duration: 0.2, ease: EASE_OUT }}
                          type="button"
                        >
                          {s}
                        </motion.button>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
              <form
                className="flex items-center gap-2 rounded-full bg-zinc-50 py-1.5 pr-1.5 pl-4 ring-1 ring-black/[0.07] dark:bg-zinc-800/60 dark:ring-white/[0.08]"
                onSubmit={(event) => {
                  event.preventDefault();
                  send(draft);
                }}
              >
                <input
                  aria-label="Message"
                  onKeyDown={event=>{if(event.key==='Enter'&&(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229))event.preventDefault();}}
                  className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-zinc-900 caret-emerald-500 outline-hidden placeholder:text-zinc-400 dark:text-zinc-100 dark:caret-emerald-400 dark:placeholder:text-zinc-500 [@media(pointer:coarse)]:text-base"
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Tell it something about you…"
                  value={draft}
                />
                <button
                  aria-label="Send"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.16)] transition-[background-color,opacity] duration-150 hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-30 dark:bg-white dark:text-zinc-900 dark:active:bg-zinc-300 dark:hover:bg-zinc-200"
                  disabled={!draft.trim() || busy||streaming}
                  type="submit"
                >
                  <ArrowUp className="size-3.5" />
                </button>
              </form>
            </div>
          </section>

          <section
            aria-label="Memory"
            className="flex min-w-0 flex-col bg-zinc-50/60 dark:bg-zinc-950/30"
            ref={memoryRef}
          >
            <header className="flex h-11 items-center gap-2 border-black/[0.06] border-b px-4 dark:border-white/[0.08]">
              <h2 className="font-medium text-[13px] text-zinc-900 dark:text-zinc-100">
                Memory
              </h2>
              <span className="text-[12px] text-zinc-400 tabular-nums dark:text-zinc-500">
                {live.length}
              </span>
              <Switch on={enabled} onToggle={() => setEnabled((e) => !e)} />
            </header>
            <div
              className={cn(
                "flex-1 space-y-4 px-2 py-3 transition-opacity duration-200",
                !enabled && "opacity-50"
              )}
            >
              {groups.map((group) => (
                <div key={group}>
                  <p className="px-2 pb-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                    {group}
                  </p>
                  <ul>
                    <AnimatePresence initial={false}>
                      {rows
                        .filter((r) => r.group === group)
                        .map((row) => (
                          <MemoryRow
                            flash={flash === row.id}
                            key={row.id}
                            onEdit={text=>state.onEdit(row.id,text)}
                            onForget={() => forget(row)}
                            row={row}
                          />
                        ))}
                    </AnimatePresence>
                  </ul>
                </div>
              ))}
            </div>
            <div aria-live="polite" className="h-10 px-2 pb-2">
              <AnimatePresence>
                {undo && (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="flex h-8 items-center gap-2 rounded-full bg-zinc-900 pr-1 pl-3.5 text-[12px] text-white dark:bg-zinc-100 dark:text-zinc-900"
                    exit={{ opacity: 0, y: 4, transition: { duration: 0.15 } }}
                    initial={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      Forgot “{undo.row.text}”
                    </span>
                    <button
                      className="h-6 shrink-0 rounded-full px-2.5 font-medium transition-colors duration-100 hover:bg-white/15 active:bg-white/25 dark:active:bg-black/15 dark:hover:bg-black/10"
                      onClick={restoreRow}
                      ref={undoRef}
                      type="button"
                    >
                      Undo
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function MemoryRow({
  row,
  flash,
  onEdit,
  onForget,
}: {
  row: Row;
  flash: boolean;
  onEdit: (text: string) => void;
  onForget: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.text);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLLIElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const replaced = row.state === "replaced";

  // Tapping "Saved to memory" in the chat brings the fact into view.
  useEffect(() => {
    if (flash) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [flash]);

  // Enter or Escape closes the field; Edit takes focus back once it returns.
  const refocus = useRef(false);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      editRef.current?.focus();
    }
  }, [editing]);

  const save = () => {
    const text = value.trim();
    if (text && text !== row.text) {
      onEdit(text);
    } else {
      setValue(row.text);
    }
    setEditing(false);
  };

  const icon =
    "flex size-6 shrink-0 items-center justify-center rounded-full text-zinc-400 outline-hidden transition-colors duration-100 hover:bg-zinc-900/[0.06] hover:text-zinc-800 focus-visible:bg-zinc-900/[0.06] focus-visible:text-zinc-800 active:bg-zinc-900/[0.1] dark:text-zinc-500 dark:active:bg-white/15 dark:focus-visible:bg-white/10 dark:focus-visible:text-zinc-100 dark:hover:bg-white/10 dark:hover:text-zinc-100";

  return (
    <motion.li
      animate={{ opacity: 1, height: "auto" }}
      className="overflow-hidden"
      data-memory={row.id}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
      initial={{ opacity: 0, height: 0 }}
      ref={rowRef}
      transition={{ duration: 0.28, ease: EASE_OUT }}
    >
      <div
        className={cn(
          "group/mem flex min-h-8 items-center gap-1 rounded-xl py-1 pr-1 pl-2 transition-colors duration-700",
          row.state === "new" &&
            "bg-emerald-500/[0.1] duration-200 dark:bg-emerald-400/[0.12]",
          flash && "bg-zinc-900/[0.06] duration-150 dark:bg-white/[0.08]"
        )}
      >
        {editing ? (
          <input
            aria-label="Edit memory"
            className="h-6 min-w-0 flex-1 rounded-md bg-white px-1.5 text-[12.5px] text-zinc-900 outline-hidden ring-1 ring-black/10 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/15"
            onBlur={save}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing||event.nativeEvent.keyCode===229) {
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                refocus.current = true;
                save();
              } else if (event.key === "Escape") {
                event.preventDefault();
                refocus.current = true;
                setValue(row.text);
                setEditing(false);
              }
            }}
            ref={inputRef}
            value={value}
          />
        ) : (
          <p className="min-w-0 flex-1 text-[12.5px] leading-snug">
            <span
              className={cn(
                "bg-no-repeat transition-[background-size,color] duration-[400ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
                "bg-[length:0%_1px] bg-[linear-gradient(currentColor,currentColor)] bg-[position:0_55%]",
                replaced
                  ? "bg-[length:100%_1px] text-zinc-400 dark:text-zinc-500"
                  : "text-zinc-700 dark:text-zinc-200"
              )}
            >
              {row.text}
            </span>
            <span className="ml-1.5 whitespace-nowrap text-[11px] text-zinc-400 dark:text-zinc-500">
              {replaced ? "Replaced" : row.saved}
            </span>
          </p>
        )}
        {row.state === "new" && !editing && (
          <Check
            aria-label="Just saved"
            className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
        )}
        {!(replaced || editing) && (
          <div className="flex shrink-0 opacity-100 transition-opacity duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-within:opacity-100 [@media(hover:hover)]:group-hover/mem:opacity-100">
            <button
              aria-label={`Edit “${row.text}”`}
              className={icon}
              onClick={() => setEditing(true)}
              ref={editRef}
              type="button"
            >
              <Pencil className="size-3" />
            </button>
            <button
              aria-label={`Forget “${row.text}”`}
              className={icon}
              onClick={onForget}
              type="button"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        )}
      </div>
    </motion.li>
  );
}

/** The assistant working on a reply that hasn't come back yet. */
function Thinking() {
  const reduced=useReducedMotion();
  return (
    <span className="flex h-5 items-center gap-1">
      <span className="sr-only">Thinking</span>
      {[0, 1, 2].map((i) => (
        <motion.span
          animate={reduced?{opacity:.6}:{opacity:[0.25,1,0.25]}}
          className="size-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500"
          key={i}
          transition={reduced?{duration:0}:{
            duration: 1,
            repeat: Number.POSITIVE_INFINITY,
            delay: i * 0.15,
          }}
        />
      ))}
    </span>
  );
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      aria-checked={on}
      aria-label="Use memory"
      className="ml-auto flex items-center gap-2 rounded-md py-1 text-[12px] text-zinc-500 outline-hidden focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:text-zinc-400 dark:focus-visible:ring-white/20"
      onClick={onToggle}
      role="switch"
      type="button"
    >
      {on ? "On" : "Off"}
      <span
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors duration-200",
          on
            ? "bg-emerald-500 dark:bg-emerald-500"
            : "bg-zinc-300 dark:bg-zinc-600"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-3 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
            on && "translate-x-3"
          )}
        />
      </span>
    </button>
  );
}
