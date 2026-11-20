import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {EmptyState} from '@ksf/sdk/empty-state';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function EmptyStateCustomImageExample(){return <EmptyState illustration={<FolderGlyph/>} heading='目录为空' description='尚未添加资料。'/>;}
