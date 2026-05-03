import Foundation

enum NoeisAPIError: LocalizedError {
    case invalidResponse
    case missingToken
    case networkLost
    case timedOut
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The server response was not valid."
        case .missingToken:
            return "You need to sign in first."
        case .networkLost:
            return "The connection to Noeis was interrupted. Please check your connection and try again."
        case .timedOut:
            return "Noeis took too long to respond. Please try again in a few seconds."
        case .server(let message):
            return message
        }
    }
}

struct AuthResponse: Decodable {
    let token: String
}

struct RegisterResponse: Decodable {
    let message: String?
    let loginMessage: String?
}

struct NoeisSessionSummary: Decodable {
    let username: String?
}

struct SessionResponse: Decodable {
    let user: NoeisSessionSummary?
}

struct FolderSummary: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let parentFolderId: String?
    let articleCount: Int?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name
        case parentFolderId
        case articleCount
    }

    init(id: String, name: String, parentFolderId: String? = nil, articleCount: Int? = nil) {
        self.id = id
        self.name = name
        self.parentFolderId = parentFolderId
        self.articleCount = articleCount
    }

    init(from decoder: Decoder) throws {
        if let value = try? decoder.singleValueContainer().decode(String.self) {
            id = value
            name = "Folder"
            parentFolderId = nil
            articleCount = nil
            return
        }

        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? ""
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? "Folder"
        parentFolderId = try container.decodeIfPresent(String.self, forKey: .parentFolderId)
        articleCount = try container.decodeIfPresent(Int.self, forKey: .articleCount)
    }
}

struct ArticleHighlight: Decodable, Identifiable, Hashable {
    let id: String
    let text: String
    let note: String?
    let tags: [String]
    let color: String?
    let type: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case text
        case note
        case tags
        case color
        case type
    }
}

struct ArticleSummary: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let url: String?
    let siteName: String?
    let folder: FolderSummary?
    let highlights: [ArticleHighlight]

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title
        case url
        case siteName
        case folder
        case highlights
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Untitled article"
        url = try container.decodeIfPresent(String.self, forKey: .url)
        siteName = try container.decodeIfPresent(String.self, forKey: .siteName)
        folder = try container.decodeIfPresent(FolderSummary.self, forKey: .folder)
        highlights = try container.decodeIfPresent([ArticleHighlight].self, forKey: .highlights) ?? []
    }
}

struct ArticleDetailData: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let url: String?
    let siteName: String?
    let folder: FolderSummary?
    let content: String?
    let highlights: [ArticleHighlight]

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title
        case url
        case siteName
        case folder
        case content
        case highlights
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Untitled article"
        url = try container.decodeIfPresent(String.self, forKey: .url)
        siteName = try container.decodeIfPresent(String.self, forKey: .siteName)
        folder = try container.decodeIfPresent(FolderSummary.self, forKey: .folder)
        content = try container.decodeIfPresent(String.self, forKey: .content)
        highlights = try container.decodeIfPresent([ArticleHighlight].self, forKey: .highlights) ?? []
    }
}

struct NotebookEntry: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let content: String?
    let folder: FolderSummary?
    let snippet: String?
    let blockCount: Int?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title
        case content
        case folder
        case snippet
        case blockCount
        case updatedAt
    }

}

struct ConceptMaterial: Decodable {
    let pinnedHighlights: [ConceptMaterialHighlight]
    let recentHighlights: [ConceptMaterialHighlight]
    let linkedArticles: [ConceptMaterialArticle]
    let linkedNotes: [NotebookEntry]
}

struct ConceptMaterialHighlight: Decodable, Identifiable, Hashable {
    let id: String
    let articleId: String?
    let articleTitle: String?
    let text: String
    let note: String?
    let tags: [String]
    let type: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case articleId
        case articleTitle
        case text
        case note
        case tags
        case type
    }
}

struct ConceptMaterialArticle: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let url: String?
    let highlightCount: Int?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title
        case url
        case highlightCount
    }
}

struct AgentChatMessage: Identifiable, Hashable {
    let id = UUID()
    let role: String
    let text: String
}

