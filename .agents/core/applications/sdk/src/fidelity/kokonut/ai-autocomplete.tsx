import '../styles/ai-autocomplete.css';
// Adapted for KSF from the free MIT Kokonut UI source.
// Source commit: 655ec61161aff87721e4c60c3cc4dc3329f3e80e
// Copyright (c) 2025 kokonutUI. Full license: ../../../THIRD_PARTY_NOTICES.txt
import {useScopedEffect as useEffect} from "../scope";
"use client";

/**
 * @author: @dorianbaffier
 * @description: AI Autocomplete
 * @version: 1.0.0
 * @date: 2026-10-16
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import {type Ref, type ChangeEvent, type KeyboardEvent, type TextareaHTMLAttributes, useLayoutEffect as useRawLayoutEffect, useRef, useState} from "react";
import { cn } from "../../lib/utils";

export interface AIAutocompleteProps {value:string;completion?:string;onValueChange:(value:string)=>void;onAccept?:(value:string)=>void;label:string;placeholder?:string;className?:string;disabled?:boolean;readOnly?:boolean;loading?:boolean;controlRef?:Ref<HTMLTextAreaElement>;nativeProps?:TextareaHTMLAttributes<HTMLTextAreaElement>}

const WORD = /^\s*\S+\s?/;
const WORDS = /\s*\S+\s*/g;

/** The next word of a suggestion, with the space around it. */
function nextWord(ghost: string) {
  return ghost.match(WORD)?.[0] ?? ghost;
}

/**
 * A text box that offers how your sentence could end, in grey after the
 * caret. Tab takes all of it, → takes one word, Esc waves it off, and
 * typing the same letters keeps it instead of asking again.
 */
