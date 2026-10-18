import SwiftUI
import UIKit

// The web's notebook, on iPhone and iPad: a note is blocks you can hold and
// move, a passage keeps the source it quotes, other wordings wait beside the
// sentence they would replace, and the note remembers where you were.

// MARK: Blocks and pieces

/// One block of a note, as the server and the web keep it. Its JSON travels
/// back whole, so fields the app never shows (a list's indent, a source's
/// path) survive every save.
struct Block: Identifiable, Equatable {
    var json: JSON

    var id: String { json["id"].text }
    var type: String { json["type"].text }

    var text: String {
        get { json["text"]?.raw ?? "" }
        set { json = json.setting("text", to: .string(newValue)) }
    }

    /// A passage from a source, which travels with the paragraph before it.
    var sourced: Bool {
        switch type {
        case "highlight_embed", "article_ref", "concept_ref", "question_ref", "wiki_ref": return true
        case "quote": return ["articleId", "highlightId", "sourcePath", "articleTitle"].contains { json[$0]?.string != nil }
        default: return false
        }
    }

    /// Text you type into here.
    var written: Bool { ["paragraph", "heading", "quote", "bullet"].contains(type) && !sourced }

    static func new(_ type: String = "paragraph", _ text: String = "") -> Block {
        Block(json: ["id": .string(UUID().uuidString.lowercased()), "type": .string(type), "text": .string(text)])
    }
}

/// What moves as one: a paragraph and the sources quoted under it, a heading,
/// or a list. The web calls these pieces, and so do we.
struct Piece: Identifiable {
    let blocks: Range<Int>
    let label: String
    let id: String

    static func of(_ blocks: [Block]) -> [Piece] {
        var ranges: [Range<Int>] = []
        for (index, block) in blocks.enumerated() {
            if let last = ranges.last, (block.sourced && !blocks[last.lowerBound].sourced) || (block.type == "bullet" && blocks[index - 1].type == "bullet") {
                ranges[ranges.count - 1] = last.lowerBound..<(index + 1)
            } else {
                ranges.append(index..<(index + 1))
            }
        }
        return ranges.map { range in
            let head = blocks[range.lowerBound]
            let label = head.sourced
                ? "Source · " + opening(head.json["articleTitle"]?.string ?? head.json["title"]?.string ?? head.text)
                : opening(head.text)
            return Piece(blocks: range, label: label.isEmpty ? "Untitled passage" : label, id: head.id)
        }
    }

    /// The first sentence, as the web labels a passage.
    static func opening(_ text: String, limit: Int = 100) -> String {
        let line = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        let sentence = line.firstRange(of: /[.!?](\s|$)/).map { String(line[..<line.index(after: $0.lowerBound)]) } ?? line
        return sentence.count > limit ? sentence.prefix(limit - 1).trimmingCharacters(in: .whitespaces) + "…" : sentence
    }
}

// MARK: The draft

/// A note while you work on it: its blocks, what you set aside, the private
/// side state (wordings tried, where you were), and what you did last, so it
/// can be undone.
@Observable @MainActor
final class Draft {
    let id: String
    let begun: Date?
    var title: String { didSet { if title != oldValue { edits += 1 } } }
    private(set) var blocks: [Block]
    private(set) var aside: [JSON]
    private(set) var workbench: JSON

    /// The block you are in (or were last in), which the margin follows.
    var current: String?
    /// Where the caret goes next, once the block's text view exists.
    var caret: (block: String, at: Int)?
    /// The passage selected in the current block, for trying other words.
    var selection = NSRange(location: 0, length: 0)
    /// Another wording shown in place of a passage, before you keep it.
    var preview: (block: String, text: String)?
    /// The passage whose other wordings are open beside the draft.
    var wording: JSON?
    var receipt: (text: String, undo: (() -> Void)?)?
    /// Counts changes, so saving can wait until you pause.
    private(set) var edits = 0

    init(_ note: JSON) {
        id = note.id
        begun = note["createdAt"]?.date
        title = note["title"]?.raw ?? ""
        let saved = (note["blocks"]?.array ?? []).map(Block.init(json:))
        blocks = saved.isEmpty ? [.new()] : saved
        aside = note["asidePieces"]?.array ?? []
        workbench = note["workingState"] ?? ["revision": 0.0]
        current = workbench.at("continuity.target.blockId")?.string.flatMap { id in saved.contains { $0.id == id } ? id : nil }
    }

    var pieces: [Piece] { Piece.of(blocks) }
    var currentPiece: Int? { current.flatMap { id in pieces.firstIndex { piece in blocks[piece.blocks].contains { $0.id == id } } } }

    var words: Int { blocks.reduce(title.split(whereSeparator: \.isWhitespace).count) { $0 + $1.text.split(whereSeparator: \.isWhitespace).count } }

