const assert = require('node:assert/strict');
const {
  acquireMarketSnapshotSource,
  assessNasdaqQuote,
  parseNasdaqDate,
  parsePrice
} = require('./investmentDossierMarketSourceService');

const payload = {
  data: {
    symbol: 'DE',
    companyName: 'Deere & Company Common Stock',
    exchange: 'NYSE',
    assetClass: 'STOCKS',
    marketStatus: 'Closed',
    primaryData: {
      lastSalePrice: '$628.16',
      lastTradeTimestamp: 'Jul 23, 2026',
      isRealTime: false
    }
  }
};

const run = async () => {
  assert.equal(parsePrice('$628.16'), 628.16);
  assert.equal(parsePrice('N/A'), null);
  assert.equal(parseNasdaqDate('Jul 23, 2026').toISOString(), '2026-07-23T00:00:00.000Z');
  assert.equal(parseNasdaqDate('Jul 23, 26'), null);

  const accepted = assessNasdaqQuote({
    payload,
    ticker: 'de',
    now: new Date('2026-07-26T12:00:00.000Z')
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.price, 628.16);
  assert.equal(accepted.ageDays, 3);

  assert.equal(assessNasdaqQuote({
    payload,
    ticker: 'ADBE',
    now: new Date('2026-07-26T12:00:00.000Z')
  }).accepted, false);
  assert.equal(assessNasdaqQuote({
    payload,
    ticker: 'DE',
    now: new Date('2026-08-05T12:00:00.000Z')
  }).accepted, false);

  let fetchCalls = 0;
  const acquired = await acquireMarketSnapshotSource({
    ticker: 'de',
    fetchNasdaqQuoteFn: async ({ ticker }) => {
      fetchCalls += 1;
      assert.equal(ticker, 'DE');
      return {
        endpoint: 'https://api.nasdaq.com/api/quote/DE/info?assetclass=stocks',
        payload
      };
    },
    now: new Date('2026-07-26T12:00:00.000Z')
  });
  assert.equal(fetchCalls, 1);
  assert.equal(acquired.stop, null);
  assert.equal(acquired.sourceRef.provider, 'nasdaq-public-quote');
  assert.equal(acquired.sourceRef.metadata.evidenceArchetype, 'market_snapshot');
  assert.equal(acquired.sourceRef.metadata.marketSnapshot, true);
  assert.equal(acquired.sourceRef.metadata.price, 628.16);
  assert.equal(acquired.sourceRef.metadata.asOf, '2026-07-23');
  assert.equal(acquired.sourceRef.metadata.validation.status, 'accepted');
  assert.match(acquired.sourceRef.metadata.provenance.contentHash, /^[a-f0-9]{64}$/);
  assert.match(acquired.sourceRef.url, /nasdaq\.com\/market-activity\/stocks\/de$/);

  const insufficient = await acquireMarketSnapshotSource({
    ticker: 'DE',
    fetchNasdaqQuoteFn: async () => ({
      endpoint: 'https://api.nasdaq.com/api/quote/DE/info?assetclass=stocks',
      payload: {
        data: {
          ...payload.data,
          primaryData: {
            ...payload.data.primaryData,
            lastSalePrice: 'N/A'
          }
        }
      }
    }),
    now: new Date('2026-07-26T12:00:00.000Z')
  });
  assert.equal(insufficient.sourceRef, null);
  assert.equal(insufficient.stop.code, 'MARKET_SNAPSHOT_INSUFFICIENT');

  console.log('investment dossier market source service tests passed');
};

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
