import SwiftUI
import UIKit

// MARK: The list

struct LibraryList: View {
    @State private var query = ""
    @State private var saving = false
    @State private var generation = 0
    /// The web's nightstand: what you put by to read later.
    @AppStorage("library.nightstand") private var nightstand = false
    @State private var kept = 0

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.articles() }) { articles, reload in
            let later = articles.filter { $0["placement"].text == "later" }
            let onNightstand = nightstand && !later.isEmpty
            let shelf = onNightstand ? later : articles
            let shown = query.isEmpty ? shelf : shelf.filter {
                $0["title"].text.localizedCaseInsensitiveContains(query) || $0["siteName"].text.localizedCaseInsensitiveContains(query) || $0["firstGraph"].text.localizedCaseInsensitiveContains(query)
            }
            // The nightstand and the newest dozen wait on the device, to read with no connection.
            let keeping = NSOrderedSet(array: (later + articles.prefix(12)).map(\.id)).array as? [String] ?? []
            RoomIndex {
                HStack(alignment: .firstTextBaseline, spacing: 22) {
                    if !later.isEmpty {
                        WordTabs(selection: $nightstand, options: [(false, "All"), (true, "Nightstand")])
                    }
                    // Books are a page of their own: each one is the desk you write at.
                    RouteLink(route: .books) {
                        Text("Books").font(.system(.body, design: .serif)).foregroundStyle(Ink.muted).padding(.vertical, 8)
                    }
                }
                .padding(.top, 12)
                IndexHeading(onNightstand ? nightstandLine(later.count) : shown.count == 1 ? "1 source" : "\(shown.count) sources")
                ForEach(shown, id: \.id) { article in
                    RouteRow(route: article.opens) { ArticleRow(article: article) }
                }
                if shown.isEmpty {
                    Quiet(query.isEmpty ? "Nothing saved yet. Share a page to Noeis from Safari or any app, or tap + to paste a link." : "Nothing matches “\(query)”.")
                }
            }
            .refreshable { await reload() }
            .onChange(of: generation) { Task { await reload() } }
            .task(id: keeping) {
                await NoeisAPI.shared.keep(articleIds: keeping)
                kept = later.filter { NoeisAPI.shared.isKept(articleId: $0.id) }.count
            }
        }
        .searchable(text: $query, prompt: nightstand ? "Search your nightstand" : "Search your library")
        .roomTitle("Library")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { saving = true } label: { Image(systemName: "plus") }.accessibilityLabel("Save a link")
            }
            PartnerToolbarItem(context: ["type": "workspace", "id": "library", "title": "Library"])
        }
        .sheet(isPresented: $saving, onDismiss: { generation += 1 }) { SaveLinkSheet() }
        .paper()
    }

    /// A receipt of what is ready for the plane: "3 on your nightstand · all kept on this iPhone".
    private func nightstandLine(_ count: Int) -> String {
        let pieces = count == 1 ? "1 on your nightstand" : "\(count) on your nightstand"
        let device = UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
        switch kept {
        case count: return "\(pieces) · all kept on this \(device)"
        case 0: return "\(pieces) · kept on this \(device) once you’re on Wi-Fi"
        default: return "\(pieces) · \(kept) kept on this \(device), the rest on Wi-Fi"
        }
    }
}

private struct ArticleRow: View {
    let article: JSON

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(article["title"].text.isEmpty ? "Untitled" : article["title"].text)
                .font(.rowTitle)
                .lineLimit(3)
            if !article["firstGraph"].text.isEmpty {
                Text(article["firstGraph"].text).font(.dek).foregroundStyle(Ink.muted).lineLimit(2)
            }
            HStack(spacing: 6) {
                Text(article.byline)
                if let marked = article["highlightCount"]?.int, marked > 0 { Text("· \(marked) marked") }
                if let ratio = article.at("lastPlace.ratio")?.double, ratio > 0.05, ratio < 0.95 {
                    Text("· \(Int(ratio * 100))% read")
                }
            }
            .font(.meta)
            .foregroundStyle(Ink.subtle)
        }
        .padding(.vertical, 20)
    }
}

