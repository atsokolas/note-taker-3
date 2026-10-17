import SwiftUI

/// Renders a wiki page body (TipTap JSON) the way the web reader does
/// (renderTiptapDoc.jsx): headings, paragraphs, lists, pull quotes, links to
/// other pages, and claims with their numbered citations.
struct DocumentView: View {
    let doc: JSON
    let sources: [JSON]
    @State private var pushed: Route?
    @Environment(\.openURL) private var systemOpenURL

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array((doc["content"]?.array ?? []).enumerated()), id: \.offset) { _, node in
                BlockView(node: node)
            }
        }
        .environment(\.openURL, OpenURLAction(handler: open))
        .navigationDestination(item: $pushed) { RouteView(route: $0) }
    }

    private func open(_ url: URL) -> OpenURLAction.Result {
        switch url.scheme {
        case "noeis-wiki":
            pushed = .wikiPage(url.host() ?? "")
            return .handled
        case "noeis-cite":
            let index = (Int(url.host() ?? "") ?? 0) - 1
            guard sources.indices.contains(index) else { return .discarded }
            let source = sources[index]
            if let route = source.route {
                pushed = route
                return .handled
            }
            if let link = source["url"]?.string.flatMap(URL.init(string:)) { systemOpenURL(link) }
            return .handled
        default:
            return .systemAction(url)
        }
    }
}

private struct BlockView: View {
    let node: JSON

    var body: some View {
        let children = node["content"]?.array ?? []
        switch node["type"].text {
        case "heading":
            Text(Inline.render(children))
                .font((node.at("attrs.level")?.int ?? 2) <= 2 ? .headline2 : .system(.headline, design: .serif))
                .padding(.top, 8)
        case "paragraph":
            if !children.isEmpty {
                Text(Inline.render(children)).font(.reading).lineSpacing(5)
            }
        case "bulletList", "orderedList":
            let ordered = node["type"].text == "orderedList"
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(children.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(ordered ? "\(index + 1)." : "•").font(.reading).foregroundStyle(Ink.subtle)
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(Array((item["content"]?.array ?? []).enumerated()), id: \.offset) { _, child in
                                AnyView(BlockView(node: child))
                            }
                        }
                    }
                }
            }
        case "pullquote", "blockquote":
            Passage(text: Inline.plain(children), source: node.at("attrs.attribution").text.isEmpty ? node.at("attrs.cite").text : node.at("attrs.attribution").text)
        case "horizontalRule":
            Divider().overlay(Ink.rule)
        default:
            if !children.isEmpty {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(Array(children.enumerated()), id: \.offset) { _, child in AnyView(BlockView(node: child)) }
                }
            }
        }
    }
}

enum Inline {
    static func render(_ nodes: [JSON]) -> AttributedString {
        var out = AttributedString()
        var claim: (id: String, citations: [Int])?

        func closeClaim() {
            if let citations = claim?.citations, let first = citations.first {
                var marker = AttributedString("\u{2009}[\(citations.map(String.init).joined(separator: ","))]")
                marker.font = .caption
                marker.foregroundColor = Ink.thread
                marker.link = URL(string: "noeis-cite://\(first)")
                out += marker
            }
            claim = nil
        }

        for node in nodes {
            if node["type"].text == "hardBreak" { out += AttributedString("\n"); continue }
            let marks = node["marks"]?.array ?? []
            var run = AttributedString(node["text"]?.raw ?? "")
            var intent: InlinePresentationIntent = []
            for mark in marks {
                let attrs = mark["attrs"] ?? .null
                switch mark["type"].text {
                case "bold", "strong": intent.insert(.stronglyEmphasized)
                case "italic", "em": intent.insert(.emphasized)
                case "link": run.link = attrs["href"]?.string.flatMap(URL.init(string:))
                case "wikiLink":
                    if let id = attrs["pageId"]?.string { run.link = URL(string: "noeis-wiki://\(id)") }
                default: break
                }
            }
            if !intent.isEmpty { run.inlinePresentationIntent = intent }

            let claimMark = marks.first { $0["type"].text == "claim" }
            let claimId = claimMark?.at("attrs.claimId").text
            if claim?.id != claimId { closeClaim() }
            if let claimMark, claim == nil {
                claim = (claimId ?? "", (claimMark.at("attrs.citationIndexes")?.array ?? []).compactMap(\.int))
            }
            out += run
        }
        closeClaim()
        return out
    }

    static func plain(_ nodes: [JSON]) -> String {
        nodes.map { node in node["text"]?.raw ?? plain(node["content"]?.array ?? []) }.joined()
    }
}