struct AgentChatResponse: Decodable {
    let reply: String?
    let relatedItems: [AgentRelatedItem]?
}

struct AgentRelatedItem: Decodable, Identifiable, Hashable {
    let id: String
    let type: String?
    let title: String?
    let snippet: String?

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case title
        case snippet
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decodeIfPresent(String.self, forKey: .type)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        snippet = try container.decodeIfPresent(String.self, forKey: .snippet)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? [type, title, snippet].compactMap { $0 }.joined(separator: "-")
    }
}

struct ConceptSummary: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String?
    let count: Int?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name
        case description
        case count
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedId = try container.decodeIfPresent(String.self, forKey: .id)
        let decodedName = try container.decodeIfPresent(String.self, forKey: .name) ?? "Untitled concept"
        id = decodedId ?? decodedName
        name = decodedName
        description = try container.decodeIfPresent(String.self, forKey: .description)
        if let intCount = try? container.decodeIfPresent(Int.self, forKey: .count) {
            count = intCount
        } else if let doubleCount = try? container.decodeIfPresent(Double.self, forKey: .count) {
            count = Int(doubleCount)
        } else {
            count = nil
        }
    }
}

struct WikiPageSummary: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let slug: String?
    let pageType: String?
    let status: String?
    let visibility: String?
    let plainText: String?
    let updatedAt: String?
    let sourceCount: Int

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title
        case slug
        case pageType
        case status
        case visibility
        case plainText
        case updatedAt
        case sourceRefs
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Untitled Wiki Page"
        slug = try container.decodeIfPresent(String.self, forKey: .slug)
        pageType = try container.decodeIfPresent(String.self, forKey: .pageType)
        status = try container.decodeIfPresent(String.self, forKey: .status)
        visibility = try container.decodeIfPresent(String.self, forKey: .visibility)
        plainText = try container.decodeIfPresent(String.self, forKey: .plainText)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
        sourceCount = (try? container.decodeIfPresent([LooseJSON].self, forKey: .sourceRefs)?.count) ?? 0
    }
}

private struct LooseJSON: Decodable {}

struct NoeisAPI {
    static let shared = NoeisAPI()

