#if DEBUG
import Foundation

/// A made-up reader's library, for screenshots in the simulator. Launch with
/// NOEIS_SAMPLE=1 (DEBUG builds only); nothing here reaches a release build.
enum Sample {
    /// The reply the API would give for a GET of `path` with `query`, or nil for an empty reply.
    static func reply(_ method: String, _ path: String, _ query: [String: String]) -> JSON? {
        let parts = path.split(separator: "/").map(String.init)
        func at(_ pattern: String) -> [String]? { match(parts, pattern) }
        guard method == "GET" else { return write(parts) }

        if at("api/ui-settings") != nil { return ["theme": "auto"] }

        // Wiki and Judgment share one collection; the projection says which.
        if at("api/wiki/pages") != nil {
            return query["projection"] == "judgment" ? views : .array(wiki.array.map { without($0, "body") })
        }
        if let id = at("api/wiki/pages/*")?.first { return find(wiki, id) ?? find(views, id) }
        if let id = at("api/wiki/pages/*/research-candidate")?.first {
            return ["summary": ["reason": "The Partner proposes adding the 2026 mouse cohort from your library, which tempers the lifespan figure in the second passage."], "candidate": find(wiki, id) ?? .null]
        }
        if let id = at("api/wiki/pages/*/library-evidence")?.first { return ["candidates": evidence[id] ?? []] }
        if let id = at("api/wiki/pages/*/judgment-change-proposal")?.first { return ["proposal": .null, "reading": proposals[id] ?? []] }
        if at("api/wiki/changes") != nil { return changes }
        if at("api/wiki/contradictions") != nil { return ["contradictions": contradictions[query["pageId"] ?? ""] ?? []] }
        if at("api/judgment/due") != nil { return due }
        if at("api/judgment/pushes-against") != nil {
            let articleId = query["articleId"] ?? ""
            return ["reading": articleId.isEmpty || articleId == "art-cowos" ? pushesAgainst : .null]
        }

        if at("api/articles") != nil { return .array(articles.array.map { without($0, "content") }) }
        if let id = at("articles/*")?.first { return find(articles, id) ?? kept(id) }
        if let id = at("api/articles/*/highlights")?.first { return highlights[id] ?? [] }

        if at("api/notebook") != nil { return .array(notes.array.map { without($0, "blocks") }) }
        if let id = at("api/notebook/*")?.first { return find(notes, id) }

        if at("api/concepts") != nil { return concepts }
        if let name = at("api/concepts/*")?.first {
            let concept = concepts.array.first { $0["name"].text == name } ?? ["name": .string(name)]
            return concept.setting("allHighlightCount", to: concept["count"] ?? 0.0)
        }
        if let name = at("api/concepts/*/related")?.first { return conceptRelated[name] ?? ["highlights": [], "notes": [], "articles": []] }
        if let name = at("api/concepts/*/questions")?.first { return .array(questions.array.filter { $0["linkedTagName"].text == name }) }
        if at("api/questions") != nil { return questions }
        if let id = at("api/questions/*")?.first { return find(questions, id) }

        if at("api/editions") != nil { return ["editions": .array(stand().map(listRow))] }
        if let id = at("api/editions/*")?.first { return stand().first { $0.id == id } }
        if let ids = at("api/editions/*/items/*/held") { return ["held": held[ids[1]] ?? .null] }
        return nil
    }

    // MARK: Writes

    private static func write(_ parts: [String]) -> JSON {
        func at(_ pattern: String) -> [String]? { match(parts, pattern) }
        if at("api/auth/login") != nil { return ["token": "sample"] }
        for action in ["save", "later", "state"] {
            if let ids = at("api/editions/*/items/*/\(action)") { return ["edition": act(ids[0], ids[1], action)] }
        }
        if let id = at("api/notebook/*/opposite")?.first { return ["line": opposite[id] ?? .null] }
        if at("api/notebook/*/workbench/wording-options") != nil {
            return ["status": "ready", "options": [
                ["wording": "But SK hynix guides as if the pricing power were already its own.", "explanation": "More direct: the hedge moves into the verb."],
                ["wording": "SK hynix, though, is guiding as if it holds the pricing power, and it may be right.", "explanation": "Grants the other side before the turn."]
            ]]
        }
        if at("api/agent/chat") != nil { return partner }
        if at("api/wiki/pages/*/judgment-change-proposals") != nil { return ["proposal": ["id": "rcpt-sample"]] }
        if at("api/wiki/pages") != nil { return wiki.array.first ?? .null }
        if at("api/questions") != nil { return questions.array.first ?? .null }
        if at("api/import/url") != nil { return ["article": ["_id": "art-memory-wall"]] }
        return ["ok": true]
    }

    // MARK: Editions, which Keep and reading change for the session

    private static let lock = NSLock()
    private static var issues: [JSON] = parse(Sample.editionsText).array.map(Sample.counted)

    private static func stand() -> [JSON] {
        lock.lock(); defer { lock.unlock() }
        return issues
    }

    private static func act(_ id: String, _ itemId: String, _ action: String) -> JSON {
        lock.lock(); defer { lock.unlock() }
        guard let index = issues.firstIndex(where: { $0.id == id }) else { return .null }
        let items = (issues[index]["items"]?.array ?? []).map { item -> JSON in
            guard item["itemId"].text == itemId else { return item }
            // The body (opened, dismissed, new) does not reach here, so a state change reads as opened.
            let opened = item.setting("readerStatus", to: "opened")
            return action == "state" ? opened : opened.setting("savedArticleId", to: .string("kept-\(itemId)"))
        }
        issues[index] = counted(issues[index].setting("items", to: .array(items)))
        return issues[index]
    }

    private static func counted(_ issue: JSON) -> JSON {
        let items = issue["items"]?.array ?? []
        return issue
            .setting("itemCount", to: .number(Double(items.count)))
            .setting("newCount", to: .number(Double(items.filter { $0["readerStatus"].text == "new" }.count)))
            .setting("savedCount", to: .number(Double(items.filter { $0["savedArticleId"]?.string != nil }.count)))
    }

    /// The stand carries who filed, never what they said.
    private static func listRow(_ issue: JSON) -> JSON {
        let filings: [JSON] = (issue["items"]?.array ?? []).map {
            ["section": $0["section"] ?? "", "filedBy": $0["filedBy"] ?? "", "filedByRuntime": $0["filedByRuntime"] ?? "",
             "filedAt": $0["filedAt"] ?? .null, "saved": .bool($0["savedArticleId"]?.string != nil)]
        }
        return without(issue, "items").setting("filings", to: .array(filings))
    }

    /// A finding kept this session opens as a saved article made from it.
    private static func kept(_ id: String) -> JSON? {
        guard id.hasPrefix("kept-") else { return nil }
        let itemId = String(id.dropFirst(5))
        guard let item = stand().flatMap({ $0["items"]?.array ?? [] }).first(where: { $0["itemId"].text == itemId }) else { return nil }
        let content = [item["finding"].text, item["passage"].text, item["boundary"].text].filter { !$0.isEmpty }.joined(separator: "\n")
        return ["_id": .string(id), "title": item["title"] ?? "", "url": item["url"] ?? .null, "siteName": item["sourceLabel"] ?? "",
                "createdAt": .string(JSON.iso(Date())), "content": .string(content)]
    }

    // MARK: Helpers

    private static func match(_ parts: [String], _ pattern: String) -> [String]? {
        let shape = pattern.split(separator: "/").map(String.init)
        guard shape.count == parts.count else { return nil }
        var ids: [String] = []
        for (want, got) in zip(shape, parts) {
            if want == "*" { ids.append(got) } else if want != got { return nil }
        }
        return ids
    }

    private static func find(_ list: JSON, _ id: String) -> JSON? { list.array.first { $0.id == id } }

    private static func without(_ json: JSON, _ key: String) -> JSON {
        var object = json.object
        object[key] = nil
        return .object(object)
    }

    private static func parse(_ text: String) -> JSON {
        do { return try JSONDecoder().decode(JSON.self, from: Data(text.utf8)) } catch {
            assertionFailure("Sample JSON does not parse: \(error)")
            return .null
        }
    }

    // MARK: Library

