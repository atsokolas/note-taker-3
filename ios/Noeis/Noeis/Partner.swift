import SwiftUI

/// The Partner, from wherever you are. The web's ⌘J: one Partner in every
/// room, told what you are looking at.
/// A view you hold, when the Partner is opened from it: a passage it read
/// can then be filed for or against the view, from the conversation.
struct Held: Hashable {
    let pageId: String
    let claim: String
}

struct PartnerToolbarItem: ToolbarContent {
    let context: JSON
    var holding: Held? = nil
    @State private var open = false

    var body: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Button { open = true } label: { Image(systemName: "bubble.left.and.text.bubble.right") }
                .accessibilityLabel("Ask the Partner")
                .keyboardShortcut("j", modifiers: .command)
                .sheet(isPresented: $open) { PartnerSheet(context: context, holding: holding) }
        }
    }
}

private struct Turn: Identifiable {
    var id = UUID()
    let mine: Bool
    var text: String
    var sources: [JSON] = []
    var proposed = false
    /// The source sentence the answer rests on, which can be filed.
    var offer: JSON?
}

struct PartnerSheet: View {
    let context: JSON
    /// A question already begun, such as one about a selected passage.
    var opening = ""
    var holding: Held? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var turns: [Turn] = []
    @State private var draft = ""
    @State private var threadId: String?
    @State private var thinking = false
    @State private var doing = ""
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
                        ForEach(turns) { turn in TurnView(turn: turn, holding: holding).id(turn.id) }
                        if thinking {
                            HStack(spacing: 8) {
                                ProgressView()
                                Text(doing.isEmpty ? "Reading your library…" : doing)
                                    .font(.callout).foregroundStyle(Ink.muted)
                                    .contentTransition(.opacity)
                                    .id(doing)
                                    .transition(.opacity)
                            }
                            .calmAnimation(.easeOut(duration: 0.2), value: doing)
                            .id("thinking")
                        }
                        if let failure { Text(failure).font(.callout).foregroundStyle(Ink.danger) }
                    }
                    .padding(20)
                    .column()
                }
                .scrollDismissesKeyboard(.interactively)
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
        .onAppear {
            if draft.isEmpty { draft = opening }
            focused = true
        }
    }

    private var subject: String {
        let title = context["title"].text
        return context["type"].text == "workspace" || title.isEmpty ? "your reading" : "“\(title)”"
    }

    private func send() {
        let message = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !thinking else { return }
        draft = ""
        focused = false
        failure = nil
        thinking = true
        doing = ""
        // The conversation so far travels with the question, as the web sends it.
        let history: [JSON] = turns.suffix(6).map { ["role": .string($0.mine ? "user" : "assistant"), "text": .string(String($0.text.prefix(1200)))] }
        turns.append(Turn(mine: true, text: message))
        Task {
            defer { thinking = false }
            var answer: Int?
            do {
                let reply = try await NoeisAPI.shared.streamAsk(message, threadId: threadId, context: context, history: history,
                    onActivity: { doing = $0 },
                    onDelta: { piece in
                        if let answer { turns[answer].text += piece } else {
                            turns.append(Turn(mine: false, text: piece))
                            answer = turns.count - 1
                        }
                    })
                threadId = reply.at("thread.threadId")?.string ?? reply.at("thread._id")?.string ?? threadId
                // What it read: the passages behind the answer, then anything it cited by name.
                var seen = Set<String>()
                let sources = ((reply["relatedItems"]?.array ?? []) + (reply["citations"]?.array ?? []))
                    .filter { !$0["title"].text.isEmpty && seen.insert("\($0["type"].text):\($0["id"]?.string ?? $0["title"].text)").inserted }
                // As on the web: only a saved source's own sentence can be written down.
                let offer = (reply["relatedItems"]?.array ?? []).first { $0["type"].text == "article" && !$0.id.isEmpty && !$0["snippet"].text.isEmpty }
                let finished = Turn(mine: false, text: reply["reply"]?.string ?? "No answer came back.", sources: Array(sources.prefix(4)),
                                    proposed: reply["proposalBundle"] != nil && reply["proposalBundle"] != .null, offer: offer)
                if let answer { turns[answer] = finished } else { turns.append(finished) }
            } catch {
                failure = error.localizedDescription
            }
        }
    }
}

private struct TurnView: View {
    let turn: Turn
    let holding: Held?

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
                        Kicker("What it read")
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
                if let holding, let offer = turn.offer { FileOffer(holding: holding, source: offer) }
                if turn.proposed {
                    Link("The Partner suggested changes. Review them on noeis.io", destination: NoeisAPI.shared.site)
                        .font(.footnote)
                }
            }
        }
    }
}

/// Click to confirm: the sentence the answer rests on, filed for or against
/// the view only when you say so.
private struct FileOffer: View {
    let holding: Held
    let source: JSON
    @State private var filed: String?
    @StateObject private var writer = Writer()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Passage(text: source["snippet"].text, source: source["title"].text)
            if let filed {
                Text(filed).font(.footnote).foregroundStyle(Ink.living).transition(.opacity)
            } else {
                HStack(spacing: 10) {
                    // Neither is the default: which way it cuts is yours to say.
                    Button("File for") { file("why") }
                    Button("File against") { file("against") }
                }
                .buttonStyle(.bordered)
                .disabled(writer.busy)
            }
        }
        .failureAlert(writer)
    }

    private func file(_ field: String) {
        writer.run {
            _ = try await NoeisAPI.shared.file(pageId: holding.pageId, claim: holding.claim, field: field,
                                               candidate: ["articleId": .string(source.id), "text": source["snippet"] ?? .null])
            calmly { filed = field == "why" ? "Filed for your view." : "Filed against your view." }
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
