import {AnimatePresence, MotionConfig} from '../motion-provider';
import '../styles/ai-text-loading.css';
// Adapted for KSF from the free MIT Kokonut UI source.
// Source commit: 655ec61161aff87721e4c60c3cc4dc3329f3e80e
// Copyright (c) 2025 kokonutUI. Full license: ../../../THIRD_PARTY_NOTICES.txt
import {useScopedEffect as useEffect} from "../scope";
"use client";

/**
 * @author: @kokonutui
 * @description: AI Text Loading
 * @version: 2.0.0
 * @date: 2026-10-14
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import {motion, type Variants} from 'motion/react';
import {useState} from "react";
import { cn } from "../../lib/utils";

interface AITextLoadingProps {
  texts?: string[];
  className?: string;
  interval?: number;
  /** Stable status for screen readers; the cycling words are hidden from them. */
  label?: string;
  /** Show the seconds spent so far next to the words. */
  showElapsed?: boolean;
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Delay between neighbouring letters in the wave, in seconds.
const WAVE_STEP = 0.07;

const wordVariants = {
  enter: {},
  shown: { transition: { staggerChildren: 0.018 } },
  exit: {
    opacity: 0,
    y: -6,
    filter: "blur(3px)",
    transition: { duration: 0.15, ease: EASE_OUT },
  },
} satisfies Variants;

const letterVariants = {
  enter: { opacity: 0, y: 8, filter: "blur(4px)" },
  shown: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.28, ease: EASE_OUT },
  },
} satisfies Variants;

export default function AITextLoading({
  texts = [
    "Thinking...",
    "Processing...",
    "Analyzing...",
    "Computing...",
    "Almost...",
  ],
  className,
  interval = 1500,
  label = "Loading",
  showElapsed = false,
}: AITextLoadingProps) {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);
  // Clamped, so a shorter (or empty) `texts` never reads past the end.
  const textIndex = texts.length > 0 ? currentTextIndex % texts.length : 0;
  const text = texts[textIndex] ?? "";

  useEffect(() => {
    if (texts.length < 2) {
      return;
    }
    const timer = setInterval(() => {
      setCurrentTextIndex((prevIndex) => (prevIndex + 1) % texts.length);
    }, interval);

    return () => clearInterval(timer);
  }, [interval, texts.length]);

  useEffect(() => {
    if (!showElapsed) {
      return;
    }
    // Counts from zero each time it's turned on, not from the last run.
    setSeconds(0);
    const startedAt = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      500
    );
    return () => clearInterval(timer);
  }, [showElapsed]);

  return (
    <output
      aria-live="polite"
      className={cn(
        "flex items-baseline justify-center gap-3 font-bold text-3xl text-neutral-950 dark:text-white",
        className
      )}
    >
      
      <span className="sr-only">{label}</span>
      {/* With reduced motion the words swap with a fade only, and the
          letters hold still instead of waving. */}
      <MotionConfig reducedMotion="user">
        <span aria-hidden="true" className="relative flex justify-center">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              animate="shown"
              className="flex min-w-max justify-center whitespace-pre"
              exit="exit"
              initial="enter"
              key={textIndex}
              variants={wordVariants}
            >
              {Array.from(text).map((char, i) => (
                <motion.span
                  className="inline-block"
                  // biome-ignore lint/suspicious/noArrayIndexKey: letters of one fixed word, never reordered
                  key={i}
                  variants={letterVariants}
                >
                  {/* A soft brightness wave runs through the letters, left
                      to right, in place of a gradient shimmer. CSS keeps the
                      endless loop off the main thread. */}
                  <span
                    className="kokonut-ai-wave inline-block"
                    style={{ animationDelay: `${i * WAVE_STEP}s` }}
                  >
                    {char}
                  </span>
                </motion.span>
              ))}
            </motion.span>
          </AnimatePresence>
        </span>
      </MotionConfig>
      {showElapsed && (
        <span
          aria-hidden="true"
          className="font-medium text-base text-neutral-400 tabular-nums dark:text-neutral-500"
        >
          {seconds}s
        </span>
      )}
    </output>
  );
}
