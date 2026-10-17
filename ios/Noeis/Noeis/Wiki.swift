import SwiftUI

// MARK: Front page

/// What the reading built, and what changed since you last looked.
struct WikiFront: View {
    @AppStorage("wiki.lastLooked") private var lastLooked = Date().addingTimeInterval(-7 * 86_400).timeIntervalSince1970
    @State private var query = ""
    @State private var dossiersOnly = false

    var body: some View {
        Loaded(load: load) { front, reload in
            let pages = shown(front.pages)
            RoomIndex {
                if query.isEmpty && !dossiersOnly {
                    NewPageField()
                    if let due = front.due { DueCard(due: due).padding(.top, 12) }
                    if let reading = front.argues { ArguesCard(reading: reading, onFiled: reload).padding(.top, 12) }
                    if !front.changes.isEmpty {
                        IndexHeading("Since you looked")
                        ForEach(front.changes, id: \.self) { ChangeRow(change: $0) }
                    }
                }
                IndexHeading(pages.count == 1 ? "1 page" : "\(pages.count) \(dossiersOnly ? "dossiers" : "pages")")
                ForEach(pages, id: \.id) { page in
                    RouteRow(route: .wikiPage(page.id)) { WikiRow(page: page) }
                }
                if pages.isEmpty {
                    Quiet(query.isEmpty ? "No pages yet. Pages appear as Noeis builds them from what you save." : "No page matches “\(query)”.")
                }
            }
            .refreshable { await reload() }
            .onDisappear { lastLooked = Date().timeIntervalSince1970 }
        }
        .searchable(text: $query, prompt: "Search the wiki")
        .roomTitle("Wiki")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    Picker("Show", selection: $dossiersOnly) {
                        Text("All pages").tag(false)
                        Text("Dossiers").tag(true)
                    }
                } label: { Image(systemName: "line.3.horizontal.decrease.circle") }
                    .accessibilityLabel("Filter pages")
            }
            PartnerToolbarItem(context: ["type": "workspace", "id": "library", "title": "Wiki"])
        }
        .paper()
    }

    private struct Front {
        var due: JSON?
        var argues: JSON?
        var changes: [JSON]
        var pages: [JSON]
    }

    private func load() async throws -> Front {
        let api = NoeisAPI.shared
        async let pages = api.wikiPages()
        async let due = try? api.dueView()
        async let argues = try? api.pushesAgainst()
        async let changes = try? api.wikiChanges(since: Date(timeIntervalSince1970: lastLooked))
        return Front(
            due: await due ?? nil,
            argues: await argues ?? nil,
            changes: (await changes)?["changes"]?.array ?? [],
            pages: (try await pages).filter { !$0.isHeldView }
        )
    }

    private func shown(_ pages: [JSON]) -> [JSON] {
        pages.filter { page in
            (!dossiersOnly || page.at("investmentDossier.version") != nil)
                && (query.isEmpty || page["title"].text.localizedCaseInsensitiveContains(query) || page["plainText"].text.localizedCaseInsensitiveContains(query))
        }
    }
}

extension JSON {
    /// A view held from Judgment is stored as a wiki page but lives in Judgment
    /// (wikiFacetModel.js `isHeldView`).
    var isHeldView: Bool {
        !at("judgment.currentJudgment").text.isEmpty && at("judgment.kind") == nil
            && at("investmentDossier.version") == nil && self["pageType"].text != "repo" && at("externalWatches.githubRepo.repo") == nil
    }

    var dek: String {
        let text = self["plainText"].text.isEmpty ? self["summary"].text : self["plainText"].text
        return String(text.prefix(180))
    }
}

