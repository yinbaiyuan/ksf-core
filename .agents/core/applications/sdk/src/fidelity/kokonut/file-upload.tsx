import {AnimatePresence} from '../motion-provider';
import '../styles/file-upload.css';
// Adapted from Kokonut UI free MIT source; commit 655ec61161aff87721e4c60c3cc4dc3329f3e80e.
// Copyright (c) 2025 kokonutUI. Full license: ../../../THIRD_PARTY_NOTICES.txt
import {useScopedEffect as useEffect,useScopedReducedMotion as useReducedMotion,useFidelityActivity} from '../scope';
import {useWindowContext} from '../../window-context';
"use client";

/**
 * @author: @dorianbaffier
 * @description: File Upload
 * @version: 2.0.0
 * @date: 2026-10-16
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { RotateCw, Upload, X } from "lucide-react";
import {motion} from 'motion/react';
import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  useCallback,

  useId,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/utils";

export interface FileError {
  message: string;
  code: string;
}

export interface FileUploadProps {
 items:QueueItem[];onFiles:(files:File[])=>void;onPick?:()=>void;
 onRemove:(id:string)=>void;onRetry:(id:string)=>void;onClear:()=>void;
 notice?:string|null;disabled?:boolean;acceptedFileTypes?:string[];maxFileSize?:number;
 multiple?:boolean;maxFiles?:number;className?:string;
}
type ItemStatus = "queued" | "uploading" | "done" | "error" | "rejected";

export interface QueueItem {
  id: string;
  file: {name:string;size?:number;type:string};
  sourceFile?:File;
  index: number;
  status: ItemStatus;
  progress: number;
  attempts: number;
  error?: FileError;
  previewUrl?: string;
}

const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;


const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const FILE_SIZES = ["B", "KB", "MB", "GB", "TB"] as const;
// Module constant, so the default does not change identity every render.
const NO_ACCEPTED_TYPES: string[] = [];

const formatBytes = (bytes: number | undefined): string => {
  if(bytes===undefined)return "Unknown size";
  if (!bytes) {
    return "0 B";
  }
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    FILE_SIZES.length - 1
  );
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : Number(value.toFixed(1))} ${FILE_SIZES[i]}`;
};

// ".pdf" -> "PDF", "image/svg+xml" -> "SVG", "image/*" -> "images".
const describeAcceptedType = (acceptedType: string): string => {
  const accepted = acceptedType.trim();
  if (accepted.startsWith(".")) {
    return accepted.slice(1).toUpperCase();
  }
  const [kind = "", subtype = ""] = accepted.split("/");
  if (subtype === "*") {
    return `${kind.toLowerCase()}s`;
  }
  return subtype.split("+")[0].toUpperCase();
};

const describeAcceptedTypes = (acceptedTypes: string[]): string => {
  const labels = acceptedTypes.map(describeAcceptedType).filter(Boolean);
  if (!labels.length) {
    return "Any file";
  }
  const text =
    labels.length > 1
      ? `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`
      : labels[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return "FILE";
  }
  return name
    .slice(dot + 1)
    .slice(0, 4)
    .toUpperCase();
};

const isFileDrag = (e: { dataTransfer: DataTransfer | null }) =>
  Boolean(e.dataTransfer?.types.includes("Files"));

const countDraggedFiles = (dataTransfer: DataTransfer): number => {
  let count = 0;
  for (const item of dataTransfer.items) {
    if (item.kind === "file") {
      count += 1;
    }
  }
  return count;
};

const summarize = (items: QueueItem[]) => {
  let done = 0;
  let failed = 0;
  let busy = false;
  for (const item of items) {
    if (item.status === "done") {
      done += 1;
    } else if (item.status === "error" || item.status === "rejected") {
      failed += 1;
    } else {
      busy = true;
    }
  }
  return { done, failed, busy };
};

const zoneCopy = ({
  isFull,
  overZone,
  windowDrag,
  multiple,
  limit,
  maxFileSize,
  acceptedFileTypes,
}: {
  isFull: boolean;
  overZone: number;
  windowDrag: boolean;
  multiple: boolean;
  limit: number;
  maxFileSize: number;
  acceptedFileTypes: string[];
}) => {
  const noun = multiple ? "files" : "a file";
  if (isFull) {
    return {
      title: "File limit reached",
      showBrowse: false,
      hint: "Remove a file to add another",
    };
  }
  const sizeHint =
    maxFileSize > 0 && Number.isFinite(maxFileSize)
      ? ` up to ${formatBytes(maxFileSize)}`
      : "";
  const hint = `${describeAcceptedTypes(acceptedFileTypes)}${sizeHint}${multiple ? ` · ${limit} max` : ""}`;
  if (overZone) {
    return {
      title: `Release to add ${overZone} ${overZone === 1 ? "file" : "files"}`,
      showBrowse: false,
      hint,
    };
  }
  if (windowDrag) {
    return { title: `Drop ${noun} here`, showBrowse: false, hint };
  }
  return { title: `Drop ${noun} here or `, showBrowse: true, hint };
};

const FileThumb = ({item}:{item:QueueItem})=>{
 const host=useRef<HTMLSpanElement>(null),[preview,setPreview]=useState<{file:File;url:string}>();
 useEffect(()=>{const file=item.sourceFile,view=host.current?.ownerDocument.defaultView;if(item.previewUrl||!file?.type.startsWith('image/')||!view)return;const reader=new view.FileReader();let alive=true;reader.onload=()=>{if(alive&&typeof reader.result==='string')setPreview({file,url:reader.result});};reader.readAsDataURL(file);return()=>{alive=false;if(reader.readyState===1)reader.abort();};},[item.sourceFile,item.previewUrl]);
 const src=item.previewUrl??(preview?.file===item.sourceFile?preview?.url:undefined);
 return <span ref={host} aria-hidden="true" className={cn('flex size-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 font-medium font-mono text-[9px] text-zinc-500 tracking-wide dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400',src&&'bg-center bg-cover ring-1 ring-black/5 ring-inset dark:ring-white/10')} style={src?{backgroundImage:`url("${src}")`}:undefined}>{src?null:extensionOf(item.file.name)}</span>;
};

const DoneCheck = ({ reduceMotion }: { reduceMotion: boolean | null }) => (
  <svg
    aria-hidden="true"
    className="size-4 text-emerald-600 dark:text-emerald-400"
    fill="none"
    viewBox="0 0 16 16"
  >
    <motion.path
      animate={{ pathLength: 1 }}
      d="M3.5 8.5 6.5 11.5 12.5 4.5"
      initial={{ pathLength: reduceMotion ? 1 : 0 }}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      transition={{ duration: 0.32, ease: EASE_OUT, delay: 0.05 }}
    />
  </svg>
);

const statusLine = (item: QueueItem): string => {
  switch (item.status) {
    case "queued":
      return "Waiting";
    case "uploading":
      return `${Math.round(item.progress)}%`;
    case "done":
      return "Uploaded";
    case "error":
    case "rejected":
      return item.error?.message ?? "Upload failed";
    default:
      return "";
  }
};

const iconButton =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-400 outline-none transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/20 active:bg-zinc-200 dark:text-zinc-500 dark:active:bg-zinc-700 dark:focus-visible:ring-white/25 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

const QueueRow = ({
  item,
  reduceMotion,
  onRemove,
  onRetry,
}: {
  item: QueueItem;
  reduceMotion: boolean | null;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) => {
  const failed = item.status === "error" || item.status === "rejected";
  const inFlight = item.status === "uploading" || item.status === "queued";
  const name = item.file.name;

  return (
    <motion.li
      animate={{ height: "auto", opacity: 1 }}
      className="overflow-hidden"
      exit={{
        height: 0,
        opacity: 0,
        transition: {
          height: { duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT },
          opacity: { duration: 0.12, ease: EASE_OUT },
        },
      }}
      initial={{ height: 0, opacity: 0 }}
      transition={{
        height: reduceMotion
          ? { duration: 0 }
          : { type: "spring", duration: 0.35, bounce: 0 },
        opacity: {
          duration: 0.2,
          ease: EASE_OUT,
          delay: reduceMotion ? 0 : 0.05,
        },
      }}
    >
      <div className="group/row relative flex items-center gap-3 px-1 py-2.5">
        <FileThumb item={item} />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[13px] text-zinc-900 leading-5 dark:text-zinc-100">
            {name}
          </p>
          <p
            className={cn(
              "truncate text-xs tabular-nums leading-4",
              failed
                ? "text-red-600 dark:text-red-400"
                : "text-zinc-500 dark:text-zinc-400"
            )}
          >
            <span className="text-zinc-500 dark:text-zinc-400">
              {formatBytes(item.file.size)}
            </span>
            <span
              aria-hidden="true"
              className="px-1 text-zinc-300 dark:text-zinc-600"
            >
              ·
            </span>
            {statusLine(item)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {item.status === "done" && (
            <span className="flex size-7 items-center justify-center">
              <DoneCheck reduceMotion={reduceMotion} />
            </span>
          )}
          {item.status === "error" && (
            <button
              aria-label={`Retry ${name}`}
              className={cn(iconButton, "w-auto gap-1 px-2 text-xs")}
              onClick={() => onRetry(item.id)}
              type="button"
            >
              <RotateCw aria-hidden="true" className="size-3" />
              Retry
            </button>
          )}
          <button
            aria-label={inFlight ? `Cancel ${name}` : `Remove ${name}`}
            className={iconButton}
            onClick={() => onRemove(item.id)}
            type="button"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>

        {/* The row's hairline divider doubles as its progress bar. */}
        <div className="absolute inset-x-1 bottom-0 h-px bg-zinc-100 dark:bg-zinc-800/80">
          <div
            aria-label={`Uploading ${name}`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(item.progress)}
            className={cn(
              "h-full origin-left transition-[transform,opacity,background-color] duration-200 ease-linear",
              // A retry starts from zero at once instead of rewinding.
              item.progress === 0 && "transition-none",
              item.status === "done" &&
                "bg-emerald-500 opacity-0 delay-300 duration-300 ease-out dark:bg-emerald-400",
              failed && "bg-red-500 dark:bg-red-400",
              inFlight && "bg-zinc-900 dark:bg-zinc-100"
            )}
            role="progressbar"
            style={{ transform: `scaleX(${item.progress / 100})` }}
          />
        </div>
      </div>
    </motion.li>
  );
};

