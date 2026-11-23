# Library Source Catalogue regression checks

Run the web build and check `/library` with signed-in fixture sources at 1440px Chromium, 1320px WebKit, and 430px Chromium with touch and 125% text. Use an article with a known marked paragraph and personal note, an unmarked article, a Nightstand source, and a Keeper.

- Search is visible before the shelves and results. Changing a phrase or shelf clears the previous results and preview during the request. A zero-result search leaves the preview empty.
- The first source in the current result order supplies the preview. Moving the pointer across rows leaves the preview in place. Selecting a different row's Peek opens one panel and moves focus there. Close and Escape return focus to its row.
- Search for the personal note. The preview shows the source passage and the note. **Read from here** opens the matching highlight. Browser Back restores the query, scroll position, and focus to the result.
- The title still opens the reader directly. Peeking leaves the current reading position as it was.
- Open **Save a link**, save a source to Nightstand, and confirm the acknowledgement and the new row. Escape returns focus to **Save a link**. Verify that sorting, filing, and the existing Passages and Keepers shelves still work.
- The Reading room opens on request. The initial catalogue keeps the reading-room request idle.

Use `src/components/library/LibraryCollection.test.jsx` for stale results, preview selection, trace enrichment, sort, and shelf behavior. Cover the direct reader and Partner route with `src/pages/Library.agent.test.jsx`.