    func index(_ block: String) -> Int? { blocks.firstIndex { $0.id == block } }

    // Writing

    func setText(_ block: String, _ text: String) {
        guard let at = index(block), blocks[at].text != text else { return }
        let lines = text.components(separatedBy: "\n")
        blocks[at].text = lines[0]
        // Pasted paragraphs become paragraphs.
        if lines.count > 1 {
            let rest = lines.dropFirst().map { Block.new(blocks[at].type == "bullet" ? "bullet" : "paragraph", $0) }
            blocks.insert(contentsOf: rest, at: at + 1)
            caret = (rest.last!.id, rest.last!.text.utf16.count)
        }
        edits += 1
    }

    /// Return: the rest of the line becomes the next block. An empty list item
    /// ends the list instead, as every editor does.
    func split(_ block: String, at offset: Int, through end: Int) {
        guard let at = index(block) else { return }
        let text = blocks[at].text as NSString
        if blocks[at].type == "bullet" && text.length == 0 {
            blocks[at].json = blocks[at].json.setting("type", to: "paragraph")
            edits += 1
            return
        }
        blocks[at].text = text.substring(to: offset)
        let next = Block.new(blocks[at].type == "bullet" ? "bullet" : "paragraph", text.substring(from: end))
        blocks.insert(next, at: at + 1)
        caret = (next.id, 0)
        current = next.id
        edits += 1
    }

    /// Delete at the very start: a heading or list item turns back into a
    /// paragraph; a paragraph joins the one before it.
    func joinBackward(_ block: String) {
        guard let at = index(block) else { return }
        if blocks[at].type != "paragraph" {
            blocks[at].json = blocks[at].json.setting("type", to: "paragraph")
        } else if at > 0, blocks[at - 1].written {
            let length = blocks[at - 1].text.utf16.count
            blocks[at - 1].text += blocks[at].text
            caret = (blocks[at - 1].id, length)
            current = blocks[at - 1].id
            blocks.remove(at: at)
        } else if blocks[at].text.isEmpty, blocks.count > 1 {
            blocks.remove(at: at)
            if let previous = blocks[..<at].lastIndex(where: \.written) {
                caret = (blocks[previous].id, blocks[previous].text.utf16.count)
                current = blocks[previous].id
            }
        } else { return }
        edits += 1
    }

    func turn(_ block: String, into type: String, level: Int? = nil) {
        guard let at = index(block) else { return }
        var json = blocks[at].json.setting("type", to: .string(type))
        if let level { json = json.setting("level", to: .number(Double(level))) }
        blocks[at].json = json
        edits += 1
    }

    // Arranging

    func move(_ piece: Int, by step: Int) {
        let all = pieces
        guard all.indices.contains(piece), all.indices.contains(piece + step) else { return }
        let (first, second) = step < 0 ? (all[piece + step], all[piece]) : (all[piece], all[piece + step])
        undoable("Moved “\(all[piece].label)” \(step < 0 ? "up" : "down")") {
            blocks.replaceSubrange(first.blocks.lowerBound..<second.blocks.upperBound, with: blocks[second.blocks] + blocks[first.blocks])
        }
    }

    /// "Try without": the passage waits under Set aside, where the web keeps
    /// it too, until you bring it back.
    func setAside(_ piece: Int) {
        let all = pieces
        guard all.indices.contains(piece) else { return }
        let range = all[piece].blocks
        undoable("Set aside “\(all[piece].label)”") {
            aside.append([
                "id": .string(all[piece].id), "label": .string(all[piece].label), "index": .number(Double(piece)),
                "beforeId": .string(range.lowerBound > 0 ? blocks[range.lowerBound - 1].id : ""),
                "afterId": .string(range.upperBound < blocks.count ? blocks[range.upperBound].id : ""),
                "nodes": [], "blocks": .array(blocks[range].map(\.json)),
            ])
            blocks.removeSubrange(range)
            if blocks.isEmpty { blocks = [.new()] }
        }
    }

    /// Back where it was: after the block it followed, if that is still here.
    func bringBack(_ piece: JSON) {
        let returning = (piece["blocks"]?.array ?? []).map(Block.init(json:))
        guard !returning.isEmpty else { return }
        undoable("Brought back “\(piece["label"].text)”") {
            aside.removeAll { $0.id == piece.id }
            let at = index(piece["beforeId"].text).map { $0 + 1 } ?? index(piece["afterId"].text) ?? blocks.count
            blocks.insert(contentsOf: returning, at: at)
        }
    }

    func delete(_ piece: Int) {
        let all = pieces
        guard all.indices.contains(piece) else { return }
        undoable("Deleted “\(all[piece].label)”") {
            blocks.removeSubrange(all[piece].blocks)
            if blocks.isEmpty { blocks = [.new()] }
        }
    }

