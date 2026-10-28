import './src/business.css';
import { mountReact, type ApplicationSDK2 } from '@ksf/sdk/react';
import { DocumentsApp } from './src/apps/documents';
import { flushDocuments } from './src/apps/document-store';
import { registerResourcePreparation } from '@ksf/sdk/resources';
let users=0,unregister:(()=>void)|undefined;
export function mount(container:HTMLElement,sdk:ApplicationSDK2){
  if(!users++)unregister=registerResourcePreparation(flushDocuments);
  const mounted=mountReact(DocumentsApp,container,sdk);
  return {dispose(){mounted.dispose();if(!--users){unregister?.();unregister=undefined;}}};
}
