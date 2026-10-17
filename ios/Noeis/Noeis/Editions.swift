import SwiftUI

// MARK: The stand

/// Every paper you keep, read the way you choose: one front page set from all
/// of them, or a newsstand with each paper as a cover (EditionStand.jsx). The
/// choice is remembered on this device.
struct EditionsFront: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @AppStorage("editions.view") private var view = "front"
    @AppStorage("editions.last") private var last = ""
    @Namespace private var pill

    var body: some View {
        Loaded(load: { try await Stand.load() }) { stand, reload in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if stand.papers.isEmpty {
                        Text("A paper is a short weekly issue that an agent you connect, such as Claude Code or Codex, files for you: what it found, each finding with its source and how sure to be. Connect one from Connections on noeis.io.")
                            .font(.dek).foregroundStyle(Ink.muted).multilineTextAlignment(.center)
                            .padding(.top, 60)
                    } else {
                        bar(stand)
                        Group {
                            if view == "stand" { Newsstand(stand: stand) } else { FrontPage(stand: stand) }
                        }
                        .id(view)
                        .transition(.opacity)
                    }
                }
                .padding(.horizontal, sizeClass == .regular ? 40 : 20)
                .padding(.bottom, 48)
                .column(1240)
            }
            .refreshable { await reload() }
        }
        .toolbar { PartnerToolbarItem(context: ["type": "workspace", "id": "editions", "title": "Editions"]) }
        .roomTitle("Editions")
        .paper()
    }

    private func bar(_ stand: Stand) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 0) {
                ForEach(["front", "stand"], id: \.self) { key in
                    let label = key == "front" ? "Front page" : "Newsstand"
                    Button {
                        calmly(.spring(response: 0.34, dampingFraction: 0.86)) { view = key }
                    } label: {
                        Text(label)
                            .font(.footnote)
                            .foregroundStyle(view == key ? Ink.paper : Ink.muted)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 36)
                            .background {
                                if view == key { Capsule().fill(Ink.text).matchedGeometryEffect(id: "pill", in: pill) }
                            }
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(view == key ? .isSelected : [])
                }
            }
            .padding(3)
            .overlay(Capsule().strokeBorder(Ink.rule))
            .accessibilityLabel("Read your papers as")

            let place = last.components(separatedBy: "\n")
            if place.count == 3, stand.papers.contains(where: { $0.issues.contains { $0.id == place[0] } }) {
                RouteLink(route: .edition(place[0], item: place[1].isEmpty ? nil : place[1])) {
                    (Text("Back to where you stopped ") + Text(place[2]).italic())
                        .font(.footnote).foregroundStyle(Ink.muted).lineLimit(1)
                }
            }
        }
        .padding(.top, 6)
    }
}

/// One paper's run, newest issue first: where a paper's name on the front page leads.
struct PaperIssues: View {
    let profile: String

    var body: some View {
        Loaded(load: { try await Stand.load(opening: false).papers.first { $0.profile == profile } }) { paper, reload in
            RoomIndex {
                ForEach(paper?.issues ?? [], id: \.id) { issue in
                    RouteRow(route: .edition(issue.id)) { IssueRow(issue: issue) }
                }
            }
            .refreshable { await reload() }
            .navigationTitle(paper?.title ?? "Editions")
        }
        .paper()
    }
}

private struct Paper {
    let profile: String
    let title: String
    /// Newest first.
    let issues: [JSON]
    var latest: JSON { issues[0] }
}

private struct Story {
    let paper: Paper
    let issue: JSON
    let item: JSON
}

private struct Stand {
    var papers: [Paper]
    /// Each paper's newest issue, opened, since both views print what is inside.
    var opened: [String: JSON]

