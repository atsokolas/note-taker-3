#!/usr/bin/env node

const BASE_URL = (process.env.BASE_URL || 'http://localhost:5500').replace(/\/+$/, '');
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const USERNAME = process.env.QA_WIKI_USERNAME || 'qa_wiki_seed';
const PASSWORD = process.env.QA_WIKI_PASSWORD || 'QaWikiSeed1234';

const pages = [
  {
    title: 'Investing - Concepts, Ideas, and Strategies',
    pageType: 'overview',
    scope: 'A source-backed overview of investing as disciplined capital allocation, process design, and behavioral control.',
    summary: 'Investing is a repeatable decision craft built around cash-flow valuation, evidence discipline, and temperament.',
    sources: [
      {
        title: 'Buffett letters on intrinsic value',
        url: 'https://example.com/buffett-intrinsic-value',
        snippet: 'Intrinsic value is the present value of future cash that an owner can extract from a business.'
      },
      {
        title: 'Munger on mental models and inversion',
        url: 'https://example.com/munger-mental-models',
        snippet: 'Inversion, margin of safety, and explicit checklists reduce avoidable investment mistakes.'
      },
      {
        title: 'Peter Lynch on knowing what you own',
        url: 'https://example.com/lynch-know-what-you-own',
        snippet: 'Investors can outperform when they understand the drivers, risks, and valuation assumptions behind each holding.'
      },
      {
        title: 'Mr. Market and behavioral mispricing',
        url: 'https://example.com/mr-market-behavior',
        snippet: 'Market prices swing between optimism and pessimism, creating opportunities for patient investors.'
      }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          { text: 'The core discipline is estimating cash flows, testing assumptions, and buying only when price leaves room for error.', citations: [1, 2], support: 'supported' },
          { text: 'The best practitioners combine simple valuation models with repeatable checklists and a willingness to wait.', citations: [1, 2, 3], support: 'supported' }
        ]
      },
      {
        heading: 'Converging Evidence',
        paragraphs: [
          { text: 'Buffett, Munger, and Lynch converge on the idea that research quality matters more than market activity.', citations: [1, 2, 3], support: 'supported' },
          { text: 'Behavioral patience is not separate from analysis; it is the condition that lets analysis survive volatility.', citations: [2, 4], support: 'partial' }
        ]
      },
      {
        heading: 'Diverging Evidence',
        paragraphs: [
          { text: 'A concentration strategy can compound faster, but it also increases damage when a thesis is wrong or timing is poor.', citations: [3, 4], support: 'conflicted', contradictions: [4] }
        ]
      },
      {
        heading: 'Open Questions',
        paragraphs: [
          { text: 'The unresolved question is how to size concentrated positions without converting conviction into hidden fragility.', citations: [], support: 'unsupported' }
        ]
      }
    ]
  },
  {
    title: 'Cia Teach Investor Behavioural Investment',
    pageType: 'overview',
    scope: 'A focused page on behavioral discipline, investor temperament, and decision hygiene.',
    summary: 'Behavioral investing treats patience, position sizing, and emotional control as first-class parts of investment edge.',
    sources: [
      {
        title: 'Temperament as an investing edge',
        url: 'https://example.com/temperament-edge',
        snippet: 'Investors with explicit process rules are less likely to sell into panic or buy into euphoria.'
      },
      {
        title: 'Decision journals for portfolio managers',
        url: 'https://example.com/decision-journals',
        snippet: 'Decision journals reveal whether outcomes came from process quality or luck.'
      },
      {
        title: 'Cognitive bias checklist for investors',
        url: 'https://example.com/investor-bias-checklist',
        snippet: 'Bias checklists help investors separate thesis evidence from ego defense.'
      }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          { text: 'Behavioral discipline turns market volatility from an emotional threat into a source of possible advantage.', citations: [1], support: 'supported' },
          { text: 'Decision journals and pre-mortems make assumptions visible before price movement rewrites memory.', citations: [2, 3], support: 'supported' }
        ]
      },
      {
        heading: 'Evidence',
        paragraphs: [
          { text: 'The strongest evidence supports process hygiene: writing the reason for a decision improves later error detection.', citations: [2], support: 'supported' },
          { text: 'Checklists cannot remove judgment, but they can force the investor to confront disconfirming evidence.', citations: [3], support: 'partial' }
        ]
      },
      {
        heading: 'Open Questions',
        paragraphs: [
          { text: 'It remains unclear how much process structure is enough before the process becomes mechanical and slow.', citations: [], support: 'unsupported' }
        ]
      }
    ]
  },
  {
    title: 'Complementary Machine Thing',
    pageType: 'topic',
    scope: 'A bridge page connecting human judgment, machine assistance, and source-backed synthesis.',
    summary: 'Machine assistance is useful when it exposes evidence, drafts alternatives, and preserves traceability back to sources.',
    sources: [
      {
        title: 'Human-machine investment workflows',
        url: 'https://example.com/human-machine-investment-workflows',
        snippet: 'Machine-generated summaries are most useful when they retain citations and invite review.'
      },
      {
        title: 'Source-grounded synthesis systems',
        url: 'https://example.com/source-grounded-synthesis',
        snippet: 'Synthesis tools need durable links between claims, evidence, and unresolved questions.'
      }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          { text: 'The machine should accelerate evidence comparison, not replace the user’s final judgment.', citations: [1, 2], support: 'supported' },
          { text: 'A useful wiki agent keeps claims, citations, and open questions visible enough to audit.', citations: [2], support: 'supported' }
        ]
      },
      {
        heading: 'Implications',
        paragraphs: [
          { text: 'The right product shape is a workspace where drafting, review, and source inspection sit close together.', citations: [1, 2], support: 'supported' }
        ]
      }
    ]
  }
];

