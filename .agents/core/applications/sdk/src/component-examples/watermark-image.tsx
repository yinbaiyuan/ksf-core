import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Watermark} from '@ksf/sdk/watermark';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';import {DemoPanel,CheckGlyph,SearchGlyph,FolderGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function WatermarkImageExample(){return <Watermark content='' image={mediaSamples[0].src} imageWidth={64} imageHeight={40}><DemoPanel style={{minHeight:180}}>水印覆盖内容区域，内部按钮仍可操作。<Button>查看资料</Button></DemoPanel></Watermark>;}
