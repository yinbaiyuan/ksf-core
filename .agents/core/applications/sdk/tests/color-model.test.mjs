import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHexColor,rgbaToHex,rgbToHsv,hsvToRgb,rgbToHsl,hslToRgb,colorStops,formatColor} from '../src/controls/color-model.ts';
test('color conversions preserve RGB primaries, neutral boundaries and alpha without accepting arbitrary CSS',()=>{
 for(const hex of ['#ff0000','#00ff00','#0000ff','#000000','#ffffff','#2277aa','#808080']){
  const rgba=parseHexColor(hex);assert.equal(rgbaToHex(hsvToRgb(rgbToHsv(rgba))),hex);assert.equal(rgbaToHex(hslToRgb(rgbToHsl(rgba))),hex);
 }
 assert.equal(rgbaToHex(parseHexColor('#abc')),'#aabbcc');assert.equal(rgbaToHex(parseHexColor('#abcf'),true),'#aabbccff');assert.equal(rgbaToHex(parseHexColor('#12345680'),true),'#12345680');
 for(const bad of ['url(https://example.com/x)','#12','#12345','rgb(1,2,3)','#zzzzzz'])assert.equal(parseHexColor(bad),null);
 assert.equal(formatColor(parseHexColor('#ff000080'),'rgb',true),'rgba(255, 0, 0, 0.5)');
 assert.deepEqual(colorStops('linear-gradient(120deg, #ff000080 0%, #00ff00 100%)'),{gradient:true,angle:120,first:parseHexColor('#ff000080'),second:parseHexColor('#00ff00')});
});

test('HSB display preserves hue and brightness while grayscale and alpha remain bounded',()=>{
 assert.equal(formatColor(parseHexColor('#005fb8'),'hsb'),'hsb(209, 100%, 72%)');
 assert.equal(formatColor(parseHexColor('#808080'),'hsb'),'hsb(0, 0%, 50%)');
 assert.equal(formatColor(parseHexColor('#ff000080'),'hsb',true),'hsba(0, 100%, 100%, 0.5)');
 assert.equal(formatColor(parseHexColor('#ff0000'),'hsb',true),'hsb(0, 100%, 100%)');
 assert.equal(rgbaToHex(hsvToRgb({h:-120,s:2,v:2},-1),true),'#0000ff00');
});
