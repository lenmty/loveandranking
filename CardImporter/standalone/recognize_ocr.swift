import Foundation
import Vision
import ImageIO
import CoreGraphics

struct OCRCandidate: Codable {
    let text: String
    let confidence: Float
}

struct OCRObservation: Codable {
    let candidates: [OCRCandidate]
    let box: [Double]
}

struct OCRResult: Codable {
    let file: String
    let observations: [OCRObservation]?
    let error: String?
}

let encoder = JSONEncoder()
for path in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: path)
    do {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            throw NSError(domain: "CardImporterOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not load OCR crop"])
        }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["en-US"]
        request.usesLanguageCorrection = true
        request.minimumTextHeight = 0.01
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
        let observations = (request.results ?? []).map { observation in
            OCRObservation(
                candidates: observation.topCandidates(5).map { OCRCandidate(text: $0.string, confidence: $0.confidence) },
                box: [
                    Double(observation.boundingBox.origin.x),
                    Double(observation.boundingBox.origin.y),
                    Double(observation.boundingBox.width),
                    Double(observation.boundingBox.height)
                ]
            )
        }
        let result = OCRResult(file: url.lastPathComponent, observations: observations, error: nil)
        let data = try encoder.encode(result)
        print(String(decoding: data, as: UTF8.self))
    } catch {
        let failure = error as NSError
        let message = "\(failure.domain) [\(failure.code)]: \(failure.localizedDescription) userInfo=\(failure.userInfo)"
        let result = OCRResult(file: url.lastPathComponent, observations: nil, error: message)
        if let data = try? encoder.encode(result) {
            print(String(decoding: data, as: UTF8.self))
        }
    }
}
