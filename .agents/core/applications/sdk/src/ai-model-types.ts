import type {ReactNode} from 'react';
export interface AIModelOption{id:string;label:string;description?:string;disabled?:boolean;icon?:ReactNode;efforts?:readonly string[];defaultEffort?:string;effortHints?:Readonly<Record<string,string>>}
