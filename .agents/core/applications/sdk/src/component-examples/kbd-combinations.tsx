import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Kbd} from '@ksf/sdk/kbd';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function KbdCombinationsExample(){return <div className='ksf-demo-stack'><span><Kbd aria-label='Command 加 K'>⌘ K</Kbd> 打开搜索</span><span><Kbd>Ctrl</Kbd> ＋ <Kbd>Shift</Kbd> ＋ <Kbd>P</Kbd> 命令菜单</span><span><Kbd>Enter</Kbd> 确认　<Kbd>Esc</Kbd> 退出</span></div>;}
