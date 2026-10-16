import SwiftUI

// MARK: The stand

/// Every paper the agents you connect file for you, each issue newest first,
/// led by the one finding with the most a reader can check.
struct EditionsFront: View {
    @Binding var selection: Route?

    var body: some View {
        Loaded(load: Stand.load) { stand, reload in
            List(selection: $selection) {
                if let lead = stand.lead {
                    LeadStory(story: lead).listRowSeparator(.hidden)
                }
                ForEach(stand.papers, id: \.title) { paper in
                    Section {
                        ForEach(paper.issues, id: \.id) { issue in
                            NavigationLink(value: Route.edition(issue.id)) { IssueRow(issue: issue) }
                        }
                    } header: {
                        Kicker(paper.title)
                    }
                }
            }
            .listStyle(.plain)
            .overlay {
                if stand.papers.isEmpty {
                    ContentUnavailableView("No paper yet", systemImage: "newspaper", description: Text(
                        "A paper is a short weekly issue that an agent you connect, such as Claude Code or Codex, files for you: what it found, each finding with its source and how sure to be. Connect one from Connections on noeis.io."
                    ))
                }
            }
            .refreshable { await reload() }
        }
        .navigationTitle("Editions")
        .paper()
    }
}

private struct Stand {
    struct Paper { let title: String; let issues: [JSON] }
    struct Story { let paper: String; let issue: String; let item: JSON }

    var papers: [Paper]
    var lead: Story?

    /// The papers in the order the server sends their newest issue. The lead
    /// is read from each paper's newest issue (editionModel.js `frontPage`).
    static func load() async throws -> Stand {
        let editions = try await NoeisAPI.shared.editions()
        var order: [String] = []
        var issues: [String: [JSON]] = [:]
        for edition in editions {
            let profile = edition["profile"].text
            if issues[profile] == nil { order.append(profile) }
            issues[profile, default: []].append(edition)
        }
        let papers = order.map { Paper(title: issues[$0]?.first?["profileLabel"].text ?? $0, issues: issues[$0] ?? []) }
        let newest = await withTaskGroup(of: (String, JSON)?.self) { group in
            for paper in papers.prefix(4) {
                guard let id = paper.issues.first?.id else { continue }
                group.addTask { (try? await NoeisAPI.shared.edition(id)).map { (paper.title, $0) } }
            }
            return await group.reduce(into: [(String, JSON)]()) { if let row = $1 { $0.append(row) } }
        }
        return Stand(papers: papers, lead: lead(of: newest))
    }

    /// Eligibility: findings in a paper's newest issue that you have not set
    /// aside. Quality: the most you can check (a passage found in its source,
    /// figures, stated confidence, a plain line), newest on a tie. Silence:
    /// nothing filed, no lead; nothing is promoted to fill the space.
    private static func lead(of issues: [(String, JSON)]) -> Story? {
        issues
            .flatMap { paper, issue in (issue["items"]?.array ?? []).map { Story(paper: paper, issue: issue.id, item: $0) } }
            .filter { $0.item["readerStatus"].text != "dismissed" }
            .max { ($0.item.leadWeight, $0.item["filedAt"]?.date ?? .distantPast) < ($1.item.leadWeight, $1.item["filedAt"]?.date ?? .distantPast) }
    }
}

private struct LeadStory: View {
    let story: Stand.Story

    var body: some View {
        NavigationLink(value: Route.edition(story.issue, item: story.item["itemId"].text)) {
            VStack(alignment: .leading, spacing: 10) {
                Kicker("\(story.paper) · lead story", color: Ink.thread)
                Text(story.item.heading).font(.headline2).foregroundStyle(Ink.text)
                Figures(figures: story.item["figures"]?.array ?? [])
                Text(story.item["finding"].text).font(.reading).foregroundStyle(Ink.muted).lineLimit(4)
                if !story.item.sourceNote.isEmpty {
                    Text(story.item.sourceNote).font(.caption).foregroundStyle(Ink.subtle)
                }
            }
            .padding(.vertical, 10)
        }
    }
}

