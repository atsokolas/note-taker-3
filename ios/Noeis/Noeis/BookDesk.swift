import Foundation

/// The reading desk's grammar, and what it reads back off the marks: the
/// web's components/reader/bookDesk.js, function for function.
///
/// A line is typed with the book open beside it, so it has no modes: a number
/// in front turns to that page, a quote mark makes it the book's words, and
/// anything else is the reader's own. A question is a thought ending in "?".
/// Everything the desk shows (the page you are on, tonight's tally, the line
/// from last time) is read off the marks themselves and never stored.
enum BookDesk {
    /// Marks further apart than this were made in different sittings.
    static let sittingGap: TimeInterval = 90 * 60
    /// A book untouched this long was set down.
    static let setDownAfter: TimeInterval = 30 * 24 * 60 * 60

    /// One mark in a book: the book's words (`text`), your own (`note`), or both.
    struct Mark: Identifiable, Hashable {
        let id: String
        let text: String
        let note: String
        let page: Int?
        /// Where the Kindle put it ("Location 1234"), for a mark with no page.
        let location: String
        let createdAt: Date
        /// Typed here and still on its way to Noeis.
        var pending = false
    }

    enum Kind { case quote, note, question }

    /// What a typed line says: the page it turned to, and the book's words or your own.
    struct Line: Equatable {
        var page: Int?
        var text = ""
        var note = ""
        var isEmpty: Bool { text.isEmpty && note.isEmpty }
    }

    /// The marks of one page, under its folio ("p. 212", "Loc. 1234").
    struct Page: Identifiable {
        let label: String
        var marks: [Mark]
        var id: String { "\(label)-\(marks[0].id)" }
    }

    /// Where you left off, said back as you sit down again.
    struct LastTime: Equatable {
        let page: Int?
        let words: String
        let own: Bool
    }

