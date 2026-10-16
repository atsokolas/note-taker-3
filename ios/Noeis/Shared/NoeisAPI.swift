import Foundation

enum NoeisAPIError: LocalizedError {
    case signedOut
    case offline
    case server(String)

    var errorDescription: String? {
        switch self {
        case .signedOut: return "Your sign-in has ended. Sign in again to pick up where you were."
        case .offline: return "Noeis could not be reached. Check your connection and try again."
        case .server(let message): return message
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
    func mark(articleId: String, text: String, prefix: String = "", suffix: String = "", offset: Int? = nil) async throws -> JSON {
        var anchor: [String: JSON] = ["text": .string(text), "prefix": .string(prefix), "suffix": .string(suffix)]
        if let offset { anchor["startOffsetApprox"] = .number(Double(offset)) }
        return try await send("POST", "/articles/\(articleId)/highlights", body: ["text": .string(text), "anchor": .object(anchor)])["highlight"] ?? .null
    }

    /// Saves a link; the server fetches and keeps the readable text.
    /// Returns the article id.
    func save(url: URL, title: String? = nil) async throws -> String {
        var body: [String: JSON] = ["url": .string(url.absoluteString)]
        if let title, !title.isEmpty { body["title"] = .string(title) }
        let reply = try await send("POST", "/api/import/url", body: .object(body))
        return reply.at("article._id").text
    }

    // MARK: Think

    func notes() async throws -> [JSON] {
        try await send("GET", "/api/notebook", query: ["summary": "1", "compact": "1"]).array
    }

    func note(_ id: String) async throws -> JSON {
        try await send("GET", "/api/notebook/\(id)")
    }

    func createNote(title: String, text: String) async throws -> JSON {
        try await send("POST", "/api/notebook", body: ["title": .string(title), "content": .string(Self.html(text)), "blocks": .array(Self.paragraphBlocks(text))])
    }

    /// Saves a note whose blocks are all paragraphs. The blocks travel with
    /// the HTML so the server never flattens anything it did not have to.
    func updateNote(_ id: String, title: String, text: String) async throws -> JSON {
        try await send("PUT", "/api/notebook/\(id)", body: ["title": .string(title), "content": .string(Self.html(text)), "blocks": .array(Self.paragraphBlocks(text))])
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
            .map { ["id": .string("ios-\(UUID().uuidString.prefix(8).lowercased())"), "type": "paragraph", "text": .string($0)] }
    }

    private static func html(_ text: String) -> String {
        text.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .map { "<p>\($0.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;"))</p>" }
            .joined()
    }

    // MARK: Partner

    /// One turn with the Partner. Pass back the returned thread id so a
    /// conversation stays one thread on every device.
    func ask(_ message: String, threadId: String?, context: JSON) async throws -> JSON {
        var body: [String: JSON] = ["message": .string(message), "persistThread": true, "context": context]
        if let threadId { body["threadId"] = .string(threadId) }
        return try await send("POST", "/api/agent/chat", body: .object(body))
    }

    // MARK: Transport

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
        if signedIn {
            guard let token = NoeisAuthStore.shared.token else { throw signOut() }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await perform(request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONDecoder().decode(JSON.self, from: data)) ?? .null
        if status == 401, signedIn { throw signOut() }
        guard (200..<300).contains(status) else {
            throw NoeisAPIError.server(json["error"]?.string ?? json["message"]?.string ?? "Noeis could not do that (\(status)).")
        }
        return json
    }

    private func signOut() -> NoeisAPIError {
        NoeisAuthStore.shared.clearToken()
        NotificationCenter.default.post(name: .noeisSignedOut, object: nil)
        return .signedOut
    }

    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch let error as URLError where [URLError.networkConnectionLost, URLError.timedOut].contains(error.code) && request.httpMethod == "GET" {
            // One quiet retry for reads; a write is never repeated blind.
            do { return try await session.data(for: request) } catch { throw NoeisAPIError.offline }
        } catch let error as URLError where error.code != .cancelled {
            throw NoeisAPIError.offline
        }
    }
}
