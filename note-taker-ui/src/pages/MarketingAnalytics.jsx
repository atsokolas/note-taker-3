import React, { useEffect, useMemo, useState } from 'react';
import { Card, Page, PageTitle, SectionHeader, SegmentedNav } from '../components/ui';
import {
  MARKETING_FUNNEL_WINDOW_OPTIONS,
  buildMarketingFunnelViewModel,
  getMarketingFunnelSeries,
  getMarketingFunnelSnapshot
} from '../api/marketingAnalytics';

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const formatPercent = (value = 0) => percentFormatter.format(Number(value) || 0);

const barTrackStyle = {
  height: 8,
  borderRadius: 999,
  background: 'rgba(255, 255, 255, 0.08)',
  overflow: 'hidden'
};

const barFillStyle = (value) => ({
  width: `${Math.max(0, Math.min(100, Math.round((Number(value) || 0) * 100)))}%`,
  height: '100%',
  borderRadius: 999,
  background: 'linear-gradient(90deg, rgba(106, 227, 255, 0.9), rgba(158, 241, 179, 0.85))'
});

const cardGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 16
};

const metricCardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 18,
  borderRadius: 18,
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.08)'
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse'
};

const thStyle = {
  textAlign: 'left',
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'rgba(255, 255, 255, 0.6)',
  padding: '0 0 12px'
};

const tdStyle = {
  padding: '14px 0',
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  verticalAlign: 'top'
};

const insightGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 16
};

const getWindowLabel = (days) => `Last ${days} days`;

const dayLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC'
});

const formatDayLabel = (value = '') => {
  if (!value) return '';
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return dayLabelFormatter.format(parsed);
};

const buildTrendRows = (series = []) => {
  const rows = Array.isArray(series) ? series : [];
  const maxViewed = rows.reduce((highest, row) => Math.max(highest, Number(row?.totals?.signupViewed) || 0), 0);

  return rows.map((row) => ({
    date: row.date,
    label: formatDayLabel(row.date),
    signupViewed: Number(row?.totals?.signupViewed) || 0,
    signupsCompleted: Number(row?.totals?.signupsCompleted) || 0,
    activatedUsers: Number(row?.totals?.activatedUsers) || 0,
    wikiPageCreated: Number(row?.totals?.wikiPageCreated) || 0,
    wikiDraftGenerated: Number(row?.totals?.wikiDraftGenerated) || 0,
    heightRatio: maxViewed > 0 ? (Number(row?.totals?.signupViewed) || 0) / maxViewed : 0
  }));
};

const TrendChart = ({ rows = [] }) => (
  <Card className="search-section">
    <SectionHeader
      title="Daily trend"
      subtitle="Daily attributed views, signups, and activated users across the selected window."
    />
    {rows.length === 0 ? (
      <p className="muted small">No attributed trend data yet.</p>
    ) : (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length}, minmax(28px, 1fr))`, gap: 10, alignItems: 'end', minHeight: 180 }}>
          {rows.map((row) => (
            <div key={row.date} style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
              <div
                aria-label={`${row.label}: ${row.signupViewed} views, ${row.signupsCompleted} signups, ${row.activatedUsers} activated`}
                style={{
                  width: '100%',
                  minHeight: 24,
                  height: `${Math.max(16, Math.round(row.heightRatio * 140))}px`,
                  borderRadius: 16,
                  background: 'linear-gradient(180deg, rgba(106, 227, 255, 0.92), rgba(158, 241, 179, 0.75))'
                }}
              />
              <div style={{ textAlign: 'center' }}>
                <div className="muted small">{row.label}</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{row.signupViewed}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
          <span className="muted small">Bar height = signup views</span>
          <span className="muted small">Signed up and activated counts are listed per day below.</span>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Day</th>
                <th style={thStyle}>Viewed</th>
                <th style={thStyle}>Signed up</th>
                <th style={thStyle}>Activated</th>
                <th style={thStyle}>Wiki pages</th>
                <th style={thStyle}>Drafts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.date}-table`}>
                  <td style={tdStyle}>{row.label}</td>
                  <td style={tdStyle}>{row.signupViewed}</td>
                  <td style={tdStyle}>{row.signupsCompleted}</td>
                  <td style={tdStyle}>{row.activatedUsers}</td>
                  <td style={tdStyle}>{row.wikiPageCreated}</td>
                  <td style={tdStyle}>{row.wikiDraftGenerated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </Card>
);

