import SwiftUI

enum NoeisDesign {
    static let background = Color(.systemGroupedBackground)
    static let panel = Color(.secondarySystemGroupedBackground)
    static let ink = Color(.label)
    static let muted = Color(.secondaryLabel)
    static let accent = Color(red: 0.200, green: 0.254, blue: 0.333)
    static let border = Color(.separator)
}

@MainActor
final class NoeisSession: ObservableObject {
    @Published var isAuthenticated = NoeisAuthStore.shared.token != nil
    @Published var username = ""

    func refresh() {
        isAuthenticated = NoeisAuthStore.shared.token != nil
        Task {
            if let session = try? await NoeisAPI.shared.session() {
                username = session.user?.username ?? ""
            }
        }
    }

    func logout() {
        NoeisAuthStore.shared.clearToken()
        username = ""
        isAuthenticated = false
    }
}

struct NoeisRootView: View {
    @StateObject private var session = NoeisSession()

    var body: some View {
        Group {
            if session.isAuthenticated {
                NoeisMainView()
                    .environmentObject(session)
            } else {
                LoginView()
                    .environmentObject(session)
            }
        }
        .tint(NoeisDesign.accent)
        .task {
            session.refresh()
        }
    }
}

struct LoginView: View {
    @EnvironmentObject private var session: NoeisSession
    @State private var username = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isRegistering = false
    @State private var isLoading = false
    @State private var message = ""

    var body: some View {
        ZStack {
            NoeisDesign.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 20) {
                Text("Noeis")
                    .font(.system(size: 44, weight: .semibold, design: .serif))
                    .foregroundStyle(NoeisDesign.ink)
                Text("Read, highlight, and turn notes into working knowledge.")
                    .foregroundStyle(NoeisDesign.muted)

                TextField("Email or username", text: $username)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textFieldStyle(.roundedBorder)

                SecureField("Password", text: $password)
                    .textContentType(isRegistering ? .newPassword : .password)
                    .textFieldStyle(.roundedBorder)

                if isRegistering {
                    SecureField("Confirm password", text: $confirmPassword)
                        .textContentType(.newPassword)
                        .textFieldStyle(.roundedBorder)
                }

                if !message.isEmpty {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(NoeisDesign.muted)
                }

                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        if isLoading {
                            ProgressView()
                        }
                        Text(isRegistering ? "Create Account" : "Sign In")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isLoading || username.isEmpty || password.isEmpty)

                Button(isRegistering ? "Already have an account?" : "Create a Noeis account") {
                    isRegistering.toggle()
                    message = ""
                }
            }
            .padding(26)
            .frame(maxWidth: 520)
            .background(NoeisDesign.panel)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .padding()
        }
    }

    private func submit() async {
        isLoading = true
        defer { isLoading = false }

        do {
            if isRegistering {
                guard password == confirmPassword else {
                    message = "Passwords do not match."
                    return
                }
                try await NoeisAPI.shared.register(username: username, password: password)
            }

            let token = try await NoeisAPI.shared.login(username: username, password: password)
            try NoeisAuthStore.shared.saveToken(token)
            session.refresh()
        } catch {
            message = error.localizedDescription
        }
    }
}

struct NoeisMainView: View {
    @StateObject private var store = WorkspaceStore()
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        Group {
            if horizontalSizeClass == .regular {
                WorkspaceSidebarShell()
            } else {
                WorkspaceTabShell()
            }
        }
        .environmentObject(store)
        .task {
            await store.load()
        }
        .refreshable {
            await store.load()
        }
    }
}

@MainActor
final class WorkspaceStore: ObservableObject {
    @Published var articles: [ArticleSummary] = []
    @Published var pages: [NotebookEntry] = []
    @Published var concepts: [ConceptSummary] = []
    @Published var isLoading = false
    @Published var message = ""

    var totalCount: Int {
        articles.count + pages.count + concepts.count
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        var failures: [String] = []
        async let articleResult = Self.captureResult { try await NoeisAPI.shared.fetchArticles() }
        async let pageResult = Self.captureResult { try await NoeisAPI.shared.fetchNotebookEntries() }
        async let conceptResult = Self.captureResult { try await NoeisAPI.shared.fetchConcepts() }

        let results = await (articleResult, pageResult, conceptResult)

        switch results.0 {
        case .success(let value):
            articles = value
        case .failure(let error):
            failures.append("Library: \(error.localizedDescription)")
        }

        switch results.1 {
        case .success(let value):
            pages = value
        case .failure(let error):
            failures.append("Notebook: \(error.localizedDescription)")
        }

        switch results.2 {
        case .success(let value):
            concepts = value
        case .failure(let error):
            failures.append("Concepts: \(error.localizedDescription)")
        }

        message = failures.joined(separator: "\n")
    }

