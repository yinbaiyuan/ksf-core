import {AnimatePresence} from '../motion-provider';
import '../styles/ai-voice.css';
// Adapted for KSF from the free MIT Kokonut UI source.
// Source commit: 655ec61161aff87721e4c60c3cc4dc3329f3e80e
// Copyright (c) 2025 kokonutUI. Full license: ../../../THIRD_PARTY_NOTICES.txt
import {useScopedEffect as useEffect, useScopedReducedMotion as useReducedMotion} from "../scope";
"use client";

/**
 * @author: @kokonutui
 * @description: AI Voice
 * @version: 2.1.0
 * @date: 2026-10-14
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { ArrowUp, Mic, Pause, Play, X } from "lucide-react";
import {motion} from 'motion/react';
import {useRef, useState} from "react";
import {useLayoutEffect as useRawLayoutEffect,type Ref} from "react";
import { cn } from "../../lib/utils";

type Mode = "idle" | "recording" | "review";

const BAR_COUNT = 48;
// One extra bar waits off the right edge, so the row can slide a full bar
// before the samples shift and nothing pops in.
const BAR_IDS = Array.from({ length: BAR_COUNT + 1 }, (_, i) => `bar-${i}`);
const BAR_PITCH = 5; // bar width + gap, px
// A new sample enters on the right this often, so the history scrolls at
// BAR_PITCH / SAMPLE_MS px per ms.
const SAMPLE_MS = 70;
const REST_LEVEL = 0.12;
// Shape shown under reduced motion: still bars, no scrolling.
const STILL_LEVELS = BAR_IDS.map(
  (_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21))
);
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EDGE_MASK =
  "linear-gradient(to right, transparent, black 18%, black 92%, transparent)";

/**
 * Speech-like level without a microphone: syllables at about 4-5 per second,
 * grouped into words and phrases with pauses between them.
 */
function createVoiceSimulator() {
  let speaking = false;
  let switchAt = 0;
  let gate = 0;
  return (time: number) => {
    if (time >= switchAt) {
      speaking = !speaking;
      switchAt =
        time +
        (speaking ? 700 + Math.random() * 1600 : 180 + Math.random() * 500);
    }
    // The gate eases in and out, so words swell and fade instead of cutting.
    gate += ((speaking ? 1 : 0) - gate) * 0.35;
    const t = time / 1000;
    const syllable = Math.abs(
      Math.sin(t * Math.PI * 4.4 + Math.sin(t * 1.7) * 2)
    );
    const grain = 0.65 + Math.random() * 0.35;
    return REST_LEVEL + gate * syllable * grain * (1 - REST_LEVEL);
  };
}

/** Squeezes a whole take into BAR_COUNT bars, keeping each slice's peak. */
function condense(take: number[]) {
  if (take.length === 0) {
    return STILL_LEVELS.slice(0, BAR_COUNT);
  }
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const from = Math.floor((i / BAR_COUNT) * take.length);
    const to = Math.max(
      from + 1,
      Math.floor(((i + 1) / BAR_COUNT) * take.length)
    );
    return Math.max(REST_LEVEL, ...take.slice(from, to));
  });
}

