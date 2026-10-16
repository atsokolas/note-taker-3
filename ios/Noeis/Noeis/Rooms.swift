import SwiftUI

/// The web's four rooms: Library is what you read, Think is what you wrote,
/// Wiki is what the reading built, Judgment is what it was for, and
/// Editions is what the agents you connect bring back.
enum Room: String, CaseIterable, Identifiable {
    case wiki, judgment, library, think, editions

    var id: String { rawValue }

    var title: String {
        switch self {
        case .wiki: return "Wiki"
        case .judgment: return "Judgment"
        case .library: return "Library"
        case .think: return "Think"
        case .editions: return "Editions"
        }
    }

    var symbol: String {
        switch self {
        case .wiki: return "text.book.closed"
        case .judgment: return "scale.3d"
        case .library: return "books.vertical"
        case .think: return "square.and.pencil"
        case .editions: return "newspaper"
        }
    }
}

/// Anything a row can open. One type, so every room pushes the same way on
/// iPhone and fills the same detail column on iPad.
enum Route: Hashable {
    case wikiPage(String)
    case view(String)
    case article(String, passage: String? = nil)
    case note(String)
    case edition(String, item: String? = nil)
    case paper(String)
}

struct Rooms: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @SceneStorage("room") private var room: Room = .wiki
    @State private var selection: Route?
    @State private var showingSettings = false

    var body: some View {
        Group {
            if sizeClass == .regular { split } else { tabs }
        }
        .sheet(isPresented: $showingSettings) { SettingsView() }
    }

    // iPhone: a tab per room, each with its own stack.
    private var tabs: some View {
        TabView(selection: $room) {
            ForEach(Room.allCases) { room in
                NavigationStack {
                    RoomList(room: room)
                        .toolbar { accountButton }
                        .navigationDestination(for: Route.self) { RouteView(route: $0) }
                }
                .tabItem { Label(room.title, systemImage: room.symbol) }
                .tag(room)
            }
        }
    }

    // iPad: rooms, then the room's list, then the page.
    private var split: some View {
        NavigationSplitView {
            List(Room.allCases) { room in
                Button {
                    calmly(.easeOut(duration: 0.2)) { self.room = room; selection = nil }
                } label: {
                    Label(room.title, systemImage: room.symbol)
                        .font(.system(.body, design: .serif))
                        .foregroundStyle(room == self.room ? Ink.text : Ink.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(QuietPress())
                .onPage(selected: room == self.room)
                .listRowSeparator(.hidden)
            }
            .listStyle(.plain)
            .navigationTitle("Noeis")
            .toolbar { accountButton }
            .paper()
        } content: {
            RoomList(room: room)
                .navigationSplitViewColumnWidth(min: 300, ideal: room == .editions ? 440 : 340, max: 520)
                .environment(\.detail, $selection)
                .id(room)
                .transition(.opacity)
        } detail: {
            NavigationStack {
                Group {
                    if let selection {
                        RouteView(route: selection).id(selection).transition(.opacity)
                    } else {
                        Text(room.emptyDetail)
                            .font(.system(.title3, design: .serif).italic())
                            .foregroundStyle(Ink.subtle)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .navigationDestination(for: Route.self) { RouteView(route: $0) }
            }
            .paper()
        }
    }

    private var accountButton: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button { showingSettings = true } label: { Image(systemName: "person.crop.circle") }
                .accessibilityLabel("Account and settings")
        }
    }
}

private extension Room {
    var emptyDetail: String {
        switch self {
        case .wiki: return "Choose a page to read."
        case .judgment: return "Choose a view."
        case .library: return "Choose something to read."
        case .think: return "Choose a note."
        case .editions: return "Choose an issue."
        }
    }
}

struct RoomList: View {
    let room: Room

    var body: some View {
        switch room {
        case .wiki: WikiFront()
        case .judgment: ViewsList()
        case .library: LibraryList()
        case .think: NotesList()
        case .editions: EditionsFront()
        }
    }
}

extension EnvironmentValues {
    private struct DetailKey: EnvironmentKey { static let defaultValue: Binding<Route?>? = nil }

    /// The iPad's detail column, when there is one. On iPhone it is nil and a
    /// row pushes onto its tab's stack instead.
    var detail: Binding<Route?>? {
        get { self[DetailKey.self] }
        set { self[DetailKey.self] = newValue }
    }
}

/// Anything that opens a page: into the detail column on iPad, pushed onto the
/// stack on iPhone.
struct RouteLink<Label: View>: View {
    let route: Route
    @ViewBuilder var label: Label
    @Environment(\.detail) private var detail

    var body: some View {
        Group {
            if let detail {
                Button { calmly(.easeOut(duration: 0.22)) { detail.wrappedValue = route } } label: { label.contentShape(Rectangle()) }
            } else {
                NavigationLink(value: route) { label }
            }
        }
        .buttonStyle(QuietPress())
    }
}

/// A list row that opens a page, marked while it is open in the detail column.
/// Either way it stands on the page.
struct RouteRow<Label: View>: View {
    let route: Route
    @ViewBuilder var label: Label
    @Environment(\.detail) private var detail

    var body: some View {
        if let detail {
            RouteLink(route: route) { label.frame(maxWidth: .infinity, alignment: .leading) }
                .onPage(selected: detail.wrappedValue == route)
        } else {
            NavigationLink(value: route) { label }
                .onPage()
        }
    }
}

struct RouteView: View {
    let route: Route

    var body: some View {
        switch route {
        case .wikiPage(let id): WikiPageView(id: id)
        case .view(let id): ViewDetail(id: id)
        case .article(let id, let passage): ArticleReader(id: id, passage: passage)
        case .note(let id): NoteView(id: id)
        case .edition(let id, let item): IssueView(id: id, focus: item)
        case .paper(let profile): PaperIssues(profile: profile)
        }
    }
}
