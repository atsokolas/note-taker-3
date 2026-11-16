# Working Studio

Implements Athan’s selected three-screen direction for Work: weekly priorities, project notebook, and contextual note/follow-up editing. No wiki or other product surfaces were redesigned.

## Changes

- Compact priority creation, aligned task provenance, quiet progress derived from canonical tasks. Today remains above Next; independently collapsible priorities/rails remain expanded by default.
- Project log and context rail retain check-ins, scheduling, decisions and kept references. State changes still preserve the closing-line workflow.
- Removed the hill visualization and its component/styles, not historical project data.
- Follow-ups open in a right-edge inspector; mobile uses a full-height sheet. All appointment and task fields remain available, with Escape/Cancel, focus return and save semantics preserved.
- Note header and sidebar actions move notes into recoverable Trash. No hard-delete endpoint exists. Trash retains original content, revisions, folder/project placement and linked tasks; restore and receipt Undo use the same save path. Offline edits and version conflicts use existing durable drafts and both-version recovery.
- Small delight: a priority quietly acknowledges when every linked task is actually saved-complete. Empty, missing or pending tasks cannot trigger it. Completion does not silently close the priority. Reduced motion is respected.
- Tokyo Night’s Work-local colors use the approved warm ink palette; other themes keep their own tokens. Global navigation is unchanged.

New `WorkTrash` replaces an unwieldy inline recovery view. Scoped project CSS replaces the retired hill/state presentation. No new package dependency or data migration.

## Verification

- Work UI suites: 254 tests across 25 files passed; focused follow-up run after receipt wording change: 36 tests passed.
- Work note route and session tests include reversible deletion, reload, linked-task retention, offline/undo, ownership and revision conflicts.
- Production UI build passed.
- Expanded existing `scripts/smoke_work_priority_feedback.cjs`: desktop 1440, sidebar/tablet 1280, phone 430; light and Tokyo Night; real drag and canonical task assignment; inline creation and reload; collapsible rails; past-week navigation; project rendering; inspector focus, cancel/Escape, repeated save, Back/Forward; Trash/restore/reload; reduced-motion flow; no page errors or horizontal overflow.
- Screenshots inspected for all three surfaces; fixtures are synthetic and do not modify user data.
- Independent review found navigation, stale-response selection, initial focus and trashed-link provenance issues. Fixed with regression coverage.

A full server run is recorded separately in the PR because it exercises unrelated integrations too. This is a draft PR, not a production deployment.