/// The web's "+ New page", as the first line of the room: name a topic and
/// Noeis drafts it from your library while you watch, or open a living thesis
/// that asks a question and leaves the conclusions to you.
private struct NewPageField: View {
    @State private var topic = ""
    @State private var question = ""
    @State private var thesis = false
    @StateObject private var writer = Writer()
    @FocusState private var focused: Bool
    @Environment(\.open) private var open

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField(thesis ? "What are you trying to decide?" : "What should a page be about?", text: $topic, axis: .vertical)
                .font(.system(.title2, design: .serif))
                .lineLimit(1...3)
                .focused($focused)
                .submitLabel(thesis ? .next : .go)
                .onSubmit { if !thesis { create() } }
                .padding(.vertical, 12)
                .overlay(alignment: .bottom) { Hairline(color: focused ? Ink.text : Ink.rule) }
            if thesis {
                TextField("The question it answers", text: $question, axis: .vertical)
                    .font(.dek)
                    .lineLimit(1...3)
                    .padding(.vertical, 8)
                    .overlay(alignment: .bottom) { Hairline() }
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
            HStack(spacing: 14) {
                ForEach([false, true], id: \.self) { each in
                    Button(each ? "Living thesis" : "Page") { calmly(.easeOut(duration: 0.18)) { thesis = each } }
                        .font(.footnote)
                        .foregroundStyle(thesis == each ? Ink.text : Ink.subtle)
                        .underline(thesis == each, color: Color.accentColor)
                        .buttonStyle(QuietPress())
                }
                Spacer()
                if ready {
                    Button(thesis ? "Open" : "Build", action: create)
                        .buttonStyle(.ink)
                        .disabled(writer.busy)
                        .transition(.opacity)
                }
            }
        }
        .padding(.vertical, 8)
        .calmAnimation(.easeOut(duration: 0.18), value: ready)
        .failureAlert(writer)
    }

    private var ready: Bool {
        !clean(topic).isEmpty && (!thesis || !clean(question).isEmpty)
    }

    private func clean(_ text: String) -> String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func create() {
        guard ready else { return }
        writer.run {
            let page = try await NoeisAPI.shared.createWikiPage(clean(topic), question: thesis ? clean(question) : nil)
            focused = false
            topic = ""
            question = ""
            open(.wikiPage(page.id, build: !thesis))
        }
    }
}

/// "You said you would know by …": a view whose check-by date has come.
private struct DueCard: View {
    let due: JSON
    @State private var dismissed = false

    var body: some View {
        if !dismissed {
            Card {
                Kicker("Comes due")
                Text("You said you would know by \(due["by"]?.date?.longDay ?? "now") whether \(due["view"].text.lowercasedFirst)")
                    .font(.readingLarge)
                if !due["test"].text.isEmpty { Passage(text: due["test"].text) }
                HStack {
                    NavigationLink(value: Route.view(due["pageId"].text)) { Text("Did it hold up?").fontWeight(.semibold) }
                        .buttonStyle(.ink)
                    Button("Not now") { calmly { dismissed = true } }.buttonStyle(.bordered)
                }
            }
        }
    }
}

/// The newest saved reading that pushes against something you hold.
private struct ArguesCard: View {
    let reading: JSON
    let onFiled: () async -> Void
    @StateObject private var writer = Writer()
    @State private var dismissed = false

    var body: some View {
        if !dismissed {
            let proposal = reading["proposal"] ?? .null
            let author = proposal.at("provenance.author").text.isEmpty ? proposal["sourceLabel"].text : proposal.at("provenance.author").text
            Card {
                Kicker("Argues with you")
                Text("\(author.isEmpty ? "Something you saved" : author) pushes against your view that \(reading["view"].text.lowercasedFirst)")
                    .font(.readingLarge)
                Passage(text: proposal.at("provenance.after").text, source: proposal["sourceLabel"].text)
                HStack {
                    Button("File against") {
                        writer.run {
                            _ = try await NoeisAPI.shared.file(pageId: reading["pageId"].text, claim: reading["view"].text, field: "against", proposalId: proposal.id)
                            calmly { dismissed = true }
                            await onFiled()
                        }
                    }
                    .buttonStyle(.ink)
                    .disabled(writer.busy)
                    Button("Not now") { calmly { dismissed = true } }.buttonStyle(.bordered)
                }
            }
            .failureAlert(writer)
        }
    }
}

private struct ChangeRow: View {
    let change: JSON

    var body: some View {
        RouteRow(route: .wikiPage(change["pageId"].text)) {
            VStack(alignment: .leading, spacing: 5) {
                Text(change["title"].text).font(.rowTitle)
                Text(change["sentence"].text).font(.dek).foregroundStyle(Ink.muted)
                Text(byline).font(.meta).foregroundStyle(Ink.subtle)
            }
            .padding(.vertical, 18)
        }
    }

    private var byline: String {
        let who: String
        if let source = change.at("changeSource.title")?.string { who = "When you saved \(source)" }
        else { who = change["by"].text == "you" ? "By you" : "By Noeis" }
        return [who, change["at"]?.date?.shortDay].compactMap { $0 }.joined(separator: " · ")
    }
}

