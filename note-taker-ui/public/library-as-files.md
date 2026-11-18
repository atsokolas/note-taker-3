# A library as files

A person's reading and writing, as a folder of Markdown that any agent can open,
search and edit with the tools it already has. This is the layout `noeis sync`
keeps. Another tool may write it too: the format is the folder, not Noeis.

```
Think/      the person's own notes, one file each
Library/    what they saved, and what they marked in it
Wiki/       pages written from their reading
AGENTS.md   what the folder is, for the agent that finds it
.noeis/     the sync's own state (leave it alone)
```

## Files

- A file's name is its title, made safe for a filename and cut to 60 characters,
  then a hyphen and the last six characters of its id: `Hiring-a1b2c3.md`. The
  name stays put while the title does, and two files never collide.
- Every file begins with `# Title`.

### Think

A note's text as Markdown: paragraphs, headings, lists, code, dividers. Things it
quotes or points to keep their place as lines Noeis reads back as themselves:

```
> The passage, as marked.
>
> — [Source title](/library?articleId=<id>&highlightId=<id>)

[An article](/articles/<id>)
Concept: [Name](/think?tab=concepts&conceptId=<id>)
Question: [The question?](/think?tab=questions&questionId=<id>)
[A wiki page](/wiki/workspace?page=<id>)
```

Edit a note in place and it goes back. A new file in `Think/` becomes a new note.

### Library

```
# Title

Source: https://… · By Author

## What you marked

> A passage they marked.

Your note: what they wrote beside it.

The source's text, passage by passage.
```

A new file in `Library/` is saved to the Library. The files already there are
kept by Noeis: an edit to one is put back.

### Wiki

Each page as Noeis renders it, read-only.

## Pencil

What an agent wrote and the person has not yet taken up is in pencil. Its file
starts with front matter naming the agent:

```
---
pencil: Claude Code, not yet taken up
---
```

A margin note an agent left reads `Claude Code's note:` rather than `Your note:`.
Never present pencil as the person's own view. Everything an agent writes into
the folder lands in pencil, marked with the connection that wrote it, until the
person inks it in Noeis.

## Syncing

- Run `noeis sync ~/Noeis` before you read and after you write, or leave
  `noeis sync ~/Noeis --watch` running.
- **A note changed in both places:** Noeis keeps its version, and the folder's
  version becomes a new note beside it. Nothing is lost.
- **A file deleted in the folder** comes back on the next sync. Deleting is done
  in Noeis.
- **A folder belongs to the account it first synced with.** Signed in as someone
  else, it refuses to sync.
