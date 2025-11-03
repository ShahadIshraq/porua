import Foundation
import ScreenCaptureKit
import Vision
import AppKit
import CoreGraphics

// MARK: - C-compatible structures for FFI

@frozen
public struct CRect {
    public let x: Int32
    public let y: Int32
    public let width: Int32
    public let height: Int32
}

@frozen
public struct CTextRegion {
    public let text: UnsafePointer<CChar>?
    public let x: Int32
    public let y: Int32
    public let width: Int32
    public let height: Int32
    public let confidence: Float
}

@frozen
public struct CExtractedText {
    public let full_text: UnsafePointer<CChar>?
    public let regions: UnsafeMutablePointer<CTextRegion>?
    public let region_count: Int32
    public let overall_confidence: Float
}

// MARK: - Permission Management

/// Check if screen recording permission is granted
@_cdecl("screen_capture_check_permission")
public func checkPermission() -> Bool {
    if #available(macOS 12.3, *) {
        // For macOS 12.3+, we need to check via CGPreflightScreenCaptureAccess
        return CGPreflightScreenCaptureAccess()
    } else {
        // Fallback for older versions
        return true
    }
}

/// Request screen recording permission
/// Note: This will trigger the system permission dialog
@_cdecl("screen_capture_request_permission")
public func requestPermission() -> Bool {
    if #available(macOS 12.3, *) {
        return CGRequestScreenCaptureAccess()
    } else {
        // Older macOS versions don't require explicit permission
        return true
    }
}

// MARK: - Screen Capture

/// Capture a specific region of the screen
/// Returns PNG image data as base64 string
@_cdecl("screen_capture_region")
public func captureRegion(x: Int32, y: Int32, width: Int32, height: Int32) -> UnsafePointer<CChar>? {
    if #available(macOS 12.3, *) {
        do {
            // Create capture rect
            let rect = CGRect(x: CGFloat(x), y: CGFloat(y), width: CGFloat(width), height: CGFloat(height))

            // Get available content
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

            guard let display = content.displays.first else {
                return strdup("ERROR: No display found")
            }

            // Configure capture
            let config = SCStreamConfiguration()
            config.sourceRect = rect
            config.width = Int(width)
            config.height = Int(height)
            config.pixelFormat = kCVPixelFormatType_32BGRA
            config.showsCursor = false

            // Capture screenshot
            let filter = SCContentFilter(display: display, excludingWindows: [])
            let image = try await SCScreenshotManager.captureImage(
                contentFilter: filter,
                configuration: config
            )

            // Convert to PNG data
            guard let pngData = convertImageToPNG(image) else {
                return strdup("ERROR: Failed to convert image to PNG")
            }

            // Return base64 encoded string
            let base64 = pngData.base64EncodedString()
            return strdup(base64)

        } catch {
            let errorMsg = "ERROR: Screen capture failed - \(error.localizedDescription)"
            return strdup(errorMsg)
        }
    } else {
        // Fallback for older macOS versions using CGImage
        return captureLegacy(x: x, y: y, width: width, height: height)
    }
}

/// Legacy screen capture for macOS < 12.3
private func captureLegacy(x: Int32, y: Int32, width: Int32, height: Int32) -> UnsafePointer<CChar>? {
    let rect = CGRect(x: CGFloat(x), y: CGFloat(y), width: CGFloat(width), height: CGFloat(height))

    guard let cgImage = CGWindowListCreateImage(
        rect,
        .optionOnScreenOnly,
        kCGNullWindowID,
        [.boundsIgnoreFraming, .bestResolution]
    ) else {
        return strdup("ERROR: Legacy screen capture failed")
    }

    let nsImage = NSImage(cgImage: cgImage, size: NSSize(width: Int(width), height: Int(height)))

    guard let tiffData = nsImage.tiffRepresentation,
          let bitmapRep = NSBitmapImageRep(data: tiffData),
          let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
        return strdup("ERROR: Failed to convert legacy image to PNG")
    }

    let base64 = pngData.base64EncodedString()
    return strdup(base64)
}

/// Convert CGImage to PNG data
private func convertImageToPNG(_ cgImage: CGImage) -> Data? {
    let nsImage = NSImage(cgImage: cgImage, size: NSSize(width: cgImage.width, height: cgImage.height))

    guard let tiffData = nsImage.tiffRepresentation,
          let bitmapRep = NSBitmapImageRep(data: tiffData),
          let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
        return nil
    }

    return pngData
}

// MARK: - OCR with Vision Framework

/// Perform OCR on image data (base64 encoded PNG)
/// Returns JSON string with extracted text and regions
@_cdecl("screen_capture_ocr")
public func performOCR(base64Image: UnsafePointer<CChar>?) -> UnsafePointer<CChar>? {
    guard let base64Ptr = base64Image else {
        return strdup("ERROR: Null image data")
    }

    let base64String = String(cString: base64Ptr)

    guard let imageData = Data(base64Encoded: base64String) else {
        return strdup("ERROR: Invalid base64 image data")
    }

    guard let cgImage = createCGImage(from: imageData) else {
        return strdup("ERROR: Failed to create image from data")
    }

    // Perform text recognition
    let result = recognizeText(in: cgImage)

    // Convert result to JSON
    let jsonString = convertToJSON(result)
    return strdup(jsonString)
}

