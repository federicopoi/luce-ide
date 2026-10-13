const {test}=require('node:test');const assert=require('node:assert/strict');const {TerminalPalette}=require('../src/main/terminal-palette.cjs');
test('palette probes are answered exactly once at every chunk boundary and omitted from replay',()=>{
 for(const end of ['\x07','\x1b\\'])for(const slot of [10,11]){const query=`\x1b]${slot};?${end}`;for(let split=0;split<=query.length;split++){const replies=[],palette=new TerminalPalette(data=>replies.push(data));const output=palette.consume('before'+query.slice(0,split))+palette.consume(query.slice(split)+'after');assert.equal(output,'beforeafter');assert.deepEqual(replies,[`\x1b]${slot};rgb:${slot===10?'ecec/ecec/ecec':'1c1c/1c1c/1c1c'}\x1b\\`]);}}
});
test('multiple probes do not swallow surrounding text, ANSI colors, or other terminal protocols',()=>{
 const replies=[],palette=new TerminalPalette(data=>replies.push(data));const before='\x1b[48;2;60;60;60mInput\x1b[0m\x1b]8;;https://example.test\x1b\\Link\x1b]8;;\x1b\\';
 const output=palette.consume(before+'\x1b]10;?\x07\x1b]11;?\x1b\\'+'\x1b[6n');assert.equal(output,before+'\x1b[6n');assert.equal(replies.length,2);
});
test('a partial escape that is not a palette probe is released without loss',()=>{
 const palette=new TerminalPalette(()=>assert.fail('Not a palette query'));assert.equal(palette.consume('text\x1b'),'text');assert.equal(palette.consume('[31mred'),'\x1b[31mred');assert.equal(palette.consume('\x1b]11;'),'');assert.equal(palette.consume('#222222\x07'),'\x1b]11;#222222\x07');
});
