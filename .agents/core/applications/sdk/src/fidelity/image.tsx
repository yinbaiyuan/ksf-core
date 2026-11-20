import type {ImgHTMLAttributes} from 'react';
/** Native image; layout mirrors the reference fill behavior without a framework loader. */
export default function FidelityImage({fill,unoptimized:_,sizes,style,...props}:ImgHTMLAttributes<HTMLImageElement>&{fill?:boolean;unoptimized?:boolean}){return <img {...props} sizes={sizes} style={{...(fill?{position:'absolute',inset:0,width:'100%',height:'100%'} as const:{}),...style}}/>;}
