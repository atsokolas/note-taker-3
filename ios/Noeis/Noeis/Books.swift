import SwiftUI

// MARK: The shelf

/// The books you are reading, paper or Kindle, each with a page of its own:
/// the desk you type at while the book is open beside you.
struct BookShelf: View {
    /// Back from a book, the shelf reads its marks again.
    @State private var seen = false

    var body: some View {
        Loaded(load: { try await NoeisAPI.shared.books() }) { books, reload in
            RoomIndex {
                FirstLine(prompt: "The book you’re reading, and who wrote it", action: "Open") { name in
                    let book = BookDesk.book(from: name)
                    return .book(try await NoeisAPI.shared.startBook(title: book.title, author: book.author))
                }
                ForEach(books, id: \.id) { book in
                    RouteRow(route: .book(book.id)) { BookRow(book: book) }
                }
                if books.isEmpty {
                    Quiet("Name a book above and it gets a page here. Books from your Kindle or Readwise arrive here too.")
                }
            }
            .refreshable { await reload() }
            .onAppear {
                if seen { Task { await reload() } }
                seen = true
            }
        }
        .roomTitle("Books")
        .paper()
    }
}

private struct BookRow: View {
    let book: JSON

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(book["title"]?.string ?? "Untitled book").font(.rowTitle).lineLimit(3)
            if let author = book["author"]?.string { Kicker(author) }
            Text(tally).font(.meta).foregroundStyle(Ink.subtle)
            if let last {
                Text(last.own ? last.words : "“\(last.words)”")
                    .font(last.own ? .callout : .quote)
                    .foregroundStyle(Ink.muted)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 20)
    }

    private var marks: [BookDesk.Mark] { (book["marks"]?.array ?? []).map { BookDesk.Mark($0) } }

    /// The sentence you closed it with, or where you left off.
    private var last: BookDesk.LastTime? {
        book["closingLine"]?.string.map { BookDesk.LastTime(page: nil, words: $0, own: true) } ?? BookDesk.lastTime(marks)
    }

    private var tally: String {
        let finished = BookDesk.day(book["finishedOn"].text)
        let written = BookDesk.tally(marks)
        return [
            finished.map { "Finished \(BookDesk.month($0))" } ?? "",
            BookDesk.setDownOn(book, marks: marks).map { "Set down in \(BookDesk.month($0))" } ?? "",
            written.isEmpty && finished == nil ? "Nothing written yet" : written
        ].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

// MARK: One book

/// One book, at its desk: what you marked, page by page, and the one line you
/// type into while the book is open beside you.
struct BookPage: View {
    let id: String

    var body: some View {
        Loaded(load: { () async throws -> (JSON, [JSON]) in
            async let book = NoeisAPI.shared.article(id)
            async let marks = NoeisAPI.shared.highlights(articleId: id)
            return (try await book, try await marks)
        }) { loaded, _ in
            Desk(id: id, loaded: loaded.0, kept: loaded.1.map { BookDesk.Mark($0) })
        }
        .navigationBarTitleDisplayMode(.inline)
        .paper()
    }
}

private struct Desk: View {
    let id: String
    let loaded: JSON
    /// The marks as Noeis holds them; `marks` adds the lines on their way there.
    let kept: [BookDesk.Mark]
    @State private var marks: [BookDesk.Mark]
    /// What closing, reopening or reading again changed, laid over the book as loaded.
    @State private var closing: JSON = [:]
    @State private var line = ""
    @State private var page: Int?
    @State private var said = ""
    /// The mark just typed, to bring into view.
    @State private var landed: String?
    @FocusState private var typing: Bool
    @Environment(\.horizontalSizeClass) private var sizeClass

    init(id: String, loaded: JSON, kept: [BookDesk.Mark]) {
        self.id = id
        self.loaded = loaded
        self.kept = kept
        _marks = State(initialValue: kept)
        let since = BookDesk.readingSince(loaded)
        _page = State(initialValue: BookDesk.pageNow(kept.filter { !BookDesk.isEarlier($0, since: since) }))
    }

    private var shown: JSON { closing.object.reduce(loaded) { $0.setting($1.key, to: $1.value) } }

    var body: some View {
        let book = shown
        let since = BookDesk.readingSince(book)
        let current = marks.filter { !BookDesk.isEarlier($0, since: since) }
        let lede = ledeLine(book, current)
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let author = book["author"]?.string { Kicker(author).padding(.bottom, 6) }
                    Text(book["title"]?.string ?? "Untitled book").font(.display)
                    VStack(alignment: .leading, spacing: 6) {
                        if !lede.label.isEmpty { Kicker(lede.label) }
                        Text(lede.words).font(lede.quoted ? .quote : .callout).foregroundStyle(Ink.muted)
                    }
                    .padding(.top, 24)
                    .padding(.bottom, 12)
                    Hairline()
                    ForEach(BookDesk.pages(of: marks)) { page in
                        PageOfMarks(page: page, since: since)
                    }
                    Closing(id: id, book: book, marks: current) { changed in
                        closing = changed.object.reduce(closing) { $0.setting($1.key, to: $1.value) }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, sizeClass == .regular ? 40 : 20)
                .padding(.top, 24)
                .column()
            }
            .defaultScrollAnchor(.bottom)
            .onChange(of: landed) {
                if let landed { calmly { proxy.scrollTo(landed, anchor: .center) } }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            typedLine(setDown: BookDesk.setDownOn(book, marks: current) != nil)
        }
        .onChange(of: kept) { marks = kept + marks.filter(\.pending) }
    }

    /// What the desk says above the marks: tonight's sitting, where you left
    /// off, a question for a book set down, or how the line works.
    private func ledeLine(_ book: JSON, _ current: [BookDesk.Mark]) -> (label: String, words: String, quoted: Bool) {
        let sitting = BookDesk.sitting(of: current)
        if !sitting.isEmpty { return ("Tonight", BookDesk.tally(sitting), false) }
        if let setDown = BookDesk.setDownOn(book, marks: current) { return ("Set down in \(BookDesk.month(setDown))", "Why’d you stop?", false) }
        if let last = BookDesk.lastTime(current) {
            return (last.page.map { "Last time, p. \($0)" } ?? "Last time", last.own ? last.words : "“\(last.words)”", !last.own)
        }
        if let before = book["readBefore"]?.array.last, let finished = BookDesk.day(before["finishedOn"].text) {
            let closingLine = before["closingLine"]?.string.map { "“\($0)”" }
            return ("Read before, finished \(BookDesk.month(finished))", closingLine ?? "What you marked then is here in faded ink.", closingLine != nil)
        }
        return ("", "Type as you read. A number turns the page; a quote mark makes the line the book’s own words.", false)
    }

    /// The one line, under the marks: the page you are on, and what you type.
    /// Return keeps the line; on a keyboard, ⌘↑ and ⌘↓ turn the page.
    private func typedLine(setDown: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("p.").font(.system(.body, design: .serif).smallCaps()).foregroundStyle(Ink.subtle)
                    TextField("–", text: pageText)
                        .keyboardType(.numberPad)
                        .font(.system(.body, design: .serif).monospacedDigit())
                        .frame(width: 44)
                        .accessibilityLabel("Page you are on")
                }
                // Vertical, so Return arrives as a newline and the field keeps
                // the keyboard: the next line follows without a tap.
                TextField(setDown ? "Why you stopped, or the next line" : "A quote, or what you think", text: $line, axis: .vertical)
                    .font(.reading)
                    .lineLimit(1...5)
                    .focused($typing)
                    .onChange(of: line) { if line.contains("\n") { keep() } }
                    .accessibilityLabel("Type a quote, a note or a question")
            }
            .padding(.vertical, 12)
            .overlay(alignment: .bottom) { Hairline(color: typing ? Ink.text : Ink.rule) }
            Text(said.isEmpty ? "Return keeps the line." : said)
                .font(.footnote)
                .foregroundStyle(Ink.subtle)
        }
        .padding(.horizontal, sizeClass == .regular ? 40 : 20)
        .padding(.top, 4)
        .padding(.bottom, 10)
        .column()
        .background(Ink.canvas, ignoresSafeAreaEdges: .bottom)
        .overlay(alignment: .top) { Hairline() }
        .background(PageKeys(page: $page))
    }

    private var pageText: Binding<String> {
        Binding(
            get: { page.map { String($0) } ?? "" },
            set: { typed in page = Int(typed.filter { $0.isASCII && $0.isNumber }).flatMap { $0 > 0 ? $0 : nil } }
        )
    }

    /// Reads the line as the web's desk does, shows it at once, and keeps it.
    /// A line that does not reach Noeis comes back to the field to try again.
    private func keep() {
        let typed = BookDesk.readLine(line.replacingOccurrences(of: "\n", with: " "), page: page)
        page = typed.page
        line = ""
        said = ""
        guard !typed.isEmpty else { return }
        let draft = BookDesk.Mark(id: "desk-\(UUID().uuidString)", text: typed.text, note: typed.note, page: typed.page,
                                  location: "", createdAt: .now, pending: true)
        marks.append(draft)
        landed = draft.id
        Task {
            do {
                let saved = BookDesk.Mark(try await NoeisAPI.shared.write(bookId: id, text: typed.text, note: typed.note, page: typed.page))
                let known = marks.contains { $0.id == saved.id }
                marks.removeAll { $0.id == draft.id || $0.id == saved.id }
                marks.append(saved)
                if known { said = "You had marked this already. It is one mark now." }
            } catch {
                marks.removeAll { $0.id == draft.id }
                if line.isEmpty { line = typed.text.isEmpty ? typed.note : "“\(typed.text)" }
                said = "That line did not save."
            }
        }
    }
}