    /// The papers with the most recent filing first, each issue newest first,
    /// with every paper's newest issue opened (editionModel.js `papersOf`).
    static func load(opening: Bool = true) async throws -> Stand {
        let editions = try await NoeisAPI.shared.editions()
        let papers = Dictionary(grouping: editions) { $0["profile"].text }
            .map { profile, issues in
                Paper(profile: profile, title: issues[0]["profileLabel"]?.string ?? issues[0]["title"].text,
                      issues: issues.sorted { ($0["windowStart"]?.date ?? .distantPast) > ($1["windowStart"]?.date ?? .distantPast) })
            }
            .sorted { $0.latest.recency > $1.latest.recency }
        guard opening else { return Stand(papers: papers, opened: [:]) }
        let opened = await withTaskGroup(of: JSON?.self) { group in
            for id in papers.prefix(8).map(\.latest.id) { group.addTask { try? await NoeisAPI.shared.edition(id) } }
            return await group.reduce(into: [String: JSON]()) { if let issue = $1 { $0[issue.id] = issue } }
        }
        return Stand(papers: papers, opened: opened)
    }

    /// The stories in one paper's newest issue, strongest first.
    func stories(of paper: Paper) -> [Story] {
        guard let issue = opened[paper.latest.id] else { return [] }
        return (issue["items"]?.array ?? [])
            .filter { $0["readerStatus"].text != "dismissed" }
            .map { Story(paper: paper, issue: issue, item: $0) }
            .sorted(by: Story.leads)
    }

    /// Eligibility: findings in a paper's newest issue that you have not set
    /// aside. Quality: the lead is the one with the most a reader can check (a
    /// passage found in its source, figures, stated confidence, a plain line),
    /// newest on a tie. Silence: a paper whose newest issue holds nothing gets
    /// no column, and a stand with nothing filed has no lead; nothing is
    /// promoted to fill the space.
    var lead: Story? { papers.flatMap { stories(of: $0) }.sorted(by: Story.leads).first }

    /// The other papers, each a column of its own stories.
    var columns: [(paper: Paper, stories: [Story])] {
        let lead = self.lead?.paper.profile
        return papers.filter { $0.profile != lead }
            .map { (paper: $0, stories: stories(of: $0)) }
            .filter { !$0.stories.isEmpty }
    }

    /// A paper that filed nothing can still say where it looked.
    var quiet: [String] {
        papers.flatMap { paper in
            (opened[paper.latest.id]?["silences"]?.array ?? []).filter { $0["state"].text == "checked" }
                .map { "\($0["label"].text), in \(paper.title): looked, and nothing met the bar." }
        }
    }

    /// What each paper has been watching: a line in one issue's watch list is
    /// answered by the next issue's follow-ups; a line nobody answered is open.
    var watching: [(status: String, watch: String)] {
        papers.flatMap { paper -> [(status: String, watch: String)] in
            let run = Array(paper.issues.reversed())
            var threads: [String: (status: String, watch: String)] = [:]
            var order: [String] = []
            for (index, issue) in run.enumerated() {
                for line in (issue["watchNext"]?.array ?? []).map(\.raw) {
                    let key = line.lowercased()
                    let answer = index + 1 < run.count
                        ? (run[index + 1]["followUps"]?.array ?? []).first { $0["watch"].text.lowercased() == key }
                        : nil
                    if threads[key] == nil { order.append(key) }
                    threads[key] = (status: answer?["status"].text ?? "open", watch: line)
                }
            }
            return order.reversed().compactMap { threads[$0] }.filter { !["happened", "dropped"].contains($0.status) }
        }
    }

    /// Who filed what into each paper's newest issue, newest first.
    var wire: [(paper: Paper, name: String, count: Int)] {
        typealias Hand = (paper: Paper, name: String, count: Int, at: Date)
        let hands: [Hand] = papers.flatMap { paper -> [Hand] in
            let byHand = Dictionary(grouping: paper.latest["filings"]?.array ?? []) { agentName($0) ?? "" }
            return byHand.compactMap { name, filings -> Hand? in
                name.isEmpty ? nil : (paper: paper, name: name, count: filings.count, at: filings.compactMap { $0["filedAt"]?.date }.max() ?? .distantPast)
            }
        }
        return hands.sorted { $0.at > $1.at }.map { (paper: $0.paper, name: $0.name, count: $0.count) }
    }