private struct IssueRow: View {
    let issue: JSON

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(issue.dateline).font(.caption).foregroundStyle(Ink.subtle)
            Text(issue["headline"]?.string ?? issue["profileLabel"].text)
                .font(.system(.headline, design: .serif))
                .lineLimit(3)
            if !issue["standfirst"].text.isEmpty {
                Text(issue["standfirst"].text).font(.callout).foregroundStyle(Ink.muted).lineLimit(2)
            }
            HStack(spacing: 6) {
                let count = issue["itemCount"]?.int ?? 0
                Text(count == 1 ? "1 finding" : "\(count) findings")
                if let fresh = issue["newCount"]?.int, fresh > 0 { Text("· \(fresh) new").foregroundStyle(Ink.accent) }
                if let kept = issue["savedCount"]?.int, kept > 0 { Text("· you kept \(kept)") }
            }
            .font(.caption)
            .foregroundStyle(Ink.subtle)
        }
        .padding(.vertical, 6)
    }
}

// MARK: An issue

/// An issue read the way the web reads it: the headline and what it costs to
/// read, the findings in short, then each finding led by what it means, and a
/// closing line that says what you took.
struct IssueView: View {
    let id: String
    let focus: String?

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.edition(id) }) { edition, reload in
            IssuePage(loaded: edition, focus: focus).refreshable { await reload() }
        }
        .navigationBarTitleDisplayMode(.inline)
        .paper()
    }
}

private struct IssuePage: View {
    let loaded: JSON
    let focus: String?
    @State private var edition: JSON?

    var body: some View {
        let edition = self.edition ?? loaded
        let columns = edition.columns
        let items = columns.flatMap { column in column.items.map { (item: $0, section: column.label) } }
        let quiet = columns.filter { !$0.label.isEmpty && $0.items.isEmpty }
        let kept = items.filter { $0.item["savedArticleId"]?.string != nil }.count
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 30) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(edition.dateline).font(.footnote).foregroundStyle(Ink.subtle)
                        Text(edition["headline"]?.string ?? edition["profileLabel"].text).font(.masthead)
                        if !edition["standfirst"].text.isEmpty {
                            Text(edition["standfirst"].text).font(.readingLarge).foregroundStyle(Ink.muted)
                        }
                        if !items.isEmpty {
                            Text(costLine(items.map { $0.item })).font(.footnote).foregroundStyle(Ink.subtle)
                        }
                    }

                    if !items.isEmpty || !quiet.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Kicker("In short")
                            ForEach(Array(items.enumerated()), id: \.offset) { index, row in
                                Button {
                                    calmly { proxy.scrollTo(row.item["itemId"].text, anchor: .top) }
                                } label: {
                                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                                        Text(String(format: "%02d", index + 1)).font(.footnote.monospacedDigit()).foregroundStyle(Ink.subtle)
                                        Text(row.item.heading).font(.reading).foregroundStyle(Ink.text).multilineTextAlignment(.leading)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                            ForEach(quiet, id: \.key) { column in
                                HStack(alignment: .firstTextBaseline, spacing: 10) {
                                    Text("—").font(.footnote).foregroundStyle(Ink.subtle)
                                    (Text("\(column.label). ").fontWeight(.semibold) + Text(edition.silence(of: column)))
                                        .font(.callout).foregroundStyle(Ink.muted)
                                }
                            }
                        }
                    } else {
                        Text("Nothing has been filed into this issue yet.").font(.callout).foregroundStyle(Ink.muted)
                    }

                    if let followUps = edition["followUps"]?.array, !followUps.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Kicker("Since last issue")
                            ForEach(followUps, id: \.self) { row in
                                VStack(alignment: .leading, spacing: 2) {
                                    (Text("\(Self.watch[row["status"].text] ?? "Open") · ").foregroundStyle(Ink.thread) + Text(row["watch"].text))
                                        .font(.callout)
                                    if !row["note"].text.isEmpty { Text(row["note"].text).font(.caption).foregroundStyle(Ink.subtle) }
                                }
                            }
                        }
                    }

                    ForEach(Array(items.enumerated()), id: \.offset) { index, row in
                        Divider().overlay(Ink.rule)
                        FindingView(editionId: edition.id, item: row.item, number: index + 1, section: row.section) { self.edition = $0 }
                            .id(row.item["itemId"].text)
                    }

                    if !edition["throughLine"].text.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Kicker("What it adds up to")
                            Text(edition["throughLine"].text).font(.readingLarge)
                        }
                    }
                    if let watching = edition["watchNext"]?.array, !watching.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Kicker("Watching for next time")
                            ForEach(watching, id: \.self) { Text("· \($0.raw)").font(.callout).foregroundStyle(Ink.muted) }
                        }
                    }

                    Text((kept > 0 ? "You kept \(kept) of \(items.count). " : "") + (edition.closed ? "That’s the whole issue." : "That’s the issue so far."))
                        .font(.quote)
                        .foregroundStyle(Ink.muted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 8)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
                .column()
            }
            .onAppear {
                guard let focus else { return }
                DispatchQueue.main.async { proxy.scrollTo(focus, anchor: .top) }
            }
        }
        .onChange(of: loaded) { self.edition = nil }
    }

    private static let watch = ["open": "Open", "not_yet": "Not yet", "happened": "Happened", "dropped": "Dropped"]
}

