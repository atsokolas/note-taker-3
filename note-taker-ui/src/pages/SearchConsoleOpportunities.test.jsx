import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SearchConsoleOpportunities, {
  buildSearchConsoleOpportunityReport,
  buildSearchOpportunityExecutionBrief,
  evaluateSearchConsoleRows,
  parseSearchConsolePaste
} from './SearchConsoleOpportunities';

describe('SearchConsoleOpportunities helpers', () => {
  it('parses tab-delimited Search Console exports', () => {
    const parsed = parseSearchConsolePaste([
      'Top queries\tTop pages\tClicks\tImpressions\tCTR\tPosition',
      'ai second brain\thttps://www.noeis.io/ai-second-brain\t14\t620\t2.3%\t8.1',
      'readwise alternative\thttps://www.noeis.io/\t2\t144\t1.4%\t15.8'
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      query: 'ai second brain',
      page: 'https://www.noeis.io/ai-second-brain',
      clicks: 14,
      impressions: 620
    }));
    expect(parsed.rows[0].ctr).toBeCloseTo((14 / 620) * 100, 3);
  });

  it('parses Bing-style exports with keyword and page url headers', () => {
    const parsed = parseSearchConsolePaste([
      'Keyword,Page URL,Clicks,Impressions,Click Through Rate,Average Position',
      'source backed synthesis,https://www.noeis.io/source-backed-synthesis-workflow,7,210,3.33%,6.4'
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      query: 'source backed synthesis',
      page: 'https://www.noeis.io/source-backed-synthesis-workflow',
      clicks: 7,
      impressions: 210
    }));
    expect(parsed.rows[0].ctr).toBeCloseTo((7 / 210) * 100, 3);
    expect(parsed.rows[0].position).toBeCloseTo(6.4, 3);
  });

  it('categorizes rows into improve, create, and ignore buckets', () => {
    const recommendations = evaluateSearchConsoleRows([
      {
        query: 'ai second brain',
        page: 'https://www.noeis.io/ai-second-brain',
        clicks: 14,
        impressions: 620,
        ctr: 2.3,
        position: 8.1
      },
      {
        query: 'readwise alternative',
        page: 'https://www.noeis.io/',
        clicks: 2,
        impressions: 144,
        ctr: 1.4,
        position: 15.8
      },
      {
        query: 'noeis jobs',
        page: 'https://www.noeis.io/',
        clicks: 0,
        impressions: 11,
        ctr: 0,
        position: 41
      }
    ]);

    expect(recommendations.improve).toEqual([
      expect.objectContaining({
        query: 'ai second brain',
        currentPage: 'https://www.noeis.io/ai-second-brain'
      })
    ]);
    expect(recommendations.create).toEqual([
      expect.objectContaining({
        query: 'readwise alternative',
        recommendedTitle: 'Readwise is not a second brain',
        recommendedSlug: 'readwise-is-not-a-second-brain',
        activationCta: 'Import your reading archive'
      })
    ]);
    expect(recommendations.ignore).toEqual([
      expect.objectContaining({
        query: 'noeis jobs'
      })
    ]);
  });

  it('maps recall and concept opportunities to published Noeis slugs', () => {
    const recommendations = evaluateSearchConsoleRows([
      {
        query: 'note apps for recall',
        page: 'https://www.noeis.io/',
        clicks: 1,
        impressions: 94,
        ctr: 1.1,
        position: 17.4
      },
      {
        query: 'turn highlights into concepts',
        page: 'https://www.noeis.io/',
        clicks: 1,
        impressions: 81,
        ctr: 1.2,
        position: 16.2
      }
    ]);

    expect(recommendations.create).toEqual(expect.arrayContaining([
      expect.objectContaining({
        query: 'note apps for recall',
        recommendedSlug: 'most-note-apps-solve-capture-not-recall'
      }),
      expect.objectContaining({
        query: 'turn highlights into concepts',
        recommendedSlug: 'highlights-into-concepts'
      })
    ]));
  });

  it('maps saved article and draft opportunities to the draft workflow page', () => {
    const recommendations = evaluateSearchConsoleRows([
      {
        query: 'turn saved article into draft',
        page: 'https://www.noeis.io/',
        clicks: 1,
        impressions: 73,
        ctr: 1.4,
        position: 18.1
      }
    ]);

    expect(recommendations.create).toEqual(expect.arrayContaining([
      expect.objectContaining({
        query: 'turn saved article into draft',
        recommendedTitle: 'From saved article to draft in Noeis',
        recommendedSlug: 'from-saved-article-to-draft-in-noeis',
        activationCta: 'Turn an article into a draft'
      })
    ]));
  });

  it('builds an opportunity report with totals and buckets', () => {
    const report = buildSearchConsoleOpportunityReport({
      dateRange: 'Apr 1 to Apr 15, 2026',
      source: 'GSC copy/paste',
      input: [
        'Query,Page,Clicks,Impressions,CTR,Position',
        'how to turn highlights into concepts,https://www.noeis.io/personal-knowledge-management-ai,5,91,5.5%,9.2',
        'noeis jobs,https://www.noeis.io/,0,11,0%,41'
      ].join('\n')
    });

    expect(report.rowCount).toBe(2);
    expect(report.totals).toEqual({
      clicks: 5,
      impressions: 102
    });
    expect(report.recommendations.improve[0]).toEqual(expect.objectContaining({
      query: 'how to turn highlights into concepts'
    }));
    expect(report.recommendations.ignore[0]).toEqual(expect.objectContaining({
      query: 'noeis jobs'
    }));
  });

  it('builds an execution brief with the highest-value action', () => {
    const report = buildSearchConsoleOpportunityReport({
      dateRange: 'Jun 1 to Jun 22, 2026',
      source: 'Google Search Console export',
      input: [
        'Query,Page,Clicks,Impressions,CTR,Position',
        'ai second brain,https://www.noeis.io/ai-second-brain,14,620,2.3%,8.1',
        'readwise alternative,https://www.noeis.io/,2,144,1.4%,15.8'
      ].join('\n')
    });

    const brief = buildSearchOpportunityExecutionBrief(report);

    expect(brief).toContain('Highest-value action: Improve existing page');
    expect(brief).toContain('Primary query: ai second brain');
    expect(brief).toContain('Target: https://www.noeis.io/ai-second-brain');
    expect(brief).toContain('Activation CTA: Create your first concept');
    expect(brief).toContain('Bucket counts:');
  });
});

