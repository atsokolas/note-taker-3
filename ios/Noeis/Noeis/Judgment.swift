import SwiftUI

/// A held view, read from its wiki page (judgmentModel.js `projectView`).
struct HeldView {
    let page: JSON
    var judgment: JSON { page["judgment"] ?? [:] }
    var id: String { page.id }
    var claim: String { judgment["currentJudgment"]?.string ?? judgment["governingQuestion"]?.string ?? page["title"].text }
    var heldSince: Date? { judgment["startedAt"]?.date ?? judgment["bornAt"]?.date ?? page["createdAt"]?.date }
    var setAside: Bool { ["parked", "closed"].contains(judgment["status"].text) }
    var forLines: [JSON] { judgment["why"]?.array.filter { !$0["text"].text.isEmpty } ?? [] }
    var againstLines: [JSON] { judgment["against"]?.array.filter { !$0["text"].text.isEmpty } ?? [] }
    var test: String { judgment["resolutionCriteria"]?.string ?? judgment["falsifiers"]?.array.first { $0["status"].text != "retired" }?["text"]?.string ?? "" }
    var checkBy: Date? { judgment["resolutionHorizonAt"]?.date }
    var verdicts: [JSON] { judgment["verdicts"]?.array ?? [] }
    var revised: Bool { !(judgment["heldHistory"]?.array.isEmpty ?? true) }
    var shared: Bool { page["visibility"].text == "shared" }

    /// The check-by date has come and nothing was recorded on this wording.
    var due: Bool {
        guard !setAside, let checkBy, checkBy <= .now else { return false }
        let born = judgment["bornAt"]?.date ?? .distantPast
        return !verdicts.contains { ($0["recordedAt"]?.date ?? .distantPast) >= born }
    }

    var verdictWords: String? {
        guard let last = verdicts.last else { return nil }
        return ["held_up": "held up", "broke": "broke", "partly": "held up in part",
                "unresolvable": "could not be settled", "right_for_wrong_reasons": "was right, for the wrong reasons"][last["result"].text]
    }

    static let confidence: [(word: String, value: Double)] = [("I think so", 0.6), ("Fairly sure", 0.75), ("Sure", 0.9)]

    var confidenceWord: String? {
        guard let value = judgment["confidence"]?.double else { return nil }
        return Self.confidence.min { abs($0.value - value) < abs($1.value - value) }?.word
    }

    /// "Held 84 days · 3 for · 1 against · moved Oct 12"
    var card: String {
        var parts: [String] = []
        if let heldSince {
            let days = max(1, Calendar.current.dateComponents([.day], from: heldSince, to: .now).day ?? 1)
            parts.append("Held \(days) \(days == 1 ? "day" : "days")")
        }
        if !forLines.isEmpty { parts.append("\(forLines.count) for") }
        if !againstLines.isEmpty { parts.append("\(againstLines.count) against") }
        if let moved = judgment["lastReviewedAt"]?.date { parts.append("moved \(moved.shortDay)") }
        return parts.joined(separator: " · ")
    }

    func source(of line: JSON) -> String {
        if let label = line["sourceLabel"]?.string { return label }
        let ids = Set(line["sourceRefIds"]?.array.map(\.raw) ?? [])
        let ref = page["sourceRefs"]?.array.first { ids.contains($0.id) }
        return ref?["title"]?.string ?? ref?["citationLabel"]?.string ?? ""
    }

    /// The web PATCHes the whole judgment with the changed keys merged in.
    func patch(_ changes: [String: JSON]) async throws {
        let next = changes.reduce(judgment) { $0.setting($1.key, to: $1.value) }
        _ = try await NoeisAPI.shared.patchPage(id, ["judgment": next])
    }
}

// MARK: The list