    /// "3 new findings across 2 papers", or "Every paper read".
    var news: String {
        let counts = papers.map { $0.issues.compactMap { $0["newCount"]?.int }.reduce(0, +) }
        let total = counts.reduce(0, +)
        let fresh = counts.filter { $0 > 0 }.count
        return total > 0 ? "\(total) new finding\(total == 1 ? "" : "s") across \(fresh) paper\(fresh == 1 ? "" : "s")" : "Every paper read"
    }
}

private extension Story {
    static func leads(_ left: Story, _ right: Story) -> Bool {
        (left.item.leadWeight, left.item["filedAt"]?.date ?? .distantPast) > (right.item.leadWeight, right.item["filedAt"]?.date ?? .distantPast)
    }

    var route: Route { .edition(issue.id, item: item["itemId"].text) }
}

// MARK: Front page

/// The broadsheet: the lead is the finding with the most you can check; each
/// other paper gets a column; the rail carries what the papers are watching,
/// what came over the wire, and which sections were looked at and found quiet.
private struct FrontPage: View {
    let stand: Stand

    /// "Claude", "Claude & Codex", "Claude, Codex & Hermes".
    static func and(_ names: [String]) -> String {
        names.count <= 2 ? names.joined(separator: " & ") : names.dropLast().joined(separator: ", ") + " & " + names.last!
    }

