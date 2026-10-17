import SwiftUI
import UIKit

/// One theme the app can wear: the same ones the web offers
/// (note-taker-ui/src/settings/themeCatalog.js), in the colours of
/// styles/semantic-theme.css. `auto` is not a palette: it follows the device
/// between Light and Dark.
struct Palette: Identifiable, Equatable {
    let id: String
    let label: String
    let dark: Bool
    let canvas, paper, paperMuted, text, muted, subtle, thread, accent, living, danger, rule: UIColor

    static func == (left: Palette, right: Palette) -> Bool { left.id == right.id }

    static let light = Palette(id: "light", label: "Light", dark: false,
        canvas: hex(0xF7F4ED), paper: hex(0xFFFDF8), paperMuted: hex(0xF4EEE2), text: hex(0x332F29), muted: hex(0x5F625F), subtle: hex(0x7A756C),
        thread: hex(0x8B5F1D), accent: hex(0x8B5F1D), living: hex(0x6F7340), danger: hex(0x9B5A46), rule: UIColor(red: 91 / 255, green: 80 / 255, blue: 63 / 255, alpha: 0.16))

    static let dark = Palette(id: "dark", label: "Dark", dark: true,
        canvas: hex(0x16140F), paper: hex(0x211E17), paperMuted: hex(0x1C1813), text: hex(0xF1EADC), muted: hex(0xC5BDA9), subtle: hex(0x948B7D),
        thread: hex(0xE0B971), accent: hex(0xE0B971), living: hex(0xA9AE70), danger: hex(0xC78978), rule: UIColor(red: 223 / 255, green: 206 / 255, blue: 166 / 255, alpha: 0.16))

    /// Every theme in the order the web's theme menu lists them.
    static let all: [Palette] = [
        light, dark,
        palette("tokyo-midnight", "Tokyo Midnight", paper: 0x0E1829, chrome: 0x09111E, ink: 0xF3E9ED, inkMuted: 0xCFD3E6, subtle: 0x9DACCA, rule: 0x29374D, action: 0xE0B07A, thread: 0xE0B07A, success: 0x8CCBA7, danger: 0xFF9B92),
        palette("tokyo-night", "Tokyo Night", paper: 0x1A1B26, chrome: 0x16161E, ink: 0xC0CAF5, inkMuted: 0xA9B1D6, subtle: 0x737AA2, rule: 0x292E42, action: 0x7AA2F7, thread: 0xE0AF68, success: 0x9ECE6A, danger: 0xF7768E),
        palette("catppuccin", "Catppuccin", paper: 0x1E1E2E, chrome: 0x181825, ink: 0xCDD6F4, inkMuted: 0xBAC2DE, subtle: 0x9399B2, rule: 0x313244, action: 0xF5C2E7, thread: 0xF9E2AF, success: 0xA6E3A1, danger: 0xF38BA8),
        palette("dracula", "Dracula", paper: 0x282A36, chrome: 0x21222C, ink: 0xF8F8F2, subtle: 0x9EA8C7, rule: 0x44475A, action: 0xBD93F9, thread: 0xFFB86C, success: 0x50FA7B, danger: 0xFF5555),
        palette("nord", "Nord", paper: 0x2E3440, ink: 0xE5E9F0, inkMuted: 0xD8DEE9, subtle: mix(0xD8DEE9, 0x4C566A, 0.62), rule: 0x3B4252, action: 0x81A1C1, thread: 0xEBCB8B, success: 0xA3BE8C, danger: 0xBF616A),
        palette("gruvbox-dark", "Gruvbox Dark", paper: 0x1D2021, ink: 0xD5C4A1, inkMuted: 0xBDAE93, subtle: 0xA89984, rule: 0x3C3836, action: 0x83A598, thread: 0xFABD2F, success: 0xB8BB26, danger: 0xFB4934),
        palette("rose-pine", "Rosé Pine", paper: 0x191724, ink: 0xE0DEF4, subtle: 0x908CAA, rule: 0x26233A, action: 0xEBBCBA, thread: 0xF6C177, success: 0x9CCFD8, danger: 0xEB6F92),
        palette("everforest", "Everforest", paper: 0x2D353B, chrome: 0x232A2E, ink: 0xD3C6AA, subtle: 0x9DA9A0, rule: 0x343F44, action: 0xA7C080, thread: 0xDBBC7F, success: 0x83C092, danger: 0xE67E80),
        palette("monokai", "Monokai", paper: 0x272822, ink: 0xF8F8F2, subtle: 0xA59F85, rule: 0x3E3D32, action: 0x66D9EF, thread: 0xE6DB74, success: 0xA6E22E, danger: 0xF92672),
        palette("solarized-dark", "Solarized Dark", paper: 0x002B36, ink: 0x839496, inkMuted: 0x93A1A1, subtle: 0x657B83, rule: 0x073642, action: 0x268BD2, thread: 0xB58900, success: 0x859900, danger: 0xDC322F),
        palette("solarized-light", "Solarized Light", dark: false, paper: 0xFDF6E3, chrome: 0xEEE8D5, ink: 0x586E75, subtle: 0x657B83, rule: 0xEEE8D5, action: 0x268BD2, thread: 0xB58900, success: 0x859900, danger: 0xDC322F)
    ]

