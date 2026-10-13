const DEVICE_PRESETS=[
 {id:'responsive',name:'Responsive',width:390,height:844},
 {id:'iphone-se',name:'iPhone SE',width:375,height:667},
 {id:'iphone-16',name:'iPhone 16',width:393,height:852},
 {id:'iphone-16-pro-max',name:'iPhone 16 Pro Max',width:440,height:956},
 {id:'pixel',name:'Pixel',width:412,height:915},
 {id:'galaxy',name:'Galaxy',width:360,height:800},
 {id:'ipad-mini',name:'iPad mini',width:768,height:1024},
 {id:'ipad-pro',name:'iPad Pro',width:1024,height:1366},
];
function validateDevice(value){
 if(value==null)return null;
 if(typeof value!=='object'||![value.width,value.height].every(n=>Number.isFinite(n)&&n>=240&&n<=2560))throw Error('Device dimensions must be between 240 and 2560 pixels.');
 return {width:Math.round(value.width),height:Math.round(value.height)};
}
function deviceLayout(area,value){
 const device=validateDevice(value);if(!device)return {...area};
 const scale=Math.max(.01,Math.min(1,Math.max(1,area.width-48)/device.width,Math.max(1,area.height-48)/device.height));
 const width=Math.max(1,Math.floor(device.width*scale)),height=Math.max(1,Math.floor(device.height*scale));
 return {x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+(area.height-height)/2),width,height,device};
}
module.exports={DEVICE_PRESETS,validateDevice,deviceLayout};