export function AIAutocomplete({value,completion='',onValueChange,onAccept,label,placeholder='Start writing…',className,disabled,readOnly,loading,controlRef,nativeProps}:AIAutocompleteProps){
  const areaRef=useRef<HTMLTextAreaElement>(null),pendingFocus=useRef<string|null>(null);
  const [atEnd,setAtEnd]=useState(true),[dismissed,setDismissed]=useState<string|null>(null),[composing,setComposing]=useState(false);
  const stamp=value+'\0'+completion;
  const ghost=!disabled&&!readOnly&&!loading&&!composing&&dismissed!==stamp&&completion.startsWith(value)?completion.slice(value.length):'';
  const batch=completion,spoken=`Suggestion: ${ghost}. Press Tab to accept.`,showGhost=ghost.length>0&&atEnd;
  const caretAtEnd=()=>{const area=areaRef.current;return !!area&&area.selectionStart===area.selectionEnd&&area.selectionEnd===area.value.length;};
  const onSelect=()=>setAtEnd(caretAtEnd());
  const onChange=(event:ChangeEvent<HTMLTextAreaElement>)=>{nativeProps?.onChange?.(event);if(event.defaultPrevented)return;onValueChange(event.currentTarget.value);setAtEnd(caretAtEnd());setDismissed(null);};
  const accept=(part:string)=>{if(!showGhost||!part)return;const next=value+part;pendingFocus.current=next;onValueChange(next);onAccept?.(next);};
  useRawLayoutEffect(()=>{if(pendingFocus.current===null)return;const next=pendingFocus.current;pendingFocus.current=null;if(value===next){areaRef.current?.focus();areaRef.current?.setSelectionRange(next.length,next.length);}},[value]);
  const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{nativeProps?.onKeyDown?.(event);if(event.defaultPrevented||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||!showGhost)return;const plain=!(event.metaKey||event.ctrlKey||event.altKey);if(event.key==='Tab'&&plain&&!event.shiftKey){event.preventDefault();accept(ghost);}else if(event.key==='ArrowRight'&&plain&&caretAtEnd()){event.preventDefault();accept(nextWord(ghost));}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setDismissed(stamp);}};
  const words = ghost.match(WORDS) ?? [];

  return (
    <div className={cn("w-full", className)}>
      <div className="relative">
        {/* The mirror: the same text, laid out identically under the text
          box, with the suggestion after it. It also sets the height, so
          the box grows with the suggestion and never scrolls. */}
        <div
          aria-hidden="true"
          className="pointer-events-none min-h-32 whitespace-pre-wrap break-words px-4 py-3 text-[15px] leading-6 [@media(pointer:coarse)]:text-base"
        >
          <span className="text-transparent">{value || "​"}</span>
          {value.endsWith("\n") && "​"}
          {showGhost && (
            <span className="text-zinc-400 dark:text-zinc-500" key={batch}>
              {words.map((word, i) => {
                const last = i === words.length - 1;
                return (
                  <span
                    // The Tab hint stays on the line of the last word.
                    className={cn(
                      "ai-autocomplete-word",
                      last && "whitespace-nowrap"
                    )}
                    // biome-ignore lint/suspicious/noArrayIndexKey: words of one suggestion, in order
                    key={i}
                    style={{ animationDelay: `${Math.min(i, 12) * 28}ms` }}
                  >
                    {last ? word.trimEnd() : word}
                    {last && (
                      <kbd className="ml-1.5 inline-flex h-5 translate-y-[-1px] items-center rounded border border-zinc-200 px-1 align-middle font-sans text-[10px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                        Tab
                      </kbd>
                    )}
                  </span>
                );
              })}
            </span>
          )}
        </div>
        <textarea {...nativeProps} disabled={disabled} readOnly={readOnly} aria-busy={loading||undefined}
          aria-label={label}
          className="absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent px-4 py-3 text-[15px] text-zinc-900 leading-6 caret-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:caret-zinc-100 dark:placeholder:text-zinc-500 [@media(pointer:coarse)]:text-base"
          onChange={onChange}
          onFocus={event=>{nativeProps?.onFocus?.(event);onSelect();}}
          onCompositionStart={event=>{setComposing(true);nativeProps?.onCompositionStart?.(event);}}
          onCompositionEnd={event=>{setComposing(false);nativeProps?.onCompositionEnd?.(event);}}
          onKeyDown={onKeyDown}
          onSelect={event=>{nativeProps?.onSelect?.(event);onSelect();}}
          placeholder={placeholder}
          ref={node=>{areaRef.current=node;if(typeof controlRef==='function')return controlRef(node);if(controlRef)controlRef.current=node;}}
          spellCheck={false}
          value={value}
        />
      </div>
      <p aria-live="polite" className="sr-only">
        {showGhost ? spoken : ""}
      </p>
      <AcceptBar
        onAccept={() => accept(ghost)}
        onWord={() => accept(nextWord(ghost))}
        visible={showGhost}
      />
    </div>
  );
}

/** Tap targets for touch screens, which have no Tab key. */
function AcceptBar({
  visible,
  onAccept,
  onWord,
}: {
  visible: boolean;
  onAccept: () => void;
  onWord: () => void;
}) {
  const keep = (event: { preventDefault: () => void }) =>
    // Keep focus (and the caret) in the text box.
    event.preventDefault();
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-3 pb-3 text-xs text-zinc-500 transition-opacity duration-150 dark:text-zinc-400",
        !visible && "pointer-events-none opacity-0"
      )}
    >
      <button
        className="flex items-center gap-1.5 rounded-full px-1.5 py-1 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        onClick={onAccept}
        onMouseDown={keep}
        tabIndex={-1}
        type="button"
      >
        <kbd className="rounded border border-zinc-200 px-1 font-sans text-[10px] dark:border-zinc-800">
          Tab
        </kbd>
        Accept
      </button>
      <button
        className="flex items-center gap-1.5 rounded-full px-1.5 py-1 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        onClick={onWord}
        onMouseDown={keep}
        tabIndex={-1}
        type="button"
      >
        <kbd className="rounded border border-zinc-200 px-1 font-sans text-[10px] dark:border-zinc-800">
          →
        </kbd>
        Word
      </button>
      <span className="ml-1 hidden sm:inline">
        <kbd className="rounded border border-zinc-200 px-1 font-sans text-[10px] dark:border-zinc-800">
          Esc
        </kbd>{" "}
        Dismiss
      </span>
    </div>
  );
}