/// ⌘↑ and ⌘↓ turn the page, as on the web.
private struct PageKeys: View {
    @Binding var page: Int?

    var body: some View {
        ZStack {
            Button("Turn back a page") { page = max(1, (page ?? 0) - 1) }
                .keyboardShortcut(.upArrow, modifiers: .command)
            Button("Turn the page") { page = max(1, (page ?? 0) + 1) }
                .keyboardShortcut(.downArrow, modifiers: .command)
        }
        .opacity(0)
        .accessibilityHidden(true)
    }
}

/// One page of marks under its folio, ruled beneath: the book's words in the
/// serif, your own in the sans, an earlier reading's faded and dated.
private struct PageOfMarks: View {
    let page: BookDesk.Page
    let since: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                Text(page.label)
                    .font(.system(.footnote, design: .serif).smallCaps())
                    .foregroundStyle(Ink.subtle)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(width: 64, alignment: .leading)
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(page.marks) { mark in
                        let earlier = BookDesk.isEarlier(mark, since: since)
                        VStack(alignment: .leading, spacing: 6) {
                            if !mark.text.isEmpty { Text(mark.text).font(.reading) }
                            if !mark.note.isEmpty {
                                Text(mark.note).font(.callout).foregroundStyle(mark.text.isEmpty ? Ink.text : Ink.muted)
                            }
                            if earlier { Text(mark.createdAt.formatted(.dateTime.year())).font(.meta).foregroundStyle(Ink.subtle) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .opacity(earlier ? 0.5 : mark.pending ? 0.6 : 1)
                        .id(mark.id)
                    }
                }
            }
            .padding(.vertical, 18)
            Hairline()
        }
    }
}

