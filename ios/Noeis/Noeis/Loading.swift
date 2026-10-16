import SwiftUI

/// Loads something once, shows it, and says honestly why it is slow.
///
/// The API sleeps when nobody has used it for a while, and the first request
/// after that can take most of a minute. A spinner that sits there silently
/// reads as broken; after a few seconds this says what is happening.
struct Loaded<Value, Content: View>: View {
    let load: () async throws -> Value
    @ViewBuilder let content: (Value, _ reload: @escaping () async -> Void) -> Content

    @State private var value: Value?
    @State private var error: String?
    @State private var waking = false

    var body: some View {
        Group {
            if let value {
                content(value, reload)
            } else if let error {
                ContentUnavailableView {
                    Label("Could not load this", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await reload() } }
                }
            } else {
                VStack(spacing: 12) {
                    ProgressView()
                    if waking {
                        Text("Noeis is waking up. After a quiet spell the first look takes up to a minute.")
                            .font(.footnote)
                            .foregroundStyle(Ink.muted)
                            .multilineTextAlignment(.center)
                            .transition(.opacity)
                    }
                }
                .padding(32)
                .frame(maxWidth: 360)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task { if value == nil { await reload() } }
    }

    private func reload() async {
        error = nil
        let slow = Task {
            try await Task.sleep(for: .seconds(4))
            withAnimation { waking = true }
        }
        defer { slow.cancel(); waking = false }
        do {
            value = try await load()
        } catch is CancellationError {
        } catch NoeisAPIError.signedOut {
            // The session view takes over; nothing to show here.
        } catch {
            if value == nil { self.error = error.localizedDescription }
        }
    }
}

/// Runs a write and surfaces a failure as an alert, so a tap never fails silently.
@MainActor
final class Writer: ObservableObject {
    @Published var failure: String?
    @Published var busy = false

    func run(_ action: @escaping () async throws -> Void) {
        Task {
            busy = true
            defer { busy = false }
            do { try await action() } catch NoeisAPIError.signedOut {
            } catch { failure = error.localizedDescription }
        }
    }
}

extension View {
    func failureAlert(_ writer: Writer) -> some View {
        alert("That did not go through", isPresented: Binding(get: { writer.failure != nil }, set: { if !$0 { writer.failure = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(writer.failure ?? "")
        }
    }
}

extension Date {
    var shortDay: String { formatted(.dateTime.month(.abbreviated).day()) }
    var longDay: String { formatted(.dateTime.month(.wide).day().year()) }
    var ago: String { formatted(.relative(presentation: .named)) }
}