    private static let articles = parse(#"""
    [
      {"_id": "art-hbm4", "title": "SK hynix says HBM4 is sold out through 2027", "siteName": "The Elec", "url": "https://www.thelec.net/news/articleView.html?idxno=5012",
       "createdAt": "2026-10-15T22:05:00.000Z", "highlightCount": 1, "lastPlace": {"ratio": 1.0},
       "firstGraph": "SK hynix told analysts on Wednesday that its HBM4 output for 2026 and 2027 is fully committed, and that it has begun volume shipments of twelve-high stacks to its largest customer.",
       "content": "SK hynix told analysts on Wednesday that its HBM4 output for 2026 and 2027 is fully committed, and that it has begun volume shipments of twelve-high stacks to its largest customer.\nThe company said it would raise HBM capital spending again next year, but cautioned that new capacity at its Cheongju M15X fab will not reach full output until late 2027. Through-silicon-via yields on sixteen-high stacks remain below its internal targets.\nAnalysts on the call pressed on pricing. The company declined to give figures but said long-term agreements signed this year carry prices “meaningfully above” those for HBM3E.\nFor accelerator vendors, the message is that memory supply, more than wafer starts at the foundry, will set how many parts ship next year."},
      {"_id": "art-memory-wall", "title": "The memory wall is the real bottleneck for inference", "siteName": "Semiconductor Engineering", "url": "https://semiengineering.com/the-memory-wall-is-the-real-bottleneck-for-inference/",
       "createdAt": "2026-10-14T08:12:00.000Z", "highlightCount": 2, "lastPlace": {"ratio": 0.42},
       "firstGraph": "For most of the last decade, the conversation about AI hardware was a conversation about compute. Inference has quietly broken that framing.",
       "content": "<p>For most of the last decade, the conversation about AI hardware was a conversation about compute. Peak FLOPS doubled on a predictable cadence, and each new accelerator generation was marketed on how many trillions of operations it could retire per second. Inference has quietly broken that framing.</p><h2>Decode is a bandwidth problem</h2><p>When a large language model generates text, each new token requires reading the model’s weights and the growing key-value cache out of memory. At batch sizes typical of interactive serving, the arithmetic units spend most of their time waiting. Several engineers we spoke with put utilization during decode below 30 percent on current parts, even when the same chips run training workloads above 60 percent.</p><p>That is why the most consequential spec on a 2026 accelerator is not its tensor throughput but its memory bandwidth per dollar. HBM stacks now account for roughly a third of the bill of materials on a flagship part, and the share is rising as vendors move to twelve- and sixteen-high stacks.</p><h2>Where the money goes next</h2><p>The response is showing up in three places at once: more HBM per package, larger on-die SRAM to keep hot weights close, and serving software that batches requests more aggressively to amortize each read. None of these is free. Larger stacks run hotter, SRAM costs die area, and bigger batches add latency that users notice.</p><p>&ldquo;We used to ask how fast the chip could think,&rdquo; one architect at a hyperscaler said. &ldquo;Now we ask how fast it can remember.&rdquo;</p><figure><img src=\"https://example.com/chart.png\"><figcaption>Figure 1. Decode throughput against memory bandwidth across four accelerator generations.</figcaption></figure><blockquote><p>We are no longer compute-bound at the token level; we are waiting on memory.</p></blockquote><h3>What it means for buyers</h3><ul><li>Bandwidth per dollar matters more than FLOPS per dollar.</li><li>HBM supply sets shipments.</li></ul><table><tr><th>Part</th><th>HBM</th><th>TB/s</th></tr><tr><td>H100</td><td>80 GB</td><td>3.35</td></tr><tr><td>B200</td><td>192 GB</td><td>8.0</td></tr></table><aside><p>A note on method: figures are vendor peak numbers, not measured throughput.</p></aside><p>This last paragraph shows the reader did not stop early.</p>"},
      {"_id": "art-minneapolis", "title": "Minneapolis 2040, five years on", "siteName": "Bloomberg CityLab", "url": "https://www.bloomberg.com/news/features/2026-10-12/minneapolis-2040-five-years-on",
       "createdAt": "2026-10-12T14:30:00.000Z", "highlightCount": 0,
       "firstGraph": "When Minneapolis ended single-family-only zoning in 2019, it became a national symbol. Five years later, the city’s rents have risen more slowly than in its peer metros.",
       "content": "When Minneapolis ended single-family-only zoning in 2019, it became a national symbol. Five years later, the city’s rents have risen more slowly than in its peer metros.\nBut the rezoning itself produced little. Fewer than 200 duplexes and triplexes have been permitted on formerly single-family lots. Most of the new supply came from large apartment buildings along transit corridors, which were allowed before 2040 and were helped more by parking reform and faster permitting.\nResearchers at the Pew Charitable Trusts credit the slower rent growth to that supply. Crediting the plan’s headline change, they argue, would be a mistake.\nCity officials dispute the framing. The triplex rule, they say, was never meant to carry the plan; it was meant to end a prohibition, and prohibitions are measured by what they stop, not by what replaces them in five years."},
      {"_id": "art-cowos", "title": "CoWoS, not HBM, is the constraint that matters", "siteName": "SemiAnalysis", "url": "https://semianalysis.com/2026/10/11/cowos-not-hbm-is-the-constraint/",
       "createdAt": "2026-10-11T17:48:00.000Z", "highlightCount": 0, "lastPlace": {"ratio": 0.71},
       "firstGraph": "The market has settled on a tidy story: memory is the bottleneck, and whoever secures HBM wins 2027. Our channel checks suggest the tidier story is wrong.",
       "content": "The market has settled on a tidy story: memory is the bottleneck, and whoever secures HBM wins 2027. Our channel checks suggest the tidier story is wrong.\nHBM supply is tight, but it is tight in a way suppliers can plan around. The three memory makers have signed multi-year agreements and are adding capacity on known schedules. Advanced packaging is different. TSMC’s CoWoS-L lines are booked by a handful of customers, and every percentage point of yield lost on large interposers removes accelerators from the market outright.\nIn our model, CoWoS capacity binds before HBM in four of the next six quarters. Accelerator shipments track packaging output almost one for one; they track HBM bit supply only loosely.\nThis matters for anyone holding a view on the memory makers. If packaging binds first, HBM pricing power fades sooner than consensus expects.\nWe would change our minds if TSMC’s CoWoS-L output passes 90,000 wafers a month before the end of the year. Nothing we have seen suggests it will."},
      {"_id": "art-marmosets", "title": "Rapamycin in middle-aged marmosets: a two-year readout", "siteName": "Nature Aging", "url": "https://www.nature.com/articles/s43587-026-00912-4",
       "createdAt": "2026-10-08T09:20:00.000Z", "highlightCount": 2, "lastPlace": {"ratio": 0.3},
       "firstGraph": "We report interim results from a randomized, placebo-controlled study of oral rapamycin in 48 common marmosets aged 8 to 10 years.",
       "content": "We report interim results from a randomized, placebo-controlled study of oral rapamycin in 48 common marmosets aged 8 to 10 years, roughly equivalent to late middle age in humans.\nAfter 24 months, treated animals showed no significant difference in all-cause mortality (hazard ratio 0.82, 95% CI 0.41–1.63). Treated animals did show lower fasting insulin and preserved lean mass relative to controls.\nAdverse events were modest. Two treated animals developed mouth ulcers that resolved after a dose reduction; no increase in infections was observed.\nThe study was not powered to detect lifespan effects at this interim point. Final survival data are expected in 2029.\nThese results are consistent with rapamycin being well tolerated in a primate at doses that engage mTORC1, but they do not yet show it extends life."},
      {"_id": "art-clocks", "title": "The case against epigenetic clocks as trial endpoints", "siteName": "STAT", "url": "https://www.statnews.com/2026/10/03/epigenetic-clocks-trial-endpoints/",
       "createdAt": "2026-10-03T12:00:00.000Z", "highlightCount": 1,
       "firstGraph": "Every few months, a startup announces that its intervention reversed someone’s biological age by several years. The number almost always comes from an epigenetic clock.",
       "content": "Every few months, a startup announces that its intervention reversed someone’s biological age by several years. The number almost always comes from an epigenetic clock.\nClocks are good at what they were built for: predicting chronological age, and in later versions, mortality risk across populations. They are much worse at telling you whether a change in one person, over a few months, means anything.\nTest-retest noise on several widely used clocks is on the order of two to three years. A reported reversal of 2.5 years can sit entirely inside that noise.\nNewer clocks trained on the pace of aging rather than its level do better, and their reliability is improving fast. But reliability is not validity.\nUntil a clock is shown to move in step with outcomes that matter, regulators are right not to accept it as an endpoint."},
      {"_id": "art-auckland", "title": "What Auckland’s upzoning did to rents", "siteName": "Works in Progress", "url": "https://worksinprogress.co/issue/what-aucklands-upzoning-did-to-rents/",
       "createdAt": "2026-09-29T19:41:00.000Z", "highlightCount": 3, "lastPlace": {"ratio": 0.88},
       "firstGraph": "In 2016, Auckland rezoned about three quarters of its residential land to allow more homes per lot. It remains the largest natural experiment in upzoning anywhere.",
       "content": "In 2016, Auckland rezoned about three quarters of its residential land to allow more homes per lot. It remains the largest natural experiment in upzoning anywhere.\nBuilding permits roughly doubled within five years, with most of the increase in townhouses on land that had held a single detached house.\nThe best estimates suggest rents for three-bedroom homes ended up 26 to 33 percent lower than they would have been without the reform, six years after it took effect.\nThe effect did not show up immediately. For the first two years, rents tracked the rest of New Zealand closely; the gap opened only as completions caught up with permits.\nThat timing is the part advocates tend to skip. Upzoning works through construction, and construction takes years."}
    ]
    """#)

    private static let highlights = parse(#"""
    {
      "art-hbm4": [{"_id": "hl-hbm4-1", "text": "memory supply, more than wafer starts at the foundry, will set how many parts ship next year.", "anchor": {"text": "memory supply, more than wafer starts at the foundry, will set how many parts ship next year."}}],
      "art-memory-wall": [
        {"_id": "hl-mw-1", "text": "At batch sizes typical of interactive serving, the arithmetic units spend most of their time waiting.", "anchor": {"text": "At batch sizes typical of interactive serving, the arithmetic units spend most of their time waiting."}},
        {"_id": "hl-mw-2", "text": "HBM stacks now account for roughly a third of the bill of materials on a flagship part", "anchor": {"text": "HBM stacks now account for roughly a third of the bill of materials on a flagship part"}}
      ],
      "art-marmosets": [
        {"_id": "hl-mar-1", "text": "Treated animals did show lower fasting insulin and preserved lean mass relative to controls.", "anchor": {"text": "Treated animals did show lower fasting insulin and preserved lean mass relative to controls."}},
        {"_id": "hl-mar-2", "text": "but they do not yet show it extends life.", "anchor": {"text": "but they do not yet show it extends life."}}
      ],
      "art-clocks": [{"_id": "hl-clk-1", "text": "Test-retest noise on several widely used clocks is on the order of two to three years.", "anchor": {"text": "Test-retest noise on several widely used clocks is on the order of two to three years."}}],
      "art-auckland": [
        {"_id": "hl-akl-1", "text": "rents for three-bedroom homes ended up 26 to 33 percent lower than they would have been without the reform", "anchor": {"text": "rents for three-bedroom homes ended up 26 to 33 percent lower than they would have been without the reform"}},
        {"_id": "hl-akl-2", "text": "The effect did not show up immediately.", "anchor": {"text": "The effect did not show up immediately."}},
        {"_id": "hl-akl-3", "text": "Upzoning works through construction, and construction takes years.", "anchor": {"text": "Upzoning works through construction, and construction takes years."}}
      ]
    }
    """#)

    // MARK: Think

    private static let concepts = parse(#"""
    [
      {"_id": "c-memory", "name": "Memory bandwidth", "count": 4, "description": "Why inference waits on memory, not arithmetic, and who gets paid for that."},
      {"_id": "c-upzoning", "name": "Upzoning", "count": 3, "description": "What changing the rules on land does to rents, and how long it takes."},
      {"_id": "c-rapamycin", "name": "Rapamycin", "count": 2, "description": ""},
      {"_id": "c-clocks", "name": "Aging clocks", "count": 1, "description": "Whether a blood test can stand in for living longer."}
    ]
    """#)

    private static let conceptRelated = parse(#"""
    {
      "Memory bandwidth": {
        "highlights": [
          {"_id": "hl-mw-1", "text": "At batch sizes typical of interactive serving, the arithmetic units spend most of their time waiting.", "articleId": "art-memory-wall", "articleTitle": "The memory wall is the real bottleneck for inference"},
          {"_id": "hl-mw-2", "text": "HBM stacks now account for roughly a third of the bill of materials on a flagship part", "articleId": "art-memory-wall", "articleTitle": "The memory wall is the real bottleneck for inference"},
          {"_id": "hl-hbm4-1", "text": "memory supply, more than wafer starts at the foundry, will set how many parts ship next year.", "articleId": "art-hbm4", "articleTitle": "SK hynix says HBM4 is sold out through 2027"}
        ],
        "notes": [{"notebookEntryId": "note-hbm-questions", "notebookTitle": "Questions for the HBM view", "blockPreviewText": "If CoWoS binds first, does memory bandwidth still set the price?"}],
        "articles": [{"_id": "art-memory-wall"}, {"_id": "art-hbm4"}]
      },
      "Upzoning": {
        "highlights": [
          {"_id": "hl-akl-1", "text": "rents for three-bedroom homes ended up 26 to 33 percent lower than they would have been without the reform", "articleId": "art-auckland", "articleTitle": "What Auckland’s upzoning did to rents"},
          {"_id": "hl-akl-3", "text": "Upzoning works through construction, and construction takes years.", "articleId": "art-auckland", "articleTitle": "What Auckland’s upzoning did to rents"}
        ],
        "notes": [],
        "articles": [{"_id": "art-auckland"}, {"_id": "art-minneapolis"}]
      }
    }
    """#)

    private static let questions = parse(#"""
    [
      {"_id": "q-cowos", "text": "Does CoWoS capacity bind before HBM supply next year?", "status": "open", "linkedTagName": "Memory bandwidth",
       "settledBy": "TSMC’s CoWoS capacity guidance against SK hynix HBM4 shipments for the same quarters."},
      {"_id": "q-minneapolis", "text": "Why did Minneapolis permit so few duplexes after 2040?", "status": "open", "linkedTagName": "Upzoning", "settledBy": ""},
      {"_id": "q-clocks", "text": "Is any aging clock precise enough to be a trial endpoint?", "status": "open", "linkedTagName": "Aging clocks",
       "settledBy": "Test-retest noise under a year on a clock that also predicts mortality.",
       "inquiry": {"run": {"status": "complete", "passages": [{"articleId": "art-clocks", "title": "The case against epigenetic clocks as trial endpoints", "passage": "Test-retest noise on several widely used clocks is on the order of two to three years."}]}}},
      {"_id": "wq-rapamycin-0", "text": "Does rapamycin extend life in primates, or only improve markers?", "status": "open", "sourceType": "wiki_open_question", "sourcePageId": "wiki-rapamycin", "sourcePageTitle": "Rapamycin and healthy lifespan"},
      {"_id": "q-auckland", "text": "Did Auckland’s rents fall because of upzoning or the pandemic?", "status": "answered", "linkedTagName": "Upzoning",
       "settledBy": "A synthetic control that separates the 2020 shock from the 2016 reform."}
    ]
    """#)

    // MARK: Wiki

    private static let wiki = parse(#"""
    [
      {"_id": "wiki-memory-bandwidth", "title": "Inference is memory-bound", "pageType": "topic", "updatedAt": "2026-10-15T23:10:00.000Z",
       "plainText": "Serving a large language model spends most of its time moving weights and cache out of memory, not computing on them. That makes memory bandwidth per dollar the spec that matters.",
       "sourceRefs": [
         {"_id": "src-mw-1", "type": "article", "objectId": "art-memory-wall", "title": "The memory wall is the real bottleneck for inference", "url": "https://semiengineering.com/the-memory-wall-is-the-real-bottleneck-for-inference/", "snippet": "At batch sizes typical of interactive serving, the arithmetic units spend most of their time waiting."},
         {"_id": "src-mw-2", "type": "highlight", "objectId": "hl-hbm4-1", "parentObjectId": "art-hbm4", "title": "SK hynix says HBM4 is sold out through 2027", "url": "https://www.thelec.net/news/articleView.html?idxno=5012", "snippet": "memory supply, more than wafer starts at the foundry, will set how many parts ship next year."},
         {"_id": "src-mw-3", "type": "article", "objectId": "art-cowos", "title": "CoWoS, not HBM, is the constraint that matters", "url": "https://semianalysis.com/2026/10/11/cowos-not-hbm-is-the-constraint/", "snippet": "In our model, CoWoS capacity binds before HBM in four of the next six quarters."}
       ],
       "body": {"type": "doc", "content": [
         {"type": "paragraph", "content": [
           {"type": "text", "text": "Serving a large language model spends most of its time moving weights and cache out of memory, not computing on them. "},
           {"type": "text", "text": "During decode, accelerators commonly run below 30 percent utilization even on parts that train above 60 percent", "marks": [{"type": "claim", "attrs": {"claimId": "c-mw-1", "citationIndexes": [1]}}]},
           {"type": "text", "text": "."}
         ]},
         {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Why bandwidth, not FLOPS"}]},
         {"type": "paragraph", "content": [
           {"type": "text", "text": "Each generated token reads the full set of weights plus a key-value cache that grows with the conversation. At small batch sizes there is too little arithmetic per byte to keep the compute units busy, so the "},
           {"type": "text", "text": "memory system", "marks": [{"type": "italic"}]},
           {"type": "text", "text": " sets the pace. This is why "},
           {"type": "text", "text": "HBM supply", "marks": [{"type": "wikiLink", "attrs": {"pageId": "wiki-hbm"}}]},
           {"type": "text", "text": " now shapes the whole accelerator market."}
         ]},
         {"type": "blockquote", "attrs": {"attribution": "A hyperscaler architect, in Semiconductor Engineering"}, "content": [
           {"type": "paragraph", "content": [{"type": "text", "text": "We used to ask how fast the chip could think. Now we ask how fast it can remember."}]}
         ]},
         {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "What vendors are doing about it"}]},
         {"type": "bulletList", "content": [
           {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "More HBM per package, moving to twelve- and sixteen-high stacks."}]}]},
           {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Larger on-die SRAM to keep the hottest weights close to compute."}]}]},
           {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Serving software that batches more aggressively, trading latency for throughput."}]}]}
         ]},
         {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Where it might not hold"}]},
         {"type": "paragraph", "content": [
           {"type": "text", "text": "Memory is sold out, but on a schedule suppliers can plan around. "},
           {"type": "text", "text": "One analysis argues advanced packaging, not HBM, binds first in most quarters through 2027", "marks": [{"type": "claim", "attrs": {"claimId": "c-mw-2", "citationIndexes": [3]}}]},
           {"type": "text", "text": ", while "},
           {"type": "text", "text": "the memory makers themselves say their supply will set how many parts ship", "marks": [{"type": "claim", "attrs": {"claimId": "c-mw-3", "citationIndexes": [2]}}]},
           {"type": "text", "text": ". Both can be true in different quarters."}
         ]}
       ]}},
      {"_id": "wiki-upzoning", "title": "Upzoning and rents", "pageType": "topic", "updatedAt": "2026-10-13T18:02:00.000Z",
       "plainText": "What happens to rents when a city allows more homes per lot. Auckland is the strongest evidence that it works; Minneapolis is the clearest warning that the headline reform is not the whole story.",
       "sourceRefs": [
         {"_id": "src-up-1", "type": "highlight", "objectId": "hl-akl-1", "parentObjectId": "art-auckland", "title": "What Auckland’s upzoning did to rents", "url": "https://worksinprogress.co/issue/what-aucklands-upzoning-did-to-rents/", "snippet": "rents for three-bedroom homes ended up 26 to 33 percent lower than they would have been without the reform"},
         {"_id": "src-up-2", "type": "highlight", "objectId": "hl-akl-2", "parentObjectId": "art-auckland", "title": "What Auckland’s upzoning did to rents", "url": "https://worksinprogress.co/issue/what-aucklands-upzoning-did-to-rents/", "snippet": "The effect did not show up immediately."},
         {"_id": "src-up-3", "type": "article", "objectId": "art-minneapolis", "title": "Minneapolis 2040, five years on", "url": "https://www.bloomberg.com/news/features/2026-10-12/minneapolis-2040-five-years-on", "snippet": "Fewer than 200 duplexes and triplexes have been permitted on formerly single-family lots."}
       ],
       "body": {"type": "doc", "content": [
         {"type": "paragraph", "content": [
           {"type": "text", "text": "Upzoning changes what may be built, not what is built. Whether it lowers rents depends on how much construction actually follows, and how fast."}
         ]},
         {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Auckland, 2016"}]},
         {"type": "paragraph", "content": [
           {"type": "text", "text": "Auckland rezoned about three quarters of its residential land. Permits roughly doubled within five years, mostly townhouses. "},
           {"type": "text", "text": "Six years on, rents for three-bedroom homes were an estimated 26 to 33 percent below the counterfactual", "marks": [{"type": "claim", "attrs": {"claimId": "c-up-1", "citationIndexes": [1]}}]},
           {"type": "text", "text": ". "},
           {"type": "text", "text": "For the first two years, nothing visible happened", "marks": [{"type": "claim", "attrs": {"claimId": "c-up-2", "citationIndexes": [2]}}]},
           {"type": "text", "text": "."}
         ]},
         {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Minneapolis, 2019"}]},
         {"type": "paragraph", "content": [
           {"type": "text", "text": "The national symbol of ending single-family zoning. Rents rose more slowly than in peer metros, but "},
           {"type": "text", "text": "the triplex rule itself produced fewer than 200 units", "marks": [{"type": "bold"}, {"type": "claim", "attrs": {"claimId": "c-up-3", "citationIndexes": [3]}}]},
           {"type": "text", "text": ". The supply came from apartment buildings on transit corridors, helped by parking reform and faster permits."}
         ]},
         {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Open questions"}]},
         {"type": "orderedList", "content": [
           {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "How much of Auckland’s effect came from the zoning versus the infrastructure money that came with it?"}]}]},
           {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Does a reform that permits little still matter by changing what developers expect?"}]}]}
         ]}
       ]}},
      {"_id": "wiki-rapamycin", "title": "Rapamycin and healthy lifespan", "pageType": "topic", "updatedAt": "2026-10-09T07:45:00.000Z",
       "aiState": {"candidateStatus": "awaiting_review"},
       "plainText": "Rapamycin extends lifespan in mice, worms, flies and yeast. Whether it does in primates is the open question; the first marmoset readout says it is safe, not yet that it works.",
       "sourceRefs": [
         {"_id": "src-ra-1", "type": "article", "objectId": "art-marmosets", "title": "Rapamycin in middle-aged marmosets: a two-year readout", "url": "https://www.nature.com/articles/s43587-026-00912-4", "snippet": "but they do not yet show it extends life."},
         {"_id": "src-ra-2", "type": "highlight", "objectId": "hl-mar-1", "parentObjectId": "art-marmosets", "title": "Rapamycin in middle-aged marmosets: a two-year readout", "url": "https://www.nature.com/articles/s43587-026-00912-4", "snippet": "Treated animals did show lower fasting insulin and preserved lean mass relative to controls."}
       ],
       "body": {"type": "doc", "content": [
         {"type": "paragraph", "content": [
           {"type": "text", "text": "Rapamycin inhibits mTORC1 and is the most replicated lifespan-extending drug in laboratory animals. The question that matters is whether any of that carries to primates."}
         ]},
         {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "The marmoset study"}]},
         {"type": "paragraph", "content": [
           {"type": "text", "text": "Forty-eight middle-aged marmosets, randomized. "},
           {"type": "text", "text": "At 24 months there was no significant difference in mortality, though the treated group had lower fasting insulin and kept more lean mass", "marks": [{"type": "claim", "attrs": {"claimId": "c-ra-1", "citationIndexes": [1, 2]}}]},
           {"type": "text", "text": ". Final survival data arrive in 2029."}
         ]},
         {"type": "blockquote", "attrs": {"attribution": "Nature Aging, October 2026"}, "content": [
           {"type": "paragraph", "content": [{"type": "text", "text": "These results are consistent with rapamycin being well tolerated in a primate at doses that engage mTORC1, but they do not yet show it extends life."}]}
         ]}
       ]}},
      {"_id": "wiki-hbm", "title": "HBM supply chain", "pageType": "topic", "updatedAt": "2026-10-16T06:30:00.000Z",
       "plainText": "Three suppliers make high-bandwidth memory: SK hynix, Samsung and Micron. HBM4 output for 2026 and 2027 is committed under long-term agreements.",
       "sourceRefs": [{"_id": "src-hbm-1", "type": "article", "objectId": "art-hbm4", "title": "SK hynix says HBM4 is sold out through 2027", "url": "https://www.thelec.net/news/articleView.html?idxno=5012", "snippet": "SK hynix told analysts on Wednesday that its HBM4 output for 2026 and 2027 is fully committed"}],
       "body": {"type": "doc", "content": [
         {"type": "paragraph", "content": [{"type": "text", "text": "Three suppliers make high-bandwidth memory: SK hynix, Samsung and Micron. "}, {"type": "text", "text": "SK hynix says its HBM4 output for 2026 and 2027 is fully committed", "marks": [{"type": "claim", "attrs": {"claimId": "c-hbm-1", "citationIndexes": [1]}}]}, {"type": "text", "text": ". New capacity at Cheongju M15X reaches full output in late 2027."}]}
       ]}},
      {"_id": "wiki-tsmc", "title": "TSMC", "pageType": "company", "updatedAt": "2026-10-10T15:00:00.000Z", "investmentDossier": {"version": 2},
       "plainText": "The foundry and, increasingly, the packaging house for every leading accelerator. CoWoS-L capacity is the number to watch into 2027.",
       "sourceRefs": [],
       "body": {"type": "doc", "content": [
         {"type": "paragraph", "content": [{"type": "text", "text": "The foundry and, increasingly, the packaging house for every leading accelerator. CoWoS-L capacity is the number to watch into 2027."}]}
       ]}}
    ]
    """#)

    private static let changes = parse(#"""
    {"since": "2026-10-10T00:00:00.000Z", "pageCount": 5, "changes": [
      {"pageId": "wiki-memory-bandwidth", "title": "Inference is memory-bound", "at": "2026-10-15T23:10:00.000Z", "by": "partner",
       "sentence": "Added “Where it might not hold”: one source says packaging binds before memory.", "changeSource": {"title": "CoWoS, not HBM, is the constraint that matters"}},
      {"pageId": "wiki-hbm", "title": "HBM supply chain", "at": "2026-10-16T06:30:00.000Z", "by": "partner",
       "sentence": "Now says HBM4 is committed through 2027, citing SK hynix’s call.", "changeSource": {"title": "SK hynix says HBM4 is sold out through 2027"}},
      {"pageId": "wiki-upzoning", "title": "Upzoning and rents", "at": "2026-10-13T18:02:00.000Z", "by": "you",
       "sentence": "You added a Minneapolis section and two open questions.", "changeSource": null}
    ]}
    """#)

    private static let contradictions = parse(#"""
    {"wiki-upzoning": [
      {"claimText": "Upzoning lowers rents within a few years of the reform.",
       "contradicting": [{"title": "Minneapolis 2040, five years on", "quote": "But the rezoning itself produced little. Fewer than 200 duplexes and triplexes have been permitted on formerly single-family lots."}]}
    ]}
    """#)

    // MARK: Judgment

    private static let views = parse(#"""
    [
      {"_id": "view-hbm", "title": "HBM supply caps accelerator shipments", "pageType": "topic", "createdAt": "2026-07-02T10:00:00.000Z", "updatedAt": "2026-10-09T20:00:00.000Z", "visibility": "private",
       "judgment": {"currentJudgment": "HBM supply, not logic wafers, will cap AI accelerator shipments through 2027.", "startedAt": "2026-07-02T10:00:00.000Z", "bornAt": "2026-07-02T10:00:00.000Z",
         "status": "monitoring", "confidence": 0.75, "lastReviewedAt": "2026-10-09T20:00:00.000Z",
         "why": [
           {"text": "HBM stacks now account for roughly a third of the bill of materials on a flagship part", "sourceLabel": "Semiconductor Engineering"},
           {"text": "memory supply, more than wafer starts at the foundry, will set how many parts ship next year.", "sourceLabel": "The Elec"}
         ],
         "against": [],
         "resolutionCriteria": "If TSMC names CoWoS capacity, not HBM, as the binding constraint on two consecutive earnings calls.", "resolutionHorizonAt": "2027-01-31T12:00:00.000Z", "verdicts": []}},
      {"_id": "view-upzoning", "title": "Upzoning lowers rents fast", "pageType": "topic", "createdAt": "2026-04-18T09:00:00.000Z", "updatedAt": "2026-10-13T18:02:00.000Z", "visibility": "private",
       "judgment": {"currentJudgment": "Citywide upzoning lowers rents within five years, even before much new housing is finished.", "startedAt": "2026-04-18T09:00:00.000Z", "bornAt": "2026-04-18T09:00:00.000Z",
         "status": "monitoring", "confidence": 0.6, "lastReviewedAt": "2026-10-13T18:02:00.000Z",
         "why": [{"text": "rents for three-bedroom homes ended up 26 to 33 percent lower than they would have been without the reform", "sourceLabel": "Works in Progress"}],
         "against": [
           {"text": "The effect did not show up immediately.", "sourceLabel": "Works in Progress"},
           {"text": "Upzoning works through construction, and construction takes years.", "sourceLabel": "Works in Progress"}
         ],
         "resolutionCriteria": "If the Minneapolis five-year review credits the rezoning, not new apartment supply, for slower rent growth.", "resolutionHorizonAt": "2026-10-15T12:00:00.000Z", "verdicts": []}},
      {"_id": "view-clocks", "title": "Epigenetic clocks as endpoints", "pageType": "topic", "createdAt": "2026-08-11T08:00:00.000Z", "updatedAt": "2026-10-04T11:00:00.000Z", "visibility": "private",
       "judgment": {"currentJudgment": "Epigenetic clocks are not yet reliable enough to serve as endpoints in human aging trials.", "startedAt": "2026-09-20T08:00:00.000Z", "bornAt": "2026-09-20T08:00:00.000Z",
         "status": "monitoring", "confidence": 0.9, "lastReviewedAt": "2026-10-04T11:00:00.000Z",
         "heldHistory": [{"judgment": "Epigenetic clocks are useless for measuring aging.", "heldFrom": "2026-08-11T08:00:00.000Z", "heldUntil": "2026-09-20T08:00:00.000Z"}],
         "why": [{"text": "Test-retest noise on several widely used clocks is on the order of two to three years.", "sourceLabel": "STAT"}],
         "against": [{"text": "Newer clocks trained on the pace of aging rather than its level do better, and their reliability is improving fast.", "sourceLabel": "STAT"}],
         "resolutionCriteria": "If the FDA accepts any clock as a secondary endpoint in a registered aging trial.", "resolutionHorizonAt": "2027-06-30T12:00:00.000Z", "verdicts": []}},
      {"_id": "view-rapamycin", "title": "Rapamycin in primates", "pageType": "topic", "createdAt": "2026-03-02T08:00:00.000Z", "updatedAt": "2026-10-08T21:00:00.000Z", "visibility": "private",
       "judgment": {"currentJudgment": "Rapamycin will be the first drug shown to extend healthy lifespan in a primate.", "startedAt": "2026-03-02T08:00:00.000Z", "bornAt": "2026-03-02T08:00:00.000Z",
         "status": "parked", "parkedAt": "2026-10-08T21:00:00.000Z", "confidence": 0.6, "lastReviewedAt": "2026-10-08T21:00:00.000Z",
         "why": [{"text": "Treated animals did show lower fasting insulin and preserved lean mass relative to controls.", "sourceLabel": "Nature Aging"}],
         "against": [{"text": "but they do not yet show it extends life.", "sourceLabel": "Nature Aging"}],
         "verdicts": []}}
    ]
    """#)

    private static let due = parse(#"""
    {"due": {"pageId": "view-upzoning", "view": "Citywide upzoning lowers rents within five years, even before much new housing is finished.",
      "test": "If the Minneapolis five-year review credits the rezoning, not new apartment supply, for slower rent growth.", "by": "2026-10-15T12:00:00.000Z"}}
    """#)

    private static let pushesAgainst = parse(#"""
    {"pageId": "view-hbm", "view": "HBM supply, not logic wafers, will cap AI accelerator shipments through 2027.",
     "proposal": {"id": "rcpt-cowos-1", "sourceLabel": "SemiAnalysis",
       "provenance": {"stance": "challenge", "author": "Dylan Patel", "articleId": "art-cowos",
         "after": "In our model, CoWoS capacity binds before HBM in four of the next six quarters. Accelerator shipments track packaging output almost one for one; they track HBM bit supply only loosely."}}}
    """#)

    private static let proposals = parse(#"""
    {"view-hbm": [
      {"id": "rcpt-cowos-1", "sourceLabel": "SemiAnalysis",
       "provenance": {"stance": "challenge", "author": "Dylan Patel", "articleId": "art-cowos",
         "after": "In our model, CoWoS capacity binds before HBM in four of the next six quarters. Accelerator shipments track packaging output almost one for one; they track HBM bit supply only loosely."}},
      {"id": "rcpt-hbm4-1", "sourceLabel": "The Elec",
       "provenance": {"stance": "support", "author": "", "articleId": "art-hbm4",
         "after": "SK hynix told analysts on Wednesday that its HBM4 output for 2026 and 2027 is fully committed, and that it has begun volume shipments of twelve-high stacks to its largest customer."}}
    ]}
    """#)

    private static let evidence = parse(#"""
    {"view-hbm": [
      {"id": "cand-mw-1", "articleId": "art-memory-wall", "highlightId": "hl-mw-1", "sourceLabel": "The memory wall is the real bottleneck for inference",
       "text": "At batch sizes typical of interactive serving, the arithmetic units spend most of their time waiting."},
      {"id": "cand-hbm4-2", "articleId": "art-hbm4", "sourceLabel": "SK hynix says HBM4 is sold out through 2027",
       "text": "Through-silicon-via yields on sixteen-high stacks remain below its internal targets."}
    ],
    "view-upzoning": [
      {"id": "cand-mpls-1", "articleId": "art-minneapolis", "sourceLabel": "Minneapolis 2040, five years on",
       "text": "Fewer than 200 duplexes and triplexes have been permitted on formerly single-family lots."}
    ],
    "view-clocks": [
      {"id": "cand-clk-1", "articleId": "art-clocks", "sourceLabel": "The case against epigenetic clocks as trial endpoints",
       "text": "Until a clock is shown to move in step with outcomes that matter, regulators are right not to accept it as an endpoint."}
    ]}
    """#)

    // MARK: Think

    private static let notes = parse(#"""
    [
      {"_id": "note-moat", "title": "Memory is the new moat", "updatedAt": "2026-10-16T07:55:00.000Z", "board": {"stage": "idea"},
       "snippet": "If decode is bandwidth-bound, the company that owns the memory roadmap owns the inference roadmap.",
       "blocks": [
         {"id": "b1", "type": "paragraph", "text": "If decode is bandwidth-bound, the company that owns the memory roadmap owns the inference roadmap."},
         {"id": "b2", "type": "paragraph", "text": "That would make SK hynix more like a platform than a supplier, which is not how the market prices it."},
         {"id": "b3", "type": "paragraph", "text": "Counterpoint to chase: memory has been a commodity for forty years. What is different this time besides the margins?"}
       ]},
      {"_id": "note-hbm-questions", "title": "Questions for the HBM view", "updatedAt": "2026-10-15T21:12:00.000Z", "board": {"stage": "in_progress"},
       "snippet": "What would make me wrong: packaging, not memory, binding first.",
       "blocks": [
         {"id": "b1", "type": "heading", "text": "What would make me wrong"},
         {"id": "b2", "type": "paragraph", "text": "The strongest case against is that packaging, not memory, binds first. SemiAnalysis says so outright:"},
         {"id": "b3", "type": "highlight_embed", "articleId": "art-cowos", "articleTitle": "CoWoS, not HBM, is the constraint that matters", "text": "In our model, CoWoS capacity binds before HBM in four of the next six quarters."},
         {"id": "b4", "type": "paragraph", "text": "But SK hynix is guiding as if it holds the pricing power. Both can be right if the binding constraint alternates by quarter."},
         {"id": "b5", "type": "heading", "text": "To read"},
         {"id": "b6", "type": "article_ref", "articleId": "art-hbm4", "title": "SK hynix says HBM4 is sold out through 2027"}
       ],
       "workingState": {"revision": 1,
         "trials": [{"id": "trial-1", "origin": "human", "updatedAt": "2026-10-15T21:10:00.000Z",
           "target": {"blockId": "b4", "offset": 0, "baseText": "But SK hynix is guiding as if it holds the pricing power. Both can be right if the binding constraint alternates by quarter."},
           "alternative": "Yet SK hynix guides as though it sets the price. Both hold if the binding constraint alternates by quarter."}],
         "nextTimeLine": {"text": "Check whether the alternating constraint survives the Q3 numbers.", "target": {"blockId": "b4", "offset": 0, "baseText": ""}}}},
      {"_id": "note-rapa-dosing", "title": "Rapamycin dosing, what we actually know", "updatedAt": "2026-10-09T08:30:00.000Z", "board": {"stage": "in_progress"},
       "snippet": "Intermittent dosing in mice gets most of the benefit with fewer side effects. The marmoset study used daily oral dosing.",
       "blocks": [
         {"id": "b1", "type": "paragraph", "text": "Intermittent dosing in mice gets most of the benefit with fewer side effects. The marmoset study used daily oral dosing."},
         {"id": "b2", "type": "paragraph", "text": "Mouth ulcers in two animals, resolved on dose reduction. No infection signal. That is a cleaner safety story than I expected."}
       ]},
      {"_id": "note-auckland", "title": "Why Auckland is a strange natural experiment", "updatedAt": "2026-10-13T19:20:00.000Z", "board": {"stage": "in_progress"},
       "snippet": "The rezoning came with infrastructure money and a housing shortage that was already acute.",
       "blocks": [
         {"id": "b1", "type": "paragraph", "text": "The rezoning came with infrastructure money and a housing shortage that was already acute."},
         {"id": "b2", "type": "paragraph", "text": "Rents only diverged once completions caught up with permits, about two years in. So the zoning mattered through building, not through expectations."},
         {"id": "b3", "type": "paragraph", "text": "If that is right, a city that upzones and then builds nothing should see no rent effect at all."}
       ]},
      {"_id": "note-november", "title": "Reading list for November", "updatedAt": "2026-10-11T22:00:00.000Z", "board": {"stage": "idea"},
       "snippet": "TSMC Q3 transcript. The ITP 2023 cohort paper when it lands. Glaeser on land-use regulation, again.",
       "blocks": [
         {"id": "b1", "type": "paragraph", "text": "TSMC Q3 transcript, the packaging section especially."},
         {"id": "b2", "type": "paragraph", "text": "The ITP 2023 cohort paper when it lands."},
         {"id": "b3", "type": "paragraph", "text": "Glaeser on land-use regulation, again, now that I have the Auckland numbers in my head."}
       ]},
      {"_id": "note-clocks", "title": "Clock skepticism, summarized", "updatedAt": "2026-10-04T11:05:00.000Z", "board": {"stage": "done"},
       "snippet": "Noise of two to three years swamps most reported reversals. Pace-of-aging clocks are better, but reliable is not the same as valid.",
       "blocks": [
         {"id": "b1", "type": "paragraph", "text": "Noise of two to three years swamps most reported reversals."},
         {"id": "b2", "type": "paragraph", "text": "Pace-of-aging clocks are better, but reliable is not the same as valid. I changed my view from “useless” to “not yet an endpoint”."}
       ]},
      {"_id": "note-packaging", "title": "Packaging or memory: which binds first?", "updatedAt": "2026-10-12T09:40:00.000Z", "board": {"stage": "idea"},
       "snippet": "A table by quarter: CoWoS-L wafers per month against HBM bits shipped.",
       "blocks": [
         {"id": "b1", "type": "paragraph", "text": "A table by quarter: CoWoS-L wafers per month against HBM bits shipped, converted to accelerators."},
         {"id": "b2", "type": "paragraph", "text": "Whichever line is lower is the cap. Start with 2026 Q4 and 2027 Q1."}
       ]},
      {"_id": "note-minneapolis", "title": "Notes from the Minneapolis piece", "updatedAt": "2026-10-12T15:10:00.000Z", "board": {"stage": "done"},
       "snippet": "The headline reform built under 200 units. Parking reform and faster permits did the work.",
       "blocks": [
         {"id": "b1", "type": "paragraph", "text": "The headline reform built under 200 units. Parking reform and faster permits did the work."},
         {"id": "b2", "type": "paragraph", "text": "City officials say a prohibition is measured by what it stops. Fair, but that is not the claim anyone made in 2019."}
       ]}
    ]
    """#)

    private static let opposite = parse(#"""
    {"note-auckland": {"key": "opp-akl-1", "pageId": "view-upzoning",
      "sentence": "Rents only diverged once completions caught up with permits, about two years in.",
      "view": "Citywide upzoning lowers rents within five years, even before much new housing is finished."}}
    """#)

    private static let partner = parse(#"""
    {"reply": "Your library leans one way on this. Two sources you saved say memory sets the pace: Semiconductor Engineering on decode utilization, and SK hynix’s own guidance. One, SemiAnalysis, argues packaging binds first in four of the next six quarters. Your view would survive if the constraint alternates, but its wording says HBM caps shipments through 2027, which is the stronger claim.",
     "thread": {"threadId": "thread-sample-1"},
     "relatedItems": [
       {"type": "article", "id": "art-cowos", "title": "CoWoS, not HBM, is the constraint that matters", "snippet": "In our model, CoWoS capacity binds before HBM in four of the next six quarters."}
     ],
     "citations": [
       {"type": "article", "id": "art-memory-wall", "title": "The memory wall is the real bottleneck for inference"},
       {"type": "article", "id": "art-cowos", "title": "CoWoS, not HBM, is the constraint that matters"},
       {"type": "wiki_page", "id": "wiki-memory-bandwidth", "title": "Inference is memory-bound"}
     ]}
    """#)

    // MARK: Editions

    private static let held = parse(#"""
    {"chips3-hbm4": {"highlightId": "hl-mw-2", "articleId": "art-memory-wall", "articleTitle": "The memory wall is the real bottleneck for inference",
                     "text": "HBM stacks now account for roughly a third of the bill of materials on a flagship part"},
     "house1-mpls": {"highlightId": "hl-akl-3", "articleId": "art-auckland", "articleTitle": "What Auckland’s upzoning did to rents",
                     "text": "Upzoning works through construction, and construction takes years."}}
    """#)

    private static let editionsText = #"""
    [
      {"_id": "ed-chips-3", "profile": "ai-chips", "profileLabel": "AI chips weekly", "issueLabel": "Issue", "title": "AI chips weekly", "number": 3,
       "windowStart": "2026-10-12T00:00:00.000Z", "windowEnd": "2026-10-18T23:59:59.000Z", "createdAt": "2026-10-12T06:00:00.000Z", "updatedAt": "2026-10-16T05:10:00.000Z",
       "sections": [{"key": "memory", "label": "Memory"}, {"key": "packaging", "label": "Packaging"}, {"key": "policy", "label": "Export policy"}],
       "headline": "Memory makers sell out, and packaging starts to bite",
       "standfirst": "SK hynix confirmed HBM4 is spoken for through 2027, while one analysis argues TSMC’s packaging lines, not memory, set how many accelerators ship.",
       "throughLine": "Two constraints are visible at once. Memory is sold out, but on a schedule everyone can see; packaging is the one that can still surprise you.",
       "watchNext": ["Micron’s HBM share guidance at its fiscal Q1 call", "Whether CoWoS-L output passes 90,000 wafers a month by year end"],
       "followUps": [
         {"watch": "Whether SK hynix confirms HBM4 12-high volume shipments", "status": "happened", "note": "Confirmed on its Oct 15 call; see finding 01."},
         {"watch": "Micron’s HBM share guidance at its fiscal Q1 call", "status": "not_yet", "note": "The call is on Dec 17."}
       ],
       "silences": [{"key": "policy", "label": "Export policy", "state": "checked", "by": [{"label": "Claude Code", "runtime": "claude-code"}]}],
       "writtenBy": "Claude Code", "writtenByRuntime": "claude-code",
       "items": [
         {"itemId": "chips3-hbm4", "section": "memory", "title": "SK hynix third-quarter 2026 earnings call", "url": "https://www.skhynix.com/ir/UI-FR-IR01/", "sourceLabel": "SK hynix", "sourceKind": "company", "sourceDate": "2026-10-15T00:00:00.000Z",
          "plain": "The memory inside AI chips is spoken for through 2027.",
          "finding": "SK hynix said its HBM4 output for 2026 and 2027 is fully committed under long-term agreements and that volume shipments of twelve-high stacks have begun.",
          "boundary": "This is the supplier’s own account. It does not say how the committed supply splits between customers.",
          "passage": "our HBM4 supply for 2026 and 2027 has been fully committed through long-term agreements", "passageCheck": "found", "confidence": "high",
          "figures": [{"value": "100%", "label": "of 2026–27 HBM4 output committed"}, {"value": "12-high", "label": "stacks now shipping in volume"}],
          "filedBy": "Claude Code", "filedByRuntime": "claude-code", "filedAt": "2026-10-15T21:40:00.000Z", "readings": [], "savedArticleId": null, "readerStatus": "new"},
         {"itemId": "chips3-cowos", "section": "packaging", "title": "CoWoS, not HBM, is the constraint that matters", "url": "https://semianalysis.com/2026/10/11/cowos-not-hbm-is-the-constraint/", "sourceLabel": "SemiAnalysis", "sourceKind": "news", "sourceDate": "2026-10-11T00:00:00.000Z",
          "plain": "Packaging, not memory, may decide how many accelerators ship.",
          "finding": "SemiAnalysis models CoWoS capacity as binding before HBM in four of the next six quarters, with accelerator shipments tracking packaging output almost one for one.",
          "boundary": "A model built on channel checks, not reported figures. The authors do not publish its inputs.",
          "passage": "In our model, CoWoS capacity binds before HBM in four of the next six quarters.", "passageCheck": "unchecked", "confidence": "moderate",
          "figures": [{"value": "4 of 6", "label": "quarters where packaging binds first"}],
          "filedBy": "Claude Code", "filedByRuntime": "claude-code", "filedAt": "2026-10-14T18:05:00.000Z", "savedArticleId": null, "readerStatus": "new",
          "readings": [
            {"filedBy": "Claude Code", "filedByRuntime": "claude-code", "filedAt": "2026-10-14T18:05:00.000Z", "finding": "SemiAnalysis models CoWoS capacity as binding before HBM in four of the next six quarters, with accelerator shipments tracking packaging output almost one for one.", "boundary": "A model built on channel checks, not reported figures.", "note": ""},
            {"filedBy": "Codex", "filedByRuntime": "codex", "filedAt": "2026-10-15T09:30:00.000Z", "finding": "The piece argues that yield on large interposers, not HBM bit supply, sets accelerator output through 2027.", "boundary": "Its shipment estimates are its own and run below TSMC’s guidance.", "note": "Read independently of the first filing."}
          ]},
         {"itemId": "chips3-sram", "section": "memory", "title": "Scaling on-die SRAM for LLM decode (arXiv:2610.04417)", "url": "https://arxiv.org/abs/2610.04417", "sourceLabel": "arXiv", "sourceKind": "preprint", "sourceDate": "2026-10-13T00:00:00.000Z",
          "plain": "",
          "finding": "A KAIST preprint reports that tripling on-die SRAM cut decode energy per token by 41% in simulation on a 70B-parameter model at batch size 8.",
          "boundary": "Simulated, not measured on silicon, and only at small batch sizes.", "confidence": "low",
          "figures": [{"value": "41%", "label": "less decode energy per token"}],
          "filedBy": "Claude Code", "filedByRuntime": "claude-code", "filedAt": "2026-10-13T16:20:00.000Z", "readings": [], "savedArticleId": null, "readerStatus": "new"},
         {"itemId": "chips3-glass", "section": "packaging", "title": "Intel ships first glass-core substrate test vehicles", "url": "https://www.tomshardware.com/tech-industry/intel-glass-core-substrate-test-vehicles", "sourceLabel": "Tom’s Hardware", "sourceKind": "news", "sourceDate": "2026-10-12T00:00:00.000Z",
          "plain": "Glass substrates are a 2028 story, not a 2027 one.",
          "finding": "Intel has sent glass-core substrate test vehicles to two customers but repeated that volume production is planned for 2028 or later.",
          "boundary": "Test vehicles say nothing about yields at volume.", "confidence": "moderate",
          "filedBy": "Claude Code", "filedByRuntime": "claude-code", "filedAt": "2026-10-12T11:00:00.000Z", "readings": [], "savedArticleId": "kept-chips3-glass", "readerStatus": "opened"}
       ]},
      {"_id": "ed-chips-2", "profile": "ai-chips", "profileLabel": "AI chips weekly", "issueLabel": "Issue", "title": "AI chips weekly", "number": 2,
       "windowStart": "2026-10-05T00:00:00.000Z", "windowEnd": "2026-10-11T23:59:59.000Z", "createdAt": "2026-10-05T06:00:00.000Z", "updatedAt": "2026-10-11T20:00:00.000Z",
       "sections": [{"key": "memory", "label": "Memory"}, {"key": "packaging", "label": "Packaging"}, {"key": "policy", "label": "Export policy"}],
       "headline": "Bandwidth per dollar becomes the spec that sells",
       "standfirst": "Vendors stopped leading with FLOPS this week. Micron raised its HBM target and a long trade piece made the case that inference waits on memory.",
       "throughLine": "Every claim this week ran through memory bandwidth. That is either the story of 2027 or a crowded trade.",
       "watchNext": ["Whether SK hynix confirms HBM4 12-high volume shipments", "Micron’s HBM share guidance at its fiscal Q1 call"],
       "followUps": [{"watch": "Whether Nvidia’s next part moves to HBM4 at launch", "status": "happened", "note": "Confirmed at its October 7 event."}],
       "silences": [{"key": "policy", "label": "Export policy", "state": "unreported", "by": []}],
       "items": [
         {"itemId": "chips2-micron", "section": "memory", "title": "Micron targets HBM share in line with DRAM share by 2027", "url": "https://investors.micron.com/news-releases/hbm-share-2027", "sourceLabel": "Micron", "sourceKind": "company", "sourceDate": "2026-10-08T00:00:00.000Z",
          "plain": "Micron wants a quarter of the HBM market.", "finding": "Micron said it expects its HBM share to reach roughly its DRAM share, about 23 to 25 percent, during calendar 2027.", "boundary": "A target, not guidance with numbers behind it.", "confidence": "moderate",
          "figures": [{"value": "23–25%", "label": "HBM share target, 2027"}],
          "filedBy": "Claude Code", "filedByRuntime": "claude-code", "filedAt": "2026-10-08T22:00:00.000Z", "savedArticleId": null, "readerStatus": "opened"},
         {"itemId": "chips2-wall", "section": "memory", "title": "The memory wall is the real bottleneck for inference", "url": "https://semiengineering.com/the-memory-wall-is-the-real-bottleneck-for-inference/", "sourceLabel": "Semiconductor Engineering", "sourceKind": "news", "sourceDate": "2026-10-09T00:00:00.000Z",
          "plain": "Inference chips spend most of their time waiting on memory.", "finding": "Engineers put accelerator utilization during decode below 30 percent on current parts, against above 60 percent for training on the same chips.",
          "boundary": "Interview estimates, not benchmark data.", "passage": "At batch sizes typical of interactive serving, the arithmetic units spend most of their time waiting.", "passageCheck": "found", "confidence": "moderate",
          "figures": [{"value": "<30%", "label": "utilization during decode"}],
          "filedBy": "Claude Code", "filedByRuntime": "claude-code", "filedAt": "2026-10-09T15:30:00.000Z", "savedArticleId": "art-memory-wall", "readerStatus": "opened"}
       ]},
      {"_id": "ed-chips-1", "profile": "ai-chips", "profileLabel": "AI chips weekly", "issueLabel": "Issue", "title": "AI chips weekly", "number": 1,
       "windowStart": "2026-09-28T00:00:00.000Z", "windowEnd": "2026-10-04T23:59:59.000Z", "createdAt": "2026-09-28T06:00:00.000Z", "updatedAt": "2026-10-04T19:00:00.000Z",
       "sections": [{"key": "memory", "label": "Memory"}, {"key": "packaging", "label": "Packaging"}, {"key": "policy", "label": "Export policy"}],
       "headline": "The HBM4 transition starts early",
       "standfirst": "Samples are in customers’ hands a quarter ahead of plan.",
       "watchNext": ["Whether Nvidia’s next part moves to HBM4 at launch"], "followUps": [], "silences": [],
       "items": [
         {"itemId": "chips1-samples", "section": "memory", "title": "Samsung ships HBM4 samples to two customers", "url": "https://news.samsung.com/global/hbm4-samples", "sourceLabel": "Samsung Newsroom", "sourceKind": "company", "sourceDate": "2026-09-30T00:00:00.000Z",
          "plain": "", "finding": "Samsung said it has shipped twelve-high HBM4 samples to two customers, a quarter earlier than its plan in July.", "boundary": "Samples, not qualified parts.", "confidence": "moderate",
          "filedBy": "Claude Code", "filedByRuntime": "claude-code", "filedAt": "2026-09-30T12:00:00.000Z", "savedArticleId": null, "readerStatus": "opened"},
         {"itemId": "chips1-export", "section": "policy", "title": "Commerce proposes HBM export licensing for China", "url": "https://www.federalregister.gov/documents/2026/10/02/hbm-export-licensing", "sourceLabel": "Federal Register", "sourceKind": "", "sourceDate": "2026-10-02T00:00:00.000Z",
          "plain": "HBM may need a license to ship to China.", "finding": "A proposed rule would require licenses for exports of HBM above a bandwidth density threshold to China, with comments due November 3.", "boundary": "Proposed, not final; the threshold may move.", "confidence": "high",
          "filedBy": "Claude Code", "filedByRuntime": "claude-code", "filedAt": "2026-10-02T17:00:00.000Z", "savedArticleId": null, "readerStatus": "opened"}
       ]},
      {"_id": "ed-long-2", "profile": "longevity", "profileLabel": "Longevity science", "issueLabel": "Issue", "title": "Longevity science", "number": 2,
       "windowStart": "2026-10-12T00:00:00.000Z", "windowEnd": "2026-10-18T23:59:59.000Z", "createdAt": "2026-10-12T06:00:00.000Z", "updatedAt": "2026-10-15T14:00:00.000Z",
       "sections": [{"key": "trials", "label": "Trials"}, {"key": "mechanisms", "label": "Mechanisms"}, {"key": "clocks", "label": "Clocks"}],
       "headline": "A primate rapamycin readout, and a clock that holds still",
       "standfirst": "The first randomized rapamycin data in marmosets is safe and unremarkable. A pace-of-aging clock posts the best reliability numbers yet.",
       "throughLine": "Safety is arriving faster than efficacy. The tools to measure efficacy are getting steadier, but nobody has shown they measure the right thing.",
       "watchNext": ["ITP results for the 2023 cohort compounds", "Whether the FDA comments on clock endpoints in the TAME protocol"],
       "followUps": [{"watch": "Final enrollment numbers for the TAME trial", "status": "not_yet", "note": "No update this week."}],
       "silences": [], "writtenBy": "Codex", "writtenByRuntime": "codex",
       "items": [
         {"itemId": "long2-marmoset", "section": "trials", "title": "Rapamycin in middle-aged marmosets: a two-year readout", "url": "https://www.nature.com/articles/s43587-026-00912-4", "sourceLabel": "Nature Aging", "sourceKind": "peer_reviewed", "sourceDate": "2026-10-08T00:00:00.000Z",
          "plain": "Rapamycin looks safe in a primate. Whether it extends life is still open.",
          "finding": "At 24 months, rapamycin-treated marmosets showed no significant difference in mortality (hazard ratio 0.82, 95% CI 0.41–1.63) but had lower fasting insulin and preserved lean mass.",
          "boundary": "An interim readout of 48 animals; the study is not powered for lifespan until 2029.",
          "passage": "they do not yet show it extends life", "passageCheck": "found", "confidence": "moderate",
          "figures": [{"value": "0.82", "label": "mortality hazard ratio, not significant"}, {"value": "48", "label": "marmosets randomized"}],
          "filedBy": "Codex", "filedByRuntime": "codex", "filedAt": "2026-10-14T10:15:00.000Z", "savedArticleId": null, "readerStatus": "new"},
         {"itemId": "long2-clock", "section": "clocks", "title": "DunedinPACE test-retest reliability across three cohorts", "url": "https://www.biorxiv.org/content/10.1101/2026.10.09.617702", "sourceLabel": "bioRxiv", "sourceKind": "preprint", "sourceDate": "2026-10-09T00:00:00.000Z",
          "plain": "",
          "finding": "Across three cohorts, DunedinPACE showed a test-retest intraclass correlation of 0.94, well above first-generation clocks at 0.71 to 0.83.",
          "boundary": "Reliability is not validity: a steady clock can still miss what an intervention changes.", "confidence": "moderate",
          "figures": [{"value": "0.94", "label": "test-retest ICC"}],
          "filedBy": "Codex", "filedByRuntime": "codex", "filedAt": "2026-10-13T08:40:00.000Z", "savedArticleId": null, "readerStatus": "new"},
         {"itemId": "long2-senolytic", "section": "mechanisms", "title": "Dasatinib plus quercetin and senescent cell burden in older adults", "url": "https://www.thelancet.com/journals/lanhl/article/PIIS2666-7568(26)00211-4", "sourceLabel": "The Lancet Healthy Longevity", "sourceKind": "peer_reviewed", "sourceDate": "2026-10-10T00:00:00.000Z",
          "plain": "The best-known senolytic pair did not clear senescent cells.",
          "finding": "In a 120-person randomized trial, intermittent dasatinib plus quercetin did not reduce p16-positive cell burden in adipose tissue at six months compared with placebo.",
          "boundary": "One tissue and one dosing schedule.", "confidence": "high",
          "filedBy": "Codex", "filedByRuntime": "codex", "filedAt": "2026-10-12T19:00:00.000Z", "savedArticleId": null, "readerStatus": "opened"}
       ]},
      {"_id": "ed-long-1", "profile": "longevity", "profileLabel": "Longevity science", "issueLabel": "Issue", "title": "Longevity science", "number": 1,
       "windowStart": "2026-10-05T00:00:00.000Z", "windowEnd": "2026-10-11T23:59:59.000Z", "createdAt": "2026-10-05T06:00:00.000Z", "updatedAt": "2026-10-10T12:00:00.000Z",
       "sections": [{"key": "trials", "label": "Trials"}, {"key": "mechanisms", "label": "Mechanisms"}, {"key": "clocks", "label": "Clocks"}],
       "headline": "Metformin’s big trial is still enrolling",
       "standfirst": "TAME is behind schedule, and a STAT piece makes the case against clocks as endpoints.",
       "watchNext": ["Final enrollment numbers for the TAME trial"], "followUps": [], "silences": [{"key": "mechanisms", "label": "Mechanisms", "state": "checked", "by": [{"label": "Codex", "runtime": "codex"}]}],
       "items": [
         {"itemId": "long1-tame", "section": "trials", "title": "TAME trial enrollment update", "url": "https://www.afar.org/tame-trial", "sourceLabel": "AFAR", "sourceKind": "company", "sourceDate": "2026-10-06T00:00:00.000Z",
          "plain": "", "finding": "The TAME metformin trial has enrolled about 1,900 of a planned 3,000 participants, with completion now expected in 2028.", "boundary": "The organizers’ figures, not an independent count.", "confidence": "moderate",
          "filedBy": "Codex", "filedByRuntime": "codex", "filedAt": "2026-10-06T14:00:00.000Z", "savedArticleId": null, "readerStatus": "opened"},
         {"itemId": "long1-clocks", "section": "clocks", "title": "The case against epigenetic clocks as trial endpoints", "url": "https://www.statnews.com/2026/10/03/epigenetic-clocks-trial-endpoints/", "sourceLabel": "STAT", "sourceKind": "news", "sourceDate": "2026-10-03T00:00:00.000Z",
          "plain": "Most reported age reversals sit inside the noise.", "finding": "Test-retest noise on several widely used clocks is two to three years, larger than many reported reversals.", "boundary": "Opinion grounded in published reliability studies.", "confidence": "high",
          "filedBy": "Codex", "filedByRuntime": "codex", "filedAt": "2026-10-07T09:00:00.000Z", "savedArticleId": "art-clocks", "readerStatus": "opened"}
       ]},
      {"_id": "ed-house-1", "profile": "housing", "profileLabel": "Housing policy", "issueLabel": "Issue", "title": "Housing policy", "number": 1,
       "windowStart": "2026-10-12T00:00:00.000Z", "windowEnd": "2026-10-18T23:59:59.000Z", "createdAt": "2026-10-12T06:00:00.000Z", "updatedAt": "2026-10-14T13:00:00.000Z",
       "sections": [{"key": "zoning", "label": "Zoning"}, {"key": "rents", "label": "Rents"}, {"key": "finance", "label": "Housing finance"}],
       "headline": "Minneapolis gets its five-year review",
       "standfirst": "The most famous rezoning in America built very little, and rents slowed anyway. California’s transit upzoning gets its first applications.",
       "throughLine": "Where rents fell, it was buildings, not rules, that did it. The rule matters only as far as it lets the building happen.",
       "watchNext": ["SB 79 approvals, not just applications, by January", "Whether Minneapolis publishes completion counts by lot type"],
       "followUps": [],
       "silences": [{"key": "finance", "label": "Housing finance", "state": "unreported", "by": []}],
       "writtenBy": "Hermes", "writtenByRuntime": "hermes",
       "items": [
         {"itemId": "house1-mpls", "section": "zoning", "title": "Minneapolis 2040, five years on", "url": "https://www.bloomberg.com/news/features/2026-10-12/minneapolis-2040-five-years-on", "sourceLabel": "Bloomberg CityLab", "sourceKind": "news", "sourceDate": "2026-10-12T00:00:00.000Z",
          "plain": "Minneapolis’s famous rezoning built little; its rents slowed for other reasons.",
          "finding": "Fewer than 200 duplexes and triplexes have been permitted on formerly single-family lots since 2019; most new supply came from large apartment buildings on transit corridors.",
          "boundary": "Permits, not completions, and the piece does not separate parking reform from faster permitting.",
          "passage": "Fewer than 200 duplexes and triplexes have been permitted on formerly single-family lots.", "passageCheck": "found", "confidence": "high",
          "figures": [{"value": "<200", "label": "duplexes and triplexes permitted"}],
          "filedBy": "Hermes", "filedByRuntime": "hermes", "filedAt": "2026-10-13T07:30:00.000Z", "savedArticleId": "art-minneapolis", "readerStatus": "opened"},
         {"itemId": "house1-rents", "section": "rents", "title": "National Rent Report, October 2026", "url": "https://www.apartmentlist.com/research/national-rent-data", "sourceLabel": "Apartment List", "sourceKind": "company", "sourceDate": "2026-10-01T00:00:00.000Z",
          "plain": "",
          "finding": "Median asking rents fell 0.6% from a year earlier, the fifteenth straight month of declines, led by Austin (−6.8%) and Phoenix (−4.1%).",
          "boundary": "Asking rents on new leases, not what sitting tenants pay.", "confidence": "high",
          "figures": [{"value": "−0.6%", "label": "national asking rents, year on year"}, {"value": "15", "label": "months of decline in a row"}],
          "filedBy": "Hermes", "filedByRuntime": "hermes", "filedAt": "2026-10-12T15:00:00.000Z", "savedArticleId": null, "readerStatus": "opened"},
         {"itemId": "house1-sb79", "section": "zoning", "title": "SB 79 in its first 90 days", "url": "https://ternercenter.berkeley.edu/research-and-policy/sb-79-first-90-days/", "sourceLabel": "Terner Center", "sourceKind": "", "sourceDate": "2026-10-14T00:00:00.000Z",
          "plain": "California’s transit upzoning is drawing applications.",
          "finding": "In the first 90 days under SB 79, 14 cities received applications totaling 2,310 homes within half a mile of rail stops.",
          "boundary": "Applications, not approvals or starts.", "confidence": "moderate",
          "figures": [{"value": "2,310", "label": "homes applied for near rail"}],
          "filedBy": "Hermes", "filedByRuntime": "hermes", "filedAt": "2026-10-14T12:45:00.000Z", "savedArticleId": null, "readerStatus": "opened"}
       ]}
    ]
    """#
}
#endif
