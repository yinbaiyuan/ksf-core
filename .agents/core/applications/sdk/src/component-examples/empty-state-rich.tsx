import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {EmptyState} from '@ksf/sdk/empty-state';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function EmptyStateRichExample(){return <EmptyState heading='暂无评审记录' description={<span>可以先查看<Button variant='text' size='small'>使用说明</Button></span>}/>;}
