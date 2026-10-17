import SwiftUI

/// The web's rooms, in the web's order: Library is what you read, Think is
/// what you wrote, Wiki is what the reading built, Editions is what the agents
/// you connect bring back, and Judgment is what it was all for.
enum Room: String, CaseIterable, Identifiable {
    case library, think, wiki, editions, judgment

    var id: String { rawValue }

    var title: String {
        switch self {
        case .library: return "Library"
        case .think: return "Think"
        case .wiki: return "Wiki"
        case .editions: return "Editions"
        case .judgment: return "Judgment"
        }
    }
}

/// Anything a row can open. One type, so every room pushes the same way.
enum Route: Hashable {
    case wikiPage(String, build: Bool = false)
    case view(String)
    case article(String, passage: String? = nil)
    case note(String)
    case concept(String)
    case question(String)
    case edition(String, item: String? = nil)
    case paper(String)
}

/// One room at a time, full width, as on the web: no sidebar and no fixed
/// columns. On iPad the rooms are words in a glass masthead; on iPhone they
/// float in a glass capsule under your thumb. Each room keeps its own place.
struct Rooms: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @SceneStorage("room") private var room: Room = .wiki
    @State private var sheet: Sheet?

    private enum Sheet: String, Identifiable { case settings, theme; var id: String { rawValue } }

    var body: some View {
        let wide = sizeClass == .regular
        // A tab view with its bar hidden: each room keeps its own stack, and
        // only the open one takes touches. The rooms' words are ours.
        TabView(selection: $room) {
            ForEach(Room.allCases) { each in
                RoomStack(room: each, account: wide ? nil : { sheet = .settings })
                    .toolbar(.hidden, for: .tabBar)
                    .tag(each)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if wide { Masthead(room: $room, theme: { sheet = .theme }, account: { sheet = .settings }) }
        }
        // The capsule floats over the room; each stack leaves room for it.
        .overlay(alignment: .bottom) {
            if !wide { RoomCapsule(room: $room) }
        }
        #if DEBUG
        .onAppear { if let start = ProcessInfo.processInfo.environment["NOEIS_ROOM"].flatMap(Room.init) { room = start } }
        #endif
        .sheet(item: $sheet) { which in
            switch which {
            case .settings: SettingsView()
            case .theme: NavigationStack { ThemePicker() }
            }
        }
    }
}

private struct RoomStack: View {
    let room: Room
    let account: (() -> Void)?
    @Namespace private var zoom
    @State private var path: [Route] = []

    var body: some View {
        NavigationStack(path: $path) {
            RoomList(room: room)
                .toolbar {
                    if let account {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button(action: account) { Image(systemName: "person.crop.circle").foregroundStyle(Ink.muted) }
                                .accessibilityLabel("Account and settings")
                        }
                    }
                }
                .navigationDestination(for: Route.self) { RouteView(route: $0).zooms(from: $0, in: zoom) }
        }
        // On iPhone, the last row and the end of a page scroll clear of the capsule.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if account != nil { Color.clear.frame(height: RoomCapsule.height) }
        }
        #if DEBUG
        // Screenshots: NOEIS_OPEN=wiki:wiki-rapamycin opens a page in its room.
        .onAppear {
            guard let open = ProcessInfo.processInfo.environment["NOEIS_OPEN"]?.split(separator: ":", maxSplits: 1).map(String.init),
                  open.count == 2 else { return }
            let route: Route? = switch open[0] {
            case "wiki" where room == .wiki: .wikiPage(open[1])
            case "library" where room == .library: .article(open[1])
            case "judgment" where room == .judgment: .view(open[1])
            case "concept" where room == .think: .concept(open[1])
            case "question" where room == .think: .question(open[1])
            case "note" where room == .think: .note(open[1])
            case "editions" where room == .editions: .edition(open[1])
            default: nil
            }
            if let route { path = [route] }
        }
        #endif
        .environment(\.zoomSpace, zoom)
        .environment(\.open, OpenRoute { path.append($0) })
    }
}

/// iPad: the web's top bar. The wordmark in italic serif, then the rooms as
/// words, the open one in full ink with a thread underline that slides to it.
private struct Masthead: View {
    @Binding var room: Room
    let theme: () -> Void
    let account: () -> Void
    @Namespace private var mark
    @Environment(\.noeisTheme) private var themeId

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text("Noeis")
                .font(.system(size: 30, design: .serif).italic())
                .tracking(-1.2)
                .padding(.trailing, 28)
            HStack(alignment: .firstTextBaseline, spacing: 22) {
                ForEach(Room.allCases) { each in
                    Button { calmly(.easeOut(duration: 0.22)) { room = each } } label: {
                        Text(each.title)
                            .font(.system(size: 17, design: .serif))
                            .foregroundStyle(each == room ? Ink.text : Ink.muted)
                            .padding(.vertical, 6)
                            .overlay(alignment: .bottom) {
                                if each == room {
                                    Rectangle().fill(Ink.accent).frame(height: 1)
                                        .matchedGeometryEffect(id: "line", in: mark)
                                }
                            }
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(QuietPress())
                    .accessibilityAddTraits(each == room ? .isSelected : [])
                    .keyboardShortcut(KeyEquivalent(Character(each.title.prefix(1).lowercased())), modifiers: [.command, .option])
                }
            }
            Spacer(minLength: 20)
            HStack(spacing: 18) {
                Button(action: theme) { ThemeRing(id: themeId) }
                    .accessibilityLabel("Theme")
                Button(action: account) {
                    Image(systemName: "person.crop.circle").font(.system(size: 20, weight: .light))
                }
                .accessibilityLabel("Account and settings")
            }
            .buttonStyle(QuietPress())
            .foregroundStyle(Ink.muted)
        }
        .padding(.horizontal, 40)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background {
            ZStack {
                Rectangle().fill(.ultraThinMaterial)
                Rectangle().fill(Ink.canvas).opacity(0.78)
            }
            .ignoresSafeArea(edges: .top)
        }
        .overlay(alignment: .bottom) { Hairline() }
    }
}

