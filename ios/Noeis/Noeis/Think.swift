import SwiftUI

// MARK: The room

/// Think, as on the web: what you wrote, the concepts you name, and the
/// questions you are trying to settle, one shelf at a time.
struct ThinkRoom: View {
    @AppStorage(Shelves.key) private var shelf: Shelves.Shelf = .notes

    var body: some View {
        Group {
            switch shelf {
            case .notes: NotesList()
            case .concepts: ConceptsList()
            case .questions: QuestionsList()
            }
        }
        .roomTitle("Think")
        .paper()
    }
}

/// The web's Think tabs, at the head of each shelf: words, the open one
/// underlined in the accent.
private struct Shelves: View {
    enum Shelf: String, CaseIterable { case notes, concepts, questions }
    static let key = "think.shelf"
    @AppStorage(Shelves.key) private var shelf: Shelf = .notes

    var body: some View {
        HStack(spacing: 22) {
            ForEach(Shelf.allCases, id: \.self) { each in
                Button { calmly(.easeOut(duration: 0.2)) { shelf = each } } label: {
                    Text(each.rawValue.capitalized)
                        .font(.system(.body, design: .serif))
                        .foregroundStyle(each == shelf ? Ink.text : Ink.muted)
                        .padding(.vertical, 8)
                        .overlay(alignment: .bottom) {
                            if each == shelf { Rectangle().fill(Ink.accent).frame(height: 1) }
                        }
                }
                .buttonStyle(QuietPress())
                .accessibilityAddTraits(each == shelf ? .isSelected : [])
            }
        }
        .padding(.bottom, 4)
    }
}

// MARK: Notes

/// What you wrote: notes, or the same notes as a board (Ideas, In progress, Done).
struct NotesList: View {
    @AppStorage("think.board") private var board = false
    @State private var showingArchive = false
    @State private var writing = false
    @State private var query = ""
    @State private var generation = 0
    @StateObject private var writer = Writer()
    @Environment(\.horizontalSizeClass) private var sizeClass

