export interface Heading {title:string;depth:number;id:string;line:number}
export interface DocumentEntry {path:string;title:string;group:string;description:string;sha256:string;headings:Heading[];text:string;order:number}
export interface Catalog {schemaVersion:1;coreVersion:string;contentDigest:string;home:string;groups:{id:string;title:string;description:string}[];documents:DocumentEntry[]}
export interface Location {path:string;anchor:string}
export interface History {entries:Location[];cursor:number}
export function stripFrontmatter(text:string):string;
export function inlineText(text:string):string;
export function createSlugger():(text:string)=>string;
export function slugBase(text:string):string;
export function documentHeadings(text:string):Heading[];
export function proseLines(text:string):string[];
export function markdownLinks(text:string):{href:string;line:number}[];
export function resolveLink(from:string,href:string):{kind:string;url?:string;path?:string;anchor?:string};
export function readerDestination(from:string,href:string,documents:DocumentEntry[]):{kind:string;url?:string;path?:string;anchor?:string};
export function searchDocuments(documents:DocumentEntry[],query:string,group?:string):{path:string;title:string;group:string;anchor:string;snippet:string;score:number}[];
export function historyPush(history:History,item:Location):History;