extension JSON {
    /// A source with no text of its own, a book above all, opens at its desk, as on the web.
    var opens: Route {
        self["url"].text.hasPrefix("import://") && self["firstGraph"].text.isEmpty ? .book(id) : .article(id)
    }

    var byline: String {
        let site = self["siteName"]?.string ?? self["url"]?.string.flatMap(URL.init(string:))?.host()?.replacingOccurrences(of: "www.", with: "")
        return [site, self["createdAt"]?.date?.shortDay].compactMap { $0 }.joined(separator: " · ")
    }
}

private struct SaveLinkSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var link = ""
    @State private var saved = false
    @StateObject private var writer = Writer()

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                if saved {
                    Label("Saved to your Library", systemImage: "checkmark.circle").font(.headline).foregroundStyle(Ink.living)
                    Text("Noeis reads it against the views you hold. If it argues with one, the Wiki will say so.")
                        .font(.callout).foregroundStyle(Ink.muted)
                } else {
                    TextField("https://", text: $link)
                        .keyboardType(.URL).textContentType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .textFieldStyle(PaperFieldStyle())
                    Text("Tip: in Safari or any app, tap Share, then Noeis.").font(.footnote).foregroundStyle(Ink.subtle)
                }
                Spacer()
            }
            .padding(24)
            .paper()
            .navigationTitle("Save a link")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(saved ? "Done" : "Cancel") { dismiss() } }
                if !saved {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            guard let url = URL(string: link.trimmingCharacters(in: .whitespaces)) else { return }
                            writer.run {
                                _ = try await NoeisAPI.shared.save(url: url)
                                calmly { saved = true }
                            }
                        }
                        .disabled(URL(string: link)?.scheme?.hasPrefix("http") != true || writer.busy)
                    }
                }
            }
            .failureAlert(writer)
        }
        .onAppear {
            if let pasted = UIPasteboard.general.url, link.isEmpty { link = pasted.absoluteString }
        }
        .presentationDetents([.medium])
    }
}

// MARK: Reading

struct ArticleReader: View {
    let id: String
    let passage: String?
    @StateObject private var writer = Writer()
    @State private var marks: [Mark] = []
    @State private var argument: JSON?
    @State private var selection: MarkedSelection?
    @State private var settled = 0
    /// A pencil touching paper: one soft, damped tap as the ink lands.
    @State private var tick = UIImpactFeedbackGenerator(style: .soft)