const formatTime = (seconds: number) => {
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

const setScales = (
  bars: (HTMLSpanElement | null)[],
  levels: readonly number[]
) => {
  bars.forEach((bar, i) => {
    if (bar) {
      bar.style.transform = `scaleY(${(levels[i] ?? REST_LEVEL).toFixed(3)})`;
    }
  });
};

type Face = "mic" | "stop" | "play" | "pause";

const mainLabelFor = (mode: Mode, playing: boolean) => {
  if (mode === "recording") {
    return "Stop recording";
  }
  if (mode === "review") {
    return playing ? "Pause playback" : "Play recording";
  }
  return "Start recording";
};

const timerText = (
  mode: Mode,
  seconds: number,
  duration: number,
  playing: boolean,
  playhead: number
) => {
  if (mode === "review") {
    return formatTime(playing || playhead > 0 ? playhead : duration);
  }
  return formatTime(mode === "recording" ? seconds : 0);
};

const FACE_CLASS =
  "absolute transition-[opacity,filter,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-opacity";
const faceState = (visible: boolean) =>
  visible ? "scale-100 opacity-100 blur-0" : "scale-50 opacity-0 blur-[3px]";

/**
 * Mic, stop, play and pause stay mounted and crossfade with a little blur,
 * so every swap reads as one control changing state.
 */
function ButtonFaces({ visible }: { visible: Record<Face, boolean> }) {
  const icon = "h-6 w-6 text-black/90 dark:text-white/90";
  return (
    <>
      <Mic
        aria-hidden="true"
        className={cn(FACE_CLASS, icon, faceState(visible.mic))}
      />
      <span
        aria-hidden="true"
        className={cn(
          FACE_CLASS,
          "h-5 w-5 rounded-[6px] bg-red-500 dark:bg-red-400",
          faceState(visible.stop)
        )}
      />
      <Play
        aria-hidden="true"
        className={cn(
          FACE_CLASS,
          icon,
          "fill-current",
          faceState(visible.play)
        )}
      />
      <Pause
        aria-hidden="true"
        className={cn(
          FACE_CLASS,
          icon,
          "fill-current",
          faceState(visible.pause)
        )}
      />
    </>
  );
}

const ACTION_FOCUS =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/30";

function ReviewActions({
  onDiscard,
  onSend,disabled,canDiscard=true,canSend=true,
}: {
  onDiscard: () => void;disabled?:boolean;canDiscard?:boolean;canSend?:boolean;
  onSend: () => void;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      className="flex items-center gap-1"
      exit={{ opacity: 0, filter: "blur(2px)" }}
      initial={{ opacity: 0, y: 4, filter: "blur(2px)" }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
    >
      <button
        className={cn(
          "flex h-7 items-center gap-1 rounded-full px-2 text-black/60 text-xs transition-colors duration-150 hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white",
          ACTION_FOCUS
        )}
        disabled={disabled||!canDiscard} onClick={onDiscard}
        type="button"
      >
        <X aria-hidden="true" className="size-3.5" />
        Discard
      </button>
      <button
        className={cn(
          "flex h-7 items-center gap-1 rounded-full bg-black px-2.5 text-white text-xs shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.16)] transition-colors duration-150 hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80",
          ACTION_FOCUS
        )}
        disabled={disabled||!canSend} onClick={onSend}
        type="button"
      >
        Send
        <ArrowUp aria-hidden="true" className="size-3.5" />
      </button>
    </motion.div>
  );
}

interface AIVoiceProps {className?:string;label:string;status:'idle'|'recording'|'ready'|'playing';samples:readonly number[];elapsed:number;duration:number;position:number;disabled?:boolean;controlRef?:Ref<HTMLDivElement>;onStart?:()=>void;onStop?:()=>void;onPlay?:()=>void;onDiscard?:()=>void;onSend?:()=>void;}
export default function AI_Voice({className,label,status,samples,elapsed,duration,position,disabled,controlRef,onStart,onStop,onPlay,onDiscard,onSend}:AIVoiceProps){
  const mode:Mode=status==='recording'?'recording':status==='idle'?'idle':'review',recording=mode==='recording',reviewing=mode==='review',playing=status==='playing',seconds=elapsed,playhead=position,announce=true;
  const rootRef=useRef<HTMLDivElement>(null),mainRef=useRef<HTMLButtonElement>(null),rowRef=useRef<HTMLDivElement>(null),ringRef=useRef<HTMLSpanElement>(null),playedRef=useRef<HTMLDivElement>(null),barRefs=useRef<(HTMLSpanElement|null)[]>([]),playedBarRefs=useRef<(HTMLSpanElement|null)[]>([]);
  const levels=samples.length?condense([...samples]):BAR_IDS.map(()=>REST_LEVEL),latest=useRef(levels);latest.current=levels;
  const reduced=useReducedMotion();
  const draw=(values:number[])=>{setScales(barRefs.current,values);setScales(playedBarRefs.current,values);};
  useRawLayoutEffect(()=>{draw(levels);if(playedRef.current)playedRef.current.style.clipPath=`inset(0 ${(1-Math.min(1,position/Math.max(duration,1)))*100}% 0 0)`;},[samples,position,duration,status]);
  useEffect(()=>{const ring=ringRef.current,row=rowRef.current;if(!recording||reduced||!ring||!row)return;let frame=0,phase=0,last=performance.now(),smooth=0;const tick=(now:number)=>{phase=(phase+Math.min(now-last,100)/SAMPLE_MS)%1;last=now;row.style.transform=`translateX(${-phase*BAR_PITCH}px)`;const values=latest.current;draw(values);const newest=values.at(-1)??REST_LEVEL;smooth+=(newest-smooth)*.18;const lift=Math.max(0,smooth-REST_LEVEL);ring.style.transform=`scale(${1+lift*.22})`;ring.style.opacity=String(.4+lift*.8);frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);row.style.transform='translateX(0px)';ring.style.transform='scale(1)';ring.style.opacity='0';};},[recording,reduced]);
  const finish=(sent:boolean)=>{if(disabled)return;mainRef.current?.focus();if(sent)onSend?.();else onDiscard?.();};
  const handleMainClick=()=>{if(disabled)return;if(recording||playing)onStop?.();else if(reviewing)onPlay?.();else onStart?.();};
  const mainDisabled=disabled||(recording||playing?!onStop:reviewing?!onPlay:!onStart);
  const faces: Record<Face, boolean> = {
    mic: mode === "idle",
    stop: recording,
    play: reviewing && !playing,
    pause: reviewing && playing,
  };
  const timerValue = timerText(mode, seconds, duration, playing, playhead);

  return (
    <div
      className={cn("w-full py-4", className)}
      role="group" aria-label={label} aria-disabled={disabled||undefined} ref={node=>{rootRef.current=node;if(typeof controlRef==='function')return controlRef(node);if(controlRef)controlRef.current=node;}}
    >
      <div className="relative mx-auto flex w-full max-w-xl flex-col items-center gap-2">
        <div className="relative">
          {/* Swells with the voice while recording. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full bg-red-500/10 opacity-0 dark:bg-red-400/15"
            ref={ringRef}
          />
          <button
            aria-label={mainLabelFor(mode, playing)} disabled={mainDisabled}
            aria-pressed={recording && announce}
            className={cn(
              "relative flex h-16 w-16 items-center justify-center rounded-full transition-colors duration-150 ease-out",
              "outline-hidden focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/30",
              mode === "idle" &&
                "ring-1 ring-black/[0.08] hover:bg-black/5 dark:ring-white/10 dark:hover:bg-white/5",
              recording && "bg-red-500/10 dark:bg-red-400/15",
              reviewing && "bg-black/5 dark:bg-white/5"
            )}
            onClick={handleMainClick}
            ref={mainRef}
            type="button"
          >
            <ButtonFaces visible={faces} />
          </button>
        </div>

        <span
          className={cn(
            "relative font-mono text-sm tabular-nums transition-colors duration-300",
            mode === "idle"
              ? "text-black/30 dark:text-white/30"
              : "text-black/70 dark:text-white/70"
          )}
        >
          {/* A steady red dot, like a recorder's REC lamp. Sits outside the
              text so the timer stays centred. */}
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1/2 right-full mr-2 size-1.5 -translate-y-1/2 rounded-full bg-red-500 transition-opacity duration-150",
              recording ? "opacity-100" : "opacity-0"
            )}
          />
          {timerValue}
        </span>

        {/* While recording, the newest sound enters on the right and the
            edges fade. In review the whole take sits still and a darker
            copy, clipped at the playhead, shows what has played. */}
        <div
          aria-hidden="true"
          className="relative h-8 w-60 overflow-hidden"
          style={{
            maskImage: recording ? EDGE_MASK : undefined,
            WebkitMaskImage: recording ? EDGE_MASK : undefined,
          }}
        >
          <div className="flex h-full items-center gap-[2px]" ref={rowRef}>
            {BAR_IDS.map((id, i) => (
              <span
                className={cn(
                  "h-full w-[3px] shrink-0 rounded-full",
                  recording
                    ? "bg-black/60 dark:bg-white/60"
                    : "bg-black/15 transition-transform duration-500 motion-reduce:transition-none dark:bg-white/15"
                )}
                key={id}
                ref={(el) => {
                  barRefs.current[i] = el;
                }}
                style={{
                  transform: `scaleY(${REST_LEVEL})`,
                  // Out of recording the bars settle right to left.
                  transitionDelay: recording
                    ? undefined
                    : `${(BAR_COUNT - i) * 6}ms`,
                  transitionTimingFunction: EASE_OUT,
                }}
              />
            ))}
          </div>
          <div
            className={cn(
              "absolute inset-0 flex items-center gap-[2px] transition-opacity duration-200",
              reviewing ? "opacity-100" : "opacity-0"
            )}
            ref={playedRef}
            style={{ clipPath: "inset(0 100% 0 0)" }}
          >
            {BAR_IDS.map((id, i) => (
              <span
                className="h-full w-[3px] shrink-0 rounded-full bg-black/70 dark:bg-white/70"
                key={id}
                ref={(el) => {
                  playedBarRefs.current[i] = el;
                }}
                style={{ transform: `scaleY(${REST_LEVEL})` }}
              />
            ))}
          </div>
        </div>

        <div className="relative flex h-7 items-center justify-center">
          <AnimatePresence initial={false} mode="popLayout">
            {reviewing ? (
              <ReviewActions disabled={disabled} canDiscard={!!onDiscard} canSend={!!onSend}
                key="actions"
                onDiscard={() => finish(false)}
                onSend={() => finish(true)}
              />
            ) : (
              <motion.span
                animate={{ opacity: 1, filter: "blur(0px)" }}
                className="text-black/70 text-xs dark:text-white/70"
                exit={{ opacity: 0, filter: "blur(2px)" }}
                initial={{ opacity: 0, filter: "blur(2px)" }}
                key="caption"
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              >
                {recording ? "Listening..." : "Click to speak"}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* <output> has the implicit role="status". It stays silent during
            the demo loop. */}
        <output aria-live={announce ? "polite" : "off"} className="sr-only">
          {announce && recording ? "Recording" : ""}
          {announce && reviewing ? "Recording ready to send" : ""}
        </output>
      </div>
    </div>
  );
}