/// Create CGImage from image data
private func createCGImage(from data: Data) -> CGImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        return nil
    }
    return cgImage
}

/// Recognize text in CGImage using Vision framework
private func recognizeText(in cgImage: CGImage) -> (text: String, regions: [(text: String, bounds: CGRect, confidence: Float)]) {
    var fullText = ""
    var regions: [(text: String, bounds: CGRect, confidence: Float)] = []

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US"]

    // Perform the request
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    do {
        try handler.perform([request])

        guard let observations = request.results else {
            return ("", [])
        }

        // Sort observations by vertical position (top to bottom)
        let sortedObservations = observations.sorted { obs1, obs2 in
            obs1.boundingBox.origin.y > obs2.boundingBox.origin.y
        }

        for observation in sortedObservations {
            guard let candidate = observation.topCandidates(1).first else { continue }

            let text = candidate.string
            let confidence = candidate.confidence
            let bounds = observation.boundingBox

            // Convert normalized coordinates to pixel coordinates
            let pixelBounds = CGRect(
                x: bounds.origin.x * CGFloat(cgImage.width),
                y: (1.0 - bounds.origin.y - bounds.height) * CGFloat(cgImage.height),
                width: bounds.width * CGFloat(cgImage.width),
                height: bounds.height * CGFloat(cgImage.height)
            )

            regions.append((text: text, bounds: pixelBounds, confidence: confidence))

            if !fullText.isEmpty {
                fullText += " "
            }
            fullText += text
        }

    } catch {
        print("OCR Error: \(error.localizedDescription)")
    }

    return (fullText, regions)
}

/// Convert OCR result to JSON string
private func convertToJSON(_ result: (text: String, regions: [(text: String, bounds: CGRect, confidence: Float)])) -> String {
    var json = "{"

    // Add full text
    let escapedText = result.text.replacingOccurrences(of: "\"", with: "\\\"")
                                   .replacingOccurrences(of: "\n", with: "\\n")
    json += "\"full_text\":\"\(escapedText)\","

    // Calculate overall confidence
    let totalConfidence = result.regions.reduce(0.0) { $0 + $1.confidence }
    let avgConfidence = result.regions.isEmpty ? 0.0 : totalConfidence / Float(result.regions.count)
    json += "\"overall_confidence\":\(avgConfidence),"

    // Add regions
    json += "\"regions\":["
    for (index, region) in result.regions.enumerated() {
        if index > 0 { json += "," }

        let escapedRegionText = region.text.replacingOccurrences(of: "\"", with: "\\\"")
                                            .replacingOccurrences(of: "\n", with: "\\n")

        json += "{"
        json += "\"text\":\"\(escapedRegionText)\","
        json += "\"x\":\(Int(region.bounds.origin.x)),"
        json += "\"y\":\(Int(region.bounds.origin.y)),"
        json += "\"width\":\(Int(region.bounds.width)),"
        json += "\"height\":\(Int(region.bounds.height)),"
        json += "\"confidence\":\(region.confidence)"
        json += "}"
    }
    json += "]"

    json += "}"
    return json
}

// MARK: - Screen Information

/// Get information about available displays
@_cdecl("screen_capture_get_displays")
public func getDisplays() -> UnsafePointer<CChar>? {
    if #available(macOS 12.3, *) {
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

            var json = "["
            for (index, display) in content.displays.enumerated() {
                if index > 0 { json += "," }

                json += "{"
                json += "\"id\":\(display.displayID),"
                json += "\"width\":\(display.width),"
                json += "\"height\":\(display.height)"
                json += "}"
            }
            json += "]"

            return strdup(json)
        } catch {
            return strdup("ERROR: Failed to get displays - \(error.localizedDescription)")
        }
    } else {
        // Fallback for older macOS
        return strdup("[{\"id\":0,\"width\":1920,\"height\":1080}]")
    }
}

// MARK: - Memory Management

/// Free string allocated by Swift
@_cdecl("screen_capture_free_string")
public func freeString(_ ptr: UnsafeMutablePointer<CChar>?) {
    guard let ptr = ptr else { return }
    ptr.deallocate()
}

// MARK: - Helper for async functions

/// Helper to run async code synchronously for C FFI
private func await<T>(_ asyncFunc: @escaping () async throws -> T) -> T? {
    var result: T?
    let semaphore = DispatchSemaphore(value: 0)

    Task {
        do {
            result = try await asyncFunc()
        } catch {
            print("Async error: \(error)")
        }
        semaphore.signal()
    }

    semaphore.wait()
    return result
}