    var body: some View {
        let lead = stand.lead
        let alsoIn = lead.map { lead in stand.stories(of: lead.paper).filter { $0.item["itemId"].text != lead.item["itemId"].text } } ?? []
        let columns = stand.columns
        let stories = [lead].compactMap { $0 } + alsoIn + columns.flatMap { $0.stories }
        let hands = Array(Set(stand.wire.map { $0.name })).sorted()
        VStack(alignment: .leading, spacing: 0) {
            let folio = [Self.today.string(from: Date()),
                         [stories.isEmpty ? "" : costLine(stories.map { $0.item }), stand.news].filter { !$0.isEmpty }.joined(separator: " · "),
                         hands.isEmpty ? "" : "Filed by \(Self.and(hands))"].filter { !$0.isEmpty }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 24) {
                    ForEach(Array(folio.enumerated()), id: \.offset) { index, line in
                        if index > 0 { Spacer(minLength: 0) }
                        Text(line).lineLimit(1).fixedSize()
                    }
                }
                // Middling widths: the date and the hands on one line, the counts under them.
                if folio.count == 3 {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack { Text(folio[0]).fixedSize(); Spacer(minLength: 16); Text(folio[2]).fixedSize() }
                        Text(folio[1]).lineLimit(1).fixedSize()
                    }
                }
                // Narrow: one phrase to a line, so none breaks mid-phrase.
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(folio.flatMap { $0.components(separatedBy: " · ") }, id: \.self) { Text($0) }
                }
            }
            .font(.system(.footnote, design: .serif))
            .foregroundStyle(Ink.text)
            .padding(.bottom, 8)
            Rule()

            Text("The Noeis Edition")
                .font(.system(size: 84, weight: .heavy, design: .serif))
                .tracking(-2.6)
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)

            VStack(spacing: 2) { Rule(); Rule() }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 26) { paperLinks }
                ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 22) { paperLinks }.padding(.trailing, 28) }
                    // Fades at the edge, so it reads as more to the side, not cut off.
                    .mask(LinearGradient(stops: [.init(color: .black, location: 0.86), .init(color: .clear, location: 1)], startPoint: .leading, endPoint: .trailing))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            Rule()

            if let lead {
                let first = columns.first
                let fold = Array(columns.dropFirst())
                ViewThatFits(in: .horizontal) {
                    // Landscape iPad: the web's three columns, ruled in ink.
                    VStack(alignment: .leading, spacing: 34) {
                        HStack(alignment: .top, spacing: 0) {
                            LeadArticle(lead: lead, alsoIn: alsoIn, size: 42)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                                .padding(.trailing, 28)
                            if let first {
                                PaperColumn(paper: first.paper, stories: Array(first.stories.prefix(3)))
                                    .frame(width: 280)
                                    .frame(maxHeight: .infinity, alignment: .top)
                                    .padding(.horizontal, 24)
                                    .overlay(alignment: .leading) { ColumnRule() }
                            }
                            VStack(alignment: .leading, spacing: 26) { rail }
                                .frame(width: 236)
                                .frame(maxHeight: .infinity, alignment: .top)
                                .padding(.leading, 22)
                                .overlay(alignment: .leading) { ColumnRule() }
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        Fold(columns: fold)
                    }
                    .frame(minWidth: 1000, idealWidth: 1000, maxWidth: .infinity)

                    // Portrait iPad: the lead beside one paper, the rail beneath.
                    VStack(alignment: .leading, spacing: 34) {
                        HStack(alignment: .top, spacing: 0) {
                            LeadArticle(lead: lead, alsoIn: alsoIn, size: 36)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                                .padding(.trailing, 24)
                            if let first {
                                PaperColumn(paper: first.paper, stories: Array(first.stories.prefix(3)))
                                    .frame(width: 250)
                                    .frame(maxHeight: .infinity, alignment: .top)
                                    .padding(.leading, 24)
                                    .overlay(alignment: .leading) { ColumnRule() }
                            }
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        VStack(alignment: .leading, spacing: 26) { rail }
                        Fold(columns: fold)
                    }
                    .frame(minWidth: 680, idealWidth: 680, maxWidth: .infinity)

                    // iPhone: one column.
                    VStack(alignment: .leading, spacing: 30) {
                        LeadArticle(lead: lead, alsoIn: alsoIn)
                        if let first { PaperColumn(paper: first.paper, stories: Array(first.stories.prefix(3))) }
                        rail
                        Fold(columns: fold)
                    }
                }
                .padding(.top, 24)
            } else {
                Text("Nothing has been filed into this week’s papers yet.")
                    .font(.system(.title3, design: .serif).italic())
                    .foregroundStyle(Ink.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
            }
        }
    }

    private var paperLinks: some View {
        ForEach(stand.papers, id: \.profile) { paper in
            RouteLink(route: .paper(paper.profile)) { SmallCaps(paper.title).foregroundStyle(Ink.text) }
        }
    }

    @ViewBuilder private var rail: some View {
        let watching = stand.watching
        if !watching.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SmallCaps("The watch list", size: 11).foregroundStyle(Ink.danger).padding(.bottom, 6)
                ForEach(Array(watching.prefix(4).enumerated()), id: \.offset) { index, thread in
                    if index > 0 { Rule(color: Ink.rule) }
                    (Text(Self.status[thread.status] ?? "Open").bold() + Text(" — \(thread.watch)"))
                        .font(.system(.callout, design: .serif))
                        .padding(.vertical, 8)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background { ZStack { Rectangle().fill(Ink.paper); Rectangle().fill(Ink.thread).opacity(0.08) } }
            .overlay(Rectangle().strokeBorder(Ink.text, lineWidth: 1.5))
        }
        let wire = stand.wire.prefix(4)
        if !wire.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Head("The wire")
                ForEach(Array(wire.enumerated()), id: \.offset) { index, entry in
                    if index > 0 { Rule(color: Ink.rule) }
                    RouteLink(route: .edition(entry.paper.latest.id)) {
                        Text("\(entry.name) filed \(entry.count) to \(entry.paper.title)")
                            .font(.system(.body, design: .serif).weight(.bold))
                            .foregroundStyle(Ink.text)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 10)
                    }
                }
            }
        }
        let quiet = stand.quiet
        if !quiet.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Head("Quiet this week")
                ForEach(quiet, id: \.self) { Text($0).font(.system(.callout, design: .serif)) }
            }
        }
    }

    private static let status = ["open": "Open", "not_yet": "Not yet", "happened": "Happened", "dropped": "Dropped"]

    private static let today: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEEE, MMMM d, yyyy"
        return formatter
    }()
}

