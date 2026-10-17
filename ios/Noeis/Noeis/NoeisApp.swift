import SwiftUI

@main
struct NoeisApp: App {
    @StateObject private var session = Session()
    @StateObject private var theme = Theme()

    /// Page titles in the reading serif, as on the web.
    init() {
        func serif(_ style: UIFont.TextStyle, _ weight: UIFont.Weight) -> UIFont {
            let base = UIFont.preferredFont(forTextStyle: style).fontDescriptor
            let descriptor = (base.withDesign(.serif) ?? base).addingAttributes([.traits: [UIFontDescriptor.TraitKey.weight: weight]])
            return UIFont(descriptor: descriptor, size: 0)
        }
        let bar = UINavigationBar.appearance()
        bar.largeTitleTextAttributes = [.font: serif(.largeTitle, .regular)]
        bar.titleTextAttributes = [.font: serif(.headline, .regular)]
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if session.signedIn {
                    Rooms()
                } else {
                    SignInView()
                }
            }
            .environmentObject(session)
            .environmentObject(theme)
            .environment(\.noeisTheme, theme.id)
            .preferredColorScheme(theme.scheme)
            .tint(Ink.accent)
            .task(id: session.signedIn) { if session.signedIn { await theme.sync() } }
            .onReceive(NotificationCenter.default.publisher(for: .noeisSignedOut)) { _ in
                session.signedIn = false
            }
        }
    }
}

@MainActor
final class Session: ObservableObject {
    @Published var signedIn = NoeisAuthStore.shared.token != nil

    var username: String { NoeisAuthStore.shared.username ?? "" }

    func signIn(username: String, password: String) async throws {
        let token = try await NoeisAPI.shared.signIn(username: username, password: password)
        try NoeisAuthStore.shared.saveToken(token)
        signedIn = true
    }

    func signOut() {
        NoeisAuthStore.shared.clearToken()
        signedIn = false
    }

    func deleteAccount(password: String) async throws {
        try await NoeisAPI.shared.deleteAccount(password: password)
        signOut()
    }
}

/// The account's theme. Kept on the device so the app opens in it, and on
/// the account so the web and every device wear the same one.
@MainActor
final class Theme: ObservableObject {
    @Published var id = UserDefaults.standard.string(forKey: "theme") ?? "auto" {
        didSet { UserDefaults.standard.set(id, forKey: "theme") }
    }

    /// A named palette sets light or dark for the system's own controls too.
    var scheme: ColorScheme? { Palette.named(id).map { $0.dark ? .dark : .light } }

    func sync() async {
        if let saved = try? await NoeisAPI.shared.theme(), !saved.isEmpty, saved != id { id = saved }
    }

    func keep(_ chosen: String) async throws {
        id = chosen
        try await NoeisAPI.shared.setTheme(chosen)
    }
}