    private func undoable(_ receipt: String, _ change: () -> Void) {
        let before = (blocks, aside)
        change()
        edits += 1
        self.receipt = (receipt, { [weak self] in
            guard let self else { return }
            (blocks, aside) = before
            edits += 1
            self.receipt = nil
        })
    }

    // Other wordings

    /// The passage to try other words on: what is selected in the block you
    /// are in, or the whole block. The web's target, offsets in UTF-16.
    func wordingTarget() -> JSON? {
        guard let current, let block = blocks.first(where: { $0.id == current }), block.written, !block.text.isEmpty else { return nil }
        var target: JSON = ["blockId": .string(block.id), "offset": .number(Double(selection.location)), "baseText": .string(block.text)]
        let length = block.text.utf16.count
        if selection.length > 0, selection.upperBound <= length, selection.length < length {
            target = target.setting("scope", to: "range")
                .setting("rangeStart", to: .number(Double(selection.location)))
                .setting("rangeEnd", to: .number(Double(selection.upperBound)))
        }
        return target
    }

    static func passage(_ target: JSON) -> String {
        let base = target["baseText"]?.raw ?? ""
        guard let start = target["rangeStart"]?.int, let end = target["rangeEnd"]?.int, end > start, end <= base.utf16.count else { return base }
        return (base as NSString).substring(with: NSRange(location: start, length: end - start))
    }

    /// Wordings tried for a passage, oldest first.
    func trials(for target: JSON) -> [JSON] {
        (workbench["trials"]?.array ?? []).filter { Self.sameSpot($0["target"] ?? nil, target) }
    }

    func trialCount(_ block: Block) -> Int {
        (workbench["trials"]?.array ?? []).filter { $0.at("target.blockId")?.string == block.id && $0.at("target.baseText")?.raw == block.text }.count
    }

    private static func sameSpot(_ a: JSON, _ b: JSON) -> Bool {
        a["blockId"] == b["blockId"] && a["baseText"] == b["baseText"] && a["rangeStart"]?.int == b["rangeStart"]?.int && a["rangeEnd"]?.int == b["rangeEnd"]?.int
    }

    func addTrial(_ target: JSON, _ alternative: String, origin: String = "human", explanation: String? = nil) {
        let wording = alternative.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !wording.isEmpty, wording != Self.passage(target), !trials(for: target).contains(where: { $0["alternative"]?.raw == wording }) else { return }
        var trial: JSON = ["id": .string(UUID().uuidString.lowercased()), "target": target, "alternative": .string(wording), "origin": .string(origin), "updatedAt": .string(JSON.iso(Date()))]
        if let explanation { trial = trial.setting("partnerExplanation", to: .string(explanation)) }
        changeWorkbench { $0["trials"] = .array(($0["trials"]?.array ?? []) + [trial]) }
    }

    func discard(_ trial: JSON) {
        if preview?.text != nil { preview = nil }
        changeWorkbench { $0["trials"] = .array(($0["trials"]?.array ?? []).filter { $0.id != trial.id }) }
    }

    func show(_ trial: JSON?) {
        guard let trial, let target = trial["target"], let at = index(target["blockId"].text) else { preview = nil; return }
        preview = (blocks[at].id, Self.replacing(target, with: trial["alternative"]?.raw ?? ""))
    }

    /// Keeps a wording: it goes into the draft, and the words it replaced
    /// wait among the others, so the choice can be reversed.
    func keep(_ trial: JSON) {
        guard let target = trial["target"], let at = index(target["blockId"].text), blocks[at].text == target["baseText"]?.raw else { return }
        let original = Self.passage(target)
        let kept = Self.replacing(target, with: trial["alternative"]?.raw ?? "")
        preview = nil
        wording = nil
        undoable("This wording is now in the draft") { blocks[at].text = kept }
        // The kept words now sit at the target's start; the old ones wait for that spot.
        let start = target["rangeStart"]?.int
        var spot: JSON = ["blockId": target["blockId"] ?? nil, "offset": target["offset"] ?? 0.0, "baseText": .string(kept)]
        if let start, kept.utf16.count > (trial["alternative"]?.raw ?? "").utf16.count {
            spot = spot.setting("scope", to: "range").setting("rangeStart", to: .number(Double(start)))
                .setting("rangeEnd", to: .number(Double(start + (trial["alternative"]?.raw ?? "").utf16.count)))
        }
        changeWorkbench { $0["trials"] = .array(($0["trials"]?.array ?? []).filter { $0.id != trial.id }) }
        addTrial(spot, original)
    }

    private static func replacing(_ target: JSON, with wording: String) -> String {
        let base = target["baseText"]?.raw ?? ""
        guard let start = target["rangeStart"]?.int, let end = target["rangeEnd"]?.int, end > start, end <= base.utf16.count else { return wording }
        return (base as NSString).replacingCharacters(in: NSRange(location: start, length: end - start), with: wording)
    }