/// The theme you wear, as the web's top bar shows it: a thin ring half filled
/// with the theme's accent (light and dark halves when it follows the device).
private struct ThemeRing: View {
    let id: String

    var body: some View {
        let palette = Palette.named(id)
        ZStack {
            Circle().fill(Color(palette?.paper ?? Palette.light.paper))
            Circle().trim(from: 0.25, to: 0.75)
                .fill(Color(palette?.accent ?? Palette.dark.paper))
                .rotationEffect(.degrees(180))
            Circle().strokeBorder(Ink.muted, lineWidth: 1)
        }
        .frame(width: 18, height: 18)
        .padding(6)
        .contentShape(Rectangle())
    }
}

/// iPhone: the rooms as words in a floating glass capsule; the open one sits
/// in an ink pill that slides between them.
private struct RoomCapsule: View {
    @Binding var room: Room
    @Namespace private var pill

    /// What a page leaves free beneath it: the capsule and a little air.
    static let height: CGFloat = 64

    var body: some View {
        ViewThatFits(in: .horizontal) {
            words(size: 15, padding: 11)
            words(size: 13, padding: 8)
        }
        .padding(4)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Ink.rule))
        .shadow(color: .black.opacity(0.12), radius: 14, y: 6)
        .padding(.horizontal, 12)
        .padding(.bottom, 2)
        .frame(maxWidth: .infinity)
    }

    private func words(size: CGFloat, padding: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(Room.allCases) { each in
                Button { calmly(.spring(response: 0.32, dampingFraction: 0.86)) { room = each } } label: {
                    Text(each.title)
                        .font(.system(size: size, design: .serif))
                        .foregroundStyle(each == room ? Ink.paper : Ink.text)
                        .lineLimit(1)
                        .fixedSize()
                        .padding(.horizontal, padding)
                        .padding(.vertical, 9)
                        .background {
                            if each == room { Capsule().fill(Ink.text).matchedGeometryEffect(id: "pill", in: pill) }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(each == room ? .isSelected : [])
            }
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
        case .think: ThinkRoom()
        case .editions: EditionsFront()
        }
    }
}

/// Opens a page on the room's stack from code, as a row would on a tap.
struct OpenRoute {
    let action: (Route) -> Void
    init(_ action: @escaping (Route) -> Void = { _ in }) { self.action = action }
    func callAsFunction(_ route: Route) { action(route) }
}

extension EnvironmentValues {
    private struct OpenKey: EnvironmentKey { static let defaultValue = OpenRoute() }

    var open: OpenRoute {
        get { self[OpenKey.self] }
        set { self[OpenKey.self] = newValue }
    }

    private struct ZoomKey: EnvironmentKey { static let defaultValue: Namespace.ID? = nil }

    /// The room's namespace, so a page can open out of the row it came from.
    var zoomSpace: Namespace.ID? {
        get { self[ZoomKey.self] }
        set { self[ZoomKey.self] = newValue }
    }
}

extension View {
    /// Where a page opens from (iOS 18's zoom; a plain push before it).
    @ViewBuilder func zoomSource(_ route: Route, in space: Namespace.ID?) -> some View {
        if #available(iOS 18, *), let space { matchedTransitionSource(id: route, in: space) } else { self }
    }

    /// A page that opens out of its row, and folds back into it.
    @ViewBuilder func zooms(from route: Route, in space: Namespace.ID?) -> some View {
        if #available(iOS 18, *), let space { navigationTransition(.zoom(sourceID: route, in: space)) } else { self }
    }
}

/// Anything that opens a page: it pushes onto the room's stack, opening out of
/// whatever was tapped.
struct RouteLink<Label: View>: View {
    let route: Route
    @ViewBuilder var label: Label
    @Environment(\.zoomSpace) private var space

    var body: some View {
        NavigationLink(value: route) { label.contentShape(Rectangle()) }
            .buttonStyle(QuietPress())
            .zoomSource(route, in: space)
    }
}

/// A row of an index: full width, ruled beneath, like the web's collection rows.
struct RouteRow<Label: View>: View {
    let route: Route
    @ViewBuilder var label: Label

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RouteLink(route: route) {
                label.frame(maxWidth: .infinity, alignment: .leading).multilineTextAlignment(.leading)
            }
            Hairline()
        }
    }
}

struct RouteView: View {
    let route: Route

    var body: some View {
        switch route {
        case .wikiPage(let id, let build): WikiPageView(id: id, build: build)
        case .view(let id): ViewDetail(id: id)
        case .article(let id, let passage): ArticleReader(id: id, passage: passage)
        case .note(let id): NoteView(id: id)
        case .concept(let name): ConceptView(name: name)
        case .question(let id): QuestionView(id: id)
        case .edition(let id, let item): IssueView(id: id, focus: item)
        case .paper(let profile): PaperIssues(profile: profile)
        }
    }
}
