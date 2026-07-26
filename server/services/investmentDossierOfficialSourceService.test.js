const assert = require('node:assert/strict');
const {
  acquireOfficialProductSources,
  assessProductDocument,
  buildWikidataQueryUrl,
  fetchReaderDocument,
  isSafePublicWebsite,
  markdownLinks
} = require('./investmentDossierOfficialSourceService');

const response = ({ status = 200, json = null, text = '', headers = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => json,
  text: async () => text,
  headers: { get: name => headers[String(name).toLowerCase()] || '' }
});

const readerBody = ({
  title = 'Products and solutions',
  sourceUrl = 'https://www.example.com/products',
  words = 220,
  links = ''
} = {}) => `Title: ${title}
URL Source: ${sourceUrl}

Markdown Content:
# Products and solutions

## Technology for customers

${Array.from({ length: words }, (_, index) => (
    index % 8 === 0 ? 'products technology services customers operations platform solutions' : 'evidence'
  )).join(' ')}

${links}`;

const run = async () => {
  assert.match(decodeURIComponent(buildWikidataQueryUrl('315189')), /0000315189/);
  assert.equal(isSafePublicWebsite('https://www.deere.com/'), true);
  assert.equal(isSafePublicWebsite('http://127.0.0.1/admin'), false);
  assert.equal(isSafePublicWebsite('http://metadata.internal/'), false);
  assert.equal(isSafePublicWebsite('https://user:secret@example.com/'), false);
  assert.equal(isSafePublicWebsite('https://www.example.com:8443/'), false);
  assert.equal(isSafePublicWebsite('file:///tmp/source'), false);

  const links = markdownLinks({
    markdown: [
      '[Products](https://www.deere.com/en-us/products-solutions)',
      '[Privacy](https://www.deere.com/en-us/privacy)',
      '[External](https://malicious.example/products)'
    ].join('\n'),
    baseUrl: 'https://www.deere.com/',
    officialWebsite: 'https://www.deere.com/'
  });
  assert.deepEqual(links.map(link => link.label), ['Products']);

  const assessment = assessProductDocument({
    document: {
      sourceUrl: 'https://www.example.com/products',
      markdown: readerBody().split('Markdown Content:\n')[1]
    },
    officialWebsite: 'https://www.example.com/'
  });
  assert.equal(assessment.accepted, true);
  assert(assessment.wordCount >= 180);

  await assert.rejects(
    () => fetchReaderDocument({
      url: 'https://www.example.com/products',
      officialWebsite: 'https://www.example.com/',
      fetchImpl: async () => response({
        text: readerBody({ sourceUrl: 'https://redirected.example/products' })
      })
    }),
    error => error.code === 'OFFICIAL_SOURCE_REDIRECT_MISMATCH'
  );
  await assert.rejects(
    () => fetchReaderDocument({
      url: 'https://www.example.com/products',
      officialWebsite: 'https://www.example.com/',
      fetchImpl: async () => response({
        headers: { 'content-length': '1000001' },
        text: readerBody()
      })
    }),
    error => error.statusCode === 413
  );

  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith('https://query.wikidata.org/')) {
      return response({
        json: {
          results: {
            bindings: [{
              item: { value: 'https://www.wikidata.org/entity/Q123' },
              itemLabel: { value: 'Example Corp.' },
              website: { value: 'https://www.example.com/' }
            }]
          }
        }
      });
    }
    if (url === 'https://r.jina.ai/https://www.example.com/') {
      return response({
        text: readerBody({
          title: 'Example home',
          sourceUrl: 'https://www.example.com/',
          links: [
            '[Products](https://www.example.com/products)',
            '[Technology](https://www.example.com/technology)'
          ].join('\n')
        })
      });
    }
    if (url === 'https://r.jina.ai/https://www.example.com/products') {
      return response({
        text: readerBody({
          title: 'Example products',
          sourceUrl: 'https://www.example.com/products'
        })
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const acquired = await acquireOfficialProductSources({
    cik: '123',
    ticker: 'EXM',
    companyName: 'EXAMPLE CORP',
    fetchImpl,
    now: new Date('2026-07-26T20:00:00.000Z')
  });
  assert.equal(acquired.stop, null);
  assert.equal(acquired.sourceRefs.length, 1);
  assert.equal(acquired.sourceRefs[0].url, 'https://www.example.com/products');
  assert(acquired.sourceRefs.every(source => source.provider === 'official-company-site'));
  assert(acquired.sourceRefs.every(source => source.metadata.evidenceArchetype === 'company_product'));
  assert(acquired.sourceRefs.every(source => source.metadata.validation.officialDomainMatched));
  assert(acquired.sourceRefs.every(source => /^[a-f0-9]{64}$/.test(source.metadata.provenance.contentHash)));
  assert.equal(calls.filter(url => url.startsWith('https://query.wikidata.org/')).length, 1);

  const unsafeDiscovery = await acquireOfficialProductSources({
    cik: '123',
    ticker: 'EXM',
    companyName: 'EXAMPLE CORP',
    fetchImpl: async () => response({
      json: {
        results: {
          bindings: [{
            item: { value: 'https://www.wikidata.org/entity/Q123' },
            website: { value: 'http://127.0.0.1/admin' }
          }]
        }
      }
    })
  });
  assert.equal(unsafeDiscovery.sourceRefs.length, 0);
  assert.equal(unsafeDiscovery.stop.code, 'OFFICIAL_WEBSITE_NOT_FOUND');

  const identityMismatch = await acquireOfficialProductSources({
    cik: '123',
    ticker: 'EXM',
    companyName: 'DIFFERENT ISSUER INC',
    fetchImpl: async () => response({
      json: {
        results: {
          bindings: [{
            item: { value: 'https://www.wikidata.org/entity/Q123' },
            itemLabel: { value: 'Example Corp.' },
            website: { value: 'https://www.example.com/' }
          }]
        }
      }
    })
  });
  assert.equal(identityMismatch.sourceRefs.length, 0);
  assert.equal(identityMismatch.stop.code, 'OFFICIAL_WEBSITE_IDENTITY_MISMATCH');

  const sparse = await acquireOfficialProductSources({
    cik: '123',
    ticker: 'EXM',
    companyName: 'EXAMPLE CORP',
    fetchImpl: async (url) => {
      if (url.startsWith('https://query.wikidata.org/')) {
        return response({
          json: {
            results: {
              bindings: [{
                item: { value: 'https://www.wikidata.org/entity/Q123' },
                itemLabel: { value: 'Example Corp.' },
                website: { value: 'https://www.example.com/' }
              }]
            }
          }
        });
      }
      return response({
        text: 'Title: Home\nURL Source: https://www.example.com/\nMarkdown Content:\n# Home\nThin page.'
      });
    }
  });
  assert.equal(sparse.sourceRefs.length, 0);
  assert.equal(sparse.stop.code, 'OFFICIAL_PRODUCT_EVIDENCE_INSUFFICIENT');
};

if (require.main === module) {
  run()
    .then(() => console.log('investment dossier official source service tests passed'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
