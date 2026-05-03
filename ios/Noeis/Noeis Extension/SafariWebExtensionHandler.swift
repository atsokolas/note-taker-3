import SafariServices

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey] as? [String: Any]
        let command = message?["command"] as? String
        let response = NSExtensionItem()

        switch command {
        case "getAuthToken":
            response.userInfo = [SFExtensionMessageKey: ["token": NoeisAuthStore.shared.token as Any]]
        case "setAuthToken":
            if let token = message?["token"] as? String {
                try? NoeisAuthStore.shared.saveToken(token)
            }
            response.userInfo = [SFExtensionMessageKey: ["ok": true]]
        case "clearAuthToken":
            NoeisAuthStore.shared.clearToken()
            response.userInfo = [SFExtensionMessageKey: ["ok": true]]
        default:
            response.userInfo = [SFExtensionMessageKey: ["ok": true]]
        }

        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
