import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Save to Noeis" from the share sheet: the page, the passage you selected,
/// and, when it argues with a view you hold, a line saying so.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let card = UIHostingController(rootView: SaveCard(items: extensionContext?.inputItems as? [NSExtensionItem] ?? []) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        })
        addChild(card)
        card.view.frame = view.bounds
        card.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        card.view.backgroundColor = .clear
        view.addSubview(card.view)
        card.didMove(toParent: self)
    }
}

private struct SharedPage {
    var url: URL
    var title: String?
    var selection: String?

    /// Safari hands over the page through GetPage.js (with the selection);
    /// other apps send a URL, or text containing one.
    static func read(_ items: [NSExtensionItem]) async -> SharedPage? {
        let providers = items.flatMap { $0.attachments ?? [] }
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier) {
            if let dictionary = try? await provider.loadItem(forTypeIdentifier: UTType.propertyList.identifier) as? [String: Any],
               let results = dictionary[NSExtensionJavaScriptPreprocessingResultsKey] as? [String: Any],
               let url = (results["url"] as? String).flatMap(URL.init(string:)) {
                return SharedPage(url: url, title: results["title"] as? String, selection: results["selection"] as? String)
            }
        }
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL, url.scheme?.hasPrefix("http") == true {
                return SharedPage(url: url, title: items.first?.attributedContentText?.string)
            }
        }
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String,
               let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue),
               let url = detector.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))?.url {
                let rest = text.replacingOccurrences(of: url.absoluteString, with: "").trimmingCharacters(in: .whitespacesAndNewlines)
                return SharedPage(url: url, selection: rest.count >= 3 ? rest : nil)
            }
        }
        return nil
    }
}

private struct SaveCard: View {
    let items: [NSExtensionItem]
    let close: () -> Void

    private enum Stage: Equatable {
        case saving
        case saved(marked: Bool)
        case argues(view: String)
        case failed(String)
    }

    @State private var stage = Stage.saving
    @State private var page: SharedPage?

    var body: some View {
        VStack {
            Spacer()
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Noeis").font(.system(.title3, design: .serif).weight(.medium))
                    Spacer()
                    Button("Done", action: close).fontWeight(.semibold)
                }
                if let title = page?.title, !title.isEmpty {
                    Text(title).font(.system(.headline, design: .serif)).lineLimit(2)
                }
                if let selection = page?.selection?.trimmingCharacters(in: .whitespacesAndNewlines), selection.count >= 3 {
                    Passage(text: String(selection.prefix(280)))
                }
                switch stage {
                case .saving:
                    HStack(spacing: 8) { ProgressView(); Text("Saving…").foregroundStyle(Ink.muted) }
                case .saved(let marked):
                    Label(marked ? "Saved, with the passage marked" : "Saved to your Library", systemImage: "checkmark.circle")
                        .foregroundStyle(Ink.living)
                case .argues(let view):
                    Label("Saved", systemImage: "checkmark.circle").foregroundStyle(Ink.living)
                    Text("This pushes against your view that \(view.lowercasedFirst)")
                        .font(.system(.body, design: .serif))
                        .padding(.top, 2)
                    Text("It is waiting in the view, to file for or against.").font(.footnote).foregroundStyle(Ink.subtle)
                case .failed(let message):
                    Text(message).foregroundStyle(Ink.danger)
                }
            }
            .padding(20)
            .background(Ink.paper, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Ink.rule))
            .shadow(color: .black.opacity(0.12), radius: 24, y: 8)
            .padding(16)
            .frame(maxWidth: 520)
            .calmAnimation(.easeOut(duration: 0.25), value: stage)
        }
        .frame(maxWidth: .infinity)
        .foregroundStyle(Ink.text)
        .task { await save() }
    }

    private func save() async {
        guard NoeisAuthStore.shared.token != nil else {
            stage = .failed("Open Noeis and sign in once, then share again.")
            return
        }
        guard let shared = await SharedPage.read(items) else {
            stage = .failed("There is no web page here to save.")
            return
        }
        page = shared
        do {
            let articleId = try await NoeisAPI.shared.save(url: shared.url, title: shared.title)
            var marked = false
            if let selection = shared.selection?.trimmingCharacters(in: .whitespacesAndNewlines), selection.count >= 3, !articleId.isEmpty {
                marked = (try? await NoeisAPI.shared.mark(articleId: articleId, text: selection)) != nil
            }
            stage = .saved(marked: marked)
            // Reading it against your views takes a moment; ask twice, then let it be.
            for delay in [1.0, 3.0] {
                try? await Task.sleep(for: .seconds(delay))
                if let reading = try? await NoeisAPI.shared.pushesAgainst(articleId: articleId) {
                    stage = .argues(view: reading["view"].text)
                    return
                }
            }
            try? await Task.sleep(for: .seconds(1))
            close()
        } catch {
            stage = .failed(error.localizedDescription)
        }
    }
}
