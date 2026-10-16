import SwiftUI

/// The Partner, from wherever you are. The web's ⌘J: one Partner in every
/// room, told what you are looking at.
struct PartnerToolbarItem: ToolbarContent {
    let context: JSON
    @State private var open = false

    var body: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Button { open = true } label: { Image(systemName: "bubble.left.and.text.bubble.right") }
                .accessibilityLabel("Ask the Partner")
                .keyboardShortcut("j", modifiers: .command)
                .sheet(isPresented: $open) { PartnerSheet(context: context) }
        }
    }
}

private struct Turn: Identifiable {
    let id = UUID()
    let mine: Bool
    let text: String
    var sources: [JSON] = []
    var proposed = false
}

struct PartnerSheet: View {
    let context: JSON
    @Environment(\.dismiss) private var dismiss
    @State private var turns: [Turn] = []
    @State private var draft = ""
    @State private var threadId: String?
    @State private var thinking = false
    @State private var failure: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            ScrollViewReader { scroller in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        if turns.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Ask about \(subject)").font(.headline2)
                                Text("Answers come from what you have saved and written, with the passages they rest on. When your library has nothing on it, the Partner says so.")
                                    .font(.callout).foregroundStyle(Ink.muted)
                            }
                            .padding(.top, 8)
                        }
                        ForEach(turns) { turn in TurnView(turn: turn).id(turn.id) }
                        if thinking {
                            HStack(spacing: 8) { ProgressView(); Text("Reading your library…").font(.callout).foregroundStyle(Ink.muted) }
                                .id("thinking")
                        }
                        if let failure { Text(failure).font(.callout).foregroundStyle(Ink.danger) }
                    }
                    .padding(20)
                    .column()
                }
                .onChange(of: turns.count) { if let last = turns.last { calmly { scroller.scrollTo(last.id, anchor: .bottom) } } }
                .onChange(of: thinking) { if thinking { calmly { scroller.scrollTo("thinking", anchor: .bottom) } } }
            }
            .safeAreaInset(edge: .bottom) {
                HStack(alignment: .bottom, spacing: 10) {
                    TextField("Ask", text: $draft, axis: .vertical)
                        .lineLimit(1...5)
                        .focused($focused)
                        .submitLabel(.send)
                        .onSubmit(send)
                        .textFieldStyle(PaperFieldStyle())
                    Button(action: send) { Image(systemName: "arrow.up.circle.fill").font(.title) }
                        .disabled(thinking || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityLabel("Send")
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(.bar)
            }
            .paper()
            .navigationTitle("Partner")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            .navigationDestination(for: Route.self) { RouteView(route: $0) }
        }
        .onAppear { focused = true }
    }

    private var subject: String {
        let title = context["title"].text
        return context["type"].text == "workspace" || title.isEmpty ? "your reading" : "“\(title)”"
    }

    private func send() {
        let message = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !thinking else { return }
        draft = ""
        failure = nil
        turns.append(Turn(mine: true, text: message))
        thinking = true
        Task {
            defer { thinking = false }
            do {
                let reply = try await NoeisAPI.shared.ask(message, threadId: threadId, context: context)
                threadId = reply.at("thread.threadId")?.string ?? reply.at("thread._id")?.string ?? threadId
                turns.append(Turn(
                    mine: false,
                    text: reply["reply"]?.string ?? "No answer came back.",
                    sources: reply["citations"]?.array ?? [],
                    proposed: reply["proposalBundle"] != nil && reply["proposalBundle"] != .null
                ))
            } catch {
                failure = error.localizedDescription
            }
        }
    }
}

private struct TurnView: View {
    let turn: Turn

    var body: some View {
        if turn.mine {
            Text(turn.text)
                .font(.body)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Ink.paperMuted, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .frame(maxWidth: .infinity, alignment: .trailing)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Text(.init(turn.text)).font(.reading).lineSpacing(4).textSelection(.enabled)
                if !turn.sources.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Kicker("From your library")
                        ForEach(Array(turn.sources.enumerated()), id: \.offset) { _, source in
                            if let route = source.citationRoute {
                                NavigationLink(value: route) { Label(source["title"].text.isEmpty ? "Source" : source["title"].text, systemImage: source.citationSymbol) }
                                    .font(.subheadline)
                            } else {
                                Label(source["title"].text, systemImage: source.citationSymbol).font(.subheadline).foregroundStyle(Ink.muted)
                            }
                        }
                    }
                }
                if turn.proposed {
                    Link("The Partner suggested changes. Review them on noeis.io", destination: NoeisAPI.shared.site)
                        .font(.footnote)
                }
            }
        }
    }
}

private extension JSON {
    /// `groundedIn` entries are `{type, id, title}`.
    var citationRoute: Route? {
        guard let id = self["id"]?.string else { return nil }
        switch self["type"].text {
        case "article": return .article(id)
        case "highlight": return self["articleId"]?.string.map { .article($0, passage: self["text"]?.string) }
        case "notebook", "note": return .note(id)
        case "wiki_page", "wiki": return .wikiPage(id)
        default: return nil
        }
    }

    var citationSymbol: String {
        switch self["type"].text {
        case "article", "highlight": return "doc.text"
        case "notebook", "note": return "square.and.pencil"
        default: return "text.book.closed"
        }
    }
}