private struct WikiRow: View {
    let page: JSON

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(page["title"].text).font(.rowTitle)
            if !page.dek.isEmpty {
                Text(page.dek).font(.dek).foregroundStyle(Ink.muted).lineLimit(2)
            }
            HStack(spacing: 6) {
                if page.at("investmentDossier.version") != nil { Text("Dossier") }
                if page.at("aiState.candidateStatus").text.hasPrefix("awaiting_") { Text("Proposed change").foregroundStyle(Ink.thread) }
                if let at = page["updatedAt"]?.date { Text(at.shortDay) }
            }
            .font(.meta)
            .foregroundStyle(Ink.subtle)
        }
        .padding(.vertical, 20)
    }
}

// MARK: A page

struct WikiPageView: View {
    let id: String
    var build = false
    @State private var holding: String?
    @State private var drafting: Drafting?

    /// A page being drafted while you watch: the latest words, and how it ended.
    private struct Drafting { var page: JSON?; var ended: String? }

    var body: some View {
        Loaded(load: { () async throws -> (JSON, [JSON]) in
            async let page = NoeisAPI.shared.wikiPage(id)
            async let disagreements = (try? await NoeisAPI.shared.disagreements(pageId: id)) ?? []
            return (try await page, await disagreements)
        }) { loaded, reload in
            let (saved, disagreements) = loaded
            let page = drafting?.page ?? saved
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text(page["title"].text).font(.masthead)
                    if let drafting {
                        DraftingLine(ended: drafting.ended)
                    } else if let at = page["updatedAt"]?.date {
                        Text("Updated \(at.longDay) · \(page["sourceRefs"]?.array.count ?? 0) sources")
                            .font(.footnote).foregroundStyle(Ink.subtle)
                    }
                    if drafting == nil, page.at("aiState.candidateStatus").text.hasPrefix("awaiting_"), page.at("investmentDossier.version") == nil {
                        ProposedChange(pageId: id) { await reload() }
                    }
                    DocumentView(doc: page["body"] ?? .null, sources: page["sourceRefs"]?.array ?? [])
                        .calmAnimation(.easeOut(duration: 0.3), value: page["body"])
                    ForEach(disagreements, id: \.self) { item in
                        DisagreementCard(item: item) { holding = $0 }
                    }
                    References(sources: page["sourceRefs"]?.array ?? [])
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
                .column()
            }
            .refreshable { await reload() }
            .toolbar { PartnerToolbarItem(context: ["type": "wiki_page", "id": .string(id), "pageId": .string(id), "title": page["title"] ?? ""]) }
            .task(id: build) {
                guard build, drafting == nil else { return }
                await draft(then: reload)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .paper()
        .sheet(item: Binding(get: { holding.map(Prefill.init) }, set: { holding = $0?.text })) { prefill in
            HoldViewSheet(initial: prefill.text)
        }
    }

    /// Drafts the page from its sources, filling it in as the words arrive,
    /// and says in one line how it ended.
    private func draft(then reload: () async -> Void) async {
        calmly { drafting = Drafting() }
        do {
            let done = try await NoeisAPI.shared.buildWikiPage(id) { page in drafting?.page = page }
            await reload()
            if done["ok"] == false {
                calmly { drafting?.ended = done.at("page.aiState.lastError")?.string ?? "This draft did not pass the check against your sources, so the page was left as it was." }
            } else if done["code"].text == "WIKI_FIRST_HEAD_AWAITING_ACCEPTANCE" {
                calmly { drafting = nil }
            } else {
                calmly { drafting?.ended = "Drafted from your library." }
                try? await Task.sleep(for: .seconds(3))
                calmly { drafting = nil }
            }
        } catch is CancellationError {
        } catch {
            calmly { drafting?.ended = error.localizedDescription }
        }
    }
}

/// While a page is drafted: what is happening, then how it ended.
private struct DraftingLine: View {
    let ended: String?

    var body: some View {
        HStack(spacing: 10) {
            if ended == nil { ProgressView().controlSize(.small) }
            Text(ended ?? "Drafting from your library. The page fills in as it is written.")
                .font(.footnote)
                .foregroundStyle(ended == nil ? Ink.muted : Ink.text)
                .contentTransition(.opacity)
        }
        .transition(.opacity)
    }
}

/// The web's proposal strip: a revision Noeis drafted, private until you take
/// it. Read it in place, then accept it or keep the page as it is.
private struct ProposedChange: View {
    let pageId: String
    let decided: () async -> Void
    @State private var candidate: JSON?
    @State private var reading = false
    @StateObject private var writer = Writer()

