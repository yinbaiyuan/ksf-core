import {useState} from 'react';
import {Button} from '@ksf/sdk/button';
import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Gallery} from '@ksf/sdk/gallery';
export function GalleryBasicExample(){return <Gallery items={mediaSamples} minWidth={140}/>;}
