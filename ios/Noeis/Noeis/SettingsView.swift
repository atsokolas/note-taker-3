import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    @State private var confirmingDelete = false
    @State private var password = ""
    @State private var deleteError: String?

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    LabeledContent("Signed in as", value: session.username.isEmpty ? "You" : session.username)
                    Button("Sign out") { session.signOut() }
                }
                Section {
                    Label("In Safari or any app, tap Share, then Noeis", systemImage: "square.and.arrow.up")
                        .foregroundStyle(Ink.muted)
                    Link(destination: NoeisAPI.shared.site) { Label("Open noeis.io", systemImage: "safari") }
                } header: {
                    Text("Saving")
                } footer: {
                    Text("Noeis follows your device's light or dark setting.")
                }
                Section("About") {
                    Link("Privacy", destination: NoeisAPI.shared.site.appendingPathComponent("privacy"))
                    Link("Terms", destination: NoeisAPI.shared.site.appendingPathComponent("terms"))
                    Link("Support", destination: NoeisAPI.shared.site.appendingPathComponent("support"))
                    LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")
                }
                Section {
                    Button("Delete account", role: .destructive) { confirmingDelete = true }
                } footer: {
                    Text("Deleting ends access at once, on every device, and asks us to erase everything you saved, wrote and built. Erasing is done by hand, so it is not instant; until then no one can sign in to it.")
                }
            }
            .paper()
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .alert("Delete your account?", isPresented: $confirmingDelete) {
                SecureField("Password", text: $password)
                Button("Delete", role: .destructive) { delete() }
                Button("Cancel", role: .cancel) { password = "" }
            } message: {
                Text("Enter your password to confirm. This cannot be undone.")
            }
            .alert("Your account was not deleted", isPresented: Binding(get: { deleteError != nil }, set: { if !$0 { deleteError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(deleteError ?? "")
            }
        }
    }

    private func delete() {
        let entered = password
        password = ""
        Task {
            do { try await session.deleteAccount(password: entered) } catch { deleteError = error.localizedDescription }
        }
    }
}
