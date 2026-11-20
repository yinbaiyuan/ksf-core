import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Gallery} from '@ksf/sdk/gallery';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function GallerySelectExample(){return <Gallery items={mediaSamples} selectable/>;}
