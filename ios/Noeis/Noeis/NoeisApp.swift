import SwiftUI

@main
struct NoeisApp: App {
    @StateObject private var session = Session()
    @Environment(\.scenePhase) private var scenePhase
    @State private var pendingShare: PendingShare?

    var body: some Scene {
        WindowGroup {
            Group {
                if session.signedIn {
                    Rooms()
                        .safeAreaInset(edge: .top, spacing: 0) {
                            if let pendingShare { SharedSave(draft: pendingShare) { self.pendingShare = nil }.id(pendingShare.id) }
                        }
                } else {
                    SignInView()
                }
            }
            .environmentObject(session)
            .tint(Ink.thread)
            .task(id: session.signedIn) { refreshShare() }
            .onChange(of: scenePhase) { _, phase in if phase == .active { refreshShare() } }
            .onReceive(NotificationCenter.default.publisher(for: .noeisSignedOut)) { _ in
                session.signedIn = false
            }
        }
    }

    private func refreshShare() {
        let auth = NoeisAuthStore.shared
        let signedIn = auth.token != nil
        if session.signedIn != signedIn { session.signedIn = signedIn }
        pendingShare = signedIn ? auth.pendingShare : nil
    }
}

private struct SharedSave: View {
    let draft: PendingShare
    let close: () -> Void
    @State private var saving = false
    @State private var outcome: (NoeisAPI.SavedLink, String?)?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(outcome?.0.message ?? (draft.title ?? draft.url.host() ?? "Shared page"))
                .font(.system(.subheadline, design: .serif).weight(.semibold))
                .lineLimit(2)
            if outcome == nil, let selection = draft.selection, !selection.isEmpty {
                Text(selection).font(.footnote).foregroundStyle(Ink.muted).lineLimit(2)
            }
            HStack {
                if let outcome, let href = outcome.0.href(at: outcome.1) {
                    Link(outcome.1 == nil ? "Open saved article" : "Open saved passage", destination: href)
                } else {
                    Button(saving ? "Saving…" : "Finish shared save") { Task { await finish() } }.disabled(saving)
                }
                Spacer()
                Button(outcome == nil ? "Later" : "Done", action: close).disabled(saving)
            }.font(.footnote)
            if let error { Text(error).font(.footnote).foregroundStyle(Ink.danger) }
        }
        .padding(12)
        .background(Ink.paper)
    }

    private func finish() async {
        saving = true
        error = nil
        defer { saving = false }
        do { outcome = try await NoeisAPI.shared.finishShare(draft) }
        catch { self.error = error.localizedDescription }
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