// MARK: A finding

/// One finding, led by what it means for you: the plain line is the heading,
/// the numbers carry it, the agent's finding and its limit follow, then where
/// it comes from and how sure to be. The choices are yours: keep it, read the
/// source, save it for later, or set it aside.
private struct FindingView: View {
    let editionId: String
    let item: JSON
    let number: Int
    let section: String
    let changed: (JSON) -> Void
    @StateObject private var writer = Writer()
    @State private var held: JSON?
    @State private var looked = false

    private var itemId: String { item["itemId"].text }
    private var status: String { item["readerStatus"].text }

    var body: some View {
        if status == "dismissed" {
            HStack {
                Text("Set aside: \(item.heading)").font(.callout).foregroundStyle(Ink.subtle).lineLimit(2)
                Spacer()
                Button("Undo") { act("new") }.disabled(writer.busy)
            }
            .failureAlert(writer)
        } else {
            VStack(alignment: .leading, spacing: 14) {
                Text([String(format: "%02d", number), section].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(Ink.subtle)
                Text(item.heading).font(.headline2)
                Figures(figures: item["figures"]?.array ?? [])
                if !item.plain.isEmpty { Text(item["title"].text).font(.footnote).foregroundStyle(Ink.subtle) }
                readings
                passage
                if let held {
                    VStack(alignment: .leading, spacing: 6) {
                        Kicker("Already in your library", color: Ink.thread)
                        NavigationLink(value: Route.article(held["articleId"].text, passage: held["text"].text)) {
                            Passage(text: held["text"].text, source: held["articleTitle"].text)
                        }
                        .buttonStyle(.plain)
                    }
                    .transition(.opacity)
                }
                about
                actions
            }
            .failureAlert(writer)
            // Restarts when the status changes, so a Keep or Later made meanwhile stands.
            .task(id: "\(itemId):\(status)") { await dwell() }
        }
    }

    /// One reading, or each hand's own when several agents read the source.
    @ViewBuilder private var readings: some View {
        let others = item["readings"]?.array ?? []
        if others.isEmpty {
            Text(item["finding"].text).font(.reading)
            Boundary(text: item["boundary"].text)
            if !item["note"].text.isEmpty { Text(item["note"].text).font(.callout).foregroundStyle(Ink.muted) }
        } else {
            let all = [item] + others
            Text("Filed independently by \(Self.hands[all.count] ?? "\(all.count)") hands.").font(.footnote).foregroundStyle(Ink.subtle)
            ForEach(Array(all.enumerated()), id: \.offset) { _, reading in
                VStack(alignment: .leading, spacing: 8) {
                    Kicker(agentName(reading).map { "\($0)’s reading" } ?? "A reading")
                    Text(reading["finding"].text).font(.reading)
                    Boundary(text: reading["boundary"].text)
                    if !reading["note"].text.isEmpty { Text(reading["note"].text).font(.callout).foregroundStyle(Ink.muted) }
                }
            }
        }
    }

    /// Only a passage found word for word is set as a quotation.
    @ViewBuilder private var passage: some View {
        let text = item["passage"].text
        if !text.isEmpty {
            if item["passageCheck"].text == "found" {
                Passage(text: text, source: "In the source, checked word for word")
            } else {
                Text("\(agentName(item) ?? "The agent") \(item["passageCheck"].text == "missing" ? "quoted a passage the source does not contain. Read the finding with that in mind." : "quoted a passage. It is checked against the source when you keep it.")")
                    .font(.footnote).foregroundStyle(item["passageCheck"].text == "missing" ? Ink.danger : Ink.subtle)
            }
        }
    }

    @ViewBuilder private var about: some View {
        let lines = [item.sourceNote, Self.sure[item["confidence"].text] ?? "", (item["readings"]?.array.isEmpty ?? true) ? agentName(item).map { "Picked by \($0)." } ?? "" : ""]
            .filter { !$0.isEmpty }
        if !lines.isEmpty {
            Text(lines.joined(separator: " ")).font(.footnote).foregroundStyle(Ink.subtle)
        }
    }

    private var actions: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { buttons }
            VStack(alignment: .leading, spacing: 10) { buttons }
        }
        .buttonStyle(.bordered)
        .disabled(writer.busy)
    }

    @ViewBuilder private var buttons: some View {
        if let saved = item["savedArticleId"]?.string {
            NavigationLink(value: Route.article(saved)) { Label("Kept in your Library", systemImage: "checkmark") }
                .foregroundStyle(Ink.living)
        } else {
            Button("Keep") { act("keep") }.buttonStyle(.borderedProminent)
        }
        if let source = item.passageURL {
            Link("Read the source", destination: source)
        }
        if status == "later" {
            Text("In Later").font(.callout).foregroundStyle(Ink.subtle)
        } else {
            Button("Later") { act("later") }
        }
        if item["savedArticleId"]?.string == nil {
            Button("Not for me") { act("dismissed") }
        }
    }

    private func act(_ action: String) {
        writer.run {
            let edition = try await NoeisAPI.shared.act(edition: editionId, item: itemId, action)
            calmly { changed(edition) }
        }
    }

    /// A finding counts as read once it has been on screen a moment, so
    /// scrolling past does not; then the one thing you already hold that it
    /// touches is asked for, and said only when there is one.
    private func dwell() async {
        do { try await Task.sleep(for: .seconds(4)) } catch { return }
        if status == "new", let edition = try? await NoeisAPI.shared.act(edition: editionId, item: itemId, "opened") {
            changed(edition)
        }
        guard !looked else { return }
        looked = true
        if let found = try? await NoeisAPI.shared.held(edition: editionId, item: itemId) {
            calmly { held = found }
        }
    }

    private static let hands = [2: "two", 3: "three", 4: "four"]

    private static let sure = [
        "high": "Well supported. Rely on it within the limit it states.",
        "moderate": "A real signal, not a settled fact.",
        "low": "Early and thin. Worth knowing, not worth acting on yet."
    ]
}

