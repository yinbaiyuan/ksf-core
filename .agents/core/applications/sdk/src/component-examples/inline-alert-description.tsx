import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {InlineAlert} from '@ksf/sdk/inline-alert';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function InlineAlertDescriptionExample(){return <InlineAlert icon heading='需要补充资料' tone='warning'>请补充交付日期和负责人。相关文件会保留在当前应用中。</InlineAlert>;}