    func createPage(title: String, content: String) async {
        do {
            try await NoeisAPI.shared.createNotebookEntry(title: title, content: content)
            await load()
        } catch {
            message = error.localizedDescription
        }
    }

    nonisolated private static func captureResult<Value>(_ operation: @escaping () async throws -> Value) async -> Result<Value, Error> {
        do {
            return .success(try await operation())
        } catch {
            return .failure(error)
        }
    }
}

enum WorkspaceRoute: String, CaseIterable, Identifiable {
    case home
    case search
    case capture
    case library
    case notebook
    case concepts
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: return "Home"
        case .search: return "Search"
        case .capture: return "Capture"
        case .library: return "Library"
        case .notebook: return "Notebook"
        case .concepts: return "Concepts"
        case .settings: return "Settings"
        }
    }

    var icon: String {
        switch self {
        case .home: return "house"
        case .search: return "magnifyingglass"
        case .capture: return "plus.square"
        case .library: return "books.vertical"
        case .notebook: return "doc.text"
        case .concepts: return "brain.head.profile"
        case .settings: return "gearshape"
        }
    }
}

struct WorkspaceTabShell: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
            SearchWorkspaceView()
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
            CaptureView()
                .tabItem { Label("New", systemImage: "plus.square") }
            LibraryDatabaseView()
                .tabItem { Label("Library", systemImage: "books.vertical") }
            WorkspaceStackView()
                .tabItem { Label("Workspace", systemImage: "rectangle.3.group") }
        }
    }
}

struct WorkspaceSidebarShell: View {
    @State private var route: WorkspaceRoute? = .home

    var body: some View {
        NavigationSplitView {
            List(selection: $route) {
                Section("Noeis") {
                    ForEach([WorkspaceRoute.home, .search, .capture]) { item in
                        Label(item.title, systemImage: item.icon)
                            .tag(item)
                    }
                }

                Section("Workspace") {
                    ForEach([WorkspaceRoute.library, .notebook, .concepts]) { item in
                        Label(item.title, systemImage: item.icon)
                            .tag(item)
                    }
                }

                Section {
                    Label(WorkspaceRoute.settings.title, systemImage: WorkspaceRoute.settings.icon)
                        .tag(WorkspaceRoute.settings)
                }
            }
            .navigationTitle("Noeis")
            .scrollContentBackground(.hidden)
            .background(NoeisDesign.background)
        } detail: {
            switch route ?? .home {
            case .home:
                HomeView()
            case .search:
                SearchWorkspaceView()
            case .capture:
                CaptureView()
            case .library:
                LibraryDatabaseView()
            case .notebook:
                NotebookDatabaseView()
            case .concepts:
                ConceptsDatabaseView()
            case .settings:
                SettingsView()
            }
        }
    }
}

struct HomeView: View {
    @EnvironmentObject private var store: WorkspaceStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    WorkspaceHeader(title: "Home", subtitle: "\(store.totalCount) items in your workspace")

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                        MetricTile(title: "Library", value: "\(store.articles.count)", icon: "books.vertical")
                        MetricTile(title: "Pages", value: "\(store.pages.count)", icon: "doc.text")
                        MetricTile(title: "Concepts", value: "\(store.concepts.count)", icon: "brain.head.profile")
                    }

                    SectionBlock(title: "Recent Pages") {
                        ForEach(store.pages.prefix(5)) { page in
                            NavigationLink {
                                PageDetail(page: page)
                            } label: {
                                PageRow(page: page)
                            }
                        }
                    }

                    SectionBlock(title: "Active Concepts") {
                        ForEach(store.concepts.prefix(5)) { concept in
                            NavigationLink {
                                ConceptDetail(concept: concept)
                            } label: {
                                ConceptRow(concept: concept)
                            }
                        }
                    }

                    SectionBlock(title: "Saved Articles") {
                        ForEach(store.articles.prefix(5)) { article in
                            NavigationLink {
                                ArticleDetail(article: article)
                            } label: {
                                ArticleRow(article: article)
                            }
                        }
                    }

                    if !store.message.isEmpty {
                        Text(store.message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding()
            }
            .background(NoeisDesign.background)
            .navigationTitle("Home")
        }
    }
}

