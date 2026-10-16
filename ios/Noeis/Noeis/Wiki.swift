import SwiftUI

// MARK: Front page

/// What the reading built, and what changed since you last looked.
struct WikiFront: View {
    @Binding var selection: Route?
    @AppStorage("wiki.lastLooked") private var lastLooked = Date().addingTimeInterval(-7 * 86_400).timeIntervalSince1970
    @State private var query = ""
    @State private var dossiersOnly = false

    var body: some View {
        Loaded(load: load) { front, reload in
            List(selection: $selection) {
                if query.isEmpty && !dossiersOnly {
                    if let due = front.due { DueCard(due: due).listRowSeparator(.hidden) }
                    if let reading = front.argues { ArguesCard(reading: reading, onFiled: reload).listRowSeparator(.hidden) }
                    if !front.changes.isEmpty {
                        Section { ForEach(front.changes, id: \.self) { ChangeRow(change: $0) } } header: { Kicker("Since you looked") }
                    }
                }
                Section {
                    let pages = shown(front.pages)
                    ForEach(pages, id: \.id) { page in
                        NavigationLink(value: Route.wikiPage(page.id)) { WikiRow(page: page) }
                    }
                    if pages.isEmpty {
                        Text(query.isEmpty ? "No pages yet. Pages appear as Noeis builds them from what you save." : "No page matches “\(query)”.")
                            .font(.callout).foregroundStyle(Ink.muted)
                    }
                } header: {
                    Kicker(dossiersOnly ? "Dossiers" : "Pages")
                }
            }
            .listStyle(.plain)
            .refreshable { await reload() }
            .onDisappear { lastLooked = Date().timeIntervalSince1970 }
        }
        .searchable(text: $query, prompt: "Search the wiki")
        .navigationTitle("Wiki")
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
                        .buttonStyle(.borderedProminent)
                    Button("Not now") { withAnimation { dismissed = true } }.buttonStyle(.bordered)
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
                            withAnimation { dismissed = true }
                            await onFiled()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(writer.busy)
                    Button("Not now") { withAnimation { dismissed = true } }.buttonStyle(.bordered)
                }
            }
            .failureAlert(writer)
        }
    }
}

private struct ChangeRow: View {
    let change: JSON

    var body: some View {
        NavigationLink(value: Route.wikiPage(change["pageId"].text)) {
            VStack(alignment: .leading, spacing: 4) {
                Text(change["title"].text).font(.headline)
                Text(change["sentence"].text).font(.callout).foregroundStyle(Ink.muted)
                Text(byline).font(.caption).foregroundStyle(Ink.subtle)
            }
            .padding(.vertical, 4)
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
        VStack(alignment: .leading, spacing: 5) {
            Text(page["title"].text).font(.system(.headline, design: .serif))
            if !page.dek.isEmpty {
                Text(page.dek).font(.callout).foregroundStyle(Ink.muted).lineLimit(2)
            }
            HStack(spacing: 6) {
                if page.at("investmentDossier.version") != nil { Text("Dossier") }
                if page.at("aiState.candidateStatus").text.hasPrefix("awaiting_") { Text("Proposed change").foregroundStyle(Ink.thread) }
                if let at = page["updatedAt"]?.date { Text(at.shortDay) }
            }
            .font(.caption)
            .foregroundStyle(Ink.subtle)
        }
        .padding(.vertical, 6)
    }
}

// MARK: A page

struct WikiPageView: View {
    let id: String
    @State private var holding: String?

    var body: some View {
        Loaded(load: { () async throws -> (JSON, [JSON]) in
            async let page = NoeisAPI.shared.wikiPage(id)
            async let disagreements = (try? await NoeisAPI.shared.disagreements(pageId: id)) ?? []
            return (try await page, await disagreements)
        }) { loaded, reload in
            let (page, disagreements) = loaded
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text(page["title"].text).font(.masthead)
                    if let at = page["updatedAt"]?.date {
                        Text("Updated \(at.longDay) · \(page["sourceRefs"]?.array.count ?? 0) sources")
                            .font(.footnote).foregroundStyle(Ink.subtle)
                    }
                    DocumentView(doc: page["body"] ?? .null, sources: page["sourceRefs"]?.array ?? [])
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
        }
        .navigationBarTitleDisplayMode(.inline)
        .paper()
        .sheet(item: Binding(get: { holding.map(Prefill.init) }, set: { holding = $0?.text })) { prefill in
            HoldViewSheet(initial: prefill.text)
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
