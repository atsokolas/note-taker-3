import SwiftUI

/// The web's four rooms: Library is what you read, Think is what you wrote,
/// Wiki is what the reading built, Judgment is what it was for.
enum Room: String, CaseIterable, Identifiable {
    case wiki, judgment, library, think

    var id: String { rawValue }

    var title: String {
        switch self {
        case .wiki: return "Wiki"
        case .judgment: return "Judgment"
        case .library: return "Library"
        case .think: return "Think"
        }
    }

    var symbol: String {
        switch self {
        case .wiki: return "text.book.closed"
        case .judgment: return "scale.3d"
        case .library: return "books.vertical"
        case .think: return "square.and.pencil"
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
                    RoomList(room: room, selection: .constant(nil))
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
            List(Room.allCases, selection: Binding(get: { room }, set: { if let next = $0 { room = next; selection = nil } })) { room in
                Label(room.title, systemImage: room.symbol).tag(room)
            }
            .navigationTitle("Noeis")
            .toolbar { accountButton }
            .paper()
        } content: {
            RoomList(room: room, selection: $selection)
        } detail: {
            NavigationStack {
                Group {
                    if let selection {
                        RouteView(route: selection).id(selection)
                    } else {
                        ContentUnavailableView(room.emptyDetail, systemImage: room.symbol)
                            .foregroundStyle(Ink.muted)
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
        case .wiki: return "Pick a page to read"
        case .judgment: return "Pick a view"
        case .library: return "Pick something to read"
        case .think: return "Pick a note"
        }
    }
}

struct RoomList: View {
    let room: Room
    @Binding var selection: Route?

    var body: some View {
        switch room {
        case .wiki: WikiFront(selection: $selection)
        case .judgment: ViewsList(selection: $selection)
        case .library: LibraryList(selection: $selection)
        case .think: NotesList(selection: $selection)
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
        }
    }
}
