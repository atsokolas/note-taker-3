import SwiftUI
import UIKit

/// The web app's paper and ink, light and dark (note-taker-ui/src/styles/semantic-theme.css).
enum Ink {
    static let canvas = pair(0xF7F4ED, 0x16140F)
    static let paper = pair(0xFFFDF8, 0x211E17)
    static let paperMuted = pair(0xF4EEE2, 0x1C1813)
    static let text = pair(0x332F29, 0xF1EADC)
    static let muted = pair(0x5F625F, 0xC5BDA9)
    static let subtle = pair(0x7A756C, 0x948B7D)
    static let thread = pair(0x8B5F1D, 0xE0B971)
    static let living = pair(0x6F7340, 0xA9AE70)
    static let danger = pair(0x9B5A46, 0xC78978)
    static let rule = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(red: 223 / 255, green: 206 / 255, blue: 166 / 255, alpha: 0.16)
        : UIColor(red: 91 / 255, green: 80 / 255, blue: 63 / 255, alpha: 0.16) })

    private static func pair(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
}

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

/// Serif for what you read, the system face for everything you operate.
/// Both scale with Dynamic Type.
extension Font {
    static let masthead = Font.system(.largeTitle, design: .serif).weight(.medium)
    static let headline2 = Font.system(.title2, design: .serif).weight(.medium)
    static let reading = Font.system(.body, design: .serif)
    static let readingLarge = Font.system(.title3, design: .serif)
    static let quote = Font.system(.callout, design: .serif).italic()
}

extension View {
    /// The page every room sits on.
    func paper() -> some View {
        scrollContentBackground(.hidden)
            .background(Ink.canvas.ignoresSafeArea())
            .foregroundStyle(Ink.text)
    }

    /// A reading column: comfortable line length on iPad, full width on iPhone.
    func column() -> some View {
        frame(maxWidth: 680, alignment: .leading)
            .frame(maxWidth: .infinity)
    }
}

/// A quiet bordered card, used for the lines that ask something of you.
struct Card<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Ink.paper, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Ink.rule))
    }
}

/// A quoted passage, set like the web's: a thread-coloured rule and serif italics.
struct Passage: View {
    let text: String
    var source: String = ""

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Rectangle().fill(Ink.thread.opacity(0.6)).frame(width: 2)
            VStack(alignment: .leading, spacing: 6) {
                Text("“\(text)”").font(.quote).foregroundStyle(Ink.text)
                if !source.isEmpty {
                    Text(source).font(.footnote).foregroundStyle(Ink.subtle)
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

struct Kicker: View {
    let text: String
    var color = Ink.subtle
    init(_ text: String, color: Color = Ink.subtle) { self.text = text; self.color = color }

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.semibold))
            .tracking(0.8)
            .foregroundStyle(color)
    }
}

extension String {
    var lowercasedFirst: String {
        guard let first else { return self }
        // Keep "I", acronyms and names as written.
        let second = dropFirst().first
        if first == "I" && (second == " " || second == "'") { return self }
        if let second, second.isUppercase { return self }
        return first.lowercased() + String(dropFirst())
    }
}
