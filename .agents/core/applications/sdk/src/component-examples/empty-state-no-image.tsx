import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {EmptyState} from '@ksf/sdk/empty-state';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function EmptyStateNoImageExample(){return <EmptyState illustration={false} heading='暂无结果' description='试试其他关键词。'/>;}