const request = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = text;
  }
  if (!response.ok) {
    const message = data?.error || data?.details || response.statusText;
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${message}`);
  }
  return data;
};

const login = async () => request('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USERNAME, password: PASSWORD })
});

const ensureLogin = async () => {
  try {
    return await login();
  } catch (error) {
    if (!String(error.message || '').includes('401')) throw error;
    await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD })
    });
    return login();
  }
};

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
});

const clean = (value) => String(value || '').trim();

const textNode = (text, marks = []) => ({
  type: 'text',
  text,
  ...(marks.length ? { marks } : {})
});

const paragraph = (text, { claimId, citations = [], contradictions = [], support = 'supported', section = '' } = {}) => ({
  type: 'paragraph',
  content: [
    textNode(text, claimId ? [{
      type: 'claim',
      attrs: {
        claimId,
        support,
        citationIndexes: citations,
        contradictionIndexes: contradictions,
        section
      }
    }] : [])
  ]
});

const heading = (text, level = 2) => ({
  type: 'heading',
  attrs: { level },
  content: [textNode(text)]
});

const wikiLinkParagraph = (leadingText, links = []) => {
  const content = [textNode(leadingText)];
  links.forEach((link, index) => {
    if (index > 0) content.push(textNode(index === links.length - 1 ? ', and ' : ', '));
    content.push(textNode(link.title, [{
      type: 'wikiLink',
      attrs: { pageId: link.pageId, title: link.title }
    }]));
  });
  content.push(textNode('.'));
  return { type: 'paragraph', content };
};

const buildDoc = (page, relatedLinks = []) => {
  const content = [
    heading(page.title, 1),
    paragraph(page.summary),
    wikiLinkParagraph('Related wiki pages: ', relatedLinks)
  ];

  page.sections.forEach((section) => {
    content.push(heading(section.heading, 2));
    section.paragraphs.forEach((item, index) => {
      content.push(paragraph(item.text, {
        claimId: `${page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
        citations: item.citations,
        contradictions: item.contradictions || [],
        support: item.support,
        section: section.heading
      }));
    });
  });

  return { type: 'doc', content };
};

const ensurePageShell = async ({ token, title, pageType }) => {
  const existingPages = await request(`/api/wiki/pages?q=${encodeURIComponent(title)}&limit=25`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const existing = Array.isArray(existingPages)
    ? existingPages.find((page) => clean(page.title).toLowerCase() === title.toLowerCase())
    : null;
  if (existing?._id) return existing;

  return request('/api/wiki/pages', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      title,
      pageType,
      sourceScope: 'selected_sources',
      createdFrom: {
        type: 'idea',
        label: title,
        text: `QA seed page for ${title}`
      }
    })
  });
};

const ensureSource = async ({ token, page, source }) => {
  const fullPage = await request(`/api/wiki/pages/${page._id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const exists = Array.isArray(fullPage.sourceRefs)
    ? fullPage.sourceRefs.some((ref) => clean(ref.title).toLowerCase() === source.title.toLowerCase())
    : false;
  if (exists) return fullPage;

  return request(`/api/wiki/pages/${page._id}/sources`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      type: 'external',
      title: source.title,
      url: source.url,
      snippet: source.snippet
    })
  });
};

const patchPageBody = async ({ token, page, body, pageType }) => request(`/api/wiki/pages/${page._id}`, {
  method: 'PATCH',
  headers: authHeaders(token),
  body: JSON.stringify({
    pageType,
    status: 'draft',
    visibility: 'private',
    sourceScope: 'selected_sources',
    body
  })
});

const main = async () => {
  const auth = await ensureLogin();
  const token = auth.token;
  if (!token) throw new Error('No auth token returned from login.');

  const shells = new Map();
  for (const page of pages) {
    const shell = await ensurePageShell({ token, title: page.title, pageType: page.pageType });
    shells.set(page.title, shell);
  }

  const finalPages = [];
  for (const page of pages) {
    let shell = shells.get(page.title);
    for (const source of page.sources) {
      shell = await ensureSource({ token, page: shell, source });
    }
    const relatedLinks = pages
      .filter((candidate) => candidate.title !== page.title)
      .map((candidate) => ({
        title: candidate.title,
        pageId: shells.get(candidate.title)?._id
      }))
      .filter((link) => link.pageId);
    const updated = await patchPageBody({
      token,
      page: shell,
      pageType: page.pageType,
      body: buildDoc(page, relatedLinks)
    });
    finalPages.push(updated);
  }

  const totalSources = finalPages.reduce((sum, page) => sum + (Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0), 0);
  const totalClaims = finalPages.reduce((sum, page) => sum + (Array.isArray(page.claims) ? page.claims.length : 0), 0);

  console.log(`QA wiki seed user: ${USERNAME}`);
  console.log(`Pages: ${finalPages.length}`);
  console.log(`Sources: ${totalSources}`);
  console.log(`Claims: ${totalClaims}`);
  console.log(`Wiki home: ${APP_URL}/wiki?devToken=${token}`);
  console.log(`Workspace: ${APP_URL}/wiki/workspace?view=graph&devToken=${token}`);
  finalPages.forEach((page) => {
    console.log(`${page.title}: ${APP_URL}/wiki/workspace?page=${page._id}&devToken=${token}`);
  });
};

main().catch((error) => {
  console.error(`Failed to seed QA wiki state: ${error.message}`);
  process.exit(1);
});