    private struct Stage: Hashable { let key: String; let title: String }
    private static let stages = [Stage(key: "idea", title: "Ideas"), Stage(key: "in_progress", title: "In progress"), Stage(key: "done", title: "Done")]

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.notes() }) { notes, reload in
            let live = notes.filter { ($0.at("board.archivedAt") == nil || $0.at("board.archivedAt") == .null) != showingArchive }
                .filter { query.isEmpty || $0.noteTitle.localizedCaseInsensitiveContains(query) || $0["snippet"].text.localizedCaseInsensitiveContains(query) }
            Group {
                if board && !showingArchive && sizeClass == .regular {
                    // The web's board: three equal columns of cards.
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            RoomHeading()
                            Shelves()
                        }
                        .padding(.horizontal, 40)
                        .column(1240)
                        HStack(alignment: .top, spacing: 28) {
                            ForEach(Self.stages, id: \.self) { stage in
                                let column = live.filter { $0.stage == stage.key }
                                VStack(alignment: .leading, spacing: 12) {
                                    Kicker("\(stage.title) · \(column.count)")
                                    ForEach(column, id: \.id) { note in card(note, reload: reload) }
                                    if column.isEmpty { Quiet("Nothing here.") }
                                }
                                .frame(maxWidth: .infinity, alignment: .topLeading)
                            }
                        }
                        .padding(.horizontal, 40)
                        .padding(.top, 8)
                        .padding(.bottom, 48)
                        .column(1240)
                    }
                } else {
                    RoomIndex {
                        Shelves()
                        if board && !showingArchive {
                            ForEach(Self.stages, id: \.self) { stage in
                                let column = live.filter { $0.stage == stage.key }
                                IndexHeading("\(stage.title) · \(column.count)")
                                ForEach(column, id: \.id) { note in row(note, reload: reload) }
                                if column.isEmpty { Quiet("Nothing here.") }
                            }
                        } else {
                            ForEach(live, id: \.id) { note in row(note, reload: reload) }
                            if live.isEmpty {
                                Quiet(showingArchive ? "Nothing archived." : "No notes yet. Write what you think; Noeis tells you when a note argues with a view you hold.")
                            }
                        }
                    }
                }
            }
            .refreshable { await reload() }
            .onChange(of: generation) { Task { await reload() } }
        }
        .searchable(text: $query, prompt: "Search notes")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    Picker("Show", selection: $board) {
                        Label("Notes", systemImage: "list.bullet").tag(false)
                        Label("Board", systemImage: "rectangle.split.3x1").tag(true)
                    }
                    Toggle(isOn: $showingArchive) { Label("Archive", systemImage: "archivebox") }
                } label: { Image(systemName: "line.3.horizontal.decrease.circle") }
                    .accessibilityLabel("Notes, board or archive")
            }
            ToolbarItem(placement: .primaryAction) {
                Button { writing = true } label: { Image(systemName: "square.and.pencil") }.accessibilityLabel("New note")
            }
            PartnerToolbarItem(context: ["type": "think", "id": "think", "title": "Think"])
        }
        .sheet(isPresented: $writing, onDismiss: { generation += 1 }) { NewNoteSheet() }
        .failureAlert(writer)
    }

    private func row(_ note: JSON, reload: @escaping () async -> Void) -> some View {
        RouteRow(route: .note(note.id)) {
            VStack(alignment: .leading, spacing: 6) {
                Text(note.noteTitle).font(.rowTitle).lineLimit(2)
                if !note["snippet"].text.isEmpty && note["snippet"].text != note.noteTitle {
                    Text(note["snippet"].text).font(.dek).foregroundStyle(Ink.muted).lineLimit(2)
                }
                if let at = note["updatedAt"]?.date { Text(at.ago).font(.meta).foregroundStyle(Ink.subtle) }
            }
            .padding(.vertical, 18)
        }
        .contextMenu { moves(note, reload: reload) }
    }

    /// A note on the board: its title and two lines, on a card of the page.
    private func card(_ note: JSON, reload: @escaping () async -> Void) -> some View {
        RouteLink(route: .note(note.id)) {
            VStack(alignment: .leading, spacing: 6) {
                Text(note.noteTitle).font(.system(.headline, design: .serif).weight(.regular)).lineLimit(3)
                if !note["snippet"].text.isEmpty && note["snippet"].text != note.noteTitle {
                    Text(note["snippet"].text).font(.footnote).foregroundStyle(Ink.muted).lineLimit(2)
                }
            }
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Ink.paper, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Ink.rule))
        }
        .contextMenu { moves(note, reload: reload) }
    }

    @ViewBuilder private func moves(_ note: JSON, reload: @escaping () async -> Void) -> some View {
        ForEach(Self.stages.filter { $0.key != note.stage }, id: \.self) { stage in
            Button("Move to \(stage.title)") { writer.run { try await NoeisAPI.shared.moveNote(note.id, stage: stage.key); await reload() } }
        }
        Button(showingArchive ? "Restore" : "Archive") {
            writer.run { try await NoeisAPI.shared.moveNote(note.id, archived: !showingArchive); await reload() }
        }
    }
}

extension JSON {
    var noteTitle: String {
        if let title = self["title"]?.string { return title }
        let snippet = self["snippet"].text
        return snippet.isEmpty ? "Untitled note" : String(snippet.prefix(60))
    }

    var stage: String { at("board.stage")?.string ?? "idea" }
}

// MARK: A note

struct NoteView: View {
    let id: String
    @State private var opposite: JSON?

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.note(id) }) { note, reload in
            let blocks = note["blocks"]?.array ?? []
            Group {
                if blocks.allSatisfy({ $0["type"].text == "paragraph" }) {
                    NoteEditor(note: note, onSaved: reload)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            Text(note.noteTitle).font(.masthead)
                            ForEach(blocks, id: \.self) { NoteBlock(block: $0) }
                            Text("Headings and quoted passages are edited on noeis.io, so nothing here can flatten them.")
                                .font(.footnote).foregroundStyle(Ink.subtle).padding(.top, 12)
                        }
                        .padding(.horizontal, 20).padding(.vertical, 24).column()
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let opposite { OppositeBanner(noteId: id, line: opposite) { calmly { self.opposite = nil } } }
            }
            .toolbar { PartnerToolbarItem(context: ["type": "notebook", "id": .string(id), "title": .string(note.noteTitle)]) }
        }
        .navigationBarTitleDisplayMode(.inline)
        .paper()
        .task {
            if let line = try? await NoeisAPI.shared.opposite(noteId: id) {
                calmly(.easeOut(duration: 0.3)) { opposite = line }
            }
        }
    }
}

