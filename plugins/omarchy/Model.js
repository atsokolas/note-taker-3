.pragma library

// Everything the Noeis panel decides without the shell: what counts as a
// link, where a search result opens, what a save receipt says, and how a
// failed request reads. Pure functions, so they are tested in node
// (scripts/omarchy_plugin.test.js) and trusted in QML.

var APP = "https://www.noeis.io"
var API = "https://note-taker-3-unrg.onrender.com"

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

function trimmed(text, length) {
  var flat = String(text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
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
      views.push({ kind: "View", title: claim,
        detail: status === "parked" || status === "closed" ? "Set aside" : p.title && p.title !== claim ? p.title : "",
        path: "/judgment/" + encodeURIComponent(p._id) })
    } else {
      pages.push({ kind: "Wiki", title: p.title || "Untitled page", detail: trimmed(p.plainText, 120),
        path: "/wiki/workspace?page=" + encodeURIComponent(p._id) })
    }
  })
  ;((library && library.articles) || []).forEach(function(a) {
    sources.push({ kind: "Source", title: a.title || "Untitled", detail: trimmed(a.content, 120),
      path: "/library?articleId=" + encodeURIComponent(a._id) })
  })
  ;((library && library.highlights) || []).forEach(function(h) {
    passages.push({ kind: "Passage", title: trimmed(h.text, 120), detail: h.articleTitle || "",
      path: "/library?articleId=" + encodeURIComponent(h.articleId) + "&highlightId=" + encodeURIComponent(h._id) })
  })
  ;((library && library.notebook) || []).forEach(function(n) {
    notes.push({ kind: "Note", title: n.title || "Untitled note", detail: trimmed(n.content, 120),
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

// The nightstand as rows: what you set aside to read later, newest first,
// each opening where it waits in the Library.
function nightstandRows(reply, limit) {
  return ((reply && reply.items) || []).slice(0, limit || 6).map(function(a) {
    return { kind: "Nightstand", title: a.title || "Untitled", detail: a.siteName || a.author || "",
      path: "/library?articleId=" + encodeURIComponent(a._id) }
  })
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
