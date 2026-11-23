# Think and Books home regression checks

Build the web UI in CI mode. Use a signed-in fixture with a working draft, an open question, an answered question, a recent closure, and a source explicitly kept in Library. In Books, include a title-only book, a marked book, a book set down, and a finished book. Check Chromium at 1440px and 430px and WebKit at 1320px. At phone width check touch and 125% text size. Repeat with reduced motion.

## Think

- Open `/think`. The most recent working draft with a saved “Next time” line leads. Without a saved line, the latest working draft leads. Verify the empty state after loading a shelf with no working drafts.
- Choose **Write the next sentence** and verify that focus and the caret land at the saved block and character offset. A missing block falls back to the end of the draft. The source return and separate Partner controls still work.
- Follow an Evergreen row to the owned source, and **Browse keepers** to Library's Keepers shelf. Archived, hidden and uninked sources are excluded by the existing kept collection. With no returned sources the shelf stays quiet.
- Verify that the overview includes the open question and recent closure. Start a named idea and confirm that the new record opens through the notebook route.

## Books

- Open `/books` and filter by Reading, Set down and Finished. A book with just a title opens directly and shows no invented page, author, artwork or preview quote.
- Select a preview and check that its heading receives focus. Open at the previewed mark and verify the highlight ID and page. The catalogue's last marked page and the previewed note's page may differ.
- Return using both browser Back and the book's Books link. Verify the previous filter, row focus, position and bookmark. If the book disappeared, focus returns to the catalogue heading.
- Reconfirm the anniversary sentence, echoes, open questions and book renaming on the existing routes.