    static func named(_ id: String) -> Palette? { all.first { $0.id == id } }

    /// A community palette names its paper, ink, rule and accents; the rest is
    /// derived the way the web's `data-ui-family='palette'` rules derive it.
    private static func palette(_ id: String, _ label: String, dark: Bool = true, paper: UInt32, chrome: UInt32? = nil, ink: UInt32, inkMuted: UInt32? = nil,
                                subtle: UInt32, rule: UInt32, action: UInt32, thread: UInt32, success: UInt32, danger: UInt32) -> Palette {
        Palette(id: id, label: label, dark: dark,
                canvas: hex(paper), paper: hex(paper), paperMuted: hex(chrome ?? mix(paper, 0x000000, 0.86)),
                text: hex(ink), muted: hex(inkMuted ?? mix(ink, subtle, 0.72)), subtle: hex(subtle),
                thread: hex(thread), accent: hex(action), living: hex(success), danger: hex(danger), rule: hex(rule))
    }

    private static func hex(_ value: UInt32) -> UIColor {
        UIColor(red: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255, blue: CGFloat(value & 0xFF) / 255, alpha: 1)
    }

    /// CSS `color-mix(in srgb, a weight, b)`.
    private static func mix(_ a: UInt32, _ b: UInt32, _ weight: Double) -> UInt32 {
        [16, 8, 0].reduce(0) { out, shift in
            let channel = Double((a >> shift) & 0xFF) * weight + Double((b >> shift) & 0xFF) * (1 - weight)
            return out | (UInt32(channel.rounded()) << shift)
        }
    }
}

extension EnvironmentValues {
    private struct ThemeKey: EnvironmentKey { static let defaultValue = "auto" }

    /// The theme id the account wears: "auto" or a `Palette` id.
    var noeisTheme: String {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }

    /// The colours in force here, with `auto` resolved against the device.
    var palette: Palette { Palette.named(noeisTheme) ?? (colorScheme == .dark ? .dark : .light) }
}

/// A colour of the theme in force. A shape style rather than a fixed Color,
/// so every room repaints the moment the theme changes and keeps its place.
struct Ink: ShapeStyle {
    let role: KeyPath<Palette, UIColor>

    func resolve(in environment: EnvironmentValues) -> Color.Resolved {
        Color(uiColor: environment.palette[keyPath: role]).resolve(in: environment)
    }

    static let canvas = Ink(role: \.canvas)
    static let paper = Ink(role: \.paper)
    static let paperMuted = Ink(role: \.paperMuted)
    static let text = Ink(role: \.text)
    static let muted = Ink(role: \.muted)
    static let subtle = Ink(role: \.subtle)
    static let thread = Ink(role: \.thread)
    static let accent = Ink(role: \.accent)
    static let living = Ink(role: \.living)
    static let danger = Ink(role: \.danger)
    static let rule = Ink(role: \.rule)
}

extension Ink {
    /// The web's highlight inks (constants/highlightColors.js): keep, for, against.
    enum Highlight: String, CaseIterable {
        case keep = "#f6e27a", support = "#cfe3b4", against = "#f7c9a3"

        var label: String {
            switch self {
            case .keep: return "Keep"
            case .support: return "For"
            case .against: return "Against"
            }
        }

        var color: UIColor {
            let value = Int(rawValue.dropFirst(), radix: 16) ?? 0xF6E27A
            return UIColor(red: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255, blue: CGFloat(value & 0xFF) / 255, alpha: 1)
        }
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
    /// The web's light display serif, for the head of a page.
    static let display = Font.system(.largeTitle, design: .serif).weight(.light)
    /// A row's title, the web's 25px serif: large enough that a list reads at a glance.
    static let rowTitle = Font.system(.title2, design: .serif)
    /// The line under a row's title, in the reading voice.
    static let dek = Font.system(.body, design: .serif)
    /// Dates, counts, sources: the quiet sans under everything.
    static let meta = Font.caption
}

/// Motion that honours Reduce Motion: with it on, the change simply happens.
@MainActor func calmly(_ animation: Animation = .default, _ change: () -> Void) {
    if UIAccessibility.isReduceMotionEnabled { change() } else { withAnimation(animation, change) }
}

private struct CalmAnimation<V: Equatable>: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let animation: Animation
    let value: V
    func body(content: Content) -> some View { content.animation(reduceMotion ? nil : animation, value: value) }
}