/// The lead story: a red kicker, the headline, the source, the numbers, the
/// finding under a drop cap, its limit, and what else ran in the issue.
private struct LeadArticle: View {
    let lead: Story
    let alsoIn: [Story]
    var size: CGFloat = 32

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SmallCaps("\(lead.paper.title) · lead story", size: 11).foregroundStyle(Ink.danger)
            RouteLink(route: lead.route) {
                Text(lead.item.heading)
                    .font(.system(size: size, weight: .bold, design: .serif))
                    .tracking(-0.8)
                    .foregroundStyle(Ink.text)
                    .multilineTextAlignment(.leading)
            }
            SourceLine(item: lead.item)
            Figures(figures: lead.item["figures"]?.array ?? [])
            DropCap(text: lead.item["finding"].text)
            QuotedPassage(item: lead.item)
            Boundary(text: lead.item["boundary"].text)
            if !alsoIn.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Rule(color: Ink.rule)
                    (Text("Also in the issue: ").bold() + Text(alsoIn.prefix(3).map { $0.item.heading.trimmingCharacters(in: CharacterSet(charactersIn: ".")) }.joined(separator: "; ") + "."))
                        .font(.system(.body, design: .serif))
                        .foregroundStyle(Ink.text)
                }
            }
            RouteLink(route: .edition(lead.issue.id)) {
                Text("Read the whole issue →").font(.subheadline).underline().foregroundStyle(Ink.text)
            }
        }
    }
}

/// A paper's column: its name under a heavy rule, then its stories, the first set large.
private struct PaperColumn: View {
    let paper: Paper
    let stories: [Story]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            RouteLink(route: .paper(paper.profile)) { Head(paper.title) }
            ForEach(Array(stories.enumerated()), id: \.offset) { index, story in
                if index > 0 { Rule(color: Ink.rule) }
                RouteLink(route: story.route) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(story.item.heading)
                            .font(.system(size: index == 0 ? 26 : 20, weight: .heavy, design: .serif))
                            .tracking(-0.3)
                            .foregroundStyle(Ink.text)
                        Text(story.item.plain.isEmpty ? story.item["finding"].text : story.item["title"].text)
                            .font(.system(.callout, design: .serif).italic())
                            .foregroundStyle(Ink.muted)
                            .lineLimit(3)
                    }
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

/// Below the fold: the rest of the papers, one story each, under a double rule.
private struct Fold: View {
    let columns: [(paper: Paper, stories: [Story])]

    var body: some View {
        if !columns.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                VStack(spacing: 2) { Rule(); Rule() }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 24, alignment: .top)], alignment: .leading, spacing: 24) {
                    ForEach(Array(columns.enumerated()), id: \.offset) { _, column in
                        PaperColumn(paper: column.paper, stories: Array(column.stories.prefix(1)))
                    }
                }
            }
        }
    }
}

/// The ink rule between broadsheet columns.
private struct ColumnRule: View {
    var body: some View { Rectangle().fill(Ink.text).frame(width: 1) }
}

// MARK: Newsstand

/// The house's own inks, one per paper, in order.
private let covers = [Ink.text, Ink.thread, Ink.living, Ink.subtle, Ink.danger]

/// Every paper as a magazine on a rack, its newest issue facing out. Pick one
/// up and it opens; older issues stand below as spines.
private struct Newsstand: View {
    let stand: Stand
    @State private var open: String?

    var body: some View {
        Group {
            if let paper = stand.papers.first(where: { $0.profile == open }) {
                Spread(stand: stand, paper: paper) { calmly(.easeOut(duration: 0.28)) { open = nil } }
            } else {
                rack
            }
        }
        .transition(.opacity)
    }