private struct NoteBlock: View {
    let block: JSON

    var body: some View {
        switch block["type"].text {
        case "heading":
            Text(block["text"].text).font(.headline2).padding(.top, 6)
        case "highlight_embed":
            if let article = block["articleId"]?.string {
                NavigationLink(value: Route.article(article, passage: block["text"]?.string)) {
                    Passage(text: block["text"].text, source: block["articleTitle"].text)
                }
                .buttonStyle(.plain)
            } else {
                Passage(text: block["text"].text, source: block["articleTitle"].text)
            }
        case "article_ref":
            if let article = block["articleId"]?.string {
                NavigationLink(value: Route.article(article)) {
                    Label(block["title"].text.isEmpty ? "Saved article" : block["title"].text, systemImage: "doc.text")
                }
            }
        default:
            if !block["text"].text.isEmpty { Text(block["text"].text).font(.reading).lineSpacing(5) }
        }
    }
}

/// Plain notes are written here; the server gets paragraphs and nothing else.
private struct NoteEditor: View {
    let note: JSON
    let onSaved: () async -> Void
    @State private var title = ""
    @State private var text = ""
    @State private var savedTitle = ""
    @State private var savedText = ""
    @State private var status = ""
    @FocusState private var editing: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                TextField("Title", text: $title, axis: .vertical).font(.masthead)
                TextField("Write what you think", text: $text, axis: .vertical)
                    .font(.reading).lineSpacing(5)
                    .focused($editing)
                    .frame(minHeight: 280, alignment: .top)
                if !status.isEmpty { Text(status).font(.caption).foregroundStyle(Ink.subtle) }
            }
            .padding(.horizontal, 20).padding(.vertical, 24).column()
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear {
            title = note["title"].text
            text = (note["blocks"]?.array ?? []).map { $0["text"].text }.joined(separator: "\n")
            savedTitle = title
            savedText = text
        }
        // Saved a moment after you stop typing, like the web editor.
        .task(id: title + "\u{0}" + text) {
            guard title != savedTitle || text != savedText else { return }
            status = "Editing"
            try? await Task.sleep(for: .seconds(1.2))
            guard !Task.isCancelled else { return }
            do {
                _ = try await NoeisAPI.shared.updateNote(note.id, title: title, text: text)
                savedTitle = title
                savedText = text
                status = "Saved"
            } catch {
                status = "Not saved: \(error.localizedDescription)"
            }
        }
        // Leaving mid-pause cancels the save above, so the last words go now.
        .onDisappear {
            let (title, text) = (title, text)
            let unsaved = title != savedTitle || text != savedText
            Task {
                if unsaved { _ = try? await NoeisAPI.shared.updateNote(note.id, title: title, text: text) }
                await onSaved()
            }
        }
    }
}

/// "You hold the opposite": a view this note argues against.
private struct OppositeBanner: View {
    let noteId: String
    let line: JSON
    let dismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("You hold the opposite").font(.caption.weight(.semibold)).foregroundStyle(Ink.thread)
            Text("“\(line["sentence"].text)” argues against your view that \(line["view"].text.lowercasedFirst)")
                .font(.system(.subheadline, design: .serif))
            HStack {
                NavigationLink(value: Route.view(line["pageId"].text)) { Text("Open the view").fontWeight(.semibold) }
                Spacer()
                Button("Not now") {
                    dismiss()
                    Task { try? await NoeisAPI.shared.setOppositeAside(noteId: noteId, key: line["key"].text) }
                }
                .foregroundStyle(Ink.subtle)
            }
            .font(.subheadline)
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Ink.rule))
        .padding(.horizontal, 16).padding(.bottom, 8)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