private struct Boundary: View {
    let text: String

    var body: some View {
        if !text.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Kicker("What it doesn’t show")
                Text(text).font(.callout).foregroundStyle(Ink.muted)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Ink.paperMuted, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }
}

/// Up to three numbers, each set large with what it counts.
private struct Figures: View {
    let figures: [JSON]

    var body: some View {
        if !figures.isEmpty {
            HStack(alignment: .top, spacing: 22) {
                ForEach(Array(figures.prefix(3).enumerated()), id: \.offset) { _, figure in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(figure["value"].text).font(.system(.title2, design: .serif).weight(.semibold).monospacedDigit()).foregroundStyle(Ink.thread)
                        Text(figure["label"].text).font(.caption).foregroundStyle(Ink.muted)
                    }
                }
            }
        }
    }
}

// MARK: Reading an edition's JSON

private struct Column { let key: String; let label: String; let items: [JSON] }

private extension JSON {
    var plain: String { self["plain"].text }

    /// What a finding means, before the title of the source it rests on.
    var heading: String { plain.isEmpty ? self["title"].text : plain }

    /// "arXiv preprint, Oct 4. Not yet peer reviewed."
    var sourceNote: String {
        let kind = ["preprint": "preprint", "peer_reviewed": "peer-reviewed", "company": "company source", "news": "news"][self["sourceKind"].text] ?? ""
        let place = [self["sourceLabel"].text, kind].filter { !$0.isEmpty }.joined(separator: " ")
        let line = [place, self["sourceDate"]?.date.map(Self.utcDay) ?? ""].filter { !$0.isEmpty }.joined(separator: ", ")
        return ((line.isEmpty ? "" : "\(line).") + (self["sourceKind"].text == "preprint" ? " Not yet peer reviewed." : ""))
            .trimmingCharacters(in: .whitespaces)
    }

    /// How strongly a finding can lead: by what a reader can check, never by who filed it.
    var leadWeight: Int {
        (self["passageCheck"].text == "found" ? 4 : 0) + ((self["figures"]?.array.isEmpty ?? true) ? 0 : 2)
            + (["high": 2, "moderate": 1][self["confidence"].text] ?? 0) + (plain.isEmpty ? 0 : 1)
    }