struct ViewsList: View {
    @Binding var selection: Route?
    @State private var showingSetAside = false
    @State private var holding = false
    @State private var generation = 0

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.views().map(HeldView.init).filter { !$0.claim.isEmpty && !$0.judgment["currentJudgment"].text.isEmpty } }) { views, reload in
            let shown = views.filter { $0.setAside == showingSetAside }
                .sorted { ($0.judgment["lastReviewedAt"]?.date ?? $0.page["updatedAt"]?.date ?? .distantPast) > ($1.judgment["lastReviewedAt"]?.date ?? $1.page["updatedAt"]?.date ?? .distantPast) }
            List(selection: $selection) {
                Section {
                    ForEach(shown, id: \.id) { view in
                        NavigationLink(value: Route.view(view.id)) {
                            VStack(alignment: .leading, spacing: 6) {
                                if view.due { Kicker("Comes due", color: Ink.thread) }
                                Text(view.claim).font(.system(.body, design: .serif))
                                Text(view.card).font(.caption).foregroundStyle(Ink.subtle)
                            }
                            .padding(.vertical, 6)
                        }
                    }
                } footer: {
                    if shown.isEmpty {
                        Text(showingSetAside ? "Nothing set aside." : "Write down something you believe. Every passage you save is read against it, for or against.")
                            .font(.callout).foregroundStyle(Ink.muted).padding(.top, 8)
                    }
                }
            }
            .listStyle(.plain)
            .refreshable { await reload() }
            .onChange(of: generation) { Task { await reload() } }
        }
        .navigationTitle(showingSetAside ? "Set aside" : "Judgment")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    Picker("Show", selection: $showingSetAside) {
                        Text("Views you hold").tag(false)
                        Text("Set aside").tag(true)
                    }
                } label: { Image(systemName: "line.3.horizontal.decrease.circle") }
                    .accessibilityLabel("Show views you hold or set aside")
            }
            ToolbarItem(placement: .primaryAction) {
                Button { holding = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Hold a view")
            }
            PartnerToolbarItem(context: ["type": "workspace", "id": "library", "title": "Judgment"])
        }
        .sheet(isPresented: $holding, onDismiss: { generation += 1 }) { HoldViewSheet() }
        .paper()
    }
}

// MARK: A view

struct ViewDetail: View {
    let id: String
    @StateObject private var writer = Writer()
    @State private var editingTest = false
    @State private var revising = false

    private struct ViewData {
        var view: HeldView
        var library: [JSON]
        var reading: [JSON]
    }