    private var rack: some View {
        let papers = stand.papers
        let backIssues = papers.enumerated()
            .flatMap { index, paper in paper.issues.dropFirst().map { (ink: index, paper: paper, issue: $0) } }
            .sorted { ($0.issue["windowStart"]?.date ?? .distantPast) > ($1.issue["windowStart"]?.date ?? .distantPast) }
            .prefix(30)
        return VStack(alignment: .leading, spacing: 0) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 16)], alignment: .leading, spacing: 20) {
                ForEach(Array(papers.enumerated()), id: \.element.profile) { index, paper in
                    Button { calmly(.easeOut(duration: 0.28)) { open = paper.profile } } label: {
                        Cover(paper: paper, ink: covers[index % covers.count], figure: stand.opened[paper.latest.id]?.coverFigure, italic: index % 2 == 1)
                            .aspectRatio(3 / 4, contentMode: .fit)
                    }
                    .buttonStyle(Lift())
                }
            }
            .padding(.horizontal, 4)
            Shelf()

            if !backIssues.isEmpty {
                Text("Back issues").font(.system(.title2, design: .serif)).padding(.top, 30).padding(.bottom, 12)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .bottom, spacing: 4) {
                        ForEach(Array(backIssues.enumerated()), id: \.offset) { _, row in
                            RouteLink(route: .edition(row.issue.id)) {
                                Text(row.issue.issueName)
                                    .font(.system(size: 11, weight: .bold))
                                    .tracking(0.6)
                                    .foregroundStyle(Ink.text)
                                    .fixedSize()
                                    .rotationEffect(.degrees(-90))
                                    .frame(width: 38, height: 170)
                                    .background { ZStack { Rectangle().fill(Ink.paper); Rectangle().fill(covers[row.ink % covers.count]).opacity(0.4) } }
                                    .overlay(alignment: .top) { Rectangle().fill(covers[row.ink % covers.count]).frame(height: 4) }
                            }
                            .accessibilityLabel("\(row.paper.title), \(row.issue.issueName)")
                        }
                    }
                    .padding(.horizontal, 4)
                }
                Shelf()
            }
        }
    }
}

/// A paper's newest issue, facing out: its strongest figure, its title, and
/// a ribbon for what you have not read.
private struct Cover: View {
    let paper: Paper
    let ink: Ink
    let figure: JSON?
    var italic = false
    var open = false

    var body: some View {
        let latest = paper.latest
        let line = latest["headline"]?.string ?? latest["standfirst"].text
        VStack(alignment: .leading, spacing: 6) {
            SmallCaps(latest.issueName, size: 10).foregroundStyle(Ink.muted)
            Text(paper.title)
                .font(.system(size: open ? 44 : 22, weight: italic ? .regular : .heavy, design: .serif))
                .italic(italic)
                .tracking(-0.4)
                .foregroundStyle(Ink.text)
            Spacer(minLength: 4)
            if let figure {
                VStack(alignment: .leading, spacing: 4) {
                    Text(figure["value"].text)
                        .font(.system(size: open ? 72 : 40, weight: .heavy, design: .serif))
                        .tracking(-1.5)
                        .lineLimit(1)
                        .minimumScaleFactor(0.4)
                        .foregroundStyle(ink)
                    Text(figure["label"].text).font(.caption2).foregroundStyle(Ink.muted).lineLimit(2)
                }
            }
            if !line.isEmpty {
                Text(line)
                    .font(.system(open ? .title3 : .footnote, design: .serif).italic())
                    .foregroundStyle(Ink.text)
                    .lineLimit(open ? 5 : 3)
            }
        }
        .multilineTextAlignment(.leading)
        .padding(open ? 26 : 13)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background { ZStack { Rectangle().fill(Ink.paper); Rectangle().fill(ink).opacity(0.28) } }
        .overlay(alignment: .top) { Rectangle().fill(ink).frame(height: 6) }
        .overlay(alignment: .topTrailing) {
            let fresh = paper.issues.compactMap { $0["newCount"]?.int }.reduce(0, +)
            if fresh > 0 {
                SmallCaps("\(fresh) new", size: 10)
                    .foregroundStyle(Ink.paper)
                    .frame(width: 130)
                    .padding(.vertical, 3)
                    .background(Ink.thread)
                    .rotationEffect(.degrees(45))
                    .offset(x: 38, y: 18)
            }
        }
        .clipShape(Rectangle())
        .shadow(color: .black.opacity(open ? 0.18 : 0.28), radius: 14, y: 12)
    }
}