    var body: some View {
        Loaded(load: { () async throws -> (JSON, [JSON], NSAttributedString) in
            async let article = NoeisAPI.shared.article(id)
            async let highlights = (try? await NoeisAPI.shared.highlights(articleId: id)) ?? []
            let saved = try await article
            return (saved, await highlights, await ArticleBody.from(saved["content"]?.raw ?? ""))
        }) { loaded, _ in
            let (article, highlights, body) = loaded
            ReaderText(
                title: article["title"].text,
                byline: article.byline,
                body: body,
                marks: highlights.map { Mark(text: $0.at("anchor.text")?.string ?? $0["text"].text, ink: Ink.Highlight(rawValue: $0["color"].text) ?? .keep) } + marks,
                focus: passage,
                settled: settled,
                onSelect: { picked in
                    // Awake before the tap, so the first tick isn't late.
                    if picked != nil { tick.prepare() }
                    calmly(.easeOut(duration: 0.18)) { selection = picked }
                }
            )
            .safeAreaInset(edge: .bottom) {
                if let selection {
                    HighlightBar(selection: selection, busy: writer.busy) { ink, thought in
                        // Painted at once; kept on the server, so it is there on the web and after a reload.
                        let mark = Mark(text: selection.text, ink: ink)
                        // Once per new mark: not again for a passage already marked.
                        if !(highlights.contains { ($0.at("anchor.text")?.string ?? $0["text"].text) == mark.text } || marks.contains { $0.text == mark.text }) {
                            tick.impactOccurred(intensity: 0.55)
                        }
                        marks.append(mark)
                        settled += 1
                        writer.run {
                            do {
                                let saved = try await NoeisAPI.shared.mark(articleId: id, text: selection.text, prefix: selection.prefix, suffix: selection.suffix, offset: selection.offset, color: ink.rawValue)
                                if let thought, !thought.isEmpty { try await NoeisAPI.shared.note(articleId: id, highlightId: saved.id, thought) }
                            } catch {
                                marks.removeAll { $0 == mark }
                                throw error
                            }
                        }
                    }
                } else if let argument {
                    ArgumentBanner(reading: argument) { calmly { self.argument = nil } }
                }
            }
            .toolbar {
                if let url = article["url"]?.string.flatMap(URL.init(string:)) {
                    ToolbarItem(placement: .primaryAction) {
                        ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                    }
                }
                PartnerToolbarItem(context: ["type": "article", "id": .string(id), "title": article["title"] ?? ""])
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .failureAlert(writer)
        .paper()
        .task {
            // Does this piece argue with something you hold? Said once, at the bottom.
            if let reading = try? await NoeisAPI.shared.pushesAgainst(articleId: id) {
                calmly(.easeOut(duration: 0.3)) { argument = reading }
            }
        }
    }
}

/// A highlight in the reader, in one of the web's inks.
struct Mark: Hashable {
    let text: String
    let ink: Ink.Highlight
}

/// What a selection can become, as on the web: a highlight in one of three
/// inks (keep, for, against), a highlight with a thought, or a question for the Partner.
private struct HighlightBar: View {
    let selection: MarkedSelection
    let busy: Bool
    let highlight: (Ink.Highlight, String?) -> Void
    @State private var asking = false
    @State private var thinking = false
    @State private var thought = ""

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Ink.Highlight.allCases, id: \.self) { ink in
                Button { highlight(ink, nil) } label: {
                    HStack(spacing: 6) {
                        Circle().fill(Color(ink.color)).frame(width: 12, height: 12)
                            .overlay(Circle().strokeBorder(Ink.rule))
                        Text(ink.label)
                    }
                    .padding(.horizontal, 11).padding(.vertical, 10)
                }
                .disabled(busy)
                .accessibilityLabel(ink == .keep ? "Highlight" : "Highlight as \(ink.label.lowercased())")
            }
            Rectangle().fill(Ink.rule).frame(width: 1, height: 22)
            Button { thinking = true } label: {
                Image(systemName: "text.bubble").padding(.horizontal, 11).padding(.vertical, 10)
            }
            .accessibilityLabel("Leave a thought")
            Button { asking = true } label: {
                Image(systemName: "sparkle.magnifyingglass").padding(.horizontal, 11).padding(.vertical, 10)
            }
            .accessibilityLabel("Ask about this")
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(Ink.text)
        .buttonStyle(QuietPress())
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Ink.rule))
        .shadow(color: .black.opacity(0.14), radius: 12, y: 6)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .alert("Leave a thought", isPresented: $thinking) {
            TextField("What it makes you think", text: $thought, axis: .vertical)
            Button("Keep") { highlight(.keep, thought); thought = "" }
            Button("Cancel", role: .cancel) { thought = "" }
        } message: {
            Text("“\(selection.text.prefix(140))”")
        }
        .sheet(isPresented: $asking) {
            PartnerSheet(context: ["type": "passage", "id": .string(selection.text), "title": .string(String(selection.text.prefix(80)))], opening: "Help me understand this passage: “\(selection.text.prefix(400))”")
        }
    }
}

/// "This pushes against your view that …", the same line the extension's save card shows.
private struct ArgumentBanner: View {
    let reading: JSON
    let dismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text("This pushes against your view that \(reading["view"].text.lowercasedFirst)")
                    .font(.system(.subheadline, design: .serif))
                NavigationLink(value: Route.view(reading["pageId"].text)) {
                    Text("Open the view").font(.subheadline.weight(.semibold))
                }
            }
            Spacer(minLength: 0)
            Button(action: dismiss) { Image(systemName: "xmark").font(.footnote.weight(.semibold)) }
                .foregroundStyle(Ink.subtle)
                .accessibilityLabel("Dismiss")
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Ink.rule))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