struct WorkspaceStackView: View {
    @State private var mode = WorkspaceMode.notebook

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Workspace", selection: $mode) {
                    ForEach(WorkspaceMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .padding()

                switch mode {
                case .notebook:
                    NotebookDatabaseView()
                case .concepts:
                    ConceptsDatabaseView()
                }
            }
            .navigationTitle("Workspace")
        }
    }
}

enum WorkspaceMode: String, CaseIterable, Identifiable {
    case notebook
    case concepts

    var id: String { rawValue }
    var title: String { self == .notebook ? "Notebook" : "Concepts" }
}

struct CaptureView: View {
    @EnvironmentObject private var store: WorkspaceStore
    @State private var title = ""
    @State private var content = ""
    @State private var status = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("New Page") {
                    TextField("Title", text: $title)
                    TextEditor(text: $content)
                        .frame(minHeight: 180)
                    Button("Save Page") {
                        Task { await save() }
                    }
                    .disabled(title.isEmpty)
                }

                if !status.isEmpty {
                    Text(status)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New")
        }
    }

    private func save() async {
        await store.createPage(title: title, content: content)
        title = ""
        content = ""
        status = store.message.isEmpty ? "Saved" : store.message
    }
}

struct LibraryDatabaseView: View {
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selectedArticle: ArticleSummary?
    @State private var query = ""

    private var filteredArticles: [ArticleSummary] {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return store.articles
        }
        return store.articles.filter { article in
            article.title.localizedCaseInsensitiveContains(query) ||
                (article.siteName ?? "").localizedCaseInsensitiveContains(query) ||
                (article.url ?? "").localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        if horizontalSizeClass == .regular {
            splitView
        } else {
            NavigationStack {
                articleList { article in
                    NavigationLink {
                        ArticleDetail(article: article)
                    } label: {
                        ArticleRow(article: article)
                    }
                }
            }
        }
    }

    private var splitView: some View {
        NavigationSplitView {
            articleList { article in
                ArticleRow(article: article)
                    .tag(article)
            }
        } detail: {
            if let selectedArticle {
                ArticleDetail(article: selectedArticle)
            } else {
                ContentUnavailableView("Select an article", systemImage: "books.vertical")
            }
        }
    }

    private func articleList<Row: View>(@ViewBuilder row: @escaping (ArticleSummary) -> Row) -> some View {
        Group {
            List(filteredArticles, selection: $selectedArticle) { article in
                row(article)
            }
            .searchable(text: $query, prompt: "Search articles")
            .navigationTitle("Library")
            .overlay {
                if filteredArticles.isEmpty {
                    ContentUnavailableView("No articles", systemImage: "books.vertical", description: Text(store.message.isEmpty ? "Saved articles will appear here." : store.message))
                }
            }
        }
    }
}

struct NotebookDatabaseView: View {
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selectedPage: NotebookEntry?
    @State private var query = ""

    private var filteredPages: [NotebookEntry] {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return store.pages
        }
        return store.pages.filter { page in
            page.title.localizedCaseInsensitiveContains(query) ||
                page.previewText.localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        if horizontalSizeClass == .regular {
            splitView
        } else {
            NavigationStack {
                pageList { page in
                    NavigationLink {
                        PageDetail(page: page)
                    } label: {
                        PageRow(page: page)
                    }
                }
            }
        }
    }

    private var splitView: some View {
        NavigationSplitView {
            pageList { page in
                PageRow(page: page)
                    .tag(page)
            }
        } detail: {
            if let selectedPage {
                PageDetail(page: selectedPage)
            } else {
                ContentUnavailableView("Select a page", systemImage: "doc.text")
            }
        }
    }

    private func pageList<Row: View>(@ViewBuilder row: @escaping (NotebookEntry) -> Row) -> some View {
        Group {
            List(filteredPages, selection: $selectedPage) { page in
                row(page)
            }
            .searchable(text: $query, prompt: "Search pages")
            .navigationTitle("Notebook")
            .overlay {
                if filteredPages.isEmpty {
                    ContentUnavailableView("No pages", systemImage: "doc.text", description: Text(store.message.isEmpty ? "Notebook pages will appear here." : store.message))
                }
            }
        }
    }
}

