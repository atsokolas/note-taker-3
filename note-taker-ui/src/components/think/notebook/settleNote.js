import { settleNotebookEntry } from '../../../api/notebook';
import { wikiReadPath } from '../../../utils/wikiFeatureFlags';

const passages = (count) => (
  count === 0 ? 'No quoted passages to cite.'
    : `${count === 1 ? 'Its quoted passage is' : `Its ${count} quoted passages are`} cited and open where they came from.`
);

/* Settle a note into Wiki and say exactly what happened: which page, whether it
   is new or a new revision, and what its quotes became. A refusal comes back as
   the one line the note shows, with what to fix. */
export const settleNote = async (noteId, systemStatus) => {
  try {
    const { page, resettled } = await settleNotebookEntry(noteId);
    const settledIn = { _id: String(page._id), title: page.title };
    systemStatus.setLatestReceipt({
      id: `settle-${settledIn._id}-${Date.now()}`,
      title: `“${page.title}” ${resettled ? 'revised' : 'settled'} in Wiki`,
      summary: resettled
        ? `A new revision; the earlier words stay in the page history. ${passages(page.sourceRefs?.length || 0)}`
        : passages(page.sourceRefs?.length || 0),
      status: 'completed',
      href: wikiReadPath(settledIn._id)
    });
    return { settledIn, resettled };
  } catch (error) {
    return { refusal: error?.response?.data?.error || 'The note did not settle. Try again.' };
  }
};