/// Saved article bodies are HTML (extension saves) or plain text (link
/// imports). Both become paragraphs, with headings kept as headings.
/// The saved article as the web reads it: its own HTML (headings, lists,
/// quotes, captions, tables, links), set in the reading serif. Pictures and
/// scripts stay out; every word stays in.
extension NSAttributedString.Key {
    /// A quieter body run (a caption, an aside), coloured from the theme when shown.
    static let readerTone = NSAttributedString.Key("noeis.readerTone")
}

@MainActor
enum ArticleBody {
    private static let cache = NSCache<NSString, NSAttributedString>()

    static func from(_ content: String) -> NSAttributedString {
        let key = String(content.hashValue) as NSString
        if let hit = cache.object(forKey: key) { return hit }
        let body = content.contains("<") ? html(content) ?? plain(content.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)) : plain(content)
        cache.setObject(body, forKey: key)
        return body
    }

    static func serif(_ style: UIFont.TextStyle, _ size: CGFloat, _ weight: UIFont.Weight, italic: Bool = false) -> UIFont {
        let base = UIFont.preferredFont(forTextStyle: style).fontDescriptor
        var descriptor = (base.withDesign(.serif) ?? base).addingAttributes([.traits: [UIFontDescriptor.TraitKey.weight: weight]])
        if italic { descriptor = descriptor.withSymbolicTraits(.traitItalic) ?? descriptor }
        return UIFontMetrics(forTextStyle: style).scaledFont(for: UIFont(descriptor: descriptor, size: size))
    }

    private static func plain(_ content: String) -> NSAttributedString {
        let text = content.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: "\n")
        return NSAttributedString(string: text, attributes: [.font: serif(.body, 19, .regular), .paragraphStyle: paragraph(from: nil)])
    }

    /// Block kinds the importer would flatten, carried through it as marker
    /// colours and given the reader's own treatment afterwards.
    private enum Block: Int { case quote = 1, note, item }

    private static func html(_ content: String) -> NSAttributedString? {
        guard let data = prepared(content).data(using: .utf8),
              let parsed = try? NSMutableAttributedString(data: data, options: [
                .documentType: NSAttributedString.DocumentType.html,
                .characterEncoding: String.Encoding.utf8.rawValue
              ], documentAttributes: nil) else { return nil }
        let whole = NSRange(location: 0, length: parsed.length)
        var blocks: [(NSRange, Block)] = []
        parsed.enumerateAttribute(.foregroundColor, in: whole) { value, range, _ in
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            (value as? UIColor)?.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
            if red < 0.01, green < 0.01, let block = Block(rawValue: Int((blue * 255).rounded())) { blocks.append((range, block)) }
        }
        // HTML comes in at 12pt Times with headings larger; map it onto the reader's ladder.
        parsed.enumerateAttribute(.font, in: whole) { value, range, _ in
            let font = value as? UIFont
            let traits = font?.fontDescriptor.symbolicTraits ?? []
            let size = font?.pointSize ?? 12
            let next: UIFont
            if traits.contains(.traitMonoSpace) {
                next = UIFontMetrics(forTextStyle: .body).scaledFont(for: .monospacedSystemFont(ofSize: 15, weight: .regular))
            } else if size >= 17 {
                next = serif(.title2, 24, .semibold)
            } else if size >= 13.5 {
                next = serif(.title3, 21, .semibold)
            } else {
                next = serif(.body, 19, traits.contains(.traitBold) ? .semibold : .regular, italic: traits.contains(.traitItalic))
            }
            parsed.addAttribute(.font, value: next, range: range)
        }
        parsed.enumerateAttribute(.paragraphStyle, in: whole) { value, range, _ in
            parsed.addAttribute(.paragraphStyle, value: paragraph(from: value as? NSParagraphStyle), range: range)
        }
        for key: NSAttributedString.Key in [.foregroundColor, .backgroundColor, .strokeColor, .underlineColor, .attachment, .kern] {
            parsed.removeAttribute(key, range: whole)
        }
        for (range, block) in blocks {
            let style = NSMutableParagraphStyle()
            style.lineSpacing = 6
            style.paragraphSpacing = 14
            switch block {
            case .quote:
                // The web's pull quote: italic, set in from the measure.
                style.firstLineHeadIndent = 22
                style.headIndent = 22
                parsed.addAttribute(.font, value: serif(.body, 20, .regular, italic: true), range: range)
            case .note:
                // Captions and asides: smaller and quieter than the text they serve.
                style.paragraphSpacing = 18
                parsed.addAttribute(.font, value: serif(.footnote, 15, .regular, italic: true), range: range)
                parsed.addAttribute(.readerTone, value: "muted", range: range)
            case .item:
                // A hanging indent, so a wrapped item lines up under its words, not its bullet.
                style.headIndent = 22
                style.paragraphSpacing = 8
                style.tabStops = [NSTextTab(textAlignment: .natural, location: 22)]
                style.defaultTabInterval = 22
            }
            parsed.addAttribute(.paragraphStyle, value: style, range: range)
        }
        // Drop the object-replacement characters images leave, and outer blank lines.
        parsed.mutableString.replaceOccurrences(of: "\u{FFFC}", with: "", options: [], range: NSRange(location: 0, length: parsed.length))
        while parsed.string.hasSuffix("\n") { parsed.deleteCharacters(in: NSRange(location: parsed.length - 1, length: 1)) }
        while parsed.string.hasPrefix("\n") { parsed.deleteCharacters(in: NSRange(location: 0, length: 1)) }
        return parsed
    }

    /// The saved HTML, reshaped so the importer keeps what a reader needs:
    /// bullets and numbers as text, table rows as lines, and quotes, captions
    /// and asides tagged with a marker colour. Pictures and scripts go.
    private static func prepared(_ content: String) -> String {
        func tag(_ block: Block) -> String { "<div style=\"color:#0000\(String(format: "%02x", block.rawValue))\">" }
        var html = content
        func replace(_ pattern: String, _ with: String) {
            html = html.replacingOccurrences(of: pattern, with: with, options: .regularExpression)
        }
        replace(#"(?is)<(script|style|svg|nav|iframe|noscript|form|button|select)\b[^>]*>.*?</\1>"#, "")
        replace(#"(?i)<(img|picture|source|video|audio|input)\b[^>]*>"#, "")
        // Numbered lists keep their numbers; the rest take a bullet.
        if let ordered = try? NSRegularExpression(pattern: #"(?is)<ol\b[^>]*>(.*?)</ol>"#) {
            for match in ordered.matches(in: html, range: NSRange(html.startIndex..., in: html)).reversed() {
                guard let whole = Range(match.range, in: html), let inner = Range(match.range(at: 1), in: html) else { continue }
                var number = 0
                let items = html[inner].components(separatedBy: "<li").enumerated().map { index, piece -> String in
                    guard index > 0, let close = piece.firstIndex(of: ">") else { return index == 0 ? "" : piece }
                    number += 1
                    return "\(tag(.item))\(number).\t" + piece[piece.index(after: close)...]
                }
                html.replaceSubrange(whole, with: items.joined())
            }
        }
        replace(#"(?i)<li\b[^>]*>"#, tag(.item) + "•\t")
        replace(#"(?i)</li\s*>"#, "</div>")
        replace(#"(?i)</?(ul|ol)\b[^>]*>"#, "")
        // A table reads as one line per row, its cells set apart by dots;
        // header cells are set heavier, so the first row reads as a header.
        replace(#"(?i)<th\b[^>]*>"#, "<th><b>")
        replace(#"(?i)</th\s*>"#, "</b></th>")
        replace(#"(?i)</t[dh]\s*>\s*<t[dh]\b[^>]*>"#, " · ")
        replace(#"(?i)<tr\b[^>]*>"#, "<p>")
        replace(#"(?i)</tr\s*>"#, "</p>")
        replace(#"(?i)</?(table|thead|tbody|tfoot|t[dh]|caption|colgroup|col)\b[^>]*>"#, "")
        replace(#"(?i)<blockquote\b[^>]*>"#, tag(.quote))
        replace(#"(?i)</blockquote\s*>"#, "</div>")
        replace(#"(?i)<(figcaption|aside|small)\b[^>]*>"#, tag(.note))
        replace(#"(?i)</(figcaption|aside|small)\s*>"#, "</div>")
        return html
    }

    /// The reader's spacing, keeping the indents HTML gave lists and quotes.
    private static func paragraph(from original: NSParagraphStyle?) -> NSParagraphStyle {
        let style = (original?.mutableCopy() as? NSMutableParagraphStyle) ?? NSMutableParagraphStyle()
        style.lineSpacing = 6
        style.paragraphSpacing = max(style.paragraphSpacing, 14)
        style.paragraphSpacingBefore = 0
        style.alignment = .natural
        return style
    }
}

/// A selected passage, with the context the web uses to find it again.
struct MarkedSelection {
    let text: String
    let prefix: String
    let suffix: String
    let offset: Int
}

/// The article as one selectable text: select a passage and choose Mark.
/// UITextView, because SwiftUI's Text cannot offer a custom action on a selection.
/// Keeps a readable measure: a centred 680pt column on iPad, 20pt margins on iPhone.
private final class ReadingTextView: UITextView {
    override func layoutSubviews() {
        let side = max(20, (bounds.width - 680) / 2)
        if textContainerInset.left != side {
            textContainerInset = UIEdgeInsets(top: 24, left: side, bottom: 120, right: side)
        }
        super.layoutSubviews()
    }
}

private struct ReaderText: UIViewRepresentable {
    let title: String
    let byline: String
    let body: NSAttributedString
    let marks: [Mark]
    let focus: String?
    /// Bumped after a highlight lands, to let go of the selection.
    let settled: Int
    let onSelect: (MarkedSelection?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UITextView {
        let view = ReadingTextView()
        view.isEditable = false
        view.isSelectable = true
        view.backgroundColor = .clear
        view.adjustsFontForContentSizeCategory = true
        view.textContainerInset = UIEdgeInsets(top: 24, left: 20, bottom: 120, right: 20)
        view.delegate = context.coordinator
        view.alwaysBounceVertical = true
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        let coordinator = context.coordinator
        coordinator.onSelect = onSelect
        if coordinator.settled != settled {
            coordinator.settled = settled
            view.selectedRange = NSRange(location: view.selectedRange.location, length: 0)
        }
        let built = build(context.environment.palette)
        coordinator.bodyStart = built.bodyStart
        if coordinator.rendered != built.signature {
            let offset = view.contentOffset
            view.attributedText = built.text
            if coordinator.rendered != nil { view.setContentOffset(offset, animated: false) }
            coordinator.rendered = built.signature
        }
        if focus != nil, !coordinator.focused, let range = built.focusRange {
            coordinator.focused = true
            DispatchQueue.main.async {
                view.layoutIfNeeded()
                view.scrollRangeToVisible(range)
                // Bring it a little below the top, so it reads as arrived at, not cut off.
                view.setContentOffset(CGPoint(x: 0, y: max(0, view.contentOffset.y - 80)), animated: false)
            }
        }
    }

    private func build(_ palette: Palette) -> (text: NSAttributedString, bodyStart: Int, focusRange: NSRange?, signature: Int) {
        let ink = palette.text, muted = palette.subtle
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 6
        paragraph.paragraphSpacing = 14

        let text = NSMutableAttributedString()
        text.append(NSAttributedString(string: title + "\n", attributes: [.font: ArticleBody.serif(.largeTitle, 40, .medium), .foregroundColor: ink, .paragraphStyle: paragraph]))
        if !byline.isEmpty {
            text.append(NSAttributedString(string: byline + "\n", attributes: [.font: UIFont.preferredFont(forTextStyle: .footnote), .foregroundColor: muted, .paragraphStyle: paragraph]))
        }
        text.append(NSAttributedString(string: "\n", attributes: [.font: UIFont.preferredFont(forTextStyle: .footnote)]))
        let bodyStart = text.length

        if body.length > 0 {
            let start = text.length
            text.append(body)
            text.addAttribute(.foregroundColor, value: ink, range: NSRange(location: start, length: body.length))
            body.enumerateAttribute(.readerTone, in: NSRange(location: 0, length: body.length)) { tone, range, _ in
                guard tone != nil else { return }
                text.addAttribute(.foregroundColor, value: muted, range: NSRange(location: start + range.location, length: range.length))
            }
        } else {
            text.append(NSAttributedString(string: "No readable text was saved for this page. Open the original from the share button.", attributes: [.font: ArticleBody.serif(.body, 19, .regular), .foregroundColor: muted]))
        }

        let whole = text.string as NSString
        let dark = palette.dark
        for mark in marks {
            if let range = Self.find(mark.text, in: whole, from: bodyStart) {
                text.addAttribute(.backgroundColor, value: mark.ink.color.withAlphaComponent(dark ? 0.34 : 0.45), range: range)
            }
        }
        let markColor = Ink.Highlight.keep.color.withAlphaComponent(dark ? 0.34 : 0.45)

        var focusRange: NSRange?
        if let focus = focus?.trimmingCharacters(in: .whitespacesAndNewlines), focus.count >= 3 {
            let range = whole.range(of: String(focus.prefix(80)), options: [.caseInsensitive], range: NSRange(location: bodyStart, length: whole.length - bodyStart))
            if range.location != NSNotFound {
                focusRange = range
                let full = whole.range(of: String(focus.prefix(300)), options: [.caseInsensitive], range: NSRange(location: bodyStart, length: whole.length - bodyStart))
                text.addAttribute(.backgroundColor, value: markColor, range: full.location == NSNotFound ? range : full)
            }
        }

        var hasher = Hasher()
        hasher.combine(title); hasher.combine(ObjectIdentifier(body)); hasher.combine(marks); hasher.combine(focus); hasher.combine(palette.id)
        return (text, bodyStart, focusRange, hasher.finalize())
    }

    /// Where a saved passage sits in this text: word for word, whatever the
    /// spacing between them, since the web and this reader break lines differently.
    static func find(_ passage: String, in whole: NSString, from start: Int) -> NSRange? {
        let words = passage.split(whereSeparator: \.isWhitespace).prefix(80).map { NSRegularExpression.escapedPattern(for: String($0)) }
        guard words.count > 0, start < whole.length, let pattern = try? NSRegularExpression(pattern: words.joined(separator: "\\s+")) else { return nil }
        return pattern.firstMatch(in: whole as String, range: NSRange(location: start, length: whole.length - start))?.range
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var onSelect: (MarkedSelection?) -> Void = { _ in }
        var rendered: Int?
        var bodyStart = 0
        var focused = false
        var settled = 0

        /// Selecting a passage of the body offers to highlight it, the way the web does.
        func textViewDidChangeSelection(_ textView: UITextView) {
            onSelect(selection(in: textView, range: textView.selectedRange))
        }

        private func selection(in textView: UITextView, range: NSRange) -> MarkedSelection? {
            let whole = textView.text as NSString
            guard range.length > 0, range.location >= bodyStart, NSMaxRange(range) <= whole.length else { return nil }
            let text = whole.substring(with: range).trimmingCharacters(in: .whitespacesAndNewlines)
            guard text.count >= 3 else { return nil }
            let lead = min(30, range.location - bodyStart)
            let before = whole.substring(with: NSRange(location: range.location - lead, length: lead))
            let afterStart = NSMaxRange(range)
            let after = whole.substring(with: NSRange(location: afterStart, length: min(30, whole.length - afterStart)))
            return MarkedSelection(text: text, prefix: before, suffix: after, offset: range.location - bodyStart)
        }
    }
}