struct ConceptsDatabaseView: View {
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selectedConcept: ConceptSummary?
    @State private var query = ""

    private var filteredConcepts: [ConceptSummary] {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return store.concepts
        }
        return store.concepts.filter { concept in
            concept.name.localizedCaseInsensitiveContains(query) ||
                (concept.description ?? "").localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        if horizontalSizeClass == .regular {
            splitView
        } else {
            NavigationStack {
                conceptList { concept in
                    NavigationLink {
                        ConceptDetail(concept: concept)
                    } label: {
                        ConceptRow(concept: concept)
                    }
                }
            }
        }
    }

    private var splitView: some View {
        NavigationSplitView {
            conceptList { concept in
                ConceptRow(concept: concept)
                    .tag(concept)
            }
        } detail: {
            if let selectedConcept {
                ConceptDetail(concept: selectedConcept)
            } else {
                ContentUnavailableView("Select a concept", systemImage: "brain.head.profile")
            }
        }
    }

    private func conceptList<Row: View>(@ViewBuilder row: @escaping (ConceptSummary) -> Row) -> some View {
        Group {
            List(filteredConcepts, selection: $selectedConcept) { concept in
                row(concept)
            }
            .searchable(text: $query, prompt: "Search concepts")
            .navigationTitle("Concepts")
            .overlay {
                if filteredConcepts.isEmpty {
                    ContentUnavailableView("No concepts", systemImage: "brain.head.profile", description: Text(store.message.isEmpty ? "Concepts will appear here." : store.message))
                }
            }
        }
    }
}

struct SearchWorkspaceView: View {
    @EnvironmentObject private var store: WorkspaceStore
    @State private var query = ""

    private var articleResults: [ArticleSummary] {
        guard !query.isEmpty else { return [] }
        return store.articles.filter { $0.title.localizedCaseInsensitiveContains(query) || ($0.siteName ?? "").localizedCaseInsensitiveContains(query) }
    }

    private var pageResults: [NotebookEntry] {
        guard !query.isEmpty else { return [] }
        return store.pages.filter { $0.title.localizedCaseInsensitiveContains(query) || $0.previewText.localizedCaseInsensitiveContains(query) }
    }

    private var conceptResults: [ConceptSummary] {
        guard !query.isEmpty else { return [] }
        return store.concepts.filter { $0.name.localizedCaseInsensitiveContains(query) || ($0.description ?? "").localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            List {
                if query.isEmpty {
                    ContentUnavailableView("Search Noeis", systemImage: "magnifyingglass", description: Text("Find articles, pages, and concepts."))
                } else {
                    Section("Pages") {
                        ForEach(pageResults) { page in
                            NavigationLink {
                                PageDetail(page: page)
                            } label: {
                                PageRow(page: page)
                            }
                        }
                    }
                    Section("Concepts") {
                        ForEach(conceptResults) { concept in
                            NavigationLink {
                                ConceptDetail(concept: concept)
                            } label: {
                                ConceptRow(concept: concept)
                            }
                        }
                    }
                    Section("Articles") {
                        ForEach(articleResults) { article in
                            NavigationLink {
                                ArticleDetail(article: article)
                            } label: {
                                ArticleRow(article: article)
                            }
                        }
                    }
                }
            }
            .searchable(text: $query, prompt: "Search workspace")
            .navigationTitle("Search")
        }
    }
}

struct WorkspaceHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 38, weight: .semibold, design: .serif))
                .foregroundStyle(NoeisDesign.ink)
            Text(subtitle)
                .foregroundStyle(NoeisDesign.muted)
        }
    }
}

struct MetricTile: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(NoeisDesign.accent)
            Text(value)
                .font(.title2.bold())
                .foregroundStyle(NoeisDesign.ink)
            Text(title)
                .font(.caption)
                .foregroundStyle(NoeisDesign.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(NoeisDesign.panel)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(NoeisDesign.border, lineWidth: 0.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct SectionBlock<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)
            VStack(spacing: 0) {
                content
            }
            .background(NoeisDesign.panel)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }
}

