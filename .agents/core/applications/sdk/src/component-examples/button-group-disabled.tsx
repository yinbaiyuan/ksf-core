import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ButtonGroup} from '@ksf/sdk/button-group';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ButtonGroupDisabledExample(){return <ButtonGroup label='分页操作' attached><Button disabled>上一页</Button><Button aria-current='page'>1</Button><Button>2</Button><Button>下一页</Button></ButtonGroup>;}
