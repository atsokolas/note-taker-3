.pragma library

// Everything Noeis decides without the shell: what counts as a link, where
// a search result opens, what a save receipt says, how a failed request
// reads, how a piece becomes paragraphs for the reading window, and what
// the evening says. Pure functions, so they are tested in node
// (scripts/omarchy_plugin.test.js) and trusted in QML.

var APP = "https://www.noeis.io"
var API = "https://note-taker-3-unrg.onrender.com"

// The rooms of noeis.io, in the order the panel lists them and the reader numbers them.
var PLACES = [["Library", "/library"], ["Think", "/think"], ["Wiki", "/wiki"], ["Judgment", "/judgment"], ["Editions", "/editions"]]

var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"]

// The field takes a link or a search, so a link has to look like one: a
// scheme, or a host with a real top-level name. A bare word, or "e.g.",
// is a search.
function linkFrom(value) {
  var text = String(value || "").trim().replace(/^<|>$/g, "")
  if (!text || /\s/.test(text)) return ""
  var match = /^(https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(:\d+)?([\/?#]\S*)?$/i.exec(text)
  if (!match) return ""
  return match[1] ? text : "https://" + text
}

// A token's claims are base64url JSON. Decoded here rather than with
// Qt.atob, which Qt 6.12 deprecates, so the same code runs in node.
function claimsOf(token) {
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  var part = String(token || "").split(".")[1] || ""
  var bits = 0, value = 0, json = ""
  for (var i = 0; i < part.length; i++) {
    value = (value << 6) | alphabet.indexOf(part.charAt(i))
    bits += 6
    if (bits >= 8) {
      bits -= 8
      json += String.fromCharCode((value >> bits) & 0xff)
    }
  }
  try { return JSON.parse(json) } catch (e) { return {} }
}

// A saved session is a token. A sign-in token past its expiry is no session
// at all, so the panel asks to connect instead of failing on the first
// request; a connection's token carries no expiry and lasts until revoked.
function sessionFrom(text, now) {
  var saved
  try { saved = JSON.parse(String(text || "")) } catch (e) { saved = null }
  var token = saved && typeof saved.token === "string" ? saved.token : ""
  if (!token) return { token: "", ended: false }
  var expiresAt = Number(claimsOf(token).exp || 0) * 1000
  if (expiresAt && expiresAt <= now) return { token: "", ended: true }
  return { token: token, ended: false }
}

// Text out of stored HTML: the tags gone, the entities a reader meets decoded.
var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…" }

function plain(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function(whole, name) {
    if (name.charAt(0) !== "#") return ENTITIES[name.toLowerCase()] || whole
    var code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return isFinite(code) ? String.fromCharCode(code) : whole
  })
}

function trimmed(text, length) {
  var flat = plain(text).replace(/\s+/g, " ").trim()
  return flat.length > length ? flat.slice(0, length).replace(/\s+\S*$/, "") + "…" : flat
}

// One list from the two places a search reaches: /api/search for the
// Library (sources, passages, notes) and /api/wiki/pages for the Wiki, whose
// pages that hold a claim are views. What you hold leads, then what you have
// written up, then your reading. Each kind is promised two rows before any
// kind takes more, so a search full of sources still shows the view it
// touches. A result is only what the server found; nothing fills an empty
// search.
function searchResults(library, wiki, limit) {
  var views = [], pages = [], sources = [], passages = [], notes = []
  ;(Array.isArray(wiki) ? wiki : []).forEach(function(p) {
    var claim = trimmed(p.judgment && p.judgment.currentJudgment, 120)
    if (claim) {
      var status = p.judgment.status
      views.push({ kind: "View", id: p._id, title: claim,
        detail: status === "parked" || status === "closed" ? "Set aside" : p.title && p.title !== claim ? p.title : "",
        path: "/judgment/" + encodeURIComponent(p._id) })
    } else {
      pages.push({ kind: "Wiki", id: p._id, title: p.title || "Untitled page", detail: trimmed(p.plainText, 120),
        path: "/wiki/workspace?page=" + encodeURIComponent(p._id) })
    }
  })
  ;((library && library.articles) || []).forEach(function(a) {
    sources.push({ kind: "Source", id: a._id, title: a.title || "Untitled", detail: trimmed(a.content, 120),
      path: articlePath(a._id) })
  })
  ;((library && library.highlights) || []).forEach(function(h) {
    passages.push({ kind: "Passage", id: h.articleId, passage: h.text, title: trimmed(h.text, 120), detail: h.articleTitle || "",
      path: articlePath(h.articleId) + "&highlightId=" + encodeURIComponent(h._id) })
  })
  ;((library && library.notebook) || []).forEach(function(n) {
    notes.push({ kind: "Note", id: n._id, title: n.title || "Untitled note", detail: trimmed(n.content, 120),
      path: "/think?tab=notebook&entryId=" + encodeURIComponent(n._id) })
  })
  var groups = [views, pages, sources, passages, notes]
  var taken = groups.map(function() { return 0 })
  var room = limit || 8
  ;[2, Infinity].forEach(function(share) {
    groups.forEach(function(group, i) {
      var more = Math.min(Math.max(0, Math.min(group.length, share) - taken[i]), room)
      taken[i] += more
      room -= more
    })
  })
  return [].concat.apply([], groups.map(function(group, i) { return group.slice(0, taken[i]) }))
}

function articlePath(id) {
  return "/library?articleId=" + encodeURIComponent(id)
}

// The nightstand as rows: what you set aside to read later, newest first,
// each opening where it waits in the Library, or in the reading window.
function nightstandRows(reply) {
  return ((reply && reply.items) || []).map(function(a) {
    return { kind: "Nightstand", id: a._id, title: a.title || "Untitled", detail: a.siteName || a.author || "",
      minutes: Number(a.minutes || 0), path: articlePath(a._id) }
  })
}

// A piece as the reading window shows it: headings, paragraphs, quotes and
// list items, in order. Block tags become breaks, marked with their kind;
// everything else is text. Stored plain text splits on its blank lines.
function blocksOf(html) {
  var kinds = { h: "heading", q: "quote", l: "item" }
  var marked = String(html || "")
    .replace(/<(script|style|figure|nav|aside)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<h[1-6]\b[^>]*>/gi, "\n\n\u0001h")
    .replace(/<blockquote\b[^>]*>/gi, "\n\n\u0001q")
    .replace(/<li\b[^>]*>/gi, "\n\n\u0001l")
    .replace(/<\/?(p|div|section|article|h[1-6]|blockquote|li|ul|ol|pre|tr|table)\b[^>]*>|<br\s*\/?>/gi, "\n\n")
  // A mark left alone (<blockquote><p>…) passes its kind to the text after it.
  var blocks = [], pending = ""
  plain(marked).split(/\n\s*\n/).forEach(function(part) {
    var mark = /\u0001([hql])/.exec(part)
    var text = part.replace(/\u0001[hql]/g, "").replace(/\s+/g, " ").trim()
    if (mark) pending = kinds[mark[1]]
    if (!text) return
    blocks.push({ kind: pending || "paragraph", text: text })
    pending = ""
  })
  return blocks
}

// A Wiki page's body is a document tree; its text nodes gather into the
// heading, paragraph, quote or list item that holds them.
function docBlocks(node, kind, out) {
  out = out || []
  var own = { heading: "heading", blockquote: "quote", listItem: "item" }[node && node.type] || kind
  if (node && (node.type === "heading" || node.type === "paragraph")) {
    var text = (function words(n) {
      return n.type === "text" ? n.text || "" : (n.content || []).map(words).join(n.type === "hardBreak" ? " " : "")
    })(node).replace(/\s+/g, " ").trim()
    if (text) out.push({ kind: own || "paragraph", text: text })
  } else {
    ;((node && node.content) || []).forEach(function(child) { docBlocks(child, own, out) })
  }
  return out
}

// Where the reading window asks for a row's piece. Everything a panel row
// names can be read in the window: a source (or a passage, in its source),
// a note, a Wiki page or a view.
function pieceSource(row) {
  var id = encodeURIComponent(row.id)
  return { Note: "/api/notebook/" + id, Wiki: "/api/wiki/pages/" + id + "?reader=1", View: "/api/wiki/pages/" + id + "?reader=1" }[row.kind]
    || "/articles/" + id
}

// The piece itself: a title, a line saying what it is, its blocks, and the
// block to start at, which is the passage a passage row named.
function pieceFrom(row, reply) {
  var r = reply || {}
  var piece
  if (row.kind === "Note") {
    var noteKinds = { heading: "heading", quote: "quote", blockquote: "quote", highlight_embed: "quote", bullet: "item", todo: "item" }
    piece = { title: r.title || "Untitled note", byline: "Note",
      blocks: (r.blocks || []).map(function(b) { return { kind: noteKinds[b.type] || "paragraph", text: trimmed(b.text, 100000) } })
        .filter(function(b) { return b.text }) }
  } else if (row.kind === "Wiki" || row.kind === "View") {
    var claim = trimmed(r.judgment && r.judgment.currentJudgment, 100000)
    var body = docBlocks(r.body)
    piece = { title: r.title || "Untitled page", byline: row.kind,
      blocks: (claim ? [{ kind: "quote", text: claim }] : []).concat(body.length ? body : blocksOf(r.plainText)) }
  } else {
    piece = { title: r.title || "Untitled", byline: r.siteName || r.author || "", blocks: blocksOf(r.content) }
  }
  var start = row.passage ? trimmed(row.passage, 100000).slice(0, 60) : ""
  piece.cursor = Math.max(0, start ? piece.blocks.findIndex(function(b) { return b.text.indexOf(start) !== -1 }) : 0)
  return piece
}

// What the evening says: how many short pieces fit tonight, beginning with
// the one that has waited longest. Short is what the web app's nightstand
// calls short (server/services/nightstand.js). Nothing short waiting is
// silence, never a long piece offered anyway.
var TONIGHT_MINUTES = 15
var COUNTS = ["", "One short piece fits", "Two short pieces fit", "Three short pieces fit", "Four short pieces fit"]

function tonight(rows) {
  var short = (rows || []).filter(function(r) { return r.minutes && r.minutes <= TONIGHT_MINUTES })
  if (!short.length) return null
  var first = short[short.length - 1]
  return { id: first.id, text: (COUNTS[short.length] || short.length + " short pieces fit") + " tonight. "
    + first.title + " has waited longest, " + first.minutes + " min." }
}

// Milliseconds until the clock next reads `hour`:00.
function untilHour(hour, now) {
  var next = new Date(now)
  next.setHours(hour, 0, 0, 0)
  if (next.getTime() <= now) next.setDate(next.getDate() + 1)
  return next.getTime() - now
}

// The theme's colours from colors.toml. Omarchy's default, Tokyo Night,
// stands in until the file holds a usable pair.
var TOKYO_NIGHT = { background: "#1a1b26", foreground: "#a9b1d6", accent: "#7aa2f7", selection: "#292e42", urgent: "#f7768e" }

function parseColors(toml) {
  var found = {}
  String(toml || "").split("\n").forEach(function(line) {
    var m = /^\s*([a-z_]+)\s*=\s*"(#[0-9a-f]{6})"/i.exec(line)
    if (m) found[m[1]] = m[2].toLowerCase()
  })
  if (!found.foreground || !found.background) return TOKYO_NIGHT
  return { background: found.background, foreground: found.foreground, accent: found.accent || found.foreground,
    selection: found.selection || found.lighter_background || found.background, urgent: found.red || found.accent || found.foreground }
}

function dayOf(value) {
  var date = new Date(value)
  return isNaN(date.getTime()) ? "" : MONTHS[date.getMonth()] + " " + date.getDate()
}

// What a save says is where the piece is now, as the server reports it, so
// the line is true whether or not this server puts links on the nightstand.
function saveReceipt(reply) {
  var article = (reply && reply.article) || {}
  var title = article.title || "Untitled"
  var where = { later: "on your nightstand", setAside: "on your desk" }[article.placement] || ""
  if (reply && reply.existing) {
    var since = dayOf(article.createdAt)
    return "Already yours" + (since ? " since " + since : "") + (where ? ", " + where : "") + ": " + title
  }
  return (where ? where.charAt(0).toUpperCase() + where.slice(1) : "Saved to your Library") + ": " + title
}

// Failures as sentences someone can act on, never a status code.
function problem(status, reply, action) {
  if (!status) return "Noeis could not be reached. Check your connection and try again."
  if (action === "connect" && status === 410) return "That approval ran out of time. Connect again."
  if (status === 401) return "Noeis no longer knows this desktop. Connect again."
  if (action === "save" && (status === 400 || status === 422))
    return "Noeis could not read that page. Some sites only show their text to a signed-in browser."
  return (reply && reply.error) || "That did not work just now. Try it again."
}
