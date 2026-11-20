import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Result} from '@ksf/sdk/result';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ResultCustomExample(){return <Result heading='资料已归档' icon={<FolderGlyph/>} actions={<Button>查看目录</Button>}><ul><li>2 份设计资料</li><li>1 份评审说明</li></ul></Result>;}
