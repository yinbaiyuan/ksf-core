import '../styles/profile-dropdown.css';
// Adapted for KSF from the free MIT Kokonut UI source.
// Source commit: 655ec61161aff87721e4c60c3cc4dc3329f3e80e
// Copyright (c) 2025 kokonutUI. Full license: ../../../THIRD_PARTY_NOTICES.txt
import {useScopedEffect as useEffect, useScopedLayoutEffect as useLayoutEffect, useScopedReducedMotion as useReducedMotion} from "../scope";
"use client";

/**
 * @author: @dorianbaffier
 * @description: Account Menu
 * @version: 2.0.0
 * @date: 2026-10-14
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Settings,
  Sun,
  User,
} from "lucide-react";
import {animate, motion, type Transition, useMotionTemplate, useMotionValue} from 'motion/react';
import {type HTMLAttributes, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, useId, useRef, useState} from "react";
import {useEffect as useRawEffect,useLayoutEffect as useRawLayoutEffect,type Ref} from "react";
import {useWindowContext} from "../../window-context";
import {useFidelityInlineOverlay} from "../inline-overlay";
import { cn } from "../../lib/utils";

export interface Account {
  id: string;
  name: string;
  email: string;
  /** Shown in the avatar. Defaults to the first letters of `name`. */
  initials?: string;
  /** Plain label shown in the menu header, such as "Pro". */
  plan?: string;
}

export type AccountStatus = "online" | "away" | "busy";
export type AccountTheme = "light" | "dark" | "system";

export interface ProfileMenuItem {
  label: string;
  icon?: ReactNode;
  /** Quiet text on the right, such as a plan name or a shortcut. */
  value?: string;
  /** Renders the item as a link. Without it the item is a button. */
  href?: string;
  /** Opens `href` in a new tab. */
  external?: boolean;
  onSelect?: () => void;
}

interface ProfileDropdownProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  accounts?: Account[];accountId?:string;disabled?:boolean;label?:string;controlRef?:Ref<HTMLDivElement>;onOpenChange?:(open:boolean)=>void;
  defaultAccountId?: string;
  onAccountChange?: (account: Account) => void;
  onAddAccount?: () => void;
  /** Menu entries between the settings rows and Switch account. */
  items?: ProfileMenuItem[];
  /** Controlled theme. Leave it out to keep the choice in local state. */
  theme?: AccountTheme;
  defaultTheme?: AccountTheme;
  onThemeChange?: (theme: AccountTheme) => void;
  status?: AccountStatus;
  defaultStatus?: AccountStatus;
  onStatusChange?: (status: AccountStatus) => void;
  /** Called once Sign out has been held for `holdDuration` ms. */
  onSignOut?: () => void;
  holdDuration?: number;
}

export const SAMPLE_ACCOUNTS: Account[] = [
  { id: "personal", name: "Maya Ortega", email: "maya@ortega.me", plan: "Pro" },
  {
    id: "studio",
    name: "Fieldwork Studio",
    email: "team@fieldwork.studio",
    plan: "Team",
  },
  {
    id: "side",
    name: "Night Shift",
    email: "hello@nightshift.dev",
    plan: "Free",
  },
];

export const SAMPLE_ITEMS: ProfileMenuItem[] = [
  { label: "Profile", icon: <User className="size-4" /> },
  { label: "Settings", icon: <Settings className="size-4" />, value: "⌘," },
  { label: "Billing", icon: <CreditCard className="size-4" /> },
];

const STATUSES: {
  id: AccountStatus;
  label: string;
  name: string;
  dot: string;
}[] = [
  { id: "online", label: "Online", name: "Online", dot: "bg-emerald-500" },
  { id: "away", label: "Away", name: "Away", dot: "bg-amber-400" },
  { id: "busy", label: "DND", name: "Do not disturb", dot: "bg-red-500" },
];

const THEMES = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
] as const;

const AVATAR_TONES = [
  "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
  "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100",
  "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200 ring-inset dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
];

const WHITESPACE = /\s+/;
const PANEL_W = 288;
const RADIUS = 16;
const SPRING: Transition = { type: "spring", duration: 0.3, bounce: 0 };
const INDICATOR_SPRING: Transition = {
  type: "spring",
  duration: 0.25,
  bounce: 0,
};
const INSTANT: Transition = { duration: 0 };
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const NAV_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