const BreakdownTable = ({ title, subtitle, rows = [] }) => (
  <Card className="search-section">
    <SectionHeader title={title} subtitle={subtitle} />
    {rows.length === 0 ? (
      <p className="muted small">No attributed data in this window yet.</p>
    ) : (
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Segment</th>
              <th style={thStyle}>Viewed</th>
                <th style={thStyle}>Signed up</th>
                <th style={thStyle}>Activated</th>
                <th style={thStyle}>Wiki</th>
                <th style={thStyle}>Sources</th>
                <th style={thStyle}>Drafts</th>
                <th style={thStyle}>View → Activation</th>
              </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td style={{ ...tdStyle, minWidth: 220 }}>
                  <div style={{ fontWeight: 600 }}>{row.label}</div>
                  <div className="muted small">
                    {formatPercent(row.signupCompletionRate)} signup completion from starts
                  </div>
                </td>
                <td style={tdStyle}>{row.signupViewed}</td>
                <td style={tdStyle}>{row.signupsCompleted}</td>
                <td style={tdStyle}>{row.activatedUsers}</td>
                <td style={tdStyle}>{row.wikiPageCreated}</td>
                <td style={tdStyle}>{row.wikiSourceAttached}</td>
                <td style={tdStyle}>{row.wikiDraftGenerated}</td>
                <td style={{ ...tdStyle, minWidth: 180 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <span>{formatPercent(row.viewToActivationRate)}</span>
                    <span className="muted small">{row.activatedUsers}/{row.signupViewed || 0}</span>
                  </div>
                  <div style={barTrackStyle}>
                    <div style={barFillStyle(row.viewToActivationRate)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Card>
);

const MarketingAnalytics = () => {
  const [selectedWindow, setSelectedWindow] = useState(30);
  const [snapshot, setSnapshot] = useState(null);
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadSnapshot = async () => {
      setLoading(true);
      setError('');
      try {
        const [nextSnapshot, nextSeries] = await Promise.all([
          getMarketingFunnelSnapshot({ days: selectedWindow }),
          getMarketingFunnelSeries({ days: selectedWindow })
        ]);
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setSeries(nextSeries);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError?.response?.data?.error || 'Failed to load marketing analytics.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, [selectedWindow]);

  const viewModel = useMemo(
    () => buildMarketingFunnelViewModel(snapshot || { windowDays: selectedWindow }),
    [selectedWindow, snapshot]
  );
  const trendRows = useMemo(
    () => buildTrendRows(series?.series || []),
    [series]
  );

  return (
    <Page>
      <PageTitle
        eyebrow="Growth"
        title="Marketing analytics"
        subtitle="Authenticated reporting for the SEO/AEO funnel from signup view through activation."
      />

      <Card className="search-section">
        <SectionHeader
          title="Organic funnel performance"
          subtitle={getWindowLabel(viewModel.windowDays)}
          action={(
            <SegmentedNav
              items={MARKETING_FUNNEL_WINDOW_OPTIONS}
              value={selectedWindow}
              onChange={setSelectedWindow}
              appearance="quiet"
            />
          )}
        />

        {loading && <p className="muted">Loading marketing analytics…</p>}
        {!loading && error && <p className="status-message error-message">{error}</p>}
        {!loading && !error && (
          <div style={cardGridStyle}>
            {viewModel.summaryCards.map((card) => (
              <div key={card.key} style={metricCardStyle}>
                <span className="muted-label">{card.label}</span>
                <div style={{ fontSize: 30, fontWeight: 700 }}>{card.value}</div>
                <div className="muted small">{card.context}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {!loading && !error && (
        <>
          <div className="section-stack">
            <Card className="search-section">
              <SectionHeader
                title="Conversion rates"
                subtitle="Stage-by-stage efficiency for the current reporting window."
              />
              <div style={cardGridStyle}>
                {viewModel.stageRates.map((stage) => (
                  <div key={stage.key} style={metricCardStyle}>
                    <span className="muted-label">{stage.label}</span>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{formatPercent(stage.rate)}</div>
                    <div className="muted small">{stage.numerator}/{stage.denominator || 0}</div>
                    <div style={barTrackStyle}>
                      <div style={barFillStyle(stage.rate)} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div style={insightGridStyle}>
              <Card className="search-section">
                <SectionHeader title="Primary leak" subtitle="The weakest stage in the funnel right now." />
                {viewModel.primaryLeak ? (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{viewModel.primaryLeak.label}</div>
                    <p className="muted" style={{ marginBottom: 8 }}>
                      {formatPercent(viewModel.primaryLeak.rate)} conversion across this stage in {getWindowLabel(viewModel.windowDays).toLowerCase()}.
                    </p>
                    <p className="muted small">
                      Largest drop-off is happening between these steps, so this is the first place to tighten copy, UX, or qualification.
                    </p>
                  </>
                ) : (
                  <p className="muted small">Not enough attributed activity yet.</p>
                )}
              </Card>

              <Card className="search-section">
                <SectionHeader title="Best entry page" subtitle="Highest view-to-activation efficiency." />
                {viewModel.topEntry ? (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{viewModel.topEntry.label}</div>
                    <p className="muted" style={{ marginBottom: 8 }}>
                      {formatPercent(viewModel.topEntry.viewToActivationRate)} of views reach activation.
                    </p>
                    <p className="muted small">
                      {viewModel.topEntry.activatedUsers} activated from {viewModel.topEntry.signupViewed} attributed views.
                    </p>
                  </>
                ) : (
                  <p className="muted small">No entry-page attribution yet.</p>
                )}
              </Card>

              <Card className="search-section">
                <SectionHeader title="Best source" subtitle="Most efficient acquisition source in this window." />
                {viewModel.topSource ? (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{viewModel.topSource.label}</div>
                    <p className="muted" style={{ marginBottom: 8 }}>
                      {formatPercent(viewModel.topSource.viewToActivationRate)} of views reach activation.
                    </p>
                    <p className="muted small">
                      {viewModel.topSource.signupsCompleted} signups and {viewModel.topSource.activatedUsers} activated users.
                    </p>
                  </>
                ) : (
                  <p className="muted small">No source attribution yet.</p>
                )}
              </Card>
            </div>

            <Card className="search-section">
              <SectionHeader
                title="Activation quality"
                subtitle="Which product milestones attributed organic users are reaching after signup."
              />
              <div style={cardGridStyle}>
                {viewModel.activationMilestones.map((milestone) => (
                  <div key={milestone.key} style={metricCardStyle}>
                    <span className="muted-label">{milestone.label}</span>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{milestone.value}</div>
                    <div className="muted small">{milestone.context}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="section-stack">
            <TrendChart rows={trendRows} />
            <BreakdownTable
              title="Entry-page efficiency"
              subtitle="Which public pages are turning attributed visits into signups and activated users."
              rows={viewModel.entryRows}
            />
            <BreakdownTable
              title="Source efficiency"
              subtitle="Which acquisition sources are producing the best downstream quality."
              rows={viewModel.sourceRows}
            />
          </div>
        </>
      )}
    </Page>
  );
};

export default MarketingAnalytics;
