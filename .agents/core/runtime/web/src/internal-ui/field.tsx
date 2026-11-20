import {createContext,useContext,useId,type HTMLAttributes,type ReactNode} from 'react';
import {useUI} from './provider';

interface FieldContextValue {id:string;labelId:string;describedBy:string|undefined;invalid:boolean;required:boolean;disabled:boolean;readOnly:boolean}
const Context=createContext<FieldContextValue|null>(null);
export function useField(){useUI();return useContext(Context);}
export function descriptionIds(...values:(string|undefined|false)[]){return values.filter(Boolean).join(' ')||undefined;}
export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>,'children'> {
  id?:string;label:ReactNode;description?:ReactNode;error?:ReactNode;required?:boolean;disabled?:boolean;readOnly?:boolean;
  layout?:'stacked'|'inline'|'settings';children?:ReactNode;control?:ReactNode;
}
/** Label and validation context only; the app owns the value, persistence and business rules. */
export function Field({id, label,description,error,required=false,disabled=false,readOnly=false,layout='stacked',children,control,className='',...props}:FieldProps){
  useUI();const generated=useId(),controlId=id??'ksf-field-'+generated,labelId=controlId+'-label',descriptionId=controlId+'-description',errorId=controlId+'-error';
  const hasError=error!==undefined&&error!==null&&error!==false&&error!=='';
  const value={id:controlId,labelId,describedBy:descriptionIds(description!=null&&descriptionId,hasError&&errorId),invalid:hasError,required,disabled,readOnly};
  return <Context.Provider value={value}><div {...props} data-ksf-component="field" data-layout={layout} data-invalid={hasError||undefined} data-disabled={disabled||undefined} className={className}>
    <div className="ksf-field-heading"><label id={labelId} htmlFor={controlId}>{label}{required&&<span aria-hidden="true" className="ksf-required"> *</span>}</label>{description!=null&&<div id={descriptionId} className="ksf-field-description">{description}</div>}</div>
    <div className="ksf-field-control">{control??children}{hasError&&<div id={errorId} className="ksf-field-error" role="alert">{error}</div>}</div>
  </div></Context.Provider>;
}
