import CryptoKit
import Foundation

enum NoeisAPIError: LocalizedError {
    case signedOut
    case offline
    case server(String)
    /// Someone else wrote first; carries what the server holds now.
    case conflict(JSON)

    var errorDescription: String? {
        switch self {
        case .signedOut: return "Your sign-in has ended. Sign in again to pick up where you were."
        case .offline: return "Noeis could not be reached. Check your connection and try again."
        case .server(let message): return message
        case .conflict(let current): return current["error"]?.string ?? "This changed elsewhere."
        }
    }
}

extension Notification.Name {
    /// Posted when the server refuses the stored token, so the app can return
    /// to sign-in instead of showing errors on every screen.
    static let noeisSignedOut = Notification.Name("noeisSignedOut")
}

/// One client for the app and its extensions. Every call is a path on the
/// same API the web app uses; nothing here exists only for iOS.
struct NoeisAPI {
    static let shared = NoeisAPI()

    let base = URL(string: "https://note-taker-3-unrg.onrender.com")!
    let site = URL(string: "https://www.noeis.io")!

    private let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        // The API sleeps when idle; waking it can take most of a minute.
        configuration.timeoutIntervalForRequest = 75
        configuration.waitsForConnectivity = true
        // But not forever: past this, a read answers from the device instead.
        configuration.timeoutIntervalForResource = 90
        return URLSession(configuration: configuration)
    }()

    // MARK: Account

    func signIn(username: String, password: String) async throws -> String {
        let reply = try await send("POST", "/api/auth/login", body: ["username": .string(username), "password": .string(password)], signedIn: false)
        guard let token = reply["token"]?.string else { throw NoeisAPIError.server("Sign-in did not return a session.") }
        return token
    }

    func register(username: String, password: String) async throws {
        _ = try await send("POST", "/api/auth/register", body: ["username": .string(username), "password": .string(password)], signedIn: false)
    }

    func deleteAccount(password: String) async throws {
        _ = try await send("DELETE", "/api/account", body: ["password": .string(password)])
    }

    /// The theme the account wears, shared with the web.
    func theme() async throws -> String {
        try await send("GET", "/api/ui-settings")["theme"].text
    }

    /// Settings are saved whole, so the others go back as they were.
    func setTheme(_ theme: String) async throws {
        let settings = try await send("GET", "/api/ui-settings")
        _ = try await send("PUT", "/api/ui-settings", body: settings.setting("theme", to: .string(theme)))
    }

    // MARK: Wiki

    func wikiPages() async throws -> [JSON] {
        try await send("GET", "/api/wiki/pages", query: ["limit": "500", "summary": "1"]).array
    }

    func wikiPage(_ id: String) async throws -> JSON {
        try await send("GET", "/api/wiki/pages/\(id)", query: ["reader": "1"])
    }

    func wikiChanges(since: Date) async throws -> JSON {
        try await send("GET", "/api/wiki/changes", query: ["since": JSON.iso(since)])
    }

    func disagreements(pageId: String) async throws -> [JSON] {
        try await send("GET", "/api/wiki/contradictions", query: ["limit": "3", "pageId": pageId])["contradictions"]?.array ?? []
    }

    /// A new page, as the web's composer makes it: drafted from your whole
    /// library, or a living thesis that leaves the conclusions to you.
    func createWikiPage(_ topic: String, question: String? = nil) async throws -> JSON {
        var body: [String: JSON] = [
            "title": .string(topic), "pageType": "overview", "sourceScope": "entire_library",
            "createdFrom": ["type": "idea", "objectId": .null, "objectIds": [], "text": .string(topic), "label": .string(topic)]
        ]
        if let question {
            body["preset"] = "living_thesis"
            body["governingQuestion"] = .string(question)
        } else {
            body["evidencePreflight"] = true
        }
        return try await send("POST", "/api/wiki/pages", body: .object(body))
    }

    /// Drafts a page from its sources, handing on the page as it fills. The
    /// last event says whether the draft passed (`{ok, code}`).
    func buildWikiPage(_ id: String, onPage: @escaping @MainActor (JSON) -> Void) async throws -> JSON {
        #if DEBUG
        if Self.standIn != nil { try? await Task.sleep(for: .seconds(2)); return ["ok": true] }
        #endif
        var done: JSON = .null
        try await events("/api/wiki/pages/\(id)/ai/draft/stream", body: [:]) { event, payload in
            if let page = payload["page"], page != .null { await onPage(page) }
            if event == "error" { throw NoeisAPIError.server(payload["error"]?.string ?? "The page could not be drafted. Nothing was changed; try again.") }
            if event == "done" { done = payload }
        }
        return done
    }

    /// A proposed change: `{candidate, summary: {reason}}`.
    func proposedChange(pageId: String) async throws -> JSON {
        try await send("GET", "/api/wiki/pages/\(pageId)/research-candidate")
    }

    /// Accepts or rejects a proposed change, which until then stays private.
    func reviewProposedChange(pageId: String, accept: Bool) async throws {
        try await send("POST", "/api/wiki/pages/\(pageId)/research-candidate/\(accept ? "accept" : "reject")", body: [:])
    }

    // MARK: Judgment

    func views() async throws -> [JSON] {
        try await send("GET", "/api/wiki/pages", query: ["projection": "judgment", "limit": "500"]).array
    }

    /// A view whose check-by date has come: `{pageId, view, test, by}`.
    func dueView() async throws -> JSON? {
        let due = try await send("GET", "/api/judgment/due")["due"]
        return due == .null ? nil : due
    }

    /// The newest saved reading that argues with something you hold:
    /// `{pageId, view, proposal}`.
    func pushesAgainst(articleId: String? = nil) async throws -> JSON? {
        let reading = try await send("GET", "/api/judgment/pushes-against", query: articleId.map { ["articleId": $0] } ?? [:])["reading"]
        return reading == .null ? nil : reading
    }

    func libraryEvidence(pageId: String) async throws -> [JSON] {
        try await send("GET", "/api/wiki/pages/\(pageId)/library-evidence", query: ["limit": "3"])["candidates"]?.array ?? []
    }

    func readingAgainst(pageId: String) async throws -> [JSON] {
        try await send("GET", "/api/wiki/pages/\(pageId)/judgment-change-proposal")["reading"]?.array ?? []
    }

    /// Files a library passage (`candidate`) or a reading proposal for or
    /// against the view as currently held.
    func file(pageId: String, claim: String, field: String, candidate: JSON? = nil, proposalId: String? = nil) async throws -> JSON {
        var body: [String: JSON] = ["requestId": .string(UUID().uuidString), "expectedClaim": .string(claim), "field": .string(field)]
        if let proposalId { body["proposalId"] = .string(proposalId) }
        if let candidate {
            body["articleId"] = candidate["articleId"] ?? .null
            if let highlightId = candidate["highlightId"]?.string {
                body["highlightId"] = .string(highlightId)
            } else {
                body["quote"] = candidate["text"] ?? .null
            }
        }
        return try await send("POST", "/api/judgment/pages/\(pageId)/evidence", body: .object(body))
    }

    func patchPage(_ id: String, _ body: JSON) async throws -> JSON {
        try await send("PATCH", "/api/wiki/pages/\(id)", body: body)
    }

    func recordVerdict(pageId: String, claim: String, result: String) async throws -> JSON {
        try await send("POST", "/api/judgment/pages/\(pageId)/verdicts", body: [
            "requestId": .string(UUID().uuidString), "expectedClaim": .string(claim),
            "result": .string(result), "note": "", "evidenceSourceRefIds": []
        ])
    }

    func setTest(pageId: String, claim: String, criteria: String, by: Date?) async throws -> JSON {
        try await send("POST", "/api/judgment/pages/\(pageId)/resolution", body: [
            "requestId": .string(UUID().uuidString), "expectedClaim": .string(claim),
            "criteria": .string(criteria), "horizonAt": by.map { .string(JSON.iso($0)) } ?? .null
        ])
    }

    /// "Hold this instead": propose the new sentence, then accept it.
    func revise(pageId: String, to sentence: String) async throws -> JSON {
        let proposal = try await send("POST", "/api/wiki/pages/\(pageId)/judgment-change-proposals", body: ["proposedJudgment": .string(sentence)])
        let receiptId = proposal.at("proposal.id").text
        return try await send("POST", "/api/wiki/pages/\(pageId)/judgment-change-proposals/accept", body: ["receiptId": .string(receiptId)])["page"] ?? .null
    }

    func dismissReading(pageId: String, proposalId: String) async throws {
        _ = try await send("POST", "/api/wiki/pages/\(pageId)/judgment-change-proposals/reject", body: ["receiptId": .string(proposalId)])
    }

    /// Holds a new view and returns its page id.
    func hold(_ sentence: String) async throws -> String {
        let page = try await send("POST", "/api/wiki/pages", body: ["title": .string(sentence), "pageType": "topic"])
        // A reused page may be an ordinary one; only skip when it already holds this sentence.
        if page.at("judgment.currentJudgment").text.caseInsensitiveCompare(sentence) == .orderedSame {
            return page.id
        }
        _ = try await patchPage(page.id, ["judgment": ["currentJudgment": .string(sentence), "startedAt": .string(JSON.iso(Date()))]])
        return page.id
    }

    // MARK: Library

    func articles() async throws -> [JSON] {
        try await send("GET", "/api/articles", query: ["scope": "all", "sort": "recent", "includePreview": "true"]).array
    }

    func article(_ id: String) async throws -> JSON {
        try await send("GET", "/articles/\(id)")
    }

    func highlights(articleId: String) async throws -> [JSON] {
        try await send("GET", "/api/articles/\(articleId)/highlights").array
    }

    /// Marks a passage. `prefix`/`suffix` let the web open the article at it.
    func mark(articleId: String, text: String, prefix: String = "", suffix: String = "", offset: Int? = nil, color: String? = nil) async throws -> JSON {
        var anchor: [String: JSON] = ["text": .string(text), "prefix": .string(prefix), "suffix": .string(suffix)]
        if let offset { anchor["startOffsetApprox"] = .number(Double(offset)) }
        var body: [String: JSON] = ["text": .string(text), "anchor": .object(anchor)]
        if let color { body["color"] = .string(color) }
        return try await send("POST", "/articles/\(articleId)/highlights", body: .object(body))["highlight"] ?? .null
    }

    /// A thought left on a highlight.
    func note(articleId: String, highlightId: String, _ thought: String) async throws {
        _ = try await send("PATCH", "/articles/\(articleId)/highlights/\(highlightId)", body: ["note": .string(thought)])
    }

    /// Saves a link; the server fetches and keeps the readable text.
    /// Returns the article id.
    func save(url: URL, title: String? = nil) async throws -> String {
        var body: [String: JSON] = ["url": .string(url.absoluteString)]
        if let title, !title.isEmpty { body["title"] = .string(title) }
        let reply = try await send("POST", "/api/import/url", body: .object(body))
        return reply.at("article._id").text
    }

    // MARK: Editions

    /// The stand: every issue of every paper, newest first, without findings.
    func editions() async throws -> [JSON] {
        try await send("GET", "/api/editions", query: ["limit": "120"])["editions"]?.array ?? []
    }

    func edition(_ id: String) async throws -> JSON {
        try await send("GET", "/api/editions/\(id)")
    }

    /// Keep (save to Library), Later (save and move to Later), or a reader
    /// state: "opened", "dismissed", or "new" to undo. Returns the issue as it now stands.
    func act(edition id: String, item itemId: String, _ action: String) async throws -> JSON {
        let path = "/api/editions/\(id)/items/\(itemId)"
        switch action {
        case "keep": return try await send("POST", "\(path)/save")["edition"] ?? .null
        case "later": return try await send("POST", "\(path)/later")["edition"] ?? .null
        default: return try await send("POST", "\(path)/state", body: ["status": .string(action)])["edition"] ?? .null
        }
    }

    /// The one highlight of yours a finding touches, or nil when none clears the bar.
    func held(edition id: String, item itemId: String) async throws -> JSON? {
        let held = try await send("GET", "/api/editions/\(id)/items/\(itemId)/held")["held"]
        return held == nil || held == .null ? nil : held
    }

    // MARK: Think

    func notes() async throws -> [JSON] {
        try await send("GET", "/api/notebook", query: ["summary": "1", "compact": "1"]).array
    }

    func note(_ id: String) async throws -> JSON {
        try await send("GET", "/api/notebook/\(id)")
    }

    func createNote(title: String, text: String) async throws -> JSON {
        let blocks = Self.paragraphBlocks(text)
        return try await send("POST", "/api/notebook", body: ["title": .string(title), "content": .string(Self.html(blocks)), "blocks": .array(blocks)])
    }

    /// Saves a note as the web does: its blocks, whole, in order, with the
    /// passages set aside. The HTML is only a reading copy of the blocks.
    func saveNote(_ id: String, title: String, blocks: [JSON], aside: [JSON]) async throws {
        _ = try await send("PUT", "/api/notebook/\(id)", body: ["title": .string(title), "content": .string(Self.html(blocks)), "blocks": .array(blocks), "asidePieces": .array(aside)])
    }

    /// The note's private side state (wordings tried, where you were). It is
    /// revisioned: a stale write comes back as `.conflict` with the newer state.
    func saveWorkbench(_ id: String, _ state: JSON) async throws -> JSON {
        let body: JSON = ["workingState": state, "expectedRevision": .number(state["revision"]?.double ?? 0)]
        return try await send("PUT", "/api/notebook/\(id)/workbench", body: body)["workingState"] ?? state
    }

    /// Two or three other ways to say a passage, each with what it changed.
    func wordingOptions(_ id: String, target: JSON) async throws -> [JSON] {
        try await send("POST", "/api/notebook/\(id)/workbench/wording-options", body: ["target": target, "requestId": .string(UUID().uuidString)])["options"].array
    }

    func moveNote(_ id: String, stage: String? = nil, archived: Bool? = nil) async throws {
        var body: [String: JSON] = [:]
        if let stage { body["stage"] = .string(stage) }
        if let archived { body["archived"] = .bool(archived) }
        _ = try await send("PATCH", "/api/notebook/\(id)/board", body: .object(body))
    }

    /// A view you hold that this note argues the other way: `{sentence, pageId, view, key}`.
    func opposite(noteId: String) async throws -> JSON? {
        let line = try await send("POST", "/api/notebook/\(noteId)/opposite")["line"]
        return line == .null ? nil : line
    }

    func setOppositeAside(noteId: String, key: String) async throws {
        _ = try await send("POST", "/api/notebook/\(noteId)/opposite/\(key)/aside")
    }

    private static func paragraphBlocks(_ text: String) -> [JSON] {
        text.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .map { ["id": .string(UUID().uuidString.lowercased()), "type": "paragraph", "text": .string($0)] }
    }

    private static func html(_ blocks: [JSON]) -> String {
        func escaped(_ block: JSON) -> String {
            block["text"]?.raw.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;") ?? ""
        }
        var html = "", list = false
        for block in blocks {
            let type = block["type"].text
            if list && type != "bullet" { html += "</ul>"; list = false }
            switch type {
            case "bullet":
                if !list { html += "<ul>"; list = true }
                html += "<li>\(escaped(block))</li>"
            case "heading":
                let level = min(max(block["level"]?.int ?? 2, 1), 3)
                html += "<h\(level)>\(escaped(block))</h\(level)>"
            case "quote", "highlight_embed": html += "<blockquote><p>\(escaped(block))</p></blockquote>"
            case "divider": html += "<hr>"
            default: if !escaped(block).isEmpty { html += "<p>\(escaped(block))</p>" }
            }
        }
        return list ? html + "</ul>" : html
    }

    // MARK: Concepts and questions

    /// The concepts you name, by how much you have highlighted under each.
    func concepts() async throws -> [JSON] {
        try await send("GET", "/api/concepts").array.filter { concept in
            !["hiddenFromHome", "debugOnly", "archived"].contains { concept[$0] == true }
        }
    }

    /// A concept, what you highlighted and wrote under it, and its open questions.
    func concept(_ name: String) async throws -> (meta: JSON, related: JSON, questions: [JSON]) {
        async let meta = send("GET", "/api/concepts/\(name)")
        async let related = send("GET", "/api/concepts/\(name)/related", query: ["limit": "20"])
        async let questions = send("GET", "/api/concepts/\(name)/questions", query: ["status": "open"])
        return (try await meta, try await related, (try? await questions)?.array ?? [])
    }

    /// Names a concept, or rewrites what you mean by it. Only the description
    /// is sent, so its pins stay as they are.
    func saveConcept(_ name: String, description: String) async throws {
        try await send("PUT", "/api/concepts/\(name)", body: ["description": .string(description)])
    }

    func questions() async throws -> [JSON] {
        try await send("GET", "/api/questions").array
    }

    func question(_ id: String) async throws -> JSON {
        try await send("GET", "/api/questions/\(id)")
    }

    func createQuestion(_ text: String, concept: String = "") async throws -> JSON {
        try await send("POST", "/api/questions", body: [
            "text": .string(text), "settledBy": "", "status": "open",
            "conceptName": .string(concept), "linkedTagName": .string(concept), "blocks": [], "linkedHighlightIds": []
        ])
    }

    /// Changes only the fields named (`settledBy`, `status`, `text`).
    func updateQuestion(_ id: String, _ fields: JSON) async throws {
        try await send("PUT", "/api/questions/\(id)", body: fields)
    }

    // MARK: Partner

    /// One turn with the Partner, streamed as the web streams it: what it is
    /// doing (`agent-activity`), the reply as it is written (`agent-delta`),
    /// then the whole turn (`agent-final`), which is returned.
    func streamAsk(_ message: String, threadId: String?, context: JSON, history: [JSON],
                   onActivity: @escaping @MainActor (String) -> Void,
                   onDelta: @escaping @MainActor (String) -> Void) async throws -> JSON {
        var body: [String: JSON] = ["message": .string(message), "persistThread": true, "context": context, "history": .array(history), "limit": 6.0]
        if let threadId { body["threadId"] = .string(threadId) }
        #if DEBUG
        if let standIn = Self.standIn {
            await onActivity("Searched your library.")
            try? await Task.sleep(for: .milliseconds(600))
            let reply = standIn("POST", "/api/agent/chat", [:]) ?? .null
            await onDelta(reply["reply"].text)
            return reply
        }
        #endif
        var final: JSON?
        try await events("/api/agent/chat/stream", body: .object(body)) { event, payload in
            switch event {
            case "agent-activity": await onActivity(payload["summary"].text)
            case "agent-delta": await onDelta(payload["delta"].text)
            case "agent-final": final = payload
            case "error": throw NoeisAPIError.server(payload["error"]?.string ?? "The Partner could not answer.")
            default: break
            }
        }
        guard let final else { throw NoeisAPIError.server("The Partner stopped before it finished. Nothing was changed; ask again.") }
        return final
    }

    /// Reads a server-sent event stream, handing each event and its JSON on.
    private func events(_ path: String, body: JSON, each: (String, JSON) async throws -> Void) async throws {
        guard let token = NoeisAuthStore.shared.token else { throw signOut() }
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.timeoutInterval = 300
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)
        let (bytes, response): (URLSession.AsyncBytes, URLResponse)
        do { (bytes, response) = try await session.bytes(for: request) } catch { throw NoeisAPIError.offline }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { throw signOut() }
        guard (200..<300).contains(status) else { throw NoeisAPIError.server("Noeis could not do that (\(status)).") }
        var event = "message"
        for try await line in bytes.lines {
            if line.hasPrefix("event:") {
                event = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:"), let data = line.dropFirst(5).trimmingCharacters(in: .whitespaces).data(using: .utf8) {
                try await each(event, (try? JSONDecoder().decode(JSON.self, from: data)) ?? .null)
            }
        }
    }

    // MARK: Transport

    #if DEBUG
    /// Set by the app in the simulator to answer from sample data instead of the network.
    nonisolated(unsafe) static var standIn: ((String, String, [String: String]) -> JSON?)?
    #endif

    @discardableResult
    func send(_ method: String, _ path: String, query: [String: String] = [:], body: JSON? = nil, signedIn: Bool = true) async throws -> JSON {
        var components = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        if signedIn, !authorize(&request) { throw signOut() }

        // Every signed-in read is kept on the device, so a page can open from
        // it at once and still opens with no connection or a sleeping server.
        let key = method == "GET" && signedIn ? SavedCopies.key(request.url!) : nil
        let reading = Self.reading
        if reading?.saved == true {
            guard let key, let copy = SavedCopies.read(key) else { throw NoeisAPIError.offline }
            reading?.used(copy.date)
            return copy.json
        }
        let data: Data, status: Int
        do { (data, status) = try await perform(request) } catch NoeisAPIError.offline {
            guard let key, let copy = SavedCopies.read(key) else { throw NoeisAPIError.offline }
            reading?.used(copy.date)
            return copy.json
        }
        let json = (try? JSONDecoder().decode(JSON.self, from: data)) ?? .null
        if status == 401, signedIn { throw signOut() }
        if status == 409 { throw NoeisAPIError.conflict(json) }
        if status >= 500, let key, let copy = SavedCopies.read(key) {
            reading?.used(copy.date)
            return copy.json
        }
        guard (200..<300).contains(status) else {
            throw NoeisAPIError.server(json["error"]?.string ?? json["message"]?.string ?? "Noeis could not do that (\(status)).")
        }
        if let key { SavedCopies.write(key, data) }
        return json
    }

    /// Where a load's reads come from: the device only (`saved`), or the
    /// network falling back to the device. Records the oldest copy it used.
    final class Reading: @unchecked Sendable {
        let saved: Bool
        private let lock = NSLock()
        private var oldest: Date?

        init(saved: Bool) { self.saved = saved }

        /// When the oldest saved copy this load showed was kept, or nil if every read was fresh.
        var savedOn: Date? { lock.withLock { oldest } }

        fileprivate func used(_ date: Date) { lock.withLock { oldest = min(oldest ?? date, date) } }
    }

    @TaskLocal static var reading: Reading?

    /// Keeps the newest sources (and their marks) on the device while on Wi-Fi, so they can be
    /// read later with no connection. Skipped on cellular and in Low Data Mode.
    func keep(articleIds: [String]) async {
        for path in articleIds.flatMap({ ["/articles/\($0)", "/api/articles/\($0)/highlights"] }) {
            var request = URLRequest(url: base.appendingPathComponent(path))
            let key = SavedCopies.key(request.url!)
            guard SavedCopies.read(key) == nil else { continue }
            guard authorize(&request) else { return }
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.allowsExpensiveNetworkAccess = false
            request.allowsConstrainedNetworkAccess = false
            guard let (data, status) = try? await perform(request), status == 200 else { return }
            SavedCopies.write(key, data)
        }
    }

    /// Signs a request with the session, if there is one.
    private func authorize(_ request: inout URLRequest) -> Bool {
        var token = NoeisAuthStore.shared.token
        #if DEBUG
        if Self.standIn != nil { token = "sample" }
        #endif
        guard let token else { return false }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return true
    }

    private func signOut() -> NoeisAPIError {
        NoeisAuthStore.shared.clearToken()
        SavedCopies.erase()
        NotificationCenter.default.post(name: .noeisSignedOut, object: nil)
        return .signedOut
    }

    /// The response's body and status code.
    private func perform(_ request: URLRequest) async throws -> (Data, Int) {
        #if DEBUG
        if let standIn = Self.standIn {
            try? await Task.sleep(for: .milliseconds(350))
            // NOEIS_OFFLINE=1 cuts the sample network, to see the copies kept on the device.
            if ProcessInfo.processInfo.environment["NOEIS_OFFLINE"] != nil { throw NoeisAPIError.offline }
            let url = request.url!
            let query = (URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []).reduce(into: [String: String]()) { $0[$1.name] = $1.value }
            return (try JSONEncoder().encode(standIn(request.httpMethod ?? "GET", url.path, query) ?? .null), 200)
        }
        #endif
        func status(_ reply: (Data, URLResponse)) -> (Data, Int) { (reply.0, (reply.1 as? HTTPURLResponse)?.statusCode ?? 0) }
        do {
            return status(try await session.data(for: request))
        } catch let error as URLError where [URLError.networkConnectionLost, URLError.timedOut].contains(error.code) && request.httpMethod == "GET" {
            // One quiet retry for reads; a write is never repeated blind.
            do { return status(try await session.data(for: request)) } catch { throw NoeisAPIError.offline }
        } catch let error as URLError where error.code != .cancelled {
            throw NoeisAPIError.offline
        }
    }
}

/// The reads kept on the device, one file each, in Caches (iOS may clear it
/// when space runs low; it is only ever a copy). Filed under the account, so
/// one account's copies never show under another; erased on sign-out.
enum SavedCopies {
    static func key(_ url: URL) -> String { "\(NoeisAuthStore.shared.username ?? "")|\(url.absoluteString)" }

    private static let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Saved copies", isDirectory: true)

    static func read(_ key: String) -> (json: JSON, date: Date)? {
        let file = url(key)
        guard let data = try? Data(contentsOf: file), let json = try? JSONDecoder().decode(JSON.self, from: data) else { return nil }
        let date = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
        return (json, date)
    }

    static func write(_ key: String, _ data: Data) {
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? data.write(to: url(key), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    static func erase() { try? FileManager.default.removeItem(at: folder) }

    private static func url(_ key: String) -> URL {
        folder.appendingPathComponent(SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined())
    }
}
