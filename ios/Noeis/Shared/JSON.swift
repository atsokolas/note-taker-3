import Foundation

/// The server's JSON, read where it is used.
///
/// The API is shared with a web app that changes weekly. Mirroring every
/// response in a Swift struct would make each server change a crash here, so
/// records stay as JSON and each screen reads the few fields it shows.
/// Writes that must round-trip a whole object (a view's judgment) send the
/// same JSON back untouched.
enum JSON: Codable, Hashable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([JSON].self) { self = .array(value) }
        else { self = .object(try container.decode([String: JSON].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }

    subscript(key: String) -> JSON? {
        if case .object(let object) = self { return object[key] }
        return nil
    }

    /// A trimmed string, or nil when absent or blank.
    var string: String? {
        switch self {
        case .string(let value):
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        case .number(let value):
            return value == value.rounded() ? String(Int(value)) : String(value)
        default:
            return nil
        }
    }

    /// The string exactly as sent, spaces kept (inline text runs need them).
    var raw: String {
        if case .string(let value) = self { return value }
        return string ?? ""
    }

    var double: Double? {
        switch self {
        case .number(let value): return value
        case .string(let value): return Double(value)
        default: return nil
        }
    }

    var int: Int? { double.map { Int($0) } }

    var bool: Bool {
        if case .bool(let value) = self { return value }
        return false
    }

    var array: [JSON] {
        if case .array(let value) = self { return value }
        return []
    }

    var object: [String: JSON] {
        if case .object(let value) = self { return value }
        return [:]
    }

    var date: Date? { string.flatMap(JSON.parseDate) }

    /// `_id`, or `id`, as Mongo and the API spell it.
    var id: String { self["_id"]?.string ?? self["id"]?.string ?? "" }

    /// Follows a dotted path, e.g. `json.at("judgment.currentJudgment")`.
    func at(_ path: String) -> JSON? {
        path.split(separator: ".").reduce(self as JSON?) { $0?[String($1)] }
    }

    func setting(_ key: String, to value: JSON) -> JSON {
        var object = self.object
        object[key] = value
        return .object(object)
    }

    private static let isoFull: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoPlain = ISO8601DateFormatter()

    static func parseDate(_ value: String) -> Date? {
        isoFull.date(from: value) ?? isoPlain.date(from: value)
    }

    static func iso(_ date: Date) -> String { isoFull.string(from: date) }
}

extension JSON: ExpressibleByStringLiteral, ExpressibleByDictionaryLiteral, ExpressibleByArrayLiteral, ExpressibleByBooleanLiteral, ExpressibleByFloatLiteral, ExpressibleByNilLiteral {
    init(stringLiteral value: String) { self = .string(value) }
    init(dictionaryLiteral elements: (String, JSON)...) { self = .object(Dictionary(elements, uniquingKeysWith: { $1 })) }
    init(arrayLiteral elements: JSON...) { self = .array(elements) }
    init(booleanLiteral value: Bool) { self = .bool(value) }
    init(floatLiteral value: Double) { self = .number(value) }
    init(nilLiteral: ()) { self = .null }
}

extension Optional where Wrapped == JSON {
    /// Reads like the web's `normalizeSpaces(x) || ''`.
    var text: String { self?.string ?? "" }
}
