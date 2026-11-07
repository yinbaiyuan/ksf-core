import {Text} from '@codemirror/state';
import {GFM, parser} from '@lezer/markdown';
import {Lexer} from 'marked';

const markdownParser=parser.configure(GFM);
const plainText=tokens=>tokens.map(token=>token.tokens?plainText(token.tokens):token.type==='html'?'':token.text??' ').join('');

export function markdownOutline(text){
  const source=text.replace(/\r\n?|\n/g,'\n');
  const frontmatter=source.match(/^\uFEFF?---\n[\s\S]*?\n---(?:\n|$)/)?.[0]??'';
  const body=source.slice(frontmatter.length), document=Text.of(source.split('\n')), headings=[];
  markdownParser.parse(body).iterate({enter(node){
    const match=/^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
    if(!match)return;
    const title=body.slice(node.from,node.to)
      .replace(/^ {0,3}#{1,6}(?:[ \t]+|$)/,'').replace(/[ \t]+#+[ \t]*$/,'')
      .replace(/\n[ \t]*[=-]+[ \t]*$/,'').trim();
    headings.push({level:Number(match[1]),text:plainText(Lexer.lexInline(title)).trim()||'（空标题）',
      line:document.lineAt(node.from+frontmatter.length).number});
    return false;
  }});
  return headings;
}
