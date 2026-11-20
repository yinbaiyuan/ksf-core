import type {HTMLAttributes} from 'react';
import './decorations.css';
export interface WatermarkProps extends Omit<HTMLAttributes<HTMLDivElement>,'content'> {content:string|readonly string[];angle?:number;opacity?:number;fontSize?:number;fontFamily?:string;gap?:readonly [number,number];offset?:readonly [number,number];tileWidth?:number;tileHeight?:number;image?:string;imageWidth?:number;imageHeight?:number}
export {Watermark} from './watermark-control';
export {BorderBeam} from './border-beam-control';
export type {BorderBeamProps} from './border-beam-control';
