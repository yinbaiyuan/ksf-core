import {createContext,useContext} from 'react';
export const SurfaceScopeContext=createContext('');
export const useSurfaceScope=()=>useContext(SurfaceScopeContext);
