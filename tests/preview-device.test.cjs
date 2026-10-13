const test=require('node:test');const assert=require('node:assert/strict');
const {deviceLayout,validateDevice}=require('../src/shared/preview-device.cjs');
test('phone viewport fits a small preview while retaining its CSS dimensions',()=>{
 const result=deviceLayout({x:400,y:100,width:600,height:500},{width:390,height:844});
 assert.equal(result.device.width,390);assert.equal(result.device.height,844);
 assert.ok(result.width<390);assert.ok(result.height<=452);
 assert.ok(result.x>400);assert.ok(result.y>=124);
 assert.ok(Math.abs(result.width/result.height-390/844)<.005);
});
test('landscape and tablets fit without stretching and desktop fills the surface',()=>{
 const area={x:300,y:90,width:900,height:600};
 const landscape=deviceLayout(area,{width:844,height:390});assert.equal(landscape.width,844);assert.equal(landscape.height,390);
 assert.deepEqual(deviceLayout(area,null),area);
 const tablet=deviceLayout(area,{width:1024,height:1366});assert.ok(tablet.height<=552);assert.ok(tablet.width<900);
});
test('invalid emulation dimensions cannot reach native Chromium calls',()=>{
 for(const device of [{width:NaN,height:844},{width:0,height:844},{width:390,height:10000},{width:'390',height:844}])assert.throws(()=>validateDevice(device));
 assert.deepEqual(validateDevice({width:390.4,height:844.2}),{width:390,height:844});assert.equal(validateDevice(null),null);
});