    /// The source, opened at the passage when the passage was found in it.
    var passageURL: URL? {
        guard let url = self["url"]?.string.flatMap(URL.init(string:)), ["http", "https"].contains(url.scheme ?? "") else { return nil }
        let opening = self["passage"].text.components(separatedBy: CharacterSet(charactersIn: "…"))
            .map { $0.split(whereSeparator: \.isWhitespace).joined(separator: " ") }.first { !$0.isEmpty } ?? ""
        guard self["passageCheck"].text == "found", !opening.isEmpty,
              let words = opening.split(separator: " ").prefix(8).joined(separator: " ").addingPercentEncoding(withAllowedCharacters: .alphanumerics) else { return url }
        return URL(string: "\(url.absoluteString.components(separatedBy: "#")[0])#:~:text=\(words)") ?? url
    }

    /// "Issue 4 · covers Oct 6 – 12"
    var dateline: String {
        let issue = (self["number"]?.int ?? 0) > 0 ? "\(self["issueLabel"]?.string ?? "Edition") \(self["number"]?.int ?? 0)" : ""
        let window: String
        if let start = self["windowStart"]?.date, let end = self["windowEnd"]?.date {
            let calendar = Self.utc
            let sameMonth = calendar.component(.month, from: start) == calendar.component(.month, from: end)
            window = "covers \(Self.utcDay(start)) – \(sameMonth ? String(calendar.component(.day, from: end)) : Self.utcDay(end))"
        } else {
            window = ""
        }
        return [issue, window].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// An issue is finished once the last day of its window has ended.
    var closed: Bool {
        guard let end = self["windowEnd"]?.date else { return false }
        return Date() > end.addingTimeInterval(86_400)
    }

    /// The configured sections in order, empty ones kept; no sections is one loose column.
    var columns: [Column] {
        let items = self["items"]?.array ?? []
        let sections = (self["sections"]?.array ?? []).filter { !$0["key"].text.isEmpty || !$0["label"].text.isEmpty }
        guard !sections.isEmpty else { return [Column(key: "", label: "", items: items)] }
        let known = Set(sections.map { $0["key"].text })
        let orphans = items.filter { !known.contains($0["section"].text) }
        return sections.map { section in Column(key: section["key"].text, label: section["label"].text, items: items.filter { $0["section"].text == section["key"].text }) }
            + (orphans.isEmpty ? [] : [Column(key: "", label: "Elsewhere", items: orphans)])
    }

    /// Which silence an empty section is.
    func silence(of column: Column) -> String {
        let silence = (self["silences"]?.array ?? []).first { $0["key"].text == column.key } ?? .null
        switch silence["state"].text {
        case "checked":
            let names = (silence["by"]?.array ?? []).compactMap(agentName)
            return names.isEmpty ? "An agent looked; nothing met the bar." : "\(ListFormatter.localizedString(byJoining: names)) looked; nothing met the bar."
        case "unreported": return "Not reported this issue."
        default: return "Nothing filed under \(column.label) in this issue."
        }
    }

    static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    static func utcDay(_ date: Date) -> String {
        let month = utc.shortMonthSymbols[utc.component(.month, from: date) - 1]
        return "\(month) \(utc.component(.day, from: date))"
    }
}

/// What it costs to read, before you start: "3 findings · about 2 minutes".
private func costLine(_ items: [JSON]) -> String {
    let words = items.flatMap { item in [item.plain, item["finding"].text, item["boundary"].text] + (item["readings"]?.array ?? []).flatMap { [$0["finding"].text, $0["boundary"].text] } }
        .joined(separator: " ").split(whereSeparator: \.isWhitespace).count
    let minutes = max(1, Int((Double(words) / 230).rounded()))
    return "\(items.count == 1 ? "1 finding" : "\(items.count) findings") · \(minutes == 1 ? "about a minute" : "about \(minutes) minutes")"
}

/// An agent named by the runtime it connected from, not the token label
/// someone typed (editionAgent.js `agentOf`). A filing or a silence's `by`.
private func agentName(_ row: JSON) -> String? {
    let label = (row["filedBy"]?.string ?? row["label"]?.string ?? "")
    let runtime = (row["filedByRuntime"]?.string ?? row["runtime"]?.string ?? "").lowercased()
    let names = ["claude-code": "Claude", "codex": "Codex", "openclaw": "OpenClaw", "hermes": "Hermes", "opencode": "OpenCode"]
    if let name = names[runtime] { return name }
    if label.isEmpty { return nil }
    let lowered = label.lowercased()
    if let match = ["opencode", "openclaw", "codex", "claude", "hermes"].first(where: lowered.contains) {
        return names[match == "claude" ? "claude-code" : match]
    }
    return label
}
