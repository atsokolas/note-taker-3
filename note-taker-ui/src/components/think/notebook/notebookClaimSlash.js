import { createWikiPage, getWikiPage, updateWikiPage } from '../../../api/wiki';
import { handOffSentence } from '../../../motion/columnMotion';
import { createJudgment, judgmentIdOf, writeLineIntoJudgment } from '../../../pages/judgmentModel';

/* The sentence on this line, minus the /hold or /why token. */
export const sentenceFromSlashBlock = (editor) => String(
  editor?.state?.selection?.$from?.parent?.textContent || ''
).replace(/\/(hold|why)\S*$/i, '').replace(/\s+/g, ' ').trim();

const openClaim = (sentence, editor, path, navigate) => {
  if (editor?.view?.dom) handOffSentence(sentence, editor.view.dom);
  navigate(path);
};

export const createNotebookClaimSlashItems = ({ claimId = '', navigate, onError } = {}) => [
  {
    id: 'holdClaim',
    label: 'Hold this',
    description: 'Hold the sentence on this line as a claim.',
    keywords: ['hold', 'claim', 'judgment', 'true'],
    prioritizeForQuery: ['hold'],
    onSelect: async ({ editor }) => {
      const sentence = sentenceFromSlashBlock(editor);
      if (!sentence || !navigate) return;
      try {
        const held = await createJudgment(sentence, {
          createPage: createWikiPage,
          updatePage: updateWikiPage
        });
        openClaim(sentence, editor, `/judgment/${judgmentIdOf(held)}`, navigate);
      } catch (error) {
        onError?.(error);
      }
    }
  },
  {
    id: 'whyLine',
    label: 'This is a Why',
    description: claimId
      ? 'File this sentence as a Why on the linked claim.'
      : 'Start a claim from this sentence.',
    keywords: ['why', 'reason', 'because'],
    prioritizeForQuery: ['why'],
    onSelect: async ({ editor }) => {
      const sentence = sentenceFromSlashBlock(editor);
      if (!sentence || !navigate) return;
      try {
        if (claimId) {
          const page = await getWikiPage(claimId);
          await updateWikiPage(claimId, {
            judgment: writeLineIntoJudgment(page, sentence, 'why')
          });
          openClaim(sentence, editor, `/judgment/${claimId}`, navigate);
          return;
        }
        const held = await createJudgment(sentence, {
          createPage: createWikiPage,
          updatePage: updateWikiPage
        });
        openClaim(sentence, editor, `/judgment/${judgmentIdOf(held)}`, navigate);
      } catch (error) {
        onError?.(error);
      }
    }
  }
];