private struct NewNoteSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var text = ""
    @StateObject private var writer = Writer()
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                TextField("Title", text: $title).font(.headline2)
                TextField("Write what you think", text: $text, axis: .vertical).font(.reading).focused($focused)
                Spacer()
            }
            .padding(24)
            .paper()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        writer.run {
                            _ = try await NoeisAPI.shared.createNote(title: title, text: text)
                            dismiss()
                        }
                    }
                    .disabled((title + text).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || writer.busy)
                }
            }
            .failureAlert(writer)
            .onAppear { focused = true }
        }
    }
}

// MARK: Concepts

/// The names you give what you keep reading about, by how much sits under each.
private struct ConceptsList: View {
    @State private var generation = 0

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.concepts() }) { concepts, reload in
            RoomIndex {
                Shelves()
                FirstLine(prompt: "Name a concept", action: "Name") { name in
                    try await NoeisAPI.shared.saveConcept(name, description: "")
                    await reload()
                    return .concept(name)
                }
                IndexHeading(concepts.count == 1 ? "1 concept" : "\(concepts.count) concepts")
                ForEach(concepts, id: \.self) { concept in
                    RouteRow(route: .concept(concept["name"].text)) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(concept["name"].text).font(.rowTitle).lineLimit(2)
                            if !concept["description"].text.isEmpty {
                                Text(concept["description"].text).font(.dek).foregroundStyle(Ink.muted).lineLimit(2)
                            }
                            Text(highlights(concept["count"]?.int ?? 0)).font(.meta).foregroundStyle(Ink.subtle)
                        }
                        .padding(.vertical, 18)
                    }
                }
                if concepts.isEmpty {
                    Quiet("No concepts yet. Tag a highlight, or name one above, and what you keep under it gathers here.")
                }
            }
            .refreshable { await reload() }
        }
        .toolbar { PartnerToolbarItem(context: ["type": "concept-index", "id": "concepts", "title": "Concepts"]) }
    }
}

private func highlights(_ count: Int) -> String {
    count == 1 ? "1 highlight" : "\(count) highlights"
}

/// A concept: what you mean by it, the questions open under it, and every
/// passage and note you filed there.
struct ConceptView: View {
    let name: String

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.concept(name) }) { concept, reload in
            let highlightsUnder = concept.related["highlights"]?.array ?? []
            let notesUnder = concept.related["notes"]?.array ?? []
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Kicker("Concept")
                    Text(concept.meta["name"].text.isEmpty ? name : concept.meta["name"].text).font(.masthead)
                    DescriptionField(name: name, saved: concept.meta["description"].text)
                    Text("\(highlights(concept.meta["allHighlightCount"]?.int ?? 0)) · \(concept.related["articles"]?.array.count ?? 0) sources")
                        .font(.footnote).foregroundStyle(Ink.subtle)

                    IndexHeading("Open questions")
                    ForEach(concept.questions, id: \.self) { question in
                        RouteRow(route: .question(question.id)) {
                            Text(question["text"].text).font(.dek).padding(.vertical, 14)
                        }
                    }
                    FirstLine(prompt: "Ask a question", action: "Ask") { text in
                        let question = try await NoeisAPI.shared.createQuestion(text, concept: name)
                        await reload()
                        return .question(question.id)
                    }

                    if !highlightsUnder.isEmpty {
                        IndexHeading("What you highlighted")
                        ForEach(highlightsUnder, id: \.self) { highlight in
                            RouteLink(route: .article(highlight["articleId"].text, passage: highlight["text"]?.string)) {
                                Passage(text: highlight["text"].text, source: highlight["articleTitle"].text)
                            }
                        }
                    }
                    if !notesUnder.isEmpty {
                        IndexHeading("Notes that mention it")
                        ForEach(notesUnder, id: \.self) { note in
                            RouteRow(route: .note(note["notebookEntryId"].text)) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(note["notebookTitle"].text).font(.rowTitle)
                                    if !note["blockPreviewText"].text.isEmpty {
                                        Text(note["blockPreviewText"].text).font(.dek).foregroundStyle(Ink.muted).lineLimit(2)
                                    }
                                }
                                .padding(.vertical, 14)
                            }
                        }
                    }
                    if highlightsUnder.isEmpty && notesUnder.isEmpty {
                        Quiet("Nothing filed here yet. Tag a highlight “\(name)” and it appears here.")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
                .column()
            }
            .refreshable { await reload() }
        }
        .toolbar { PartnerToolbarItem(context: ["type": "concept", "id": .string(name), "title": .string(name)]) }
        .navigationBarTitleDisplayMode(.inline)
        .paper()
    }
}

