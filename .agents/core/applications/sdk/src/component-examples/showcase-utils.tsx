import type {HTMLAttributes,SVGProps} from 'react';
import {ControlIcon} from '../primitives/control-icons';
export function DemoPanel({emphasis=false,style,...props}:HTMLAttributes<HTMLDivElement>&{emphasis?:boolean}){return <div {...props} style={{minWidth:0,boxSizing:'border-box',borderRadius:6,padding:16,background:emphasis?'var(--ksf-color-primary-surface)':'var(--ksf-color-surface)',color:emphasis?'var(--ksf-color-primary)':'var(--ksf-color-foreground)',border:'1px solid var(--ksf-color-border)',...style}}/>;}
export function SearchGlyph(props:SVGProps<SVGSVGElement>){return <ControlIcon {...props} name="SearchOutlined"/>;}
export function CheckGlyph(props:SVGProps<SVGSVGElement>){return <ControlIcon {...props} name="CheckCircleOutlined"/>;}
export function FolderGlyph(props:SVGProps<SVGSVGElement>){return <ControlIcon {...props} name="FolderOutlined"/>;}
export function ArrowGlyph(props:SVGProps<SVGSVGElement>){return <ControlIcon {...props} name="ArrowRightOutlined"/>;}
