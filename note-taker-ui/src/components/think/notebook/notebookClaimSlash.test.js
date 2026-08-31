import { createNotebookClaimSlashItems, sentenceFromSlashBlock } from './notebookClaimSlash';
import { createWikiPage, getWikiPage, updateWikiPage } from '../../../api/wiki';
import { handOffSentence } from '../../../motion/columnMotion';
import { createJudgment, writeLineIntoJudgment } from '../../../pages/judgmentModel';

jest.mock('../../../api/wiki', () => ({
  createWikiPage: jest.fn(),
  getWikiPage: jest.fn(),
  updateWikiPage: jest.fn()
}));

jest.mock('../../../motion/columnMotion', () => ({
  handOffSentence: jest.fn()
}));

jest.mock('../../../pages/judgmentModel', () => ({
  createJudgment: jest.fn(),
  writeLineIntoJudgment: jest.fn(),
  judgmentIdOf: (held) => (typeof held === 'string' || typeof held === 'number' ? String(held) : String(held?.id || ''))
}));

const editorWith = (text) => ({
  state: {
    selection: {
      $from: { parent: { textContent: text } }
    }
  },
  view: { dom: {} }
});

describe('sentenceFromSlashBlock', () => {
  it('keeps the sentence and drops the slash token', () => {
    expect(sentenceFromSlashBlock(editorWith('People compound. /hold'))).toBe('People compound.');
    expect(sentenceFromSlashBlock(editorWith('The sample is small. /why'))).toBe('The sample is small.');
  });

  it('is empty when the line is only the command', () => {
    expect(sentenceFromSlashBlock(editorWith('/hold'))).toBe('');
  });
});

describe('createNotebookClaimSlashItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('/hold creates a judgment and opens it', async () => {
    createJudgment.mockResolvedValue('wiki-new');
    const navigate = jest.fn();
    const hold = createNotebookClaimSlashItems({ navigate }).find(item => item.id === 'holdClaim');

    await hold.onSelect({ editor: editorWith('People compound. /hold') });

    expect(createJudgment).toHaveBeenCalledWith('People compound.', {
      createPage: createWikiPage,
      updatePage: updateWikiPage
    });
    expect(handOffSentence).toHaveBeenCalledWith('People compound.', {});
    expect(navigate).toHaveBeenCalledWith('/judgment/wiki-new');
  });

  it('/why files onto the linked claim when there is one', async () => {
    const page = { judgment: { why: [] } };
    getWikiPage.mockResolvedValue(page);
    writeLineIntoJudgment.mockReturnValue({ why: [{ text: 'The sample is small.' }] });
    const navigate = jest.fn();
    const why = createNotebookClaimSlashItems({ claimId: 'wiki-nvidia', navigate })
      .find(item => item.id === 'whyLine');

    await why.onSelect({ editor: editorWith('The sample is small. /why') });

    expect(writeLineIntoJudgment).toHaveBeenCalledWith(page, 'The sample is small.', 'why');
    expect(updateWikiPage).toHaveBeenCalledWith('wiki-nvidia', {
      judgment: { why: [{ text: 'The sample is small.' }] }
    });
    expect(createJudgment).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/judgment/wiki-nvidia');
  });

  it('/why without a claim is the same as /hold', async () => {
    createJudgment.mockResolvedValue('wiki-new');
    const navigate = jest.fn();
    const why = createNotebookClaimSlashItems({ navigate }).find(item => item.id === 'whyLine');

    await why.onSelect({ editor: editorWith('People compound. /why') });

    expect(createJudgment).toHaveBeenCalledWith('People compound.', {
      createPage: createWikiPage,
      updatePage: updateWikiPage
    });
    expect(navigate).toHaveBeenCalledWith('/judgment/wiki-new');
  });
});