    // Saving

    var body: (title: String, blocks: [JSON], aside: [JSON]) {
        (title, blocks.filter { !$0.written || !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }.map(\.json), aside)
    }

    /// Side state is written on its own, revisioned: if another device wrote
    /// first, the change is laid over what it wrote and sent again.
    @ObservationIgnored private var pendingWorkbench: [([String: JSON]) -> [String: JSON]] = []

    func changeWorkbench(_ change: @escaping (inout [String: JSON]) -> Void) {
        let step: ([String: JSON]) -> [String: JSON] = { var state = $0; change(&state); return state }
        workbench = .object(step(workbench.object))
        pendingWorkbench.append(step)
        Task { await saveWorkbench() }
    }

    /// Where you were, so the note opens there next time.
    func leaveContinuity() {
        guard let current, let block = blocks.first(where: { $0.id == current }) else { return }
        let target: JSON = ["blockId": .string(block.id), "offset": .number(Double(selection.location)), "baseText": .string(block.text)]
        changeWorkbench { $0["continuity"] = ["target": target, "scrollY": 0.0, "updatedAt": .string(JSON.iso(Date()))] }
    }

    @ObservationIgnored private var savingWorkbench = false

    private func saveWorkbench() async {
        guard !savingWorkbench, !pendingWorkbench.isEmpty else { return }
        savingWorkbench = true
        defer { savingWorkbench = false }
        let steps = pendingWorkbench
        pendingWorkbench.removeAll()
        // What the server answers, with anything changed meanwhile laid over it.
        func settle(_ answer: JSON) { workbench = .object(pendingWorkbench.reduce(answer.object) { $1($0) }) }
        do {
            settle(try await NoeisAPI.shared.saveWorkbench(id, workbench))
        } catch NoeisAPIError.conflict(let reply) {
            // Only what was sent goes over the newer state; later changes follow it.
            workbench = .object(steps.reduce(reply["workingState"]?.object ?? [:]) { $1($0) })
            if let answer = try? await NoeisAPI.shared.saveWorkbench(id, workbench) { settle(answer) }
        } catch {}
        if !pendingWorkbench.isEmpty { await saveWorkbench() }
    }
}

// MARK: The note

struct NoteView: View {
    let id: String

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.note(id) }) { note, reload in
            NotebookPage(draft: Draft(note), reload: reload)
        }
        .navigationBarTitleDisplayMode(.inline)
        .paper()
    }
}