const ITEM_CLASS =
  "flex w-full cursor-default items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-sm text-zinc-700 outline-none transition-colors duration-100 focus:bg-zinc-100 focus:text-zinc-950 dark:text-zinc-300 dark:focus:bg-zinc-800 dark:focus:text-zinc-50";

type Phase = "closed" | "open" | "closing";
type Page = "main" | "accounts";
type Via = "pointer" | "keyboard";

function initialsOf(account: Account) {
  if (account.initials) {
    return account.initials;
  }
  return account.name
    .split(WHITESPACE)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function viaOf(event: MouseEvent): Via {
  // A click fired by Enter or Space carries no pointer detail.
  return event.detail === 0 ? "keyboard" : "pointer";
}

function menuItems(root: HTMLElement | null) {
  if (!root) {
    return [];
  }
  return Array.from(root.querySelectorAll<HTMLElement>("[data-fidelity-menu-item]")).filter(item=>!item.matches(":disabled,[aria-disabled=true]"));
}

function sideTarget(items: HTMLElement[], current: HTMLElement, step: number) {
  const row = items.filter((item) => item.dataset.row === current.dataset.row);
  if (row.length < 2) {
    return;
  }
  const index = row.indexOf(current);
  return row[(index + step + row.length) % row.length];
}

function rowTarget(items: HTMLElement[], current: HTMLElement, step: number) {
  const rows = [...new Set(items.map((item) => item.dataset.row))];
  const index = rows.indexOf(current.dataset.row);
  const next = rows[(index + step + rows.length) % rows.length];
  const candidates = items.filter((item) => item.dataset.row === next);
  return (
    candidates.find((item) => item.getAttribute("aria-checked") === "true") ??
    candidates[0]
  );
}

/** Where arrow keys move focus: rows go up and down, radios left and right. */
function nextTarget(
  items: HTMLElement[],
  active: Element | null,
  key: string
): HTMLElement | undefined {
  if (key === "Home") {
    return items[0];
  }
  if (key === "End") {
    return items.at(-1);
  }
  const current = items.find((item) => item === active);
  if (!current) {
    return key === "ArrowUp" ? items.at(-1) : items[0];
  }
  if (key === "ArrowLeft" || key === "ArrowRight") {
    return sideTarget(items, current, key === "ArrowRight" ? 1 : -1);
  }
  return rowTarget(items, current, key === "ArrowDown" ? 1 : -1);
}

function useControllable<T>(
  value: T | undefined,
  fallback: T,
  onChange?: (next: T) => void
) {
  const [local, setLocal] = useState(fallback);
  const set = (next: T) => {
    setLocal(next);
    onChange?.(next);
  };
  return [value ?? local, set] as const;
}

function Avatar({
  account,
  tone,
  status,
  className,
}: {
  account: Account;
  tone: number;
  status?: AccountStatus;
  className?: string;
}) {
  const dot = STATUSES.find((entry) => entry.id === status)?.dot;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 select-none place-items-center rounded-full font-medium text-[11px] tracking-wide",
        AVATAR_TONES[tone % AVATAR_TONES.length],
        className
      )}
    >
      {initialsOf(account)}
      {dot ? (
        <span
          className={cn(
            "absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-white transition-colors duration-200 dark:ring-zinc-900",
            dot
          )}
        />
      ) : null}
    </span>
  );
}

/**
 * The avatar, name and email. Rendered in the trigger while the menu is
 * closed and in the menu header while it is open; shared layout ids let the
 * three pieces travel between the two places.
 */