struct ArticleRow: View {
    let article: ArticleSummary

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 4) {
                Text(article.title)
                    .font(.headline)
                    .lineLimit(2)
                Text(article.siteName ?? article.url ?? "Saved article")
                    .font(.caption)
                    .foregroundStyle(NoeisDesign.muted)
                    .lineLimit(1)
                if !article.highlights.isEmpty {
                    Label("\(article.highlights.count) highlights", systemImage: "highlighter")
                        .font(.caption2)
                        .foregroundStyle(NoeisDesign.accent)
                }
            }
        } icon: {
            Image(systemName: "doc.richtext")
                .foregroundStyle(NoeisDesign.accent)
        }
        .padding(.vertical, 6)
    }
}

struct PageRow: View {
    let page: NotebookEntry

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 4) {
                Text(page.title)
                    .font(.headline)
                    .lineLimit(2)
                Text(page.previewText)
                    .font(.caption)
                    .foregroundStyle(NoeisDesign.muted)
                    .lineLimit(2)
            }
        } icon: {
            Image(systemName: "doc.text")
                .foregroundStyle(NoeisDesign.accent)
        }
        .padding(.vertical, 6)
    }
}

struct ConceptRow: View {
    let concept: ConceptSummary

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 4) {
                Text(concept.name)
                    .font(.headline)
                    .lineLimit(2)
                Text(concept.description?.isEmpty == false ? concept.description! : "\(concept.count ?? 0) linked items")
                    .font(.caption)
                    .foregroundStyle(NoeisDesign.muted)
                    .lineLimit(2)
            }
        } icon: {
            Image(systemName: "brain.head.profile")
                .foregroundStyle(NoeisDesign.accent)
        }
        .padding(.vertical, 6)
    }
}

struct ArticleDetail: View {
    let article: ArticleSummary
    @State private var detail: ArticleDetailData?
    @State private var message = ""

    private var paragraphs: [String] {
        detail?.content?.formattedParagraphs ?? []
    }

    private var highlights: [ArticleHighlight] {
        let loadedHighlights = detail?.highlights ?? []
        return loadedHighlights.isEmpty ? article.highlights : loadedHighlights
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                WorkspaceHeader(title: detail?.title ?? article.title, subtitle: detail?.siteName ?? article.siteName ?? "Saved article")
                if let url = detail?.url ?? article.url, let link = URL(string: url) {
                    Link(url, destination: link)
                        .font(.footnote)
                }
                if !highlights.isEmpty {
                    SectionBlock(title: "Highlights") {
                        ForEach(highlights) { highlight in
                            HighlightRow(highlight: highlight)
                        }
                    }
                }
                Divider()
                if !paragraphs.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, paragraph in
                            Text(paragraph)
                                .font(.body)
                                .foregroundStyle(NoeisDesign.ink)
                                .lineSpacing(5)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                } else if !message.isEmpty {
                    Text(message)
                        .font(.callout)
                        .foregroundStyle(NoeisDesign.muted)
                } else {
                    ProgressView()
                }
            }
            .padding()
        }
        .background(NoeisDesign.background)
        .navigationTitle("Article")
        .task(id: article.id) {
            await load()
        }
    }

    private func load() async {
        do {
            detail = try await NoeisAPI.shared.fetchArticle(id: article.id)
            if detail?.content?.formattedParagraphs.isEmpty != false {
                message = "No article body was saved for this item."
            }
        } catch {
            message = error.localizedDescription
        }
    }
}

struct HighlightRow: View {
    let highlight: ArticleHighlight

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle()
                    .fill(color)
                    .frame(width: 10, height: 10)
                Text(highlight.type?.capitalized ?? "Highlight")
                    .font(.caption)
                    .foregroundStyle(NoeisDesign.muted)
                Spacer()
            }

            Text(highlight.text.asPlainText)
                .font(.callout)
                .foregroundStyle(NoeisDesign.ink)
                .lineSpacing(3)

            if let note = highlight.note, !note.asPlainText.isEmpty {
                Text(note.asPlainText)
                    .font(.footnote)
                    .foregroundStyle(NoeisDesign.muted)
                    .lineSpacing(2)
            }

            if !highlight.tags.isEmpty {
                Text(highlight.tags.map { "#\($0)" }.joined(separator: " "))
                    .font(.caption2)
                    .foregroundStyle(NoeisDesign.accent)
                    .lineLimit(2)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NoeisDesign.background)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(NoeisDesign.border, lineWidth: 0.5)
        )
    }

    private var color: Color {
        Color(hex: highlight.color ?? "") ?? Color(red: 0.965, green: 0.886, blue: 0.478)
    }
}

