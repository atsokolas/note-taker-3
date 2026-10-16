import SwiftUI
import UIKit

// MARK: The list

struct LibraryList: View {
    var selection: Binding<Route?>?
    @State private var query = ""
    @State private var saving = false
    @State private var generation = 0

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.articles() }) { articles, reload in
            let shown = query.isEmpty ? articles : articles.filter {
                $0["title"].text.localizedCaseInsensitiveContains(query) || $0["siteName"].text.localizedCaseInsensitiveContains(query) || $0["firstGraph"].text.localizedCaseInsensitiveContains(query)
            }
            List(selection: selection) {
                ForEach(shown, id: \.id) { article in
                    NavigationLink(value: Route.article(article.id)) { ArticleRow(article: article) }
                }
            }
            .listStyle(.plain)
            .overlay {
                if shown.isEmpty {
                    ContentUnavailableView(query.isEmpty ? "Nothing saved yet" : "Nothing matches “\(query)”",
                                           systemImage: "books.vertical",
                                           description: Text(query.isEmpty ? "Share a page to Noeis from Safari or any app, or tap + to paste a link." : ""))
                }
            }
            .refreshable { await reload() }
            .onChange(of: generation) { Task { await reload() } }
        }
        .searchable(text: $query, prompt: "Search your library")
        .navigationTitle("Library")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { saving = true } label: { Image(systemName: "plus") }.accessibilityLabel("Save a link")
            }
            PartnerToolbarItem(context: ["type": "workspace", "id": "library", "title": "Library"])
        }
        .sheet(isPresented: $saving, onDismiss: { generation += 1 }) { SaveLinkSheet() }
        .paper()
    }
}

private struct ArticleRow: View {
    let article: JSON

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(article["title"].text.isEmpty ? "Untitled" : article["title"].text)
                .font(.system(.headline, design: .serif))
                .lineLimit(3)
            if !article["firstGraph"].text.isEmpty {
                Text(article["firstGraph"].text).font(.callout).foregroundStyle(Ink.muted).lineLimit(2)
            }
            HStack(spacing: 6) {
                Text(article.byline)
                if let marked = article["highlightCount"]?.int, marked > 0 { Text("· \(marked) marked") }
                if let ratio = article.at("lastPlace.ratio")?.double, ratio > 0.05, ratio < 0.95 {
                    Text("· \(Int(ratio * 100))% read")
                }
            }
            .font(.caption)
            .foregroundStyle(Ink.subtle)
        }
        .padding(.vertical, 6)
    }
}

extension JSON {
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
    @State private var marks: [String] = []
    @State private var argument: JSON?

