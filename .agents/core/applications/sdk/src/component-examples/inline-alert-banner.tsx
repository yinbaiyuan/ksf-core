import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {InlineAlert} from '@ksf/sdk/inline-alert';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function InlineAlertBannerExample(){return <InlineAlert heading="当前为演示环境" banner>操作只影响本窗口。</InlineAlert>;}