function Identity({
  uid,
  shared,
  account,
  tone,
  status,
  transition,
  stacked,
}: {
  uid: string;
  shared: boolean;
  account: Account;
  tone: number;
  status: AccountStatus;
  transition: Transition;
  stacked: boolean;
}) {
  const hidden = shared ? undefined : "invisible";
  return (
    <span
      className={cn(
        "flex min-w-0",
        stacked ? "flex-col items-start gap-3" : "items-center gap-2.5"
      )}
    >
      <motion.span
        className={cn("relative z-20 block", hidden)}
        key={shared ? "avatar-shared" : "avatar-static"}
        layoutId={shared ? `${uid}-avatar` : undefined}
        transition={transition}
      >
        <Avatar
          account={account}
          className={stacked ? "size-10" : "size-8"}
          status={status}
          tone={tone}
        />
      </motion.span>
      <span className="flex min-w-0 flex-col text-left">
        <motion.span
          className={cn(
            "relative z-20 block truncate font-medium text-sm text-zinc-900 leading-5 dark:text-zinc-100",
            hidden
          )}
          key={shared ? "name-shared" : "name-static"}
          layoutId={shared ? `${uid}-name` : undefined}
          transition={transition}
        >
          {account.name}
        </motion.span>
        <motion.span
          className={cn(
            "relative z-20 block truncate text-xs text-zinc-500 leading-4 dark:text-zinc-400",
            hidden
          )}
          key={shared ? "email-shared" : "email-static"}
          layoutId={shared ? `${uid}-email` : undefined}
          transition={transition}
        >
          {account.email}
        </motion.span>
      </span>
    </span>
  );
}

function Separator() {
  return (
    <hr className="mx-2.5 my-1.5 h-px border-0 bg-zinc-100 dark:bg-zinc-800" />
  );
}

