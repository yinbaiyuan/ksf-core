import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {BorderBeam} from '@ksf/sdk/border-beam';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function BorderBeamDisabledExample(){return <BorderBeam disabled><DemoPanel style={{minHeight:110}}>KSF 组件卡片<Button>聚焦操作</Button></DemoPanel></BorderBeam>;}