struct PageDetail: View {
    let page: NotebookEntry
    @State private var detail: NotebookEntry?
    @State private var message = ""

    private var displayPage: NotebookEntry {
        detail ?? page
    }

    private var paragraphs: [String] {
        if let content = displayPage.content, !content.formattedParagraphs.isEmpty {
            return content.formattedParagraphs
        }
        return displayPage.previewText.isEmpty ? [] : [displayPage.previewText]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                WorkspaceHeader(title: displayPage.title, subtitle: "Notebook page")
                if !paragraphs.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, paragraph in
                            Text(paragraph)
                                .font(.body)
                                .lineSpacing(5)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                } else if !message.isEmpty {
                    Text(message)
                        .font(.callout)
                        .foregroundStyle(NoeisDesign.muted)
                } else {
                    ProgressView()
                }
            }
            .padding()
        }
        .background(NoeisDesign.background)
        .navigationTitle(displayPage.title)
        .task(id: page.id) {
            await load()
        }
    }

    private func load() async {
        if page.content?.isEmpty == false {
            detail = page
            return
        }

        do {
            detail = try await NoeisAPI.shared.fetchNotebookEntry(id: page.id)
            if paragraphs.isEmpty {
                message = "No content yet."
            }
        } catch {
            if !page.previewText.isEmpty {
                message = ""
            } else {
                message = error.localizedDescription
            }
        }
    }
}

struct ConceptDetail: View {
    let concept: ConceptSummary

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                WorkspaceHeader(title: concept.name, subtitle: "Concept")
                Text(concept.description?.isEmpty == false ? concept.description! : "No description yet.")
                    .lineSpacing(5)
                Divider()
                Label("\(concept.count ?? 0) linked items", systemImage: "link")
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
        .background(NoeisDesign.background)
        .navigationTitle(concept.name)
    }
}

private extension String {
    var asPlainText: String {
        formattedParagraphs.joined(separator: " ")
    }

    var formattedParagraphs: [String] {
        var value = self
            .replacingOccurrences(of: "(?i)<\\s*br\\s*/?\\s*>", with: "\n", options: .regularExpression)
            .replacingOccurrences(of: "(?i)</\\s*(p|div|section|article|blockquote|h[1-6]|li)\\s*>", with: "\n\n", options: .regularExpression)
            .replacingOccurrences(of: "(?i)<\\s*li[^>]*>", with: "\n- ", options: .regularExpression)
            .replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&apos;", with: "'")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")

        value = value.replacingOccurrences(of: "[ \\t\\u{00a0}]+", with: " ", options: .regularExpression)
        value = value.replacingOccurrences(of: "\\n[ \\t]+", with: "\n", options: .regularExpression)
        value = value.replacingOccurrences(of: "\\n{3,}", with: "\n\n", options: .regularExpression)

        return value
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}

private extension NotebookEntry {
    var previewText: String {
        let text = (snippet?.isEmpty == false ? snippet : content) ?? ""
        return text.asPlainText
    }
}

private extension Color {
    init?(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let expanded: String
        if cleaned.count == 3 {
            expanded = cleaned.map { "\($0)\($0)" }.joined()
        } else {
            expanded = cleaned
        }

        guard expanded.count == 6, let value = Int(expanded, radix: 16) else {
            return nil
        }

        self.init(
            red: Double((value >> 16) & 0xff) / 255,
            green: Double((value >> 8) & 0xff) / 255,
            blue: Double(value & 0xff) / 255
        )
    }
}

struct SettingsView: View {
    @EnvironmentObject private var session: NoeisSession

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    Text(session.username.isEmpty ? "Signed in" : session.username)
                    Button("Log Out", role: .destructive) {
                        session.logout()
                    }
                }
                Section("Safari Extension") {
                    Text("Enable Noeis in Settings > Safari > Extensions.")
                }
                Section("Legal") {
                    Link("Privacy Policy", destination: URL(string: "https://noeis.io/privacy")!)
                    Link("Terms of Use", destination: URL(string: "https://noeis.io/terms")!)
                    Link("Support and Guides", destination: URL(string: "https://noeis.io/guides")!)
                }
            }
            .navigationTitle("Settings")
        }
    }
}