    var body: some View {
        Loaded(load: { () async throws -> (JSON, [JSON]) in
            async let article = NoeisAPI.shared.article(id)
            async let highlights = (try? await NoeisAPI.shared.highlights(articleId: id)) ?? []
            return (try await article, await highlights)
        }) { loaded, _ in
            let (article, highlights) = loaded
            ReaderText(
                title: article["title"].text,
                byline: article.byline,
                paragraphs: Paragraphs.from(article["content"].text),
                marks: highlights.map { $0.at("anchor.text")?.string ?? $0["text"].text } + marks,
                focus: passage,
                onMark: { selection in
                    writer.run {
                        _ = try await NoeisAPI.shared.mark(articleId: id, text: selection.text, prefix: selection.prefix, suffix: selection.suffix, offset: selection.offset)
                        marks.append(selection.text)
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }
                }
            )
            .ignoresSafeArea(edges: .bottom)
            .safeAreaInset(edge: .bottom) {
                if let argument { ArgumentBanner(reading: argument) { calmly { self.argument = nil } } }
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
enum Paragraphs {
    struct Paragraph: Hashable {
        var text: String
        var heading = false
    }

    static func from(_ content: String) -> [Paragraph] {
        guard content.contains("<") else {
            return content.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.map { Paragraph(text: $0) }
        }
        var html = content
        for (pattern, replacement) in [
            (#"(?is)<(script|style|figure|svg|nav|aside)[^>]*>.*?</\1>"#, ""),
            (#"(?i)<\s*br\s*/?\s*>"#, "\n"),
            (#"(?i)<h[1-6][^>]*>"#, "\n\u{1}"),
            (#"(?i)<li[^>]*>"#, "\n• "),
            (#"(?i)</\s*(p|div|section|article|blockquote|h[1-6]|li|tr)\s*>"#, "\n"),
            (#"<[^>]+>"#, "")
        ] {
            html = html.replacingOccurrences(of: pattern, with: replacement, options: .regularExpression)
        }
        return decodeEntities(html)
            .components(separatedBy: "\n")
            .map { $0.replacingOccurrences(of: #"[ \t\u{00A0}]+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && $0 != "\u{1}" }
            .map { $0.hasPrefix("\u{1}") ? Paragraph(text: String($0.dropFirst()).trimmingCharacters(in: .whitespaces), heading: true) : Paragraph(text: $0) }
    }

    private static func decodeEntities(_ text: String) -> String {
        var out = text
        for (entity, character) in ["&nbsp;": " ", "&quot;": "\"", "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&mdash;": "—", "&ndash;": "–", "&hellip;": "…", "&rsquo;": "’", "&lsquo;": "‘", "&rdquo;": "”", "&ldquo;": "“"] {
            out = out.replacingOccurrences(of: entity, with: character)
        }
        if let regex = try? NSRegularExpression(pattern: "&#(x?)([0-9a-fA-F]+);") {
            for match in regex.matches(in: out, range: NSRange(out.startIndex..., in: out)).reversed() {
                guard let whole = Range(match.range, in: out), let digits = Range(match.range(at: 2), in: out) else { continue }
                let hex = match.range(at: 1).length > 0
                if let code = UInt32(out[digits], radix: hex ? 16 : 10), let scalar = Unicode.Scalar(code) {
                    out.replaceSubrange(whole, with: String(Character(scalar)))
                }
            }
        }
        return out.replacingOccurrences(of: "&amp;", with: "&")
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
private struct ReaderText: UIViewRepresentable {
    let title: String
    let byline: String
    let paragraphs: [Paragraphs.Paragraph]
    let marks: [String]
    let focus: String?
    let onMark: (MarkedSelection) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
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
        coordinator.onMark = onMark
        let built = build(context.environment.palette)
        coordinator.bodyStart = built.bodyStart
        if coordinator.rendered != built.signature {
            let offset = view.contentOffset
            view.attributedText = built.text
            if coordinator.rendered != nil { view.setContentOffset(offset, animated: false) }
            coordinator.rendered = built.signature
        }
        // Keep a readable measure on iPad.
        let side = max(20, (view.bounds.width - 680) / 2)
        if view.textContainerInset.left != side {
            view.textContainerInset = UIEdgeInsets(top: 24, left: side, bottom: 120, right: side)
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
        let serif = { (style: UIFont.TextStyle, weight: UIFont.Weight) -> UIFont in
            let base = UIFont.preferredFont(forTextStyle: style)
            let descriptor = base.fontDescriptor.withDesign(.serif)?.addingAttributes([.traits: [UIFontDescriptor.TraitKey.weight: weight]]) ?? base.fontDescriptor
            return UIFontMetrics(forTextStyle: style).scaledFont(for: UIFont(descriptor: descriptor, size: base.pointSize))
        }
        let ink = palette.text, muted = palette.subtle
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 6
        paragraph.paragraphSpacing = 14

        let text = NSMutableAttributedString()
        text.append(NSAttributedString(string: title + "\n", attributes: [.font: serif(.title1, .medium), .foregroundColor: ink, .paragraphStyle: paragraph]))
        if !byline.isEmpty {
            text.append(NSAttributedString(string: byline + "\n", attributes: [.font: UIFont.preferredFont(forTextStyle: .footnote), .foregroundColor: muted, .paragraphStyle: paragraph]))
        }
        text.append(NSAttributedString(string: "\n", attributes: [.font: UIFont.preferredFont(forTextStyle: .footnote)]))
        let bodyStart = text.length

        for (index, item) in paragraphs.enumerated() {
            let font = item.heading ? serif(.title3, .semibold) : serif(.body, .regular)
            text.append(NSAttributedString(string: item.text + (index == paragraphs.count - 1 ? "" : "\n"), attributes: [.font: font, .foregroundColor: ink, .paragraphStyle: paragraph]))
        }
        if paragraphs.isEmpty {
            text.append(NSAttributedString(string: "No readable text was saved for this page. Open the original from the share button.", attributes: [.font: serif(.body, .regular), .foregroundColor: muted]))
        }

        let whole = text.string as NSString
        let markColor = palette.thread.withAlphaComponent(0.22)
        for mark in marks where mark.count >= 3 {
            let range = whole.range(of: String(mark.prefix(300)), options: [], range: NSRange(location: bodyStart, length: whole.length - bodyStart))
            if range.location != NSNotFound { text.addAttribute(.backgroundColor, value: markColor, range: range) }
        }

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
        hasher.combine(title); hasher.combine(paragraphs); hasher.combine(marks); hasher.combine(focus); hasher.combine(palette.id)
        return (text, bodyStart, focusRange, hasher.finalize())
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var onMark: (MarkedSelection) -> Void = { _ in }
        var rendered: Int?
        var bodyStart = 0
        var focused = false

        func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
            let whole = textView.text as NSString
            let text = whole.substring(with: range).trimmingCharacters(in: .whitespacesAndNewlines)
            guard text.count >= 3, range.location >= bodyStart else { return UIMenu(children: suggestedActions) }
            let mark = UIAction(title: "Mark", image: UIImage(systemName: "highlighter")) { [weak self] _ in
                let before = whole.substring(with: NSRange(location: max(self?.bodyStart ?? 0, range.location - 30), length: min(30, range.location - (self?.bodyStart ?? 0))))
                let afterStart = range.location + range.length
                let after = whole.substring(with: NSRange(location: afterStart, length: min(30, whole.length - afterStart)))
                self?.onMark(MarkedSelection(text: text, prefix: before, suffix: after, offset: range.location - (self?.bodyStart ?? 0)))
                textView.selectedRange = NSRange(location: range.location, length: 0)
            }
            return UIMenu(children: [mark] + suggestedActions)
        }
    }
}
