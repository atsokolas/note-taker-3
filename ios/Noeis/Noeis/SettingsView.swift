import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var theme: Theme
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
                Section("Appearance") {
                    NavigationLink {
                        ThemePicker()
                    } label: {
                        LabeledContent {
                            HStack(spacing: 10) {
                                Text(Palette.named(theme.id)?.label ?? "Follow this device")
                                Swatch(id: theme.id)
                            }
                        } label: {
                            Text("Theme")
                        }
                    }
                }
                Section("Saving") {
                    Label("In Safari or any app, tap Share, then Noeis", systemImage: "square.and.arrow.up")
                        .foregroundStyle(Ink.muted)
                    Link(destination: NoeisAPI.shared.site) { Label("Open noeis.io", systemImage: "safari") }
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

/// The web's theme menu: choosing a theme puts it on at once, Looks good
/// keeps it on the account, and leaving without it puts back the one you
/// came in with.
private struct ThemePicker: View {
    @EnvironmentObject private var theme: Theme
    @Environment(\.dismiss) private var dismiss
    @State private var origin: String?
    @State private var kept = false
    @State private var shown = Shown.all
    @StateObject private var writer = Writer()

    private enum Shown: String, CaseIterable { case all = "All", dark = "Dark", light = "Light" }

    private var entries: [(id: String, label: String)] {
        [("auto", "Follow this device")] + Palette.all
            .filter { shown == .all || $0.dark == (shown == .dark) }
            .map { ($0.id, $0.label) }
    }

    var body: some View {
        List {
            Section {
                ForEach(entries, id: \.id) { entry in
                    Button {
                        calmly { theme.id = entry.id }
                    } label: {
                        HStack(spacing: 14) {
                            Swatch(id: entry.id)
                            Text(entry.label).foregroundStyle(Ink.text)
                            Spacer()
                            if entry.id == theme.id { Image(systemName: "checkmark").foregroundStyle(Ink.accent) }
                        }
                    }
                    .accessibilityAddTraits(entry.id == theme.id ? .isSelected : [])
                }
            } header: {
                VStack(alignment: .leading, spacing: 8) {
                    Text("A different light to read by.").font(.headline2).foregroundStyle(Ink.text).textCase(nil)
                    Text("Noeis’s own, and ten community favorites by way of Strata. Pick one; every room changes with it, here and on the web.")
                        .font(.callout).foregroundStyle(Ink.muted).textCase(nil)
                    Picker("Show", selection: $shown) {
                        ForEach(Shown.allCases, id: \.self) { Text($0.rawValue) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.top, 6)
                }
                .padding(.bottom, 8)
            }
        }
        .paper()
        .navigationTitle("Theme")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Looks good") {
                    let chosen = theme.id
                    writer.run {
                        try await theme.keep(chosen)
                        kept = true
                        dismiss()
                    }
                }
                .disabled(writer.busy)
            }
        }
        .failureAlert(writer)
        .onAppear { if origin == nil { origin = theme.id } }
        .onDisappear { if !kept, let origin { theme.id = origin } }
    }
}

/// A theme read the way the web's menu reads one: accent, ink, danger and
/// rule standing on its own paper. Following the device shows Light and Dark
/// side by side.
struct Swatch: View {
    let id: String

    var body: some View {
        Group {
            if let palette = Palette.named(id) {
                bars(palette)
            } else {
                HStack(spacing: 0) { bars(.light); bars(.dark) }
            }
        }
        .frame(width: 44, height: 26)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Ink.rule))
        .accessibilityHidden(true)
    }

    private func bars(_ palette: Palette) -> some View {
        HStack(spacing: 3) {
            ForEach([palette.accent, palette.text, palette.danger, palette.subtle], id: \.self) { color in
                Capsule().fill(Color(uiColor: color)).frame(width: 3, height: 14)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(uiColor: palette.paper))
    }
}
