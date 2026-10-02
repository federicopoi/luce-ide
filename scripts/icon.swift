import AppKit
let image = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
let context = NSGraphicsContext(bitmapImageRep: image)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
NSColor(red: 0.137, green: 0.173, blue: 0.165, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 20, y: 20, width: 984, height: 984), xRadius: 216, yRadius: 216).fill()
let mint = NSColor(red: 0.710, green: 0.902, blue: 0.780, alpha: 1)
mint.setStroke()
let transform = AffineTransform(translationByX: 512, byY: 512)
var rotate = transform
rotate.rotate(byDegrees: -35)
rotate.translate(x: -512, y: -512)
for rect in [NSRect(x: 157, y: 345, width: 710, height: 334), NSRect(x: 322, y: 182, width: 380, height: 660)] {
 let ring = NSBezierPath(ovalIn: rect)
 ring.transform(using: rotate)
 ring.lineWidth = 36
 ring.stroke()
}
mint.setFill()
NSBezierPath(ovalIn: NSRect(x: 461, y: 461, width: 102, height: 102)).fill()
NSGraphicsContext.restoreGraphicsState()
let url = URL(fileURLWithPath: CommandLine.arguments[1])
try image.representation(using: .png, properties: [:])!.write(to: url)