    static func readLine(_ raw: String, page: Int? = nil) -> Line {
        var line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        var page = page
        if let turned = line.range(of: #"^[0-9]{1,4}(?:\s+|$)"#, options: .regularExpression) {
            if let number = Int(line[turned].trimmingCharacters(in: .whitespacesAndNewlines)), number > 0 { page = number }
            line = line[turned.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard !line.isEmpty else { return Line(page: page) }
        if let quoted = line.range(of: #"^(?:>\s*["“„«]?|["“„«])\s*"#, options: .regularExpression) {
            let text = line[quoted.upperBound...].replacingOccurrences(of: #"\s*["”»]$"#, with: "", options: .regularExpression)
            return Line(page: page, text: text)
        }
        return Line(page: page, note: line)
    }

    static func kind(of mark: Mark) -> Kind {
        if !mark.text.isEmpty { return .quote }
        return mark.note.trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix("?") ? .question : .note
    }

    /// A book read again keeps every reading. This one began when the book was
    /// last started again; marks made before it are earlier ink, still on the
    /// page, faded and dated. A first reading began at 1970, so nothing is earlier.
    static func readingSince(_ book: JSON) -> Date {
        (book["readBefore"]?.array ?? []).compactMap { $0["until"]?.date }.max() ?? .epoch
    }

    static func isEarlier(_ mark: Mark, since: Date) -> Bool { mark.createdAt < since }

    /// A book you stopped reading: not finished, and nothing written in it for a
    /// month. It stays on the shelf; the desk only asks why.
    static func setDownOn(_ book: JSON, marks: [Mark], now: Date = .now) -> Date? {
        guard book["finishedOn"].text.isEmpty else { return nil }
        let last = ([book["createdAt"]?.date ?? .epoch, readingSince(book)] + marks.map(\.createdAt)).max() ?? .epoch
        return last > .epoch && now.timeIntervalSince(last) > setDownAfter ? last : nil
    }

    /// A book is finished on a calendar day ("2026-10-19"), read here as that day.
    static func day(_ day: String, years: Int = 0) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0] + years, month: parts[1], day: parts[2]))
    }

    static func month(_ date: Date) -> String { date.formatted(.dateTime.month(.wide).year()) }

    /// Kindle marks know a location, desk marks a page. They cannot be put in one
    /// order, so the Kindle's run comes first and the pages you typed follow it,
    /// which keeps the desk line beside the marks you are making now.
    static func pages(of marks: [Mark]) -> [Page] {
        func order(_ mark: Mark) -> (Int, Int, Int, Date) {
            (mark.page == nil ? 0 : 1, mark.page ?? 0, locationNumber(mark), mark.createdAt)
        }
        return marks.sorted { order($0) < order($1) }.reduce(into: [Page]()) { pages, mark in
            let label = mark.page.map { "p. \($0)" }
                ?? mark.location.replacingOccurrences(of: #"^Location\b"#, with: "Loc.", options: .regularExpression)
            if pages.last?.label == label {
                pages[pages.count - 1].marks.append(mark)
            } else {
                pages.append(Page(label: label, marks: [mark]))
            }
        }
    }

    /// The marks split into the sittings they were made in, oldest first.
    static func sittings(of marks: [Mark]) -> [[Mark]] {
        marks.sorted { $0.createdAt < $1.createdAt }.reduce(into: [[Mark]]()) { runs, mark in
            if let last = runs.last?.last, mark.createdAt.timeIntervalSince(last.createdAt) <= sittingGap {
                runs[runs.count - 1].append(mark)
            } else {
                runs.append([mark])
            }
        }
    }

    /// The marks of the sitting still going on: the newest run, if its last mark was made just now.
    static func sitting(of marks: [Mark], now: Date = .now) -> [Mark] {
        guard let run = sittings(of: marks).last, let last = run.last,
              now.timeIntervalSince(last.createdAt) <= sittingGap else { return [] }
        return run
    }

    static func pageNow(_ marks: [Mark]) -> Int? {
        marks.filter { $0.page != nil }.max { $0.createdAt < $1.createdAt }?.page
    }

    /// A run of marks as a receipt: the pages it covered and what was written.
    /// Tonight's sitting at the desk, or a whole book on the shelf.
    static func tally(_ marks: [Mark]) -> String {
        guard !marks.isEmpty else { return "" }
        let pages = marks.compactMap(\.page)
        var span = ""
        if let low = pages.min(), let high = pages.max() { span = low == high ? "p. \(low)" : "pp. \(low)–\(high)" }
        let kinds = marks.map { kind(of: $0) }
        let words: [(Kind, String)] = [(.quote, "quote"), (.note, "note"), (.question, "question")]
        let written = words.map { pair in counted(kinds.filter { $0 == pair.0 }.count, pair.1) }
            .filter { !$0.isEmpty }.joined(separator: ", ")
        return [span, written].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// The last thing you wrote in your own words, or the last passage you marked.
    static func lastTime(_ marks: [Mark]) -> LastTime? {
        let newest = marks.sorted { $0.createdAt > $1.createdAt }
        guard let mark = newest.first(where: { !$0.note.isEmpty }) ?? newest.first else { return nil }
        let own = !mark.note.isEmpty
        // A note written to over several sittings ends with the newest of them.
        let words = own ? (mark.note.components(separatedBy: "\n\n").last ?? mark.note) : mark.text
        return LastTime(page: mark.page, words: words, own: own)
    }

    /// The book you are starting: "Middlemarch", or "Middlemarch by George Eliot".
    static func book(from name: String) -> (title: String, author: String) {
        let text = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let by = text.range(of: " by ", options: [.caseInsensitive, .backwards]), by.lowerBound > text.startIndex else { return (text, "") }
        return (text[..<by.lowerBound].trimmingCharacters(in: .whitespaces), text[by.upperBound...].trimmingCharacters(in: .whitespaces))
    }

    private static func locationNumber(_ mark: Mark) -> Int {
        mark.location.range(of: "[0-9]+", options: .regularExpression).flatMap { Int(mark.location[$0]) } ?? 0
    }

    private static func counted(_ count: Int, _ one: String) -> String {
        count == 0 ? "" : "\(count) \(count == 1 ? one : one + "s")"
    }
}

extension BookDesk.Mark {
    /// A mark as the server serializes a highlight (`page`, `location`).
    init(_ json: JSON) {
        self.init(id: json.id, text: json["text"].text, note: json["note"].text, page: json["page"]?.int,
                  location: json["location"].text, createdAt: json["createdAt"]?.date ?? .epoch)
    }
}

extension Date {
    static let epoch = Date(timeIntervalSince1970: 0)

    /// This day as the reader's own calendar names it ("2026-10-19"). A book is
    /// closed on a day, not a moment, so its anniversary is that day wherever you are.
    var calendarDay: String {
        let day = Calendar.current.dateComponents([.year, .month, .day], from: self)
        return String(format: "%04ld-%02ld-%02ld", day.year ?? 0, day.month ?? 0, day.day ?? 0)
    }
}