private struct NotebookPage: View {
    @State var draft: Draft
    let reload: () async -> Void
    @State private var saved = 0
    @State private var status = ""
    @State private var outline = false
    @State private var opposite: JSON?
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let line = draft.workbench.at("nextTimeLine.text")?.string {
                        LineYouLeft(text: line) {
                            if let block = draft.workbench.at("nextTimeLine.target.blockId")?.string, let at = draft.index(block) {
                                if let piece = draft.pieces.first(where: { $0.blocks.contains(at) }) { calmly { scroll.scrollTo(piece.id, anchor: .top) } }
                                draft.caret = (block, draft.blocks[at].text.utf16.count)
                            }
                        }
                    }
                    TextField("Title", text: $draft.title, axis: .vertical).font(.masthead)
                    Text(begunLine).font(.meta).foregroundStyle(Ink.subtle).padding(.top, 6).padding(.bottom, 22)
                    ForEach(Array(draft.pieces.enumerated()), id: \.element.id) { index, piece in
                        PieceView(draft: draft, piece: piece, index: index)
                            .id(piece.id)
                    }
                    if !draft.aside.isEmpty { SetAside(draft: draft).padding(.top, 36) }
                    if !status.isEmpty { Text(status).font(.caption).foregroundStyle(Ink.subtle).padding(.top, 24) }
                }
                // A wider margin than a reader's: the handle lives in it.
                .padding(.horizontal, sizeClass == .regular ? 40 : 30)
                .padding(.vertical, 24)
                .column()
            }
            .scrollDismissesKeyboard(.interactively)
            .calmAnimation(.easeOut(duration: 0.22), value: draft.pieces.map(\.id))
            .onAppear {
                guard let piece = draft.currentPiece else { return }
                scroll.scrollTo(draft.pieces[piece].id, anchor: .top)
            }
            // The passage being reworded rises above the wordings, to be seen changing.
            .onChange(of: draft.wording?["blockId"]?.string) { _, block in
                guard let block, let at = draft.index(block), let piece = draft.pieces.first(where: { $0.blocks.contains(at) }) else { return }
                calmly { scroll.scrollTo(piece.id, anchor: .top) }
            }
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button { outline = true } label: { Image(systemName: "list.bullet.indent") }
                        .accessibilityLabel("Where you are")
                        .popover(isPresented: $outline) {
                            Outline(draft: draft) { piece in
                                outline = false
                                calmly { scroll.scrollTo(piece.id, anchor: .top) }
                                draft.current = piece.id
                            }
                            .presentationCompactAdaptation(.sheet)
                            .presentationDetents([.medium, .large])
                        }
                    Button { draft.wording = draft.wordingTarget() } label: { Image(systemName: "character.cursor.ibeam") }
                        .accessibilityLabel("Try other wording")
                        .disabled(draft.wordingTarget() == nil)
                }
                PartnerToolbarItem(context: ["type": "notebook", "id": .string(draft.id), "title": .string(draft.title)])
            }
        }
        .background { ArrangeKeys(draft: draft) }
        .modifier(Beside(draft: draft, wide: sizeClass == .regular))
        // The bar keeps its frost over the draft, whatever the scroll view tells it.
        .toolbarBackground(.visible, for: .navigationBar)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if let receipt = draft.receipt { Receipt(text: receipt.text, undo: receipt.undo) { draft.receipt = nil } }
                if let opposite { OppositeBanner(noteId: draft.id, line: opposite) { calmly { self.opposite = nil } } }
            }
            .calmAnimation(.easeOut(duration: 0.2), value: draft.receipt?.text)
        }
        // Saved a moment after you pause, as the web saves.
        .task(id: draft.edits) {
            guard draft.edits != saved else { return }
            status = "Editing"
            try? await Task.sleep(for: .seconds(0.85))
            guard !Task.isCancelled else { return }
            await save()
        }
        .task { if let line = try? await NoeisAPI.shared.opposite(noteId: draft.id) { calmly(.easeOut(duration: 0.3)) { opposite = line } } }
        // Leaving mid-pause cancels the save above, so the last words go now.
        .onDisappear {
            draft.leaveContinuity()
            Task {
                if draft.edits != saved { await save() }
                await reload()
            }
        }
    }

    private func save() async {
        let edits = draft.edits, body = draft.body
        do {
            try await NoeisAPI.shared.saveNote(draft.id, title: body.title, blocks: body.blocks, aside: body.aside)
            saved = edits
            status = "Saved"
        } catch {
            status = "Not saved: \(error.localizedDescription)"
        }
    }

    private var begunLine: String {
        let words = draft.words == 1 ? "1 word" : "\(draft.words) words"
        guard let begun = draft.begun else { return words }
        return "Begun \(begun.formatted(.dateTime.weekday(.wide).day().month(.wide))) · \(words)"
    }
}

/// A piece in the margin's care: the one you are in carries a thread rule
/// down its side and a handle to move, set aside, or reword it.
private struct PieceView: View {
    let draft: Draft
    let piece: Piece
    let index: Int
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let here = draft.currentPiece == index
        VStack(alignment: .leading, spacing: 12) {
            ForEach(draft.blocks[piece.blocks]) { block in BlockView(draft: draft, block: block) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // In the margin, out of the text's way.
        .overlay(alignment: .topLeading) {
            ZStack(alignment: .top) {
                Rectangle().fill(Ink.thread).frame(width: 1.5).opacity(here ? 0.7 : 0)
                if here { ArrangeMenu(draft: draft, index: index, count: draft.pieces.count).transition(.opacity) }
            }
            .frame(width: 22)
            .offset(x: (sizeClass == .regular ? -36 : -26))
        }
        .padding(.vertical, 6)
        .calmAnimation(.easeOut(duration: 0.18), value: here)
    }
}

private struct ArrangeMenu: View {
    let draft: Draft
    let index: Int
    let count: Int

    var body: some View {
        Menu {
            Button("Move up", systemImage: "arrow.up") { draft.move(index, by: -1) }.disabled(index == 0)
            Button("Move down", systemImage: "arrow.down") { draft.move(index, by: 1) }.disabled(index >= count - 1)
            Button("Try without", systemImage: "eye.slash") { draft.setAside(index) }
            Button("Try another wording", systemImage: "character.cursor.ibeam") { draft.wording = draft.wordingTarget() }
            if let current = draft.current, let at = draft.index(current), draft.blocks[at].written {
                Menu("Turn into") {
                    Button("Paragraph") { draft.turn(current, into: "paragraph") }
                    Button("Heading") { draft.turn(current, into: "heading", level: 2) }
                    Button("Subhead") { draft.turn(current, into: "heading", level: 3) }
                    Button("List") { draft.turn(current, into: "bullet") }
                    Button("Quote") { draft.turn(current, into: "quote") }
                }
            }
            Divider()
            Button("Delete", systemImage: "trash", role: .destructive) { draft.delete(index) }
        } label: {
            // The web's six-dot handle.
            Grid(horizontalSpacing: 3, verticalSpacing: 3) {
                ForEach(0..<3, id: \.self) { _ in
                    GridRow { Circle().frame(width: 3, height: 3); Circle().frame(width: 3, height: 3) }
                }
            }
            .foregroundStyle(Ink.thread)
            .frame(width: 22, height: 28)
            .background(Ink.canvas)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Arrange this passage")
    }
}

/// ⌘⌥↑ and ⌘⌥↓ move the passage you are in, as on the web.
private struct ArrangeKeys: View {
    let draft: Draft

