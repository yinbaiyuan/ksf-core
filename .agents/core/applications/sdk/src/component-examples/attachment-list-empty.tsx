import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {AttachmentList,type Attachment} from '@ksf/sdk/attachment-list';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';import {Lightbox} from '@ksf/sdk/lightbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function AttachmentListEmptyExample(){return <AttachmentList items={[]} emptyText={<span>请选择资料后继续。</span>}/>;}