/// What you mean by a concept, saved a moment after you stop typing.
private struct DescriptionField: View {
    let name: String
    let saved: String
    @State private var text = ""
    @State private var last = ""
    @State private var status = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("What you mean by it, in a sentence or two.", text: $text, axis: .vertical)
                .font(.readingLarge)
                .lineLimit(1...8)
            if !status.isEmpty { Text(status).font(.caption).foregroundStyle(Ink.subtle).transition(.opacity) }
        }
        .onAppear { text = saved; last = saved }
        .task(id: text) {
            guard text != last else { return }
            try? await Task.sleep(for: .seconds(1.2))
            guard !Task.isCancelled else { return }
            do {
                try await NoeisAPI.shared.saveConcept(name, description: text)
                last = text
                calmly { status = "Saved" }
            } catch {
                status = "Not saved: \(error.localizedDescription)"
            }
        }
    }
}

// MARK: Questions

/// What you are trying to find out, and what would settle each.
private struct QuestionsList: View {
    @State private var answered = false

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.questions() }) { questions, reload in
            let shown = questions.filter { ($0["status"].text == "answered") == answered }
            RoomIndex {
                Shelves()
                if !answered {
                    FirstLine(prompt: "What are you trying to find out?", action: "Ask") { text in
                        let question = try await NoeisAPI.shared.createQuestion(text)
                        await reload()
                        return .question(question.id)
                    }
                }
                IndexHeading(answered ? "Answered" : (shown.count == 1 ? "1 open question" : "\(shown.count) open questions"))
                ForEach(shown, id: \.self) { question in
                    RouteRow(route: question.questionRoute) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(question["text"].text).font(.rowTitle).lineLimit(3).fixedSize(horizontal: false, vertical: true)
                            Text(question.questionByline).font(.meta).foregroundStyle(Ink.subtle)
                        }
                        .padding(.vertical, 18)
                    }
                }
                if shown.isEmpty {
                    Quiet(answered ? "Nothing answered yet." : "No open questions. Ask one above; the Partner looks for what in your library would settle it.")
                }
            }
            .refreshable { await reload() }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    Picker("Show", selection: $answered) {
                        Text("Open").tag(false)
                        Text("Answered").tag(true)
                    }
                } label: { Image(systemName: "line.3.horizontal.decrease.circle") }
                    .accessibilityLabel("Open or answered questions")
            }
            PartnerToolbarItem(context: ["type": "think", "id": "questions", "title": "Questions"])
        }
    }
}

private extension JSON {
    /// A question a wiki page asks opens that page; your own open their own.
    var questionRoute: Route {
        self["sourceType"].text == "wiki_open_question" ? .wikiPage(self["sourcePageId"].text) : .question(id)
    }

    var questionByline: String {
        if self["sourceType"].text == "wiki_open_question" { return "Asked by \(self["sourcePageTitle"].text)" }
        let settled = self["settledBy"].text.isEmpty ? "Nothing named would settle it yet" : "Settled by \(self["settledBy"].text.lowercasedFirst)"
        let concept = self["linkedTagName"].text
        return concept.isEmpty ? settled : "\(concept) · \(settled)"
    }
}