    var body: some View {
        ZStack {
            Button("Move passage up") { if let piece = draft.currentPiece { draft.move(piece, by: -1) } }
                .keyboardShortcut(.upArrow, modifiers: [.command, .option])
            Button("Move passage down") { if let piece = draft.currentPiece { draft.move(piece, by: 1) } }
                .keyboardShortcut(.downArrow, modifiers: [.command, .option])
        }
        .opacity(0)
        .accessibilityHidden(true)
    }
}

private struct BlockView: View {
    let draft: Draft
    let block: Block

    var body: some View {
        let tried = block.written ? draft.trialCount(block) : 0
        VStack(alignment: .leading, spacing: 4) {
            switch block.type {
            case _ where block.sourced:
                let title = block.json["articleTitle"]?.string ?? block.json["title"]?.string ?? ""
                if let article = block.json["articleId"]?.string {
                    RouteLink(route: .article(article, passage: block.json["text"]?.string)) {
                        if block.type == "article_ref" { Label(title.isEmpty ? "Saved article" : title, systemImage: "doc.text").font(.callout) }
                        else { Passage(text: block.text, source: title) }
                    }
                } else {
                    Passage(text: block.text.isEmpty ? title : block.text, source: block.text.isEmpty ? "" : title)
                }
            case "divider":
                Hairline().padding(.vertical, 8)
            case "bullet":
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("•").font(.reading).foregroundStyle(Ink.muted)
                    BlockText(draft: draft, block: block)
                }
                .padding(.leading, CGFloat(block.json["indent"]?.int ?? 0) * 18)
            case "quote":
                HStack(spacing: 14) {
                    Rectangle().fill(Ink.rule).frame(width: 2)
                    BlockText(draft: draft, block: block)
                }
            default:
                if block.written { BlockText(draft: draft, block: block).padding(.top, block.type == "heading" ? 14 : 0) }
                else { Text(block.text).font(.system(.callout, design: .monospaced)).foregroundStyle(Ink.muted) }
            }
            if tried > 0 {
                Button(tried == 1 ? "1 other wording" : "\(tried) other wordings") {
                    draft.current = block.id
                    draft.selection = NSRange(location: 0, length: 0)
                    draft.wording = (draft.workbench["trials"]?.array ?? []).first { $0.at("target.blockId")?.string == block.id && $0.at("target.baseText")?.raw == block.text }?["target"]
                }
                .font(.caption)
                .foregroundStyle(Ink.thread)
                .buttonStyle(QuietPress())
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

// MARK: Typing

/// A block's text, typed in a text view so Return and Delete behave as in
/// any editor: Return starts the next block, Delete at the start joins it to
/// the one before.
private struct BlockText: UIViewRepresentable {
    let draft: Draft
    let block: Block

    func makeCoordinator() -> Coordinator { Coordinator(draft: draft, id: block.id) }

    func makeUIView(context: Context) -> Field {
        let view = Field()
        view.isScrollEnabled = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.adjustsFontForContentSizeCategory = true
        view.delegate = context.coordinator
        view.joinBackward = { [weak coordinator = context.coordinator] in coordinator?.joinBackward() }
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }

    func updateUIView(_ view: Field, context: Context) {
        context.coordinator.id = block.id
        let palette = context.environment.palette
        let previewing = draft.preview?.block == block.id
        let shown = previewing ? draft.preview!.text : block.text
        let style = NSMutableParagraphStyle()
        style.lineSpacing = block.type == "heading" ? 2 : 5
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: previewing ? palette.thread : palette.text, .paragraphStyle: style]
        if view.text != shown || view.font != font || previewing != !view.isEditable {
            let selected = view.selectedRange
            view.attributedText = NSAttributedString(string: shown, attributes: attributes)
            if !previewing, selected.upperBound <= (shown as NSString).length { view.selectedRange = selected }
        }
        view.typingAttributes = attributes
        view.isEditable = !previewing
        view.accessibilityLabel = previewing ? "Trial wording. The draft is unchanged." : nil
        if let caret = draft.caret, caret.block == block.id {
            // After a joined block's view has let go of the keyboard.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                view.becomeFirstResponder()
                view.selectedRange = NSRange(location: min(caret.at, (view.text as NSString).length), length: 0)
                if draft.caret?.block == block.id { draft.caret = nil }
            }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: Field, context: Context) -> CGSize? {
        let width = proposal.width ?? 320
        return CGSize(width: width, height: ceil(uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height))
    }

    private var font: UIFont {
        switch block.type {
        case "heading": return block.json["level"]?.int == 3 ? ArticleBody.serif(.title3, 21, .semibold) : ArticleBody.serif(.title2, 24, .semibold)
        case "quote": return ArticleBody.serif(.body, 19, .regular, italic: true)
        default: return ArticleBody.serif(.body, 19, .regular)
        }
    }

    final class Field: UITextView {
        var joinBackward: (() -> Void)?

        override func deleteBackward() {
            if selectedRange == NSRange(location: 0, length: 0) { joinBackward?() } else { super.deleteBackward() }
        }
    }

    @MainActor
    final class Coordinator: NSObject, UITextViewDelegate {
        let draft: Draft
        var id: String

        init(draft: Draft, id: String) { self.draft = draft; self.id = id }

        func joinBackward() { draft.joinBackward(id) }

        func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            guard text == "\n" else { return true }
            draft.split(id, at: range.location, through: range.upperBound)
            return false
        }

        func textViewDidChange(_ textView: UITextView) { draft.setText(id, textView.text) }
        func textViewDidBeginEditing(_ textView: UITextView) { draft.current = id }
        func textViewDidChangeSelection(_ textView: UITextView) {
            guard textView.isFirstResponder else { return }
            draft.selection = textView.selectedRange
        }
    }
}

// MARK: Other wordings

/// On iPad the wordings open in a column beside the draft, as the web's rail;
/// on iPhone, in a sheet over its lower half.
private struct Beside: ViewModifier {
    let draft: Draft
    let wide: Bool