    var body: some View {
        Card {
            Kicker("Proposed change", color: Ink.thread)
            Text(summary).font(.readingLarge)
            if reading, let proposed = candidate?["candidate"] {
                Text("You are reading the proposed change. The page itself is unchanged.")
                    .font(.footnote).foregroundStyle(Ink.subtle)
                DocumentView(doc: proposed["body"] ?? .null, sources: proposed["sourceRefs"]?.array ?? [])
                    .transition(.opacity)
            }
            HStack {
                Button("Accept") { decide(accept: true) }
                    .buttonStyle(.ink)
                Button("Keep this version") { decide(accept: false) }
                    .buttonStyle(.bordered)
                Spacer()
                if candidate?["candidate"] != nil {
                    Button(reading ? "Close" : "Read it") { calmly { reading.toggle() } }
                        .buttonStyle(QuietPress())
                        .font(.subheadline)
                }
            }
            .disabled(writer.busy)
        }
        .failureAlert(writer)
        .task { candidate = try? await NoeisAPI.shared.proposedChange(pageId: pageId) }
    }

    private var summary: String {
        let reason = candidate?.at("summary.reason").text ?? ""
        return reason.isEmpty ? "The Partner proposes a change to this page." : reason
    }

    private func decide(accept: Bool) {
        writer.run {
            try await NoeisAPI.shared.reviewProposedChange(pageId: pageId, accept: accept)
            await decided()
        }
    }
}

struct Prefill: Identifiable {
    let text: String
    var id: String { text }
}

/// "This page says X. Y argues otherwise." Then the question the web asks.
private struct DisagreementCard: View {
    let item: JSON
    let hold: (String) -> Void

    var body: some View {
        let against = item["contradicting"]?.array.first ?? .null
        Card {
            Kicker("Your reading disagrees")
            Text("This page says “\(item["claimText"].text)”").font(.reading)
            if !against["quote"].text.isEmpty {
                Passage(text: against["quote"].text, source: "\(against["title"].text) argues otherwise")
            } else if !against["title"].text.isEmpty {
                Text("\(against["title"].text) argues otherwise.").font(.callout).foregroundStyle(Ink.muted)
            }
            Button("Which do you believe?") { hold(item["claimText"].text) }
                .buttonStyle(.bordered)
        }
    }
}

private struct References: View {
    let sources: [JSON]

    var body: some View {
        if !sources.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Divider().overlay(Ink.rule)
                Kicker("References")
                ForEach(Array(sources.enumerated()), id: \.offset) { index, source in
                    SourceLink(source: source) {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text("\(index + 1)").font(.footnote.monospacedDigit()).foregroundStyle(Ink.subtle).frame(minWidth: 18, alignment: .trailing)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(source["title"].text.isEmpty ? source["citationLabel"].text : source["title"].text)
                                    .font(.callout).foregroundStyle(Ink.text).multilineTextAlignment(.leading)
                                if let host = source["url"]?.string.flatMap(URL.init(string:))?.host() {
                                    Text(host).font(.caption).foregroundStyle(Ink.subtle)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Opens a cited source where it lives: your saved copy first, the public page otherwise.
struct SourceLink<Label: View>: View {
    let source: JSON
    @ViewBuilder let label: Label

    var body: some View {
        if let route = source.route {
            NavigationLink(value: route) { label }.buttonStyle(.plain)
        } else if let url = source["url"]?.string.flatMap(URL.init(string:)) {
            Link(destination: url) { label }.buttonStyle(.plain)
        } else {
            label
        }
    }
}

extension JSON {
    /// Where a `sourceRefs` entry opens inside the app (sourceRoutes.js).
    var route: Route? {
        switch self["type"].text {
        case "article": return self["objectId"]?.string.map { Route.article($0, passage: self["snippet"]?.string) }
        case "highlight": return self["parentObjectId"]?.string.map { Route.article($0, passage: self["snippet"]?.string) }
        case "notebook": return self["objectId"]?.string.map(Route.note)
        default: return nil
        }
    }
}