describe('SearchConsoleOpportunities page', () => {
  it('analyzes pasted exports and renders categorized recommendations', async () => {
    render(
      <MemoryRouter>
        <SearchConsoleOpportunities />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Date range'), {
      target: { value: 'Apr 1 to Apr 15, 2026' }
    });
    fireEvent.change(screen.getByLabelText('Source'), {
      target: { value: 'GSC copy/paste' }
    });
    fireEvent.change(screen.getByLabelText('Search performance export'), {
      target: {
        value: [
          'Query\tPage\tClicks\tImpressions\tCTR\tPosition',
          'ai second brain\thttps://www.noeis.io/ai-second-brain\t14\t620\t2.3%\t8.1',
          'readwise alternative\thttps://www.noeis.io/\t2\t144\t1.4%\t15.8',
          'noeis jobs\thttps://www.noeis.io/\t0\t11\t0%\t41'
        ].join('\n')
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Analyze export' }));

    expect(await screen.findByText('Import summary')).toBeInTheDocument();
    expect(screen.getByText('GSC copy/paste')).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === 'Highest-priority move: ai second brain')).toBeInTheDocument();
    expect(screen.getByText('Execution brief')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marketing Analytics' })).toHaveAttribute('href', '/marketing-analytics');
    expect(screen.getByLabelText('Search opportunity execution brief').value).toContain('Highest-value action: Improve existing page');
    expect(screen.getByText('Current page: https://www.noeis.io/ai-second-brain')).toBeInTheDocument();
    expect(screen.getByText('Recommended page title: Readwise is not a second brain')).toBeInTheDocument();
    expect(screen.getByText(/Reason to ignore: The query is low-intent or off-strategy/)).toBeInTheDocument();
  });

  it('accepts Bing export labeling in the UI flow', async () => {
    render(
      <MemoryRouter>
        <SearchConsoleOpportunities />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Source'), {
      target: { value: 'Bing Webmaster Tools export' }
    });
    fireEvent.change(screen.getByLabelText('Search performance export'), {
      target: {
        value: [
          'Keyword,Page URL,Clicks,Impressions,Click Through Rate,Average Position',
          'source backed synthesis,https://www.noeis.io/source-backed-synthesis-workflow,7,210,3.33%,6.4'
        ].join('\n')
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Analyze export' }));

    expect(await screen.findByText('Import summary')).toBeInTheDocument();
    expect(screen.getByText('Bing Webmaster Tools export')).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === 'Highest-priority move: source backed synthesis')).toBeInTheDocument();
  });
});
