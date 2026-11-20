import Foundation
import Security

struct PendingShare: Codable, Equatable {
    var url: URL
    var title: String? = nil
    var selection: String? = nil
    var prefix: String? = nil
    var suffix: String? = nil
    var ownerId: String? = NoeisAuthStore.shared.accountId
    var id = String(UUID().uuidString.lowercased().filter { $0 != "-" }.prefix(24))
}

enum NoeisAuthStoreError: LocalizedError {
    case unableToEncodeToken
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .unableToEncodeToken:
            return "Unable to encode the authentication token."
        case .keychain(let status):
            return "Keychain returned status \(status)."
        }
    }
}

struct NoeisAuthStore {
    static let shared = NoeisAuthStore()

    private let service = "com.atsokolas.noeis.auth"
    private let tokenKey = "jwt"
    private let shareKey = "pending-share"

    var token: String? {
        (try? read(tokenKey)).flatMap { String(data: $0, encoding: .utf8) }
    }

    /// The name inside the session token. There is no "who am I" endpoint,
    /// and the token already says it.
    var username: String? { claims?["username"] as? String }
    var accountId: String? { claims?["id"] as? String }

    private var claims: [String: Any]? {
        guard let payload = token?.split(separator: ".").dropFirst().first else { return nil }
        var base64 = payload.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
        guard let data = Data(base64Encoded: base64),
              let claims = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return claims
    }

    func saveToken(_ token: String) throws {
        guard let data = token.data(using: .utf8) else {
            throw NoeisAuthStoreError.unableToEncodeToken
        }

        try write(data, account: tokenKey)
    }

    var pendingShare: PendingShare? {
        guard let data = try? read(shareKey), let draft = try? JSONDecoder().decode(PendingShare.self, from: data),
              draft.ownerId == nil || draft.ownerId == accountId else { return nil }
        return draft
    }

    func hold(_ draft: PendingShare) throws {
        try write(JSONEncoder().encode(draft), account: shareKey)
    }

    func clearShare(_ draft: PendingShare) {
        if pendingShare?.id == draft.id { try? delete(shareKey) }
    }

    private func write(_ data: Data, account: String) throws {
        var query = baseQuery(account)
        let updated = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw NoeisAuthStoreError.keychain(updated) }

        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NoeisAuthStoreError.keychain(status)
        }
    }

    func clearToken() {
        try? delete(tokenKey)
    }

    private func read(_ account: String) throws -> Data? {
        var query = baseQuery(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw NoeisAuthStoreError.keychain(status)
        }

        return item as? Data
    }

    private func delete(_ account: String) throws {
        let status = SecItemDelete(baseQuery(account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NoeisAuthStoreError.keychain(status)
        }
    }

    private func baseQuery(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}
