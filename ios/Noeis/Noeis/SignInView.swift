import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var session: Session
    @State private var username = ""
    @State private var password = ""
    @State private var creating = false
    @State private var working = false
    @State private var message = ""
    @FocusState private var focus: Field?

    private enum Field { case username, password }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Noeis").font(.system(size: 52, weight: .medium, design: .serif))
                    Text("Know when your reading disagrees with you.")
                        .font(.readingLarge)
                        .foregroundStyle(Ink.muted)
                }

                VStack(spacing: 12) {
                    TextField("Username", text: $username)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .username)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }
                    SecureField("Password", text: $password)
                        .textContentType(creating ? .newPassword : .password)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(submit)
                }
                .textFieldStyle(PaperFieldStyle())

                if !message.isEmpty {
                    Text(message).font(.footnote).foregroundStyle(Ink.danger)
                }

                Button(action: submit) {
                    HStack {
                        if working { ProgressView().tint(Ink.paper) }
                        Text(creating ? "Create account" : "Sign in").fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(working || username.isEmpty || password.isEmpty)

                Button(creating ? "I already have an account" : "New here? Create an account") {
                    creating.toggle()
                    message = ""
                }
                .font(.subheadline)
                .frame(maxWidth: .infinity)

                if creating {
                    Text("At least 8 characters, with a letter and a number.")
                        .font(.footnote)
                        .foregroundStyle(Ink.subtle)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(28)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
            .padding(.top, 72)
        }
        .scrollDismissesKeyboard(.interactively)
        .paper()
        .animation(.easeOut(duration: 0.2), value: creating)
    }

    private func submit() {
        guard !working, !username.isEmpty, !password.isEmpty else { return }
        working = true
        message = ""
        Task {
            defer { working = false }
            do {
                if creating {
                    try await NoeisAPI.shared.register(username: username, password: password)
                }
                try await session.signIn(username: username, password: password)
            } catch {
                message = error.localizedDescription
            }
        }
    }
}

struct PaperFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .background(Ink.paper, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Ink.rule))
            .foregroundStyle(Ink.text)
    }
}
