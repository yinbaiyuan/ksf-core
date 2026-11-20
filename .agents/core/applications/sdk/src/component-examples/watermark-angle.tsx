import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Watermark} from '@ksf/sdk/watermark';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function WatermarkAngleExample(){return <Watermark content='项目资料' angle={-35} gap={[40,40]}><DemoPanel style={{minHeight:180}}>水印覆盖内容区域，内部按钮仍可操作。<Button>查看资料</Button></DemoPanel></Watermark>;}
