export interface MentionToken {start:number;end:number;prefix:string;query:string}
export function mentionToken(text:string,position:number,prefix:string|readonly string[]):MentionToken|null {
 const end=Math.max(0,Math.min(text.length,position)),head=text.slice(0,end),prefixes=typeof prefix==='string'?[prefix]:prefix;
 let found:MentionToken|null=null;
 for(const item of prefixes){if(!item)continue;const start=head.lastIndexOf(item);if(start<0||found&&start<=found.start)continue;const query=head.slice(start+item.length);if(!/\s/.test(query))found={start,end,prefix:item,query};}
 return found;
}
export function insertMention(text:string,token:MentionToken,value:string):{text:string;caret:number}{
 let before=text.slice(0,token.start);if(before.endsWith(' '))before=before.slice(0,-1);if(before)before+=' ';
 let after=text.slice(token.end);const remaining=value.slice(token.query.length);let overlap=0;while(overlap<remaining.length&&overlap<after.length&&remaining[overlap].toLocaleLowerCase()===after[overlap].toLocaleLowerCase())overlap++;
 after=after.slice(overlap);if(after.startsWith(' '))after=after.slice(1);
 const inserted=before+token.prefix+value+' ';return {text:inserted+after,caret:inserted.length};
}