extension View {
    /// `.animation(_:value:)` that stands still under Reduce Motion.
    func calmAnimation<V: Equatable>(_ animation: Animation, value: V) -> some View {
        modifier(CalmAnimation(animation: animation, value: value))
    }

    /// The page every room sits on.
    func paper() -> some View {
        scrollContentBackground(.hidden)
            .background(Ink.canvas, ignoresSafeAreaEdges: .all)
            .foregroundStyle(Ink.text)
            // The bar takes the page's colour once something scrolls under it.
            .toolbarBackground(Ink.canvas, for: .navigationBar)
    }

    /// A room's title. iPhone shows it large in the bar; on iPad the masthead
    /// already names the room, so the title sits in the column, where the
    /// web puts it, and the bar keeps only its buttons.
    func roomTitle(_ title: String) -> some View { modifier(RoomTitle(title: title)) }

    /// A centred column, as every web room is: 680 to read in, wider for an
    /// index or a broadsheet. Full width on iPhone.
    func column(_ width: CGFloat = 680) -> some View {
        frame(maxWidth: width, alignment: .leading)
            .frame(maxWidth: .infinity)
    }
}

private struct RoomTitle: ViewModifier {
    let title: String
    @Environment(\.horizontalSizeClass) private var sizeClass

    func body(content: Content) -> some View {
        if sizeClass == .regular {
            content
                .environment(\.roomHeading, title)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .principal) { Color.clear.frame(width: 1, height: 1) } }
        } else {
            content.navigationTitle(title)
        }
    }
}

extension EnvironmentValues {
    private struct RoomHeadingKey: EnvironmentKey { static let defaultValue: String? = nil }

    /// The room's title when the column shows it (iPad).
    var roomHeading: String? {
        get { self[RoomHeadingKey.self] }
        set { self[RoomHeadingKey.self] = newValue }
    }
}

/// The room's title at the head of its column, with air under the masthead.
struct RoomHeading: View {
    @Environment(\.roomHeading) private var heading

    var body: some View {
        if let heading {
            Text(heading).font(.masthead).padding(.top, 28).padding(.bottom, 6)
        }
    }
}

/// A room's index: one centred column of ruled rows on the page, the web's
/// collection pages. Rows are `RouteRow`s; headings are `IndexHeading`s.
struct RoomIndex<Content: View>: View {
    @ViewBuilder var content: Content
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                RoomHeading()
                content
            }
                .padding(.horizontal, sizeClass == .regular ? 40 : 20)
                .padding(.top, 4)
                .padding(.bottom, 48)
                .column(800)
        }
    }
}

/// A heading inside an index: small capitals with air above.
struct IndexHeading: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View { Kicker(text).padding(.top, 28).padding(.bottom, 6) }
}

/// What an empty place says, in the reading voice; never a system icon.
struct Quiet: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text)
            .font(.system(.title3, design: .serif).italic())
            .foregroundStyle(Ink.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 32)
    }
}

/// A hairline across the page.
struct Hairline: View {
    var color = Ink.rule
    var body: some View { Rectangle().fill(color).frame(height: 1) }
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

/// The web's small capitals, for every quiet heading.
struct Kicker: View {
    let text: String
    var color = Ink.subtle
    init(_ text: String, color: Ink = Ink.subtle) { self.text = text; self.color = color }

    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(1.4)
            .foregroundStyle(color)
    }
}

/// A press that answers the finger: the row dims a touch and settles back.
/// The one filled button: page colour on ink, legible on every theme
/// (the accent's own fill washed out white labels on the dark ones).
struct InkButton: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Ink.paper)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Ink.text, in: Capsule())
            .opacity(enabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
            .calmAnimation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == InkButton {
    static var ink: InkButton { InkButton() }
}

struct QuietPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.6 : 1)
            .calmAnimation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

extension View {
    /// Settles in: a short fade and a small rise, or simply appears under Reduce Motion.
    func arrives() -> some View { modifier(Arrive()) }
}

private struct Arrive: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 8)
            .onAppear {
                if reduceMotion { shown = true } else { withAnimation(.easeOut(duration: 0.32)) { shown = true } }
            }
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
