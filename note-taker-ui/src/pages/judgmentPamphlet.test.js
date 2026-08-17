import { projectJudgment } from './judgmentModel';

const { projectPamphlet, renderPamphlet } = require('../../../server/services/judgmentPamphlet');

/* The pamphlet prints the same four sections the page shows, so there are two
   projections of one contract — the page's, in the browser, and the print
   one, on the server. They can drift. This runs both over the same pages and
   compares them, so changing one without the other fails here rather than in
   somebody's hands. */
const textOf = (lines = []) => lines.map(line => line.text);

const FIXTURES = {
  'a judgment written by hand': {
    _id: 'p1',
    title: 'A written process improves judgment.',
    judgment: {
      currentJudgment: 'A written process improves judgment.',
      why: [{ reasonId: 'r1', text: 'It held last quarter.', sourceLabel: 'Decision ledger' }],
      against: [{ reasonId: 'a1', text: 'The sample is small.' }],
      falsifiers: [{ falsifierId: 'f1', text: 'Two quarters of falling margin.' }],
      decisions: [{ decisionId: 'd1', summary: 'Sold half.', decidedAt: '2026-06-02T00:00:00.000Z' }]
    }
  },
  'a judgment in the older dossier shape': {
    _id: 'p2',
    title: 'Buybacks beat dividends here.',
    judgment: {
      currentJudgment: '',
      assumptions: [{ assumptionId: 'a1', text: 'Free cash flow holds.', status: 'unreviewed' }],
      strongestCounterargument: 'Management has bought high before.',
      why: [], against: [], falsifiers: [], decisions: []
    }
  },
  'a judgment whose sources are attached by id': {
    _id: 'p3',
    title: 'Positioning beats operations.',
    sourceRefs: [{ _id: 's1', title: 'What Is Strategy?' }],
    judgment: {
      currentJudgment: 'Positioning beats operations.',
      why: [{ reasonId: 'r1', text: 'Refusal cannot be benchmarked.', sourceRefIds: ['s1'] }],
      against: [], falsifiers: [], decisions: []
    }
  },
  'a judgment with a retired falsifier and nothing else': {
    _id: 'p4',
    title: 'Only a claim.',
    judgment: {
      currentJudgment: 'Only a claim.',
      why: [], against: [],
      falsifiers: [{ falsifierId: 'f1', text: 'Retired.', status: 'retired' }],
      decisions: []
    }
  }
};

describe('the pamphlet prints what the page shows', () => {
  Object.entries(FIXTURES).forEach(([name, page]) => {
    it(`agrees with the Judgment page for ${name}`, () => {
      const onScreen = projectJudgment(page);
      const inPrint = projectPamphlet(page);

      expect(inPrint.claim).toBe(onScreen.claim);
      expect(textOf(inPrint.why)).toEqual(textOf(onScreen.why));
      expect(textOf(inPrint.against)).toEqual(textOf(onScreen.against));
      expect(textOf(inPrint.changeMindIf)).toEqual(textOf(onScreen.changeMindIf));
      expect(textOf(inPrint.whatIDid)).toEqual(textOf(onScreen.whatIDid));
      expect(inPrint.whySources).toEqual(onScreen.whySources.map(source => source.label));
      expect(inPrint.againstSources).toEqual(onScreen.againstSources.map(source => source.label));
    });
  });
});

/* What actually lands on the sheet, without a PDF in the way. */
const printed = (page, printedAt = new Date('2026-08-17T00:00:00Z')) => {
  const written = [];
  const stub = {
    page: { width: 612, height: 792, margins: { top: 72, bottom: 72, left: 72, right: 72 } },
    y: 100,
    font() { return this }, fontSize() { return this }, fillColor() { return this },
    moveDown() { return this }, moveTo() { return this }, lineTo() { return this },
    strokeColor() { return this }, lineWidth() { return this }, stroke() { return this },
    text(value) { written.push(String(value)); return this }
  };
  renderPamphlet(stub, projectPamphlet(page), { printedAt });
  return written;
};

describe('the sheet itself', () => {
  it('leads with the claim and names the four sections it has', () => {
    const lines = printed(FIXTURES['a judgment written by hand']);
    expect(lines[1]).toBe('A written process improves judgment.');
    expect(lines).toEqual(expect.arrayContaining(['WHY', 'AGAINST', "I'D CHANGE MY MIND IF", 'WHAT I DID']));
  });

  it('leaves an empty section off the sheet rather than printing a heading over nothing', () => {
    const lines = printed(FIXTURES['a judgment with a retired falsifier and nothing else']);
    expect(lines).not.toContain('WHY');
    expect(lines).not.toContain("I'D CHANGE MY MIND IF");
    expect(lines).toContain('Only a claim.');
  });

  it('dates a ledger line by the day it records, not the printer’s timezone', () => {
    const lines = printed(FIXTURES['a judgment written by hand']);
    expect(lines).toContain('June 2, 2026 — Sold half.');
  });

  it('names the publication under the reason that rests on it', () => {
    expect(printed(FIXTURES['a judgment whose sources are attached by id'])).toContain('What Is Strategy?');
  });
});