/// A question: its words, what would settle it, and whether it has been.
struct QuestionView: View {
    let id: String

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.question(id) }) { question, reload in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Kicker(question["status"].text == "answered" ? "Answered" : "Open question")
                    Text(question["text"].text).font(.masthead)
                    if !question["linkedTagName"].text.isEmpty {
                        RouteLink(route: .concept(question["linkedTagName"].text)) {
                            Text("Under \(question["linkedTagName"].text)").font(.footnote).foregroundStyle(Ink.thread)
                        }
                        .padding(.bottom, 12)
                    }
                    SettledByField(id: id, saved: question["settledBy"].text)
                    let passages = question.at("inquiry.run.passages")?.array ?? []
                    if !passages.isEmpty {
                        IndexHeading("What your library said")
                        ForEach(passages, id: \.self) { passage in
                            RouteLink(route: .article(passage["articleId"].text, passage: passage["passage"]?.string)) {
                                Passage(text: passage["passage"].text, source: passage["title"].text)
                            }
                        }
                    }
                    Resolve(id: id, answered: question["status"].text == "answered", decided: reload)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
                .column()
            }
            .refreshable { await reload() }
            .toolbar {
                PartnerToolbarItem(context: ["type": "question", "id": .string(id), "title": question["text"] ?? ""])
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .paper()
    }

    private struct Resolve: View {
        let id: String
        let answered: Bool
        let decided: () async -> Void
        @StateObject private var writer = Writer()

        var body: some View {
            Button(answered ? "Reopen" : "Mark answered") {
                writer.run {
                    try await NoeisAPI.shared.updateQuestion(id, ["status": .string(answered ? "open" : "answered")])
                    await decided()
                }
            }
            .buttonStyle(.bordered)
            .disabled(writer.busy)
            .padding(.top, 8)
            .failureAlert(writer)
        }
    }
}

/// "What would settle it": a question nothing could settle is a mood.
private struct SettledByField: View {
    let id: String
    let saved: String
    @State private var text = ""
    @State private var last = ""
    @State private var status = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Kicker("What would settle it")
            TextField("Name what you would need to see.", text: $text, axis: .vertical)
                .font(.reading)
                .lineLimit(1...6)
                .padding(.vertical, 8)
                .overlay(alignment: .bottom) { Hairline() }
            if !status.isEmpty { Text(status).font(.caption).foregroundStyle(Ink.subtle) }
        }
        .onAppear { text = saved; last = saved }
        .task(id: text) {
            guard text != last else { return }
            try? await Task.sleep(for: .seconds(1.2))
            guard !Task.isCancelled else { return }
            do {
                try await NoeisAPI.shared.updateQuestion(id, ["settledBy": .string(text)])
                last = text
                calmly { status = "Saved" }
            } catch {
                status = "Not saved: \(error.localizedDescription)"
            }
        }
    }
}

/// The first line of an index: write one thing and it opens.
struct FirstLine: View {
    let prompt: String
    let action: String
    let make: (String) async throws -> Route
    @State private var text = ""
    @StateObject private var writer = Writer()
    @FocusState private var focused: Bool
    @Environment(\.open) private var open

    init(prompt: String, action: String, make: @escaping (String) async throws -> Route) {
        self.prompt = prompt
        self.action = action
        self.make = make
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            TextField(prompt, text: $text, axis: .vertical)
                .font(.system(.title3, design: .serif))
                .lineLimit(1...3)
                .focused($focused)
                .submitLabel(.go)
                .onSubmit(go)
            if !clean.isEmpty {
                Button(action, action: go)
                    .buttonStyle(.ink)
                    .disabled(writer.busy)
                    .transition(.opacity)
            }
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { Hairline(color: focused ? Ink.text : Ink.rule) }
        .padding(.vertical, 8)
        .calmAnimation(.easeOut(duration: 0.18), value: clean.isEmpty)
        .failureAlert(writer)
    }

    private var clean: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func go() {
        let line = clean
        guard !line.isEmpty else { return }
        writer.run {
            let route = try await make(line)
            text = ""
            focused = false
            open(route)
        }
    }
}