/// A magazine, opened: the cover, then what is in the issue and its feature,
/// the finding with the most you can check.
private struct Spread: View {
    let stand: Stand
    let paper: Paper
    let close: () -> Void
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let issue = stand.opened[paper.latest.id]
        let items = issue?["items"]?.array ?? []
        let index = stand.papers.firstIndex { $0.profile == paper.profile } ?? 0
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Button("← Back to the stand", action: close)
                Spacer()
                RouteLink(route: .paper(paper.profile)) { Text("Every issue of \(paper.title) →") }
            }
            .font(.subheadline)
            .foregroundStyle(Ink.muted)
            .buttonStyle(QuietPress())

            // Two facing pages on iPad; the cover above its contents on iPhone.
            let pages = sizeClass == .regular
                ? AnyLayout(HStackLayout(alignment: .top, spacing: 0))
                : AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
            pages {
                Cover(paper: paper, ink: covers[index % covers.count], figure: issue?.coverFigure, italic: index % 2 == 1, open: true)
                    .frame(minHeight: sizeClass == .regular ? 600 : 420)
                    .frame(width: sizeClass == .regular ? 380 : nil)
                VStack(alignment: .leading, spacing: 18) {
                    if let issue, !items.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            HStack(alignment: .firstTextBaseline) {
                                SmallCaps("In this issue")
                                Spacer()
                                Text(costLine(items)).font(.system(.subheadline, design: .serif).italic()).foregroundStyle(Ink.muted)
                            }
                            .padding(.bottom, 8)
                            Rule(height: 2)
                            ForEach(Array(items.enumerated()), id: \.offset) { number, item in
                                RouteLink(route: .edition(issue.id, item: item["itemId"].text)) {
                                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                                        Text(String(format: "%02d", number + 1))
                                            .font(.system(size: 24, weight: .heavy, design: .serif))
                                            .foregroundStyle(Ink.danger)
                                            .frame(width: 34, alignment: .leading)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(item.heading).font(.system(.title3, design: .serif).weight(.bold)).foregroundStyle(Ink.text)
                                            if !item.sourceNote.isEmpty { Text(item.sourceNote).font(.meta).foregroundStyle(Ink.muted) }
                                        }
                                    }
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.vertical, 10)
                                }
                                Rule(color: Ink.rule)
                            }
                        }
                        if let feature = stand.stories(of: paper).first {
                            VStack(alignment: .leading, spacing: 10) {
                                SmallCaps("The feature", size: 11).foregroundStyle(Ink.danger)
                                RouteLink(route: feature.route) {
                                    Text(feature.item.heading)
                                        .font(.system(size: 28, weight: .bold, design: .serif))
                                        .foregroundStyle(Ink.text)
                                        .multilineTextAlignment(.leading)
                                }
                                SourceLine(item: feature.item)
                                Figures(figures: feature.item["figures"]?.array ?? [])
                                DropCap(text: feature.item["finding"].text)
                                QuotedPassage(item: feature.item)
                            }
                        }
                        RouteLink(route: .edition(issue.id)) {
                            Text("Read the whole issue →").font(.subheadline).underline().foregroundStyle(Ink.text)
                        }
                    } else {
                        Text(issue == nil ? "This issue did not open. Pull down to try again." : "Nothing has been filed into this issue yet.")
                            .font(.system(.title3, design: .serif).italic())
                            .foregroundStyle(Ink.muted)
                            .padding(.vertical, 30)
                    }
                }
                .padding(.horizontal, sizeClass == .regular ? 32 : 18)
                .padding(.vertical, sizeClass == .regular ? 30 : 22)
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .background(Ink.paper)
            }
            .shadow(color: .black.opacity(0.22), radius: 22, y: 18)
        }
    }
}

/// A cover lifts and tips a little when picked up; with Reduce Motion it only dims.
private struct Lift: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var still

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .offset(y: configuration.isPressed && !still ? -6 : 0)
            .rotationEffect(.degrees(configuration.isPressed && !still ? -0.6 : 0))
            .opacity(configuration.isPressed && still ? 0.7 : 1)
            .calmAnimation(.easeOut(duration: 0.22), value: configuration.isPressed)
    }
}

private struct Shelf: View {
    var body: some View {
        Rectangle().fill(Ink.rule).frame(height: 12)
            .shadow(color: .black.opacity(0.25), radius: 7, y: 8)
            .padding(.bottom, 8)
    }
}

// MARK: Type and rules

/// A hairline across the page, in ink unless told otherwise.
private struct Rule: View {
    var color = Ink.text
    var height: CGFloat = 1
    var body: some View { Rectangle().fill(color).frame(height: height) }
}