    var body: some View {
        Loaded(load: { () async throws -> ViewData in
            let api = NoeisAPI.shared
            async let page = api.wikiPage(id)
            async let library = (try? await api.libraryEvidence(pageId: id)) ?? []
            async let reading = (try? await api.readingAgainst(pageId: id)) ?? []
            return ViewData(view: HeldView(page: try await page), library: await library, reading: await reading)
        }) { loaded, reload in
            let view = loaded.view
            let act = { (action: @escaping () async throws -> Void) in
                writer.run { try await action(); await reload() }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(view.claim).font(.masthead)
                        HStack(spacing: 8) {
                            if let since = view.heldSince { Text("Held since \(since.longDay)") }
                            Menu {
                                ForEach(HeldView.confidence.indices, id: \.self) { index in
                                    let option = HeldView.confidence[index]
                                    Button(option.word) { act { try await view.patch(["confidence": .number(option.value)]) } }
                                }
                            } label: {
                                Text(view.confidenceWord ?? "How sure?").underline(view.confidenceWord == nil)
                            }
                        }
                        .font(.footnote).foregroundStyle(Ink.subtle)
                        if let words = view.verdictWords {
                            Text("You said it \(words).").font(.callout).foregroundStyle(Ink.living)
                        }
                        if view.setAside {
                            Text("Set aside. Noeis is not reading against this view.").font(.callout).foregroundStyle(Ink.muted)
                        }
                    }

                    if view.due {
                        Card {
                            Kicker("Comes due")
                            Text("Did it hold up?").font(.headline2)
                            if !view.test.isEmpty { Passage(text: view.test) }
                            HStack {
                                Button("Held up") { act { _ = try await NoeisAPI.shared.recordVerdict(pageId: id, claim: view.claim, result: "held_up") } }
                                Button("Broke") { act { _ = try await NoeisAPI.shared.recordVerdict(pageId: id, claim: view.claim, result: "broke") } }
                                Button("Partly") { act { _ = try await NoeisAPI.shared.recordVerdict(pageId: id, claim: view.claim, result: "partly") } }
                            }
                            .buttonStyle(.bordered)
                        }
                    }

                    ReasonsSection(title: "For", lines: view.forLines, view: view)
                    ReasonsSection(title: "Against", lines: view.againstLines, view: view)

                    let candidates = loaded.library.filter { candidate in
                        !(view.judgment["notAboutIds"]?.array.map(\.raw).contains(candidate.id) ?? false)
                    }
                    if !candidates.isEmpty && !view.setAside {
                        VStack(alignment: .leading, spacing: 14) {
                            Kicker("From your library")
                            ForEach(candidates, id: \.self) { candidate in
                                VStack(alignment: .leading, spacing: 10) {
                                    Passage(text: candidate["text"].text, source: candidate["sourceLabel"].text)
                                    HStack {
                                        Button("File for") { act { _ = try await NoeisAPI.shared.file(pageId: id, claim: view.claim, field: "why", candidate: candidate) } }
                                        Button("File against") { act { _ = try await NoeisAPI.shared.file(pageId: id, claim: view.claim, field: "against", candidate: candidate) } }
                                        Button("Not about this") {
                                            let ids = (view.judgment["notAboutIds"]?.array ?? []) + [.string(candidate.id)]
                                            act { try await view.patch(["notAboutIds": .array(ids)]) }
                                        }
                                        .foregroundStyle(Ink.muted)
                                    }
                                    .buttonStyle(.bordered)
                                    .font(.subheadline)
                                }
                            }
                        }
                    }

                    if !loaded.reading.isEmpty && !view.setAside {
                        VStack(alignment: .leading, spacing: 14) {
                            Kicker("New reading")
                            ForEach(loaded.reading, id: \.self) { proposal in
                                let challenge = proposal.at("provenance.stance").text == "challenge"
                                VStack(alignment: .leading, spacing: 10) {
                                    Text(challenge ? "Argues against it" : "Backs it up").font(.caption.weight(.semibold)).foregroundStyle(challenge ? Ink.danger : Ink.living)
                                    Passage(text: proposal.at("provenance.after").text, source: [proposal.at("provenance.author").text, proposal["sourceLabel"].text].filter { !$0.isEmpty }.joined(separator: ", "))
                                    HStack {
                                        Button("File for") { act { _ = try await NoeisAPI.shared.file(pageId: id, claim: view.claim, field: "why", proposalId: proposal.id) } }
                                        Button("File against") { act { _ = try await NoeisAPI.shared.file(pageId: id, claim: view.claim, field: "against", proposalId: proposal.id) } }
                                        Button("Not relevant") { act { try await NoeisAPI.shared.dismissReading(pageId: id, proposalId: proposal.id) } }
                                            .foregroundStyle(Ink.muted)
                                    }
                                    .buttonStyle(.bordered)
                                    .font(.subheadline)
                                }
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Kicker("What would change my mind")
                        if view.test.isEmpty {
                            Text("Nothing written yet. Say what would tell you you were wrong, and by when.").font(.callout).foregroundStyle(Ink.muted)
                        } else {
                            Text(view.test).font(.reading)
                            if let by = view.checkBy { Text("Check by \(by.longDay)").font(.footnote).foregroundStyle(Ink.subtle) }
                        }
                        Button(view.test.isEmpty ? "Write it down" : "Change it") { editingTest = true }.font(.subheadline)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
                .column()
            }
            .refreshable { await reload() }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { revising = true } label: { Label("Hold this instead…", systemImage: "arrow.triangle.2.circlepath") }
                        if view.setAside {
                            Button { act { try await view.patch(["status": "monitoring", "parkedAt": .null]) } } label: { Label("Pick it back up", systemImage: "arrow.uturn.backward") }
                        } else {
                            Button { act { try await view.patch(["status": "parked"]) } } label: { Label("Set aside", systemImage: "archivebox") }
                        }
                        if view.revised {
                            if view.shared {
                                ShareLink(item: NoeisAPI.shared.site.appendingPathComponent("share/wiki/\(id)")) { Label("Share link", systemImage: "square.and.arrow.up") }
                                Button { act { _ = try await NoeisAPI.shared.patchPage(id, ["visibility": "private"]) } } label: { Label("Stop sharing", systemImage: "lock") }
                            } else {
                                Button { act { _ = try await NoeisAPI.shared.patchPage(id, ["visibility": "shared"]) } } label: { Label("Share how this changed", systemImage: "square.and.arrow.up") }
                            }
                        }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
                PartnerToolbarItem(context: ["type": "wiki_page", "id": .string(id), "pageId": .string(id), "title": .string(view.claim)])
            }
            .sheet(isPresented: $editingTest) {
                TestSheet(view: view) { criteria, by in
                    act { _ = try await NoeisAPI.shared.setTest(pageId: id, claim: view.claim, criteria: criteria, by: by) }
                }
            }
            .sheet(isPresented: $revising) {
                ReviseSheet(current: view.claim) { sentence in
                    act { _ = try await NoeisAPI.shared.revise(pageId: id, to: sentence) }
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .failureAlert(writer)
        .paper()
    }
}

private struct ReasonsSection: View {
    let title: String
    let lines: [JSON]
    let view: HeldView

    var body: some View {
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                Kicker(title)
                ForEach(lines, id: \.self) { line in
                    if view.source(of: line).isEmpty {
                        Text(line["text"].text).font(.reading)
                    } else {
                        Passage(text: line["text"].text, source: view.source(of: line))
                    }
                }
            }
        }
    }
}

// MARK: Sheets

/// One sentence, at most 240 characters, as the web trims it (`oneSentence`).
func oneSentence(_ value: String) -> String {
    let text = value.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    var sentence = text
    if let end = text.range(of: #"[.!?](\s|$)"#, options: .regularExpression) {
        sentence = String(text[..<text.index(after: end.lowerBound)])
    }
    return String(sentence.prefix(240))
}

struct HoldViewSheet: View {
    var initial = ""
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var held: String?
    @StateObject private var writer = Writer()

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                if let held {
                    Kicker("You hold")
                    Text(held).font(.headline2)
                    Text("From now on, what you save is read against this. Passages that back it up or push against it will find you.")
                        .font(.callout).foregroundStyle(Ink.muted)
                    Spacer()
                } else {
                    Text("What do you believe?").font(.headline2)
                    TextField("One sentence you would bet on", text: $text, axis: .vertical)
                        .font(.readingLarge)
                        .lineLimit(2...6)
                        .textFieldStyle(PaperFieldStyle())
                    Text("Write it so it could turn out wrong.").font(.footnote).foregroundStyle(Ink.subtle)
                    Spacer()
                }
            }
            .padding(24)
            .paper()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(held == nil ? "Cancel" : "Done") { dismiss() }
                }
                if held == nil {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Hold") {
                            let sentence = oneSentence(text)
                            writer.run {
                                _ = try await NoeisAPI.shared.hold(sentence)
                                withAnimation { held = sentence }
                            }
                        }
                        .disabled(oneSentence(text).isEmpty || writer.busy)
                    }
                }
            }
            .failureAlert(writer)
        }
        .onAppear { if text.isEmpty { text = initial } }
        .presentationDetents([.medium, .large])
    }
}