    func body(content: Content) -> some View {
        let open = Binding(get: { draft.wording.map(Wording.init) }, set: { if $0 == nil { draft.wording = nil; draft.preview = nil } })
        if wide {
            content.inspector(isPresented: Binding(get: { open.wrappedValue != nil }, set: { if !$0 { open.wrappedValue = nil } })) {
                if let wording = open.wrappedValue { Alternatives(draft: draft, target: wording.target).inspectorColumnWidth(min: 300, ideal: 340, max: 420) }
            }
        } else {
            content.sheet(item: open) { Alternatives(draft: draft, target: $0.target) }
        }
    }

    struct Wording: Identifiable {
        let target: JSON
        var id: String { "\(target["blockId"].text)|\(target["rangeStart"]?.int ?? -1)|\(target["rangeEnd"]?.int ?? -1)" }
    }
}

/// Beside the draft (on iPhone, under it): the passage as written, the other
/// ways you or the Partner tried, and the one shown in place until you keep
/// it or put it away. Nothing changes in the draft until you keep one.
private struct Alternatives: View {
    let draft: Draft
    let target: JSON
    @State private var another = ""
    @State private var chosen: String?
    @State private var asking = false
    @State private var failure: String?
    @FocusState private var typing: Bool

    var body: some View {
        let trials = draft.trials(for: target)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("Original")
                    Option(text: Draft.passage(target), note: nil, chosen: chosen == nil) { choose(nil) }
                    Hairline()
                    ForEach(trials, id: \.id) { trial in
                        Option(text: trial["alternative"]?.raw ?? "", note: trial["origin"].text == "partner" ? (trial["partnerExplanation"]?.string ?? "Partner proposal") : nil, chosen: chosen == trial.id) { choose(trial) }
                        if chosen == trial.id {
                            HStack(spacing: 10) {
                                Button("Keep wording") { draft.keep(trial) }.buttonStyle(.ink)
                                Button("Discard") { chosen = nil; draft.discard(trial) }.foregroundStyle(Ink.muted)
                            }
                            .padding(.bottom, 14)
                        }
                        Hairline()
                    }
                    TextField("Another way…", text: $another, axis: .vertical)
                        .font(.reading)
                        .focused($typing)
                        .submitLabel(.done)
                        .onSubmit(addAnother)
                        .onChange(of: another) { if another.contains("\n") { addAnother() } }
                        .padding(.vertical, 14)
                    Hairline()
                    Button {
                        Task { await askPartner() }
                    } label: {
                        Label(asking ? "Partner options…" : "Partner options", systemImage: "sparkles").font(.callout)
                    }
                    .disabled(asking)
                    .foregroundStyle(Ink.thread)
                    .padding(.top, 16)
                    Text(failure ?? "Suggestions stay in this list until you keep one.")
                        .font(.footnote).foregroundStyle(Ink.subtle).padding(.top, 6)
                }
                .padding(20)
            }
            .navigationTitle("Alternatives")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { draft.wording = nil; draft.preview = nil }
                }
            }
            .paper()
        }
        .presentationDetents([.fraction(0.45), .large])
        // The draft stays bright above the sheet, so a wording shows in place.
        .presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.45)))
    }

    private func choose(_ trial: JSON?) {
        chosen = trial?.id
        draft.show(trial)
    }

    private func addAnother() {
        draft.addTrial(target, another.replacingOccurrences(of: "\n", with: " "))
        another = ""
    }

    private func askPartner() async {
        asking = true
        failure = nil
        defer { asking = false }
        do {
            let options = try await NoeisAPI.shared.wordingOptions(draft.id, target: target)
            options.forEach { draft.addTrial(target, $0["wording"]?.raw ?? "", origin: "partner", explanation: $0["explanation"]?.string) }
            if options.isEmpty { failure = "The Partner had nothing distinct to offer for this passage." }
        } catch {
            failure = error.localizedDescription
        }
    }

    private struct Option: View {
        let text: String
        let note: String?
        let chosen: Bool
        let action: () -> Void

        var body: some View {
            Button(action: action) {
                HStack(alignment: .top, spacing: 12) {
                    Rectangle().fill(Ink.thread).frame(width: 2).opacity(chosen ? 1 : 0)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(text).font(.reading).foregroundStyle(Ink.text).multilineTextAlignment(.leading)
                        if let note { Text(note).font(.footnote).foregroundStyle(Ink.subtle) }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(QuietPress())
            .accessibilityAddTraits(chosen ? .isSelected : [])
        }
    }
}

// MARK: Where you are

/// The note's passages in order, the one you are in marked, set-aside ones
/// below. Tap one to go there.
private struct Outline: View {
    let draft: Draft
    let go: (Piece) -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(draft.pieces.enumerated()), id: \.element.id) { index, piece in
                        let heading = draft.blocks[piece.blocks.lowerBound].type == "heading"
                        Button { go(piece) } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Circle().fill(Ink.thread).frame(width: 6, height: 6).opacity(draft.currentPiece == index ? 1 : 0)
                                Text(piece.label)
                                    .font(heading ? .system(.body, design: .serif).weight(.semibold) : .system(.callout, design: .serif))
                                    .foregroundStyle(draft.currentPiece == index ? Ink.text : Ink.muted)
                                    .multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 10)
                            .padding(.leading, heading ? 0 : 12)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(QuietPress())
                        .accessibilityAddTraits(draft.currentPiece == index ? .isSelected : [])
                    }
                    if !draft.aside.isEmpty {
                        Kicker("Set aside").padding(.top, 20)
                        ForEach(draft.aside, id: \.id) { Text($0["label"].text).font(.callout).foregroundStyle(Ink.subtle).padding(.vertical, 6) }
                    }
                }
                .padding(20)
            }
            .navigationTitle(draft.currentPiece.map { "Passage \($0 + 1) of \(draft.pieces.count)" } ?? "\(draft.pieces.count) passages")
            .navigationBarTitleDisplayMode(.inline)
            .paper()
        }
        .frame(minWidth: 320, minHeight: 360)
    }
}