/// Spaced capitals, for paper names, kickers and the heads of columns.
private struct SmallCaps: View {
    let text: String
    var size: CGFloat = 12
    init(_ text: String, size: CGFloat = 12) { self.text = text; self.size = size }
    var body: some View {
        Text(text.uppercased()).font(.system(size: size, weight: .bold)).tracking(size * 0.18).lineLimit(1)
    }
}

/// A column's head: its name in small capitals under a heavy rule.
private struct Head: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Rule(height: 3)
            SmallCaps(text).foregroundStyle(Ink.text)
        }
    }
}

/// Under a headline led by its plain line, the source's own title, then what kind of source it is.
private struct SourceLine: View {
    let item: JSON
    var body: some View {
        let line = [item.plain.isEmpty ? "" : item["title"].text, item.sourceNote].filter { !$0.isEmpty }.joined(separator: ". ")
        if !line.isEmpty { Text(line).font(.footnote).foregroundStyle(Ink.muted) }
    }
}

/// The finding, its first letter set large in red.
private struct DropCap: View {
    let text: String
    var body: some View {
        if let first = text.first {
            (Text(String(first)).font(.system(size: 52, weight: .heavy, design: .serif)).foregroundColor(.clear)
                + Text(String(text.dropFirst())).font(.system(.title3, design: .serif)))
                .foregroundStyle(Ink.text)
                .lineSpacing(5)
                .overlay(alignment: .topLeading) {
                    Text(String(first)).font(.system(size: 52, weight: .heavy, design: .serif)).foregroundStyle(Ink.danger)
                }
        }
    }
}

/// The source's own words, when the agent quoted them.
private struct QuotedPassage: View {
    let item: JSON
    var body: some View {
        if !item["passage"].text.isEmpty {
            Passage(text: item["passage"].text, source: item["passageCheck"].text == "found" ? "In the source, checked word for word" : "")
        }
    }
}

private struct IssueRow: View {
    let issue: JSON

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(issue.dateline).font(.meta).foregroundStyle(Ink.subtle)
            Text(issue["headline"]?.string ?? issue["profileLabel"].text)
                .font(.rowTitle)
                .lineLimit(3)
            if !issue["standfirst"].text.isEmpty {
                Text(issue["standfirst"].text).font(.dek).foregroundStyle(Ink.muted).lineLimit(2)
            }
            HStack(spacing: 6) {
                let count = issue["itemCount"]?.int ?? 0
                Text(count == 1 ? "1 finding" : "\(count) findings")
                if let fresh = issue["newCount"]?.int, fresh > 0 { Text("· \(fresh) new").foregroundStyle(Ink.accent) }
                if let kept = issue["savedCount"]?.int, kept > 0 { Text("· you kept \(kept)") }
            }
            .font(.meta)
            .foregroundStyle(Ink.subtle)
        }
        .padding(.vertical, 20)
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
    @AppStorage("editions.last") private var last = ""

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
                last = [loaded.id, focus ?? "", loaded["headline"]?.string ?? loaded["profileLabel"].text].joined(separator: "\n")
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
            Button("Keep") { act("keep") }.buttonStyle(.ink)
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

    /// "Edition 4", or the week it covers when it has no number.
    var issueName: String {
        if let number = self["number"]?.int, number > 0 { return "\(self["issueLabel"]?.string ?? "Edition") \(number)" }
        return dateline.replacingOccurrences(of: "covers ", with: "")
    }

    /// When an issue last took a filing: what stands its paper at the front of the stand.
    var recency: Date {
        ((self["items"]?.array ?? self["filings"]?.array ?? []).compactMap { $0["filedAt"]?.date }
            + [self["updatedAt"]?.date, self["createdAt"]?.date].compactMap { $0 }).max() ?? .distantPast
    }

    /// What a cover leads with: its strongest finding's first figure.
    var coverFigure: JSON? {
        (self["items"]?.array ?? [])
            .sorted { ($0.leadWeight, $0["filedAt"]?.date ?? .distantPast) > ($1.leadWeight, $1["filedAt"]?.date ?? .distantPast) }
            .lazy.compactMap { $0["figures"]?.array.first }.first
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
        calendar.locale = Locale(identifier: "en_US_POSIX")
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