export default function FileUpload({items,onFiles,onPick,onRemove,onRetry,onClear,notice,disabled=false,acceptedFileTypes=NO_ACCEPTED_TYPES,maxFileSize=DEFAULT_MAX_FILE_SIZE,multiple=true,maxFiles=5,className}:FileUploadProps){
 const [windowDrag,setWindowDrag]=useState(false),[overZone,setOverZone]=useState(0);
 const reduceMotion=useReducedMotion(),baseId=useId(),hintId=`${baseId}-hint`;
 const inputRef=useRef<HTMLInputElement>(null),zoneRef=useRef<HTMLButtonElement>(null);
 const owner=useWindowContext(),activity=useFidelityActivity();
 const limit=multiple?Math.max(1,maxFiles):1,counted=items.filter(i=>i.status!=='rejected').length,isFull=counted>=limit;
 const addFiles=(files:FileList|File[]|null)=>{if(!disabled&&activity.active)onFiles(Array.from(files??[]));};
 const removeAndRefocus=(id:string)=>{if(disabled)return;onRemove(id);zoneRef.current?.focus({preventScroll:true});};
 const clearAll=()=>{if(disabled)return;onClear();zoneRef.current?.focus({preventScroll:true});};
 const retryItem=(id:string)=>{if(!disabled)onRetry(id);};
 const openPicker=()=>{if(!disabled&&!isFull&&activity.active){if(onPick)onPick();else inputRef.current?.click();}};
 useEffect(()=>{const root=owner.root?.current??zoneRef.current?.closest('.ksf-sdk-surface');if(!root||disabled)return;let depth=0;const enter=(e:Event)=>{if(isFileDrag(e as globalThis.DragEvent)){depth++;setWindowDrag(true);}};const leave=(e:Event)=>{if(isFileDrag(e as globalThis.DragEvent)){depth=Math.max(0,depth-1);if(!depth)setWindowDrag(false);}};const over=(e:Event)=>{if(isFileDrag(e as globalThis.DragEvent))e.preventDefault();};const end=(e:Event)=>{if(isFileDrag(e as globalThis.DragEvent))e.preventDefault();depth=0;setWindowDrag(false);setOverZone(0);};root.addEventListener('dragenter',enter);root.addEventListener('dragleave',leave);root.addEventListener('dragover',over);root.addEventListener('drop',end);root.addEventListener('dragend',end);return()=>{root.removeEventListener('dragenter',enter);root.removeEventListener('dragleave',leave);root.removeEventListener('dragover',over);root.removeEventListener('drop',end);root.removeEventListener('dragend',end);setWindowDrag(false);setOverZone(0);};},[owner.root,disabled]);
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const handleZoneDrag = (e: DragEvent<HTMLButtonElement>) => {
    if (!isFileDrag(e)) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = isFull ? "none" : "copy";
    setOverZone(Math.max(1, countDraggedFiles(e.dataTransfer)));
  };

  const handleZoneLeave = (e: DragEvent<HTMLButtonElement>) => {
    if (
      e.relatedTarget instanceof e.currentTarget.ownerDocument.defaultView!.Node &&
      e.currentTarget.contains(e.relatedTarget)
    ) {
      return;
    }
    setOverZone(0);
  };

  const handleZoneDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setOverZone(0);
    setWindowDrag(false);
    if (!disabled && !isFull) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLButtonElement>) => {
    if (e.clipboardData.files.length) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };

  const { done, failed, busy } = summarize(items);
  const { title, showBrowse, hint } = zoneCopy({
    isFull,
    overZone,
    windowDrag,
    multiple,
    limit,
    maxFileSize,
    acceptedFileTypes,
  });

  const armed = windowDrag && !isFull;
  const over = overZone > 0 && !isFull;

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-2 shadow-xs dark:border-zinc-800 dark:bg-zinc-950",
        className
      )}
    >
      <button
        aria-describedby={hintId}
        aria-disabled={isFull || undefined}
        className={cn(
          "group/zone flex w-full flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center outline-none transition-colors duration-150 ease-out",
          "focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/10 dark:focus-visible:border-zinc-500 dark:focus-visible:ring-white/15",
          isFull
            ? "cursor-not-allowed border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30"
            : "cursor-pointer border-zinc-300 bg-zinc-50/60 hover:border-zinc-400 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/40 dark:active:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-900/70",
          armed &&
            "border-zinc-500 bg-zinc-50 dark:border-zinc-500 dark:bg-zinc-900/70",
          over &&
            "border-zinc-900 border-solid bg-zinc-100 dark:border-zinc-200 dark:bg-zinc-900"
        )}
        disabled={disabled}
        onClick={openPicker}
        onDragEnter={handleZoneDrag}
        onDragLeave={handleZoneLeave}
        onDragOver={handleZoneDrag}
        onDrop={handleZoneDrop}
        onPaste={handlePaste}
        ref={zoneRef}
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 items-center justify-center rounded-lg border bg-white shadow-xs transition-colors duration-150 dark:bg-zinc-950",
            armed || over
              ? "border-zinc-300 text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
              : "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
          )}
        >
          <Upload
            className={cn(
              "size-4 transition-[translate] duration-200 ease-out",
              (armed || over) && "motion-safe:-translate-y-0.5"
            )}
          />
        </span>
        <span className="flex flex-col gap-1">
          <span
            className={cn(
              "font-medium text-sm transition-colors duration-150",
              isFull
                ? "text-zinc-500 dark:text-zinc-400"
                : "text-zinc-900 dark:text-zinc-100"
            )}
          >
            {title}
            {showBrowse && (
              <span className="underline decoration-zinc-300 underline-offset-[3px] transition-colors duration-150 group-hover/zone:decoration-zinc-900 dark:decoration-zinc-600 dark:group-hover/zone:decoration-zinc-100">
                browse
              </span>
            )}
          </span>
          <span
            className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400"
            id={hintId}
          >
            {hint}
          </span>
        </span>
      </button>

      <input
        accept={acceptedFileTypes.join(",") || undefined}
        className="hidden"
        multiple={multiple}
        onChange={handleInputChange}
        ref={inputRef}
        tabIndex={-1}
        disabled={disabled}
        type="file"
      />

      {notice && (
        <p
          className="mt-2 px-1 text-red-600 text-xs dark:text-red-400"
          role="alert"
        >
          {notice}
        </p>
      )}

      <ul aria-label="Files" className="mt-1 px-1">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <QueueRow
              item={item}
              key={item.id}
              onRemove={removeAndRefocus}
              onRetry={retryItem}
              reduceMotion={reduceMotion}
            />
          ))}
        </AnimatePresence>
      </ul>

      <AnimatePresence initial={false}>
        {items.length > 0 && (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.2,
              ease: EASE_OUT,
            }}
          >
            <div className="flex items-center justify-between px-2 pt-2 pb-0.5">
              <output
                aria-live="polite"
                className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400"
              >
                <span className="text-zinc-900 dark:text-zinc-100">{done}</span>{" "}
                of {items.length} uploaded
                {failed > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    {" "}
                    · {failed} failed
                  </span>
                )}
              </output>
              <button
                className="-mr-1 rounded-md px-1.5 py-1 text-xs text-zinc-500 outline-none transition-colors duration-150 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/20 active:text-zinc-600 dark:text-zinc-400 dark:active:text-zinc-300 dark:focus-visible:ring-white/25 dark:hover:text-zinc-100"
                onClick={clearAll}
                type="button"
              >
                {busy ? "Cancel all" : "Clear"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

FileUpload.displayName = "FileUpload";
