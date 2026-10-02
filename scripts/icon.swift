import AppKit
let image = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:1024,pixelsHigh:1024,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep:image)!
NSColor(red:0.969,green:0.961,blue:0.941,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:64,y:64,width:896,height:896),xRadius:196,yRadius:196).fill()
let context = NSGraphicsContext.current!.cgContext
context.translateBy(x:174,y:850)
context.scaleBy(x:1.32,y:-1.32)
let ink = NSColor(red:0.133,green:0.141,blue:0.149,alpha:1)
ink.setFill()
NSBezierPath(ovalIn:NSRect(x:21,y:212,width:88,height:88)).fill()
func ray(_ flipped:Bool){
 func pt(_ x:CGFloat,_ y:CGFloat)->NSPoint { NSPoint(x:x,y:flipped ? 512-y:y) }
 let p=NSBezierPath();p.move(to:pt(105,197));p.line(to:pt(334,48))
 p.curve(to:pt(413,58),controlPoint1:pt(365.33,27.33),controlPoint2:pt(391.67,30.67))
 p.curve(to:pt(393,130),controlPoint1:pt(435.67,88),controlPoint2:pt(429,112))
 p.line(to:pt(124,223));p.curve(to:pt(105,197),controlPoint1:pt(119.33,212.33),controlPoint2:pt(113,203.67));p.close();p.fill()
}
ray(false);ray(true)
NSColor(red:1,green:0.788,blue:0.157,alpha:1).setFill()
let beam=NSBezierPath();beam.move(to:NSPoint(x:130,y:245));beam.line(to:NSPoint(x:441,y:153));beam.curve(to:NSPoint(x:480,y:184),controlPoint1:NSPoint(x:467,y:144.33),controlPoint2:NSPoint(x:480,y:154.67));beam.line(to:NSPoint(x:480,y:328));beam.curve(to:NSPoint(x:441,y:359),controlPoint1:NSPoint(x:480,y:358),controlPoint2:NSPoint(x:467,y:368.33));beam.line(to:NSPoint(x:130,y:273));beam.curve(to:NSPoint(x:130,y:245),controlPoint1:NSPoint(x:132.67,y:264.33),controlPoint2:NSPoint(x:132.67,y:255));beam.close();beam.fill()
NSGraphicsContext.restoreGraphicsState()
try image.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