private struct TestSheet: View {
    let view: HeldView
    let save: (String, Date?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var criteria = ""
    @State private var hasDate = false
    @State private var by = Calendar.current.date(byAdding: .month, value: 3, to: .now) ?? .now

    var body: some View {
        NavigationStack {
            Form {
                Section("What would tell you you were wrong?") {
                    TextField("If…", text: $criteria, axis: .vertical).lineLimit(2...6)
                }
                Section {
                    Toggle("Check by a date", isOn: $hasDate)
                    if hasDate { DatePicker("Check by", selection: $by, in: Date.now..., displayedComponents: .date) }
                } footer: {
                    Text("On that day the view comes back and asks whether it held up.")
                }
            }
            .paper()
            .navigationTitle("Change my mind")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        // Noon local time, as the web sends it, so the day never slips.
                        let noon = Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: by)
                        save(criteria.trimmingCharacters(in: .whitespacesAndNewlines), hasDate ? noon : nil)
                        dismiss()
                    }
                    .disabled(criteria.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .onAppear {
            criteria = view.test
            if let checkBy = view.checkBy { hasDate = true; by = max(checkBy, .now) }
        }
    }
}

private struct ReviseSheet: View {
    let current: String
    let save: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Kicker("You held")
                Text(current).font(.reading).foregroundStyle(Ink.muted)
                Kicker("Hold this instead")
                TextField("The view you hold now", text: $text, axis: .vertical)
                    .font(.readingLarge).lineLimit(2...6).textFieldStyle(PaperFieldStyle())
                Text("The old wording stays in the view's record, so you can see how your mind changed.")
                    .font(.footnote).foregroundStyle(Ink.subtle)
                Spacer()
            }
            .padding(24)
            .paper()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hold") { save(oneSentence(text)); dismiss() }
                        .disabled(oneSentence(text).isEmpty || oneSentence(text) == current)
                }
            }
        }
        .onAppear { text = current }
        .presentationDetents([.medium, .large])
    }
}