/// The passages you tried without, waiting to come back.
private struct SetAside: View {
    let draft: Draft

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Kicker("Set aside")
            ForEach(draft.aside, id: \.id) { piece in
                HStack(alignment: .firstTextBaseline) {
                    Text(piece["label"].text).font(.callout).foregroundStyle(Ink.muted).lineLimit(2)
                    Spacer(minLength: 12)
                    if (piece["blocks"]?.array ?? []).isEmpty {
                        Text("Bring back on noeis.io").font(.caption).foregroundStyle(Ink.subtle)
                    } else {
                        Button("Bring back") { draft.bringBack(piece) }.font(.callout).foregroundStyle(Ink.thread)
                    }
                }
            }
        }
    }
}

/// "A line you left yourself", from the last sitting.
private struct LineYouLeft: View {
    let text: String
    let pickUp: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Kicker("A line you left yourself", color: Ink.thread)
            Text(text).font(.system(.callout, design: .serif).italic())
            Button("Pick up here →", action: pickUp).font(.callout.weight(.medium)).foregroundStyle(Ink.thread)
        }
        .padding(.bottom, 24)
    }
}

/// What just happened, with the way back.
private struct Receipt: View {
    let text: String
    let undo: (() -> Void)?
    let dismiss: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Text(text).font(.footnote).lineLimit(2)
            Spacer(minLength: 8)
            if let undo { Button("Undo", action: undo).font(.footnote.weight(.semibold)) }
            Button(action: dismiss) { Image(systemName: "xmark").font(.caption) }.accessibilityLabel("Dismiss")
        }
        .foregroundStyle(Ink.text)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Ink.rule))
        .padding(.horizontal, 16)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .task(id: text) {
            try? await Task.sleep(for: .seconds(10))
            guard !Task.isCancelled else { return }
            dismiss()
        }
    }
}
