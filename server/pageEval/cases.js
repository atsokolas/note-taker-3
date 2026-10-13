/* The pages Noeis has to be able to make. A dossier on a company the owner
   knows well shows the writer at its best; a first page from three links a
   stranger brings is the hard case; the published NVIDIA page is the bar the
   hand-built showcase set, scored the same way. */

const CASES = [
  {
    id: 'nvidia',
    kind: 'company',
    ticker: 'NVDA',
    judgment: 'NVIDIA can keep earning outsized returns on AI systems while its supply commitments grow faster than its customers.',
    requiredReturn: 0.1,
    horizonYears: 5
  },
  {
    id: 'costco',
    kind: 'company',
    ticker: 'COST',
    judgment: 'Costco can keep compounding membership income while its multiple stays well above the market.',
    requiredReturn: 0.1,
    horizonYears: 5
  },
  {
    id: 'first-page',
    kind: 'links',
    title: 'Loss aversion',
    urls: [
      'https://en.wikipedia.org/wiki/Loss_aversion',
      'https://www.nobelprize.org/prizes/economic-sciences/2002/popular-information/',
      'https://www.nobelprize.org/prizes/economic-sciences/2017/popular-information/'
    ]
  },
  {
    id: 'nvidia-published',
    kind: 'published',
    ticker: 'NVDA',
    url: 'https://note-taker-3-unrg.onrender.com/api/public/wiki/pages/6a5d225cd00276de99a7d168'
  }
];

module.exports = { CASES };
