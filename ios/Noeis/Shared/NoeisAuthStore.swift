import Foundation
import Security

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
    private let account = "jwt"

    var token: String? {
        try? readToken()
    }

    func saveToken(_ token: String) throws {
        guard let data = token.data(using: .utf8) else {
            throw NoeisAuthStoreError.unableToEncodeToken
        }

        try deleteTokenFromKeychain()

        var query = baseQuery()
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NoeisAuthStoreError.keychain(status)
        }
    }

    func clearToken() {
        try? deleteTokenFromKeychain()
    }

    private func readToken() throws -> String? {
        var query = baseQuery()
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

        guard let data = item as? Data else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    private func deleteTokenFromKeychain() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NoeisAuthStoreError.keychain(status)
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}