    private let baseURL = URL(string: "https://note-taker-3-unrg.onrender.com")!
    private let decoder = JSONDecoder()
    private let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 35
        configuration.timeoutIntervalForResource = 45
        configuration.waitsForConnectivity = true
        return URLSession(configuration: configuration)
    }()

    func login(username: String, password: String) async throws -> String {
        let response: AuthResponse = try await request("/api/auth/login", method: "POST", body: ["username": username, "password": password], requiresAuth: false)
        return response.token
    }

    func register(username: String, password: String) async throws {
        let _: RegisterResponse = try await request("/api/auth/register", method: "POST", body: ["username": username, "password": password], requiresAuth: false)
    }

    func session() async throws -> SessionResponse {
        try await request("/api/debug/auth")
    }

    func fetchArticles() async throws -> [ArticleSummary] {
        try await request("/get-articles")
    }

    func fetchFolders() async throws -> [FolderSummary] {
        try await request("/api/folders?includeCounts=true")
    }

    func fetchArticle(id: String) async throws -> ArticleDetailData {
        try await request("/articles/\(id)")
    }

    func fetchNotebookEntries() async throws -> [NotebookEntry] {
        try await request("/api/notebook?summary=1")
    }

    func fetchNotebookFolders() async throws -> [FolderSummary] {
        try await request("/api/notebook/folders")
    }

    func fetchNotebookEntry(id: String) async throws -> NotebookEntry {
        try await request("/api/notebook/\(id)")
    }

    func createNotebookEntry(title: String, content: String, folderId: String? = nil) async throws {
        let _: NotebookEntry = try await request("/api/notebook", method: "POST", body: [
            "title": title,
            "content": content,
            "folder": folderId ?? ""
        ])
    }

    func updateNotebookEntry(id: String, title: String, content: String, folderId: String?) async throws -> NotebookEntry {
        try await request("/api/notebook/\(id)", method: "PUT", body: [
            "title": title,
            "content": content,
            "folder": folderId ?? ""
        ])
    }

    func fetchConcepts() async throws -> [ConceptSummary] {
        try await request("/api/concepts")
    }

    func fetchConceptMaterial(conceptIdOrName: String) async throws -> ConceptMaterial {
        let safe = conceptIdOrName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? conceptIdOrName
        return try await request("/api/concepts/\(safe)/material")
    }

    func fetchWikiPages(query: String? = nil) async throws -> [WikiPageSummary] {
        let trimmed = query?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let suffix = trimmed.isEmpty ? "" : "?q=\(trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? trimmed)"
        return try await request("/api/wiki/pages\(suffix)")
    }

    func fetchWikiPage(id: String) async throws -> WikiPageSummary {
        let safe = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        return try await request("/api/wiki/pages/\(safe)")
    }

    func createWikiPage(title: String, seedText: String = "", pageType: String = "topic") async throws -> WikiPageSummary {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanSeed = seedText.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedTitle = cleanTitle.isEmpty ? "Untitled Wiki Page" : cleanTitle
        let body: [String: Any] = [
            "type": "doc",
            "content": [
                [
                    "type": "heading",
                    "attrs": ["level": 1],
                    "content": [["type": "text", "text": resolvedTitle]]
                ],
                [
                    "type": "paragraph",
                    "content": [["type": "text", "text": cleanSeed.isEmpty ? "Start writing. AI can help expand this page from your sources." : cleanSeed]]
                ]
            ]
        ]
        return try await request("/api/wiki/pages", method: "POST", body: [
            "title": resolvedTitle,
            "pageType": pageType,
            "sourceScope": "entire_library",
            "createdFrom": ["type": "wiki_index", "label": resolvedTitle],
            "body": body
        ])
    }

    func chatWithAgent(message: String, history: [AgentChatMessage], contextType: String, contextId: String, contextTitle: String) async throws -> AgentChatResponse {
        let context: [String: Any] = [
            "type": contextType,
            "id": contextId,
            "title": contextTitle
        ]
        let historyPayload = history.map { ["role": $0.role, "text": $0.text] }
        return try await request("/api/agent/chat", method: "POST", body: [
            "message": message,
            "threadTitle": contextTitle,
            "persistThread": true,
            "context": context,
            "history": historyPayload,
            "limit": 6
        ])
    }

    private func request<Response: Decodable>(_ path: String, method: String = "GET", body: [String: Any]? = nil, requiresAuth: Bool = true) async throws -> Response {
        var request = URLRequest(url: url(for: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if requiresAuth {
            guard let token = NoeisAuthStore.shared.token else {
                throw NoeisAPIError.missingToken
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await perform(request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NoeisAPIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let error = try? decoder.decode(ServerError.self, from: data), let message = error.error ?? error.message {
                throw NoeisAPIError.server(message)
            }
            throw NoeisAPIError.server("Request failed with status \(httpResponse.statusCode).")
        }

        return try decoder.decode(Response.self, from: data)
    }

    private func url(for path: String) -> URL {
        let normalizedPath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let base = baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(base)/\(normalizedPath)")!
    }

    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch {
            if shouldRetry(error) {
                try? await Task.sleep(nanoseconds: 800_000_000)
                do {
                    return try await session.data(for: request)
                } catch {
                    throw mapNetworkError(error)
                }
            }
            throw mapNetworkError(error)
        }
    }

    private func shouldRetry(_ error: Error) -> Bool {
        let code = (error as NSError).code
        return code == NSURLErrorNetworkConnectionLost ||
            code == NSURLErrorTimedOut ||
            code == NSURLErrorCannotConnectToHost ||
            code == NSURLErrorNotConnectedToInternet
    }

    private func mapNetworkError(_ error: Error) -> Error {
        let nsError = error as NSError
        switch nsError.code {
        case NSURLErrorNetworkConnectionLost, NSURLErrorCannotConnectToHost, NSURLErrorNotConnectedToInternet:
            return NoeisAPIError.networkLost
        case NSURLErrorTimedOut:
            return NoeisAPIError.timedOut
        default:
            return error
        }
    }
}

private struct ServerError: Decodable {
    let error: String?
    let message: String?
}
