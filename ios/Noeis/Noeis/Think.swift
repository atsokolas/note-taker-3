import SwiftUI

// MARK: The list

/// What you wrote: notes, or the same notes as a board (Ideas, In progress, Done).
struct NotesList: View {
    @AppStorage("think.board") private var board = false
    @State private var showingArchive = false
    @State private var writing = false
    @State private var query = ""
    @State private var generation = 0
    @StateObject private var writer = Writer()

    private struct Stage: Hashable { let key: String; let title: String }
    private static let stages = [Stage(key: "idea", title: "Ideas"), Stage(key: "in_progress", title: "In progress"), Stage(key: "done", title: "Done")]

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.notes() }) { notes, reload in
            let live = notes.filter { ($0.at("board.archivedAt") == nil || $0.at("board.archivedAt") == .null) != showingArchive }
                .filter { query.isEmpty || $0.noteTitle.localizedCaseInsensitiveContains(query) || $0["snippet"].text.localizedCaseInsensitiveContains(query) }
            List {
                if board && !showingArchive {
                    ForEach(Self.stages, id: \.self) { stage in
                        let column = live.filter { $0.stage == stage.key }
                        Section {
                            ForEach(column, id: \.id) { note in row(note, reload: reload) }
                            if column.isEmpty { Text("Nothing here.").font(.dek).foregroundStyle(Ink.subtle).onPage() }
                        } header: { Kicker("\(stage.title) · \(column.count)") }
                    }
                } else {
                    ForEach(live, id: \.id) { note in row(note, reload: reload) }
                }
            }
            .listStyle(.plain)
            .overlay {
                if live.isEmpty && !board {
                    ContentUnavailableView(showingArchive ? "Nothing archived" : "No notes yet", systemImage: "square.and.pencil",
                                           description: Text(showingArchive ? "" : "Write what you think. Noeis tells you when a note argues with a view you hold."))
                }
            }
            .refreshable { await reload() }
            .onChange(of: generation) { Task { await reload() } }
        }
        .searchable(text: $query, prompt: "Search notes")
        .navigationTitle(showingArchive ? "Archive" : (board ? "Board" : "Think"))
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
        .paper()
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
            .padding(.vertical, 8)
        }
        .contextMenu {
            ForEach(Self.stages.filter { $0.key != note.stage }, id: \.self) { stage in
                Button("Move to \(stage.title)") { writer.run { try await NoeisAPI.shared.moveNote(note.id, stage: stage.key); await reload() } }
            }
            Button(showingArchive ? "Restore" : "Archive") {
                writer.run { try await NoeisAPI.shared.moveNote(note.id, archived: !showingArchive); await reload() }
            }
        }
        .swipeActions(edge: .trailing) {
            Button(showingArchive ? "Restore" : "Archive") {
                writer.run { try await NoeisAPI.shared.moveNote(note.id, archived: !showingArchive); await reload() }
            }
            .tint(Ink.subtle)
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