// MARK: Closing the book

/// While you read, one quiet line under the marks. Closed, the book gets its
/// colophon there, where a printed book keeps one: when you read it, what you
/// wrote, and the one sentence you said you would remember.
private struct Closing: View {
    let id: String
    let book: JSON
    /// This reading's marks.
    let marks: [BookDesk.Mark]
    let changed: (JSON) -> Void
    @State private var asking = false
    @State private var sentence = ""
    @State private var said = ""
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let finished = BookDesk.day(book["finishedOn"].text) {
                Kicker("Finished \(finished.longDay)")
                if let closingLine = book["closingLine"]?.string {
                    Text(closingLine).font(.readingLarge.italic())
                } else {
                    remember("Keep")
                }
                let colophon = colophonLine(finished)
                if !colophon.isEmpty { Text(colophon).font(.meta).foregroundStyle(Ink.subtle) }
                ForEach(earlier, id: \.self) { reading in
                    Text(alsoFinished(reading)).font(.meta).foregroundStyle(Ink.subtle)
                }
                HStack(spacing: 22) {
                    Button("Read it again") { open(again: true) }
                    Button("Still reading it") { open(again: false) }
                }
                .padding(.top, 4)
                .quiet()
            } else if asking {
                remember("Close the book")
            } else {
                Button("I’ve finished it") { asking = true }.quiet()
            }
            if !said.isEmpty { Text(said).font(.footnote).foregroundStyle(Ink.subtle) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 28)
        .padding(.bottom, 20)
    }

    /// The one sentence asked of you when a book is done. It may be left
    /// empty, and then nothing comes back.
    private func remember(_ label: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            TextField("In one sentence, what will you remember?", text: $sentence, axis: .vertical)
                .font(.readingLarge)
                .lineLimit(1...4)
            Button(label) { close() }.quiet().disabled(busy)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private var earlier: [JSON] {
        (book["readBefore"]?.array ?? []).filter { BookDesk.day($0["finishedOn"].text) != nil }
    }

    private func alsoFinished(_ reading: JSON) -> String {
        let day = BookDesk.day(reading["finishedOn"].text)?.longDay ?? ""
        return "Also finished \(day)" + (reading["closingLine"]?.string.map { ", and said: “\($0)”" } ?? "")
    }

    private func colophonLine(_ finished: Date) -> String {
        let sittings = BookDesk.sittings(of: marks)
        var parts: [String] = []
        if let first = sittings.first?.first, first.createdAt.longDay != finished.longDay { parts.append("Read from \(first.createdAt.longDay)") }
        if sittings.count > 1 { parts.append("\(sittings.count) sittings") }
        parts.append(BookDesk.tally(marks))
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func close() {
        busy = true
        Task {
            defer { busy = false }
            do {
                let closed = try await NoeisAPI.shared.close(bookId: id, line: sentence.trimmingCharacters(in: .whitespacesAndNewlines), on: Date.now.calendarDay)
                changed(closed)
                asking = false
                if let back = BookDesk.day(closed["finishedOn"].text, years: 1), closed["closingLine"]?.string != nil {
                    said = "It comes back to you on \(back.longDay)."
                } else {
                    said = "Closed without a sentence, so nothing comes back. You can still write one."
                }
            } catch {
                said = "The book did not close. Try it again."
            }
        }
    }

    private func open(again: Bool) {
        Task {
            do {
                let reply: JSON
                if again { reply = try await NoeisAPI.shared.readAgain(bookId: id) } else { reply = try await NoeisAPI.shared.reopen(bookId: id) }
                changed(reply)
                said = ""
            } catch {
                said = "The book is still closed. Try it again."
            }
        }
    }
}

private extension View {
    /// A word to press, in the quiet sans, never a filled button.
    func quiet() -> some View {
        font(.callout).foregroundStyle(Ink.muted).buttonStyle(QuietPress())
    }
}
