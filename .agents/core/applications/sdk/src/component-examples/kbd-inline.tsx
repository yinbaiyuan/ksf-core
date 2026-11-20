import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Kbd} from '@ksf/sdk/kbd';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function KbdInlineExample(){return <p>先输入内容，再按 <Kbd>Enter</Kbd> 提交；换行使用 <Kbd>Shift</Kbd> ＋ <Kbd>Enter</Kbd>。这里只呈现按键，不注册全局快捷键。</p>;}