function HoldSignOut({
  duration,
  onComplete,disabled,
}: {
  duration: number;disabled?:boolean;
  onComplete: (via: Via) => void;
}) {
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const [nudge, setNudge] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const latest=useRef({disabled,onComplete});latest.current={disabled,onComplete};
  useRawEffect(()=>{if(disabled){window.clearTimeout(timer.current);timer.current=undefined;setHolding(false);}},[disabled]);
  const nudgeTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(nudgeTimer.current);timer.current=undefined;setHolding(false);
    },
    []
  );

  const start = (via: Via) => {
    if (disabled||timer.current !== undefined || done) {
      return;
    }
    window.clearTimeout(nudgeTimer.current);
    setNudge(false);
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      if(latest.current.disabled)return;
      setDone(true);
      latest.current.onComplete(via);
    }, duration);
  };

  const cancel = () => {
    if (timer.current === undefined) {
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
    setNudge(true);
    nudgeTimer.current = window.setTimeout(() => setNudge(false), 1400);
  };

  const label = (
    <>
      <LogOut className="size-4" />
      <span className="flex-1">Sign out</span>
      <span className="text-xs opacity-60">
        {nudge ? "Keep holding" : "Hold"}
      </span>
    </>
  );

  return (
    <button disabled={disabled}
      className={cn(ITEM_CLASS, "relative touch-none select-none")}
      data-fidelity-menu-item=""
      data-row="sign-out"
      onBlur={cancel}
      onClick={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||disabled)return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!event.repeat) {
            start("keyboard");
          }
        }
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          cancel();
        }
      }}
      onPointerCancel={cancel}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        start("pointer");
      }}
      onPointerUp={cancel}
      role="menuitem"
      tabIndex={-1}
      type="button"
    >
      {label}
      <span className="sr-only">, press and hold to confirm</span>
      {/* The fill: an inverted copy of the row, revealed left to right. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center gap-2.5 rounded-[10px] bg-zinc-900 px-2.5 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
        style={{
          clipPath:
            holding || done
              ? "inset(0 0 0 0 round 10px)"
              : "inset(0 100% 0 0 round 10px)",
          transition: holding
            ? `clip-path ${duration}ms linear`
            : "clip-path 240ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function StatusRow({
  status,
  onChange,
}: {
  status: AccountStatus;
  onChange: (status: AccountStatus) => void;
}) {
  return (
    <fieldset
      aria-label="Status"
      className="m-0 flex min-w-0 items-center justify-between border-0 py-1 pr-1 pl-2.5"
    >
      <span className="text-sm text-zinc-500 dark:text-zinc-400">Status</span>
      <span className="flex">
        {STATUSES.map((entry) => {
          const checked = entry.id === status;
          return (
            <button
              aria-checked={checked}
              aria-label={entry.name}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-zinc-500 outline-none transition-colors duration-100 focus:bg-zinc-100 aria-checked:text-zinc-900 dark:text-zinc-400 dark:aria-checked:text-zinc-100 dark:focus:bg-zinc-800"
              data-fidelity-menu-item=""
              data-row="status"
              key={entry.id}
              onClick={() => onChange(entry.id)}
              role="menuitemradio"
              tabIndex={-1}
              type="button"
            >
              <span
                className={cn(
                  "size-2 rounded-full transition-colors duration-200",
                  checked ? entry.dot : "bg-zinc-300 dark:bg-zinc-600"
                )}
              />
              {entry.label}
            </button>
          );
        })}
      </span>
    </fieldset>
  );
}

function ThemeRow({
  uid,
  theme,
  onChange,
  reduced,
}: {
  uid: string;
  theme: AccountTheme;
  onChange: (theme: AccountTheme) => void;
  reduced: boolean;
}) {
  return (
    <fieldset
      aria-label="Theme"
      className="m-0 flex min-w-0 items-center justify-between border-0 py-1 pr-1 pl-2.5"
    >
      <span className="text-sm text-zinc-500 dark:text-zinc-400">Theme</span>
      <span className="flex rounded-[10px] bg-zinc-100 p-0.5 dark:bg-zinc-800">
        {THEMES.map(({ id, label, Icon }) => {
          const checked = id === theme;
          return (
            <button
              aria-checked={checked}
              aria-label={label}
              className="relative grid h-7 w-9 place-items-center rounded-lg text-zinc-500 outline-none transition-colors duration-150 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400 aria-checked:text-zinc-900 dark:text-zinc-400 dark:aria-checked:text-zinc-50 dark:hover:text-zinc-200"
              data-fidelity-menu-item=""
              data-row="theme"
              key={id}
              onClick={() => onChange(id)}
              role="menuitemradio"
              tabIndex={-1}
              type="button"
            >
              {checked ? (
                <motion.span
                  className="absolute inset-0 rounded-lg bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08)] dark:bg-zinc-700"
                  layoutId={`${uid}-theme`}
                  transition={reduced ? INSTANT : INDICATOR_SPRING}
                />
              ) : null}
              <Icon className="relative size-3.5" />
            </button>
          );
        })}
      </span>
    </fieldset>
  );
}

function LinkItem({
  item,
  index,
  onSelect,
}: {
  item: ProfileMenuItem;
  index: number;
  onSelect: (event: MouseEvent, run?: () => void) => void;
}) {
  const inner = (
    <>
      <span className="text-zinc-400 dark:text-zinc-500">{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      {item.value ? (
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {item.value}
        </span>
      ) : null}
    </>
  );
  const common = {
    className: ITEM_CLASS,
    "data-fidelity-menu-item": "",
    "data-row": `item-${index}`,
    onClick: (event: MouseEvent) => onSelect(event, item.onSelect),
    role: "menuitem",
    tabIndex: -1,
  } as const;
  if (item.href) {
    return (
      <a
        {...common}
        href={item.href}
        {...(item.external && { rel: "noopener noreferrer", target: "_blank" })}
      >
        {inner}
      </a>
    );
  }
  return (
    <button {...common} type="button">
      {inner}
    </button>
  );
}

export default function ProfileDropdown({
  accounts = SAMPLE_ACCOUNTS,accountId:controlledAccountId,disabled,label,controlRef,onOpenChange,
  defaultAccountId,
  onAccountChange,
  onAddAccount,
  items = SAMPLE_ITEMS,
  theme: themeProp,
  defaultTheme = "system",
  onThemeChange,
  status: statusProp,
  defaultStatus = "online",
  onStatusChange,
  onSignOut,
  holdDuration = 1200,
  className,
  ...props
}: ProfileDropdownProps) {
  const uid = useId(),owner=useWindowContext(),panelRef=useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() === true;
  const [panelWidth,setPanelWidth]=useState(PANEL_W);
  useRawLayoutEffect(()=>{const area=owner.contentHost??owner.root?.current;if(!area)return;const update=()=>{const width=area.getBoundingClientRect().width;if(width>0)setPanelWidth(Math.min(PANEL_W,Math.max(80,width-16)));};update();const observer=new ResizeObserver(update);observer.observe(area);return()=>observer.disconnect();},[owner.contentHost,owner.root]);
  const [phase, setPhase] = useState<Phase>("closed");
  const [instant, setInstant] = useState(false);
  const [page, setPage] = useState<Page>("main");
  const [openSeq, setOpenSeq] = useState(0);
  const [ownAccountId, setAccountId] = useState(
    defaultAccountId ?? accounts[0]?.id
  );
  const accountId=controlledAccountId??ownAccountId;
  const [theme, setTheme] = useControllable(
    themeProp,
    defaultTheme,
    onThemeChange
  );
  const [status, setStatus] = useControllable(
    statusProp,
    defaultStatus,
    onStatusChange
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const accountsRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("closed");
  phaseRef.current = phase;
  const openIntent = useRef<{
    focus: "first" | "last" | "menu";
    resume: boolean;
  }>({ focus: "menu", resume: false });
  const pageFocus = useRef<"first" | "switch" | null>(null);
  const closeSeq = useRef(0);
  const targetH = useRef(0);

  // The panel's visible box. The two surface layers (border and fill) and the
  // content all clip to it, so the menu grows out of the trigger's own
  // rectangle without any layout work per frame.
  const w = useMotionValue(0);
  const h = useMotionValue(0);
  const pageX = useMotionValue(0);
  const bodyOpacity = useMotionValue(1);
  const outerClip = useMotionTemplate`inset(0px 0px calc(100% - ${h}px) calc(100% - ${w}px) round ${RADIUS}px)`;
  const innerClip = useMotionTemplate`inset(1px 1px calc(100% - ${h}px + 1px) calc(100% - ${w}px + 1px) round ${RADIUS - 1}px)`;
  const pageTransform = useMotionTemplate`translate3d(${pageX}px, 0, 0)`;

  const account = accounts.find((entry) => entry.id === accountId) ??
    accounts[0] ?? { id: "guest", name: "Guest", email: "" };
  const tone = Math.max(0, accounts.indexOf(account));
  const others = accounts.filter((entry) => entry.id !== account.id);
  const sharedTransition = instant ? INSTANT : SPRING;
  const sharedInPanel = phase === "open";
  const menuId = `${uid}-menu`;

  const pageEl = (target: Page) =>
    target === "main" ? mainRef.current : accountsRef.current;

  const openMenu = (via: Via, focus: "first" | "last" | "menu") => {
    if (disabled||phaseRef.current === "open") {
      return;
    }
    openIntent.current = { focus, resume: phaseRef.current === "closing" };
    closeSeq.current += 1;
    setInstant(via === "keyboard" || reduced);
    setPage("main");
    setPhase("open");
    setOpenSeq((seq) => seq + 1);
  };

  const closeMenu = (via: Via, returnFocus: boolean) => {
    if (phaseRef.current !== "open") {
      return;
    }
    const trigger = triggerRef.current;
    if (returnFocus) {
      trigger?.focus({ preventScroll: true });
    }
    if (via === "keyboard" || reduced || !trigger) {
      setInstant(true);
      setPhase("closed");
      return;
    }
    setInstant(false);
    setPhase("closing");
    const seq = ++closeSeq.current;
    animate(bodyOpacity, 0, { duration: 0.12, ease: EASE_OUT });
    animate(w, trigger.offsetWidth, SPRING);
    animate(h, trigger.offsetHeight, SPRING).then(() => {
      if (closeSeq.current === seq) {
        setPhase("closed");
      }
    });
  };

  const goTo = (target: Page) => {
    pageFocus.current = target === "accounts" ? "first" : "switch";
    setPage(target);
  };

  const select = (event: MouseEvent, run?: () => void) => {
    run?.();
    closeMenu(viaOf(event), true);
  };

  // Opening: size the clip to the trigger, then spring it out to the menu.
  // A keyboard open skips straight to the end.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per open
  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const main = mainRef.current;
    if (openSeq === 0 || phaseRef.current !== "open" || !trigger || !main) {
      return;
    }
    pageX.jump(0);
    targetH.current = main.offsetHeight;
    if (instant) {
      w.jump(panelWidth);
      h.jump(targetH.current);
      bodyOpacity.jump(1);
    } else {
      if (!openIntent.current.resume) {
        w.jump(trigger.offsetWidth);
        h.jump(trigger.offsetHeight);
        bodyOpacity.jump(0);
      }
      animate(w, panelWidth, SPRING);
      animate(h, targetH.current, SPRING);
      animate(bodyOpacity, 1, { duration: 0.2, delay: 0.05, ease: EASE_OUT });
    }
    const list = menuItems(main);
    const targets = {
      first: list[0],
      last: list.at(-1),
      menu: main.querySelector<HTMLElement>("[role=menu]"),
    };
    targets[openIntent.current.focus]?.focus({ preventScroll: true });
  }, [openSeq,panelWidth]);

  // Switching pages: push sideways and spring the height to the new page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on page
  useEffect(() => {
    const el = pageEl(page);
    if (phaseRef.current !== "open" || !el) {
      return;
    }
    const x = page === "main" ? 0 : -panelWidth;
    targetH.current = el.offsetHeight;
    if (reduced) {
      pageX.jump(x);
      h.jump(targetH.current);
    } else {
      animate(pageX, x, SPRING);
      animate(h, targetH.current, SPRING);
    }
    const intent = pageFocus.current;
    pageFocus.current = null;
    if (intent === "first") {
      const list = menuItems(el);
      const checked = list.find(
        (item) => item.getAttribute("aria-checked") === "true"
      );
      (checked ?? list[0])?.focus({ preventScroll: true });
    } else if (intent === "switch") {
      el.querySelector<HTMLElement>("[data-switch]")?.focus({
        preventScroll: true,
      });
    }
  }, [page,panelWidth]);

  // Keep the height in step if a page's content changes size while open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: observers read refs
  useEffect(() => {
    if (phase !== "open") {
      return;
    }
    const observer = new ResizeObserver(() => {
      const el = pageEl(page);
      if (!el || phaseRef.current !== "open") {
        return;
      }
      const next = el.offsetHeight;
      if (Math.abs(next - targetH.current) < 0.5) {
        return;
      }
      targetH.current = next;
      animate(h, next, reduced ? INSTANT : SPRING);
    });
    for (const el of [mainRef.current, accountsRef.current]) {
      if (el) {
        observer.observe(el);
      }
    }
    return () => observer.disconnect();
  }, [phase, page]);

  useFidelityInlineOverlay(phase==='open',panelRef,triggerRef,()=>closeMenu('pointer',false));
  useRawEffect(()=>{onOpenChange?.(phase==='open');},[phase,onOpenChange]);
  useRawEffect(()=>{if(disabled||!owner.active||!owner.enabled){for(const value of [w,h,pageX,bodyOpacity])value.stop();setPhase('closed');}},[disabled,owner.active,owner.enabled,w,h,pageX,bodyOpacity]);
  useEffect(()=>()=>{closeSeq.current+=1;for(const value of [w,h,pageX,bodyOpacity])value.stop();},[w,h,pageX,bodyOpacity]);
  useLayoutEffect(()=>{const panel=panelRef.current,trigger=triggerRef.current,area=owner.contentHost??owner.root?.current;if(phase==='closed'||!panel||!trigger||!area)return;const place=()=>{const bounds=area.getBoundingClientRect(),anchor=trigger.getBoundingClientRect(),width=Math.min(PANEL_W,Math.max(0,bounds.width-16)),height=Math.max(mainRef.current?.offsetHeight??0,accountsRef.current?.offsetHeight??0);panel.style.maxWidth=width+'px';panel.style.maxHeight=Math.max(0,bounds.height-16)+'px';panel.style.overflowY=height>bounds.height-16?'auto':'visible';panel.style.top=Math.max(bounds.top+8-anchor.top,Math.min(0,bounds.bottom-8-anchor.top-height))+'px';const left=Math.max(bounds.left+8,Math.min(anchor.right-width,bounds.right-width-8));panel.style.left=(left-anchor.left)+'px';panel.style.right='auto';};place();const observer=new ResizeObserver(place);observer.observe(area);observer.observe(panel);return()=>observer.disconnect();},[phase,page,owner.contentHost,owner.root]);
  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      closeMenu("keyboard", true);
      return;
    }
    if (page === "accounts" && event.key === "Backspace") {
      event.preventDefault();
      goTo("main");
      return;
    }
    if (!NAV_KEYS.has(event.key)) {
      return;
    }
    event.preventDefault();
    const active = wrapperRef.current?.ownerDocument.activeElement;
    const target = nextTarget(menuItems(pageEl(page)), active??null, event.key);
    if (target) {
      target.focus({ preventScroll: true });
    } else if (page === "accounts" && event.key === "ArrowLeft") {
      goTo("main");
    } else if (
      event.key === "ArrowRight" &&
      active instanceof HTMLElement &&
      active.dataset.switch !== undefined
    ) {
      goTo("accounts");
    }
  };

  // Hovering an item focuses it, so pointer and keyboard share one highlight.
  const onPanelPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") {
      return;
    }
    const item = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-fidelity-menu-item]"
    );
    if (item && wrapperRef.current?.ownerDocument.activeElement !== item) {
      item.focus({ preventScroll: true });
    }
  };

  return (
    <div
      className={cn(
        "relative isolate inline-block",
        phase !== "closed" && "z-50",
        className
      )}
      ref={node=>{wrapperRef.current=node;if(typeof controlRef==='function')return controlRef(node);if(controlRef)controlRef.current=node;}}
      {...props}
    >
      <button disabled={disabled} aria-label={label}
        aria-controls={sharedInPanel ? menuId : undefined}
        aria-expanded={sharedInPanel}
        aria-haspopup="menu"
        className="flex w-60 items-center gap-2.5 rounded-2xl border border-zinc-200 bg-white p-2 pr-3 text-left outline-none transition-colors duration-150 hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-zinc-800 dark:bg-zinc-900 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
        onClick={(event) => {
          const via = viaOf(event);
          openMenu(via, via === "keyboard" ? "first" : "menu");
        }}
        onKeyDown={(event) => {
        if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||disabled)return;
          if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu("keyboard", event.key === "ArrowDown" ? "first" : "last");
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="min-w-0 flex-1">
          <Identity
            account={account}
            shared={!sharedInPanel}
            stacked={false}
            status={status}
            tone={tone}
            transition={sharedTransition}
            uid={uid}
          />
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-zinc-400 transition-opacity duration-150 dark:text-zinc-500",
            phase !== "closed" && "opacity-0"
          )}
        />
      </button>

      {phase === "closed" ? null : (
        <div
          ref={panelRef} className="pointer-events-none absolute top-0 right-0 z-10"
          style={{ width: panelWidth }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 [filter:drop-shadow(0_12px_24px_rgb(0_0_0/0.08))_drop-shadow(0_2px_4px_rgb(0_0_0/0.04))] dark:[filter:drop-shadow(0_12px_28px_rgb(0_0_0/0.5))]"
          >
            <motion.div
              className="absolute inset-0 bg-zinc-200 dark:bg-zinc-800"
              style={{ clipPath: outerClip }}
            />
            <motion.div
              className="absolute inset-0 bg-white dark:bg-zinc-900"
              style={{ clipPath: innerClip }}
            />
          </div>
          <motion.div
            className={cn("relative overflow-hidden", sharedInPanel && "pointer-events-auto")}
            onKeyDown={onPanelKeyDown}
            onPointerMove={onPanelPointerMove}
            style={{ clipPath: innerClip }}
          >
            <motion.div
              className="flex w-max items-start"
              style={{ transform: pageTransform }}
            >
              <div
                className={cn(
                  "shrink-0 p-1.5 transition-opacity duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  page !== "main" && "opacity-0"
                )}
                inert={page !== "main"}
                ref={mainRef}
                style={{ width: panelWidth }}
              >
                <div className="flex items-start justify-between px-2.5 pt-2.5 pb-3">
                  <Identity
                    account={account}
                    shared={sharedInPanel}
                    stacked
                    status={status}
                    tone={tone}
                    transition={sharedTransition}
                    uid={uid}
                  />
                  {account.plan ? (
                    <motion.span
                      className="shrink-0 pt-0.5 text-xs text-zinc-400 dark:text-zinc-500"
                      style={{ opacity: bodyOpacity }}
                    >
                      {account.plan}
                    </motion.span>
                  ) : null}
                </div>
                <motion.div
                  aria-label={account.name}
                  className="outline-none"
                  id={menuId}
                  role="menu"
                  style={{ opacity: bodyOpacity }}
                  tabIndex={-1}
                >
                  <StatusRow onChange={setStatus} status={status} />
                  <ThemeRow
                    onChange={setTheme}
                    reduced={reduced}
                    theme={theme}
                    uid={uid}
                  />
                  <Separator />
                  {items.map((item, index) => (
                    <LinkItem
                      index={index}
                      item={item}
                      key={item.label}
                      onSelect={select}
                    />
                  ))}
                  {accounts.length > 1 ? (
                    <button
                      aria-expanded={page === "accounts"}
                      aria-haspopup="menu"
                      className={ITEM_CLASS}
                      data-fidelity-menu-item=""
                      data-row="switch"
                      data-switch=""
                      onClick={() => goTo("accounts")}
                      role="menuitem"
                      tabIndex={-1}
                      type="button"
                    >
                      <span className="flex -space-x-1.5">
                        {others.slice(0, 2).map((entry) => (
                          <Avatar
                            account={entry}
                            className="size-5 text-[7px] tracking-normal ring-2 ring-white dark:ring-zinc-900"
                            key={entry.id}
                            tone={accounts.indexOf(entry)}
                          />
                        ))}
                      </span>
                      <span className="flex-1">Switch account</span>
                      <ChevronRight className="size-4 text-zinc-400 dark:text-zinc-500" />
                    </button>
                  ) : null}
                  <Separator />
                  <HoldSignOut disabled={!onSignOut||disabled}
                    duration={holdDuration}
                    onComplete={(via) => {
                      onSignOut?.();
                      closeMenu(via, true);
                    }}
                  />
                </motion.div>
              </div>

              <div
                className={cn(
                  "shrink-0 p-1.5 transition-opacity duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  page !== "accounts" && "opacity-0"
                )}
                inert={page !== "accounts"}
                ref={accountsRef}
                style={{ width: panelWidth }}
              >
                <motion.div
                  aria-label="Switch account"
                  className="outline-none"
                  role="menu"
                  style={{ opacity: bodyOpacity }}
                  tabIndex={-1}
                >
                  <button
                    className={cn(ITEM_CLASS, "gap-1.5 pl-1.5 font-medium")}
                    data-fidelity-menu-item=""
                    data-row="back"
                    onClick={() => goTo("main")}
                    role="menuitem"
                    tabIndex={-1}
                    type="button"
                  >
                    <ChevronLeft className="size-4 text-zinc-400 dark:text-zinc-500" />
                    <span className="sr-only">Back to </span>
                    Switch account
                  </button>
                  <Separator />
                  {accounts.map((entry, index) => {
                    const checked = entry.id === account.id;
                    return (
                      <button
                        aria-checked={checked}
                        className={ITEM_CLASS}
                        data-fidelity-menu-item=""
                        data-row={`account-${entry.id}`}
                        key={entry.id}
                        onClick={() => {
                          if (!checked) {
                            if(controlledAccountId===undefined)setAccountId(entry.id);
                            onAccountChange?.(entry);
                          }
                          goTo("main");
                        }}
                        role="menuitemradio"
                        tabIndex={-1}
                        type="button"
                      >
                        <Avatar
                          account={entry}
                          className="size-7"
                          status={checked ? status : undefined}
                          tone={index}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-zinc-900 dark:text-zinc-100">
                            {entry.name}
                          </span>
                          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {entry.email}
                          </span>
                        </span>
                        {checked ? (
                          <Check className="size-4 text-zinc-900 dark:text-zinc-100" />
                        ) : null}
                      </button>
                    );
                  })}
                  <Separator />
                  <button
                    className={ITEM_CLASS}
                    data-fidelity-menu-item=""
                    data-row="add"
                    onClick={(event) => select(event, onAddAccount)}
                    role="menuitem"
                    tabIndex={-1}
                    type="button"
                  >
                    <span className="grid size-7 place-items-center rounded-full border border-zinc-300 border-dashed text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                      <Plus className="size-3.5" />
                    </span>
                    Add account
                  </button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
