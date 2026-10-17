import SwiftUI

@main
struct NoeisApp: App {
    @StateObject private var session = Session()

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
            .tint(Ink.thread)
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
