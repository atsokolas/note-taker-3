import React, { useEffect, useMemo, useState } from 'react';
import { QuietButton } from '../ui';
import ReturnLaterControl from '../return-queue/ReturnLaterControl';
import ConnectionBuilder from '../connections/ConnectionBuilder';

const summarize = (text, max = 170) => {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'No summary yet.';
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max).trim()}...`;
};

const formatDateLabel = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString();
};

const ArticleCard = ({
  article,
  forceExpandedState,
  forceExpandedVersion = 0,
  connectionScopeType = '',
  connectionScopeId = '',
  children
}) => {
  const [expanded, setExpanded] = useState(false);
  const articleId = article?._id || article?.id;
  const preview = useMemo(() => summarize(article?.content || article?.url || article?.title), [article?.content, article?.url, article?.title]);

  useEffect(() => {
    setExpanded(false);
  }, [articleId]);

  useEffect(() => {
    if (typeof forceExpandedState === 'boolean') {
      setExpanded(forceExpandedState);
    }
  }, [forceExpandedState, forceExpandedVersion]);

  if (!articleId) return null;

  return (
    <div className="article-card">
      <div className="article-card-collapsed">
        <div className="article-card-collapsed-main">
          <div className="article-card-collapsed-title">{article?.title || 'Untitled article'}</div>
          <div className="article-card-collapsed-text">{preview}</div>
          <div className="article-card-collapsed-meta">
            <span className="item-type-badge">Article</span>
            {Number.isFinite(Number(article?.highlightCount)) && (
              <span className="item-tag-summary">{article.highlightCount} highlights</span>
            )}
            {article?.updatedAt && <span className="item-timestamp">{formatDateLabel(article.updatedAt)}</span>}
          </div>
        </div>
        <QuietButton onClick={() => setExpanded(prev => !prev)}>
          {expanded ? 'Collapse' : 'Expand'}
        </QuietButton>
      </div>
      {expanded && (
        <div className="article-card-expanded">
          {article?.url && <div className="article-card-url">{article.url}</div>}
          <div className="article-card-actions">
            <QuietButton onClick={() => { window.location.href = `/articles/${articleId}`; }}>
              Open article
            </QuietButton>
            <ReturnLaterControl
              itemType="article"
              itemId={articleId}
              defaultReason={article?.title || 'Article'}
            />
            <ConnectionBuilder
              itemType="article"
              itemId={articleId}
              scopeType={connectionScopeType}
              scopeId={connectionScopeId}
            />
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArticleCard;
