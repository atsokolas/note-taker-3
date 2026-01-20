import React from 'react';
import { Button, QuietButton, TagChip } from '../ui';

const SynthesisModal = ({
  open,
  title = 'Synthesis',
  loading,
  error,
  data,
  onClose,
  onAddTheme,
  onAddQuestion,
  onLinkSuggested
}) => {
  if (!open) return null;
  const themes = data?.themes || [];
  const connections = data?.connections || [];
  const questions = data?.questions || [];
  const suggested = data?.suggestedLinks || [];
  const draftInsights = data?.draftInsights || null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content--wide">
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            <p className="muted small">Synthesis is suggestions, not conclusions.</p>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>

        {loading && <p className="muted small">Synthesizing…</p>}
        {error && <p className="status-message error-message">{error}</p>}

        {!loading && !error && (
          <div className="section-stack">
            <div>
              <div className="search-section-header">
                <span className="eyebrow">Draft insights</span>
                <span className="muted small">Local LLM, grounded in evidence</span>
              </div>
              {!draftInsights && (
                <p className="muted small">Draft insights are disabled or unavailable.</p>
              )}
              {draftInsights && (
                <div className="section-stack">
                  <div>
                    <div className="search-section-header">
                      <span className="eyebrow">Key insights</span>
                    </div>
                    {draftInsights.insights?.length ? (
                      <div className="related-embed-list">
                        {draftInsights.insights.map((item, idx) => (
                          <div key={`insight-${idx}`} className="related-embed-row">
                            <div>
                              <div className="related-embed-title">{item.text}</div>
                              {(item.evidence || []).length > 0 && (
                                <div className="muted small">
                                  Evidence:{' '}
                                  {item.evidence.map(ev => {
                                    const label = ev.articleTitle || ev.id;
                                    if (ev.articleId) {
                                      return (
                                        <a
                                          key={ev.id}
                                          href={`/articles/${ev.articleId}`}
                                          className="inline-link"
                                        >
                                          {label}
                                        </a>
                                      );
                                    }
                                    return (
                                      <span key={ev.id} className="inline-link">
                                        {label}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted small">No draft insights.</p>
                    )}
                  </div>
                  <div>
                    <div className="search-section-header">
                      <span className="eyebrow">Blind spots</span>
                    </div>
                    {draftInsights.blindSpots?.length ? (
                      <div className="related-embed-list">
                        {draftInsights.blindSpots.map((item, idx) => (
                          <div key={`blind-${idx}`} className="related-embed-row">
                            <div>
                              <div className="related-embed-title">{item.text}</div>
                              {(item.evidence || []).length > 0 && (
                                <div className="muted small">
                                  Evidence:{' '}
                                  {item.evidence.map(ev => {
                                    const label = ev.articleTitle || ev.id;
                                    if (ev.articleId) {
                                      return (
                                        <a
                                          key={ev.id}
                                          href={`/articles/${ev.articleId}`}
                                          className="inline-link"
                                        >
                                          {label}
                                        </a>
                                      );
                                    }
                                    return (
                                      <span key={ev.id} className="inline-link">
                                        {label}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted small">No blind spots identified.</p>
                    )}
                  </div>
                  <div>
                    <div className="search-section-header">
                      <span className="eyebrow">Next questions</span>
                    </div>
                    {draftInsights.nextQuestions?.length ? (
                      <div className="related-embed-list">
                        {draftInsights.nextQuestions.map((item, idx) => (
                          <div key={`next-${idx}`} className="related-embed-row">
                            <div>
                              <div className="related-embed-title">{item.text}</div>
                              {(item.evidence || []).length > 0 && (
                                <div className="muted small">
                                  Evidence:{' '}
                                  {item.evidence.map(ev => {
                                    const label = ev.articleTitle || ev.id;
                                    if (ev.articleId) {
                                      return (
                                        <a
                                          key={ev.id}
                                          href={`/articles/${ev.articleId}`}
                                          className="inline-link"
                                        >
                                          {label}
                                        </a>
                                      );
                                    }
                                    return (
                                      <span key={ev.id} className="inline-link">
                                        {label}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted small">No next questions yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="search-section-header">
                <span className="eyebrow">Themes</span>
                <span className="muted small">{themes.length} clusters</span>
              </div>
              {themes.length === 0 ? (
                <p className="muted small">No themes yet.</p>
              ) : (
                <div className="related-embed-list">
                  {themes.map((theme, idx) => (
                    <div key={`${theme.title}-${idx}`} className="related-embed-row">
                      <div>
                        <div className="related-embed-title">{theme.title || 'Theme'}</div>
                        {theme.evidence?.length > 0 && (
                          <div className="muted small">{theme.evidence.length} highlights</div>
                        )}
                      </div>
                      {onAddTheme && (
                        <QuietButton onClick={() => onAddTheme(theme.title || 'Theme')}>
                          Add as concept
                        </QuietButton>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="search-section-header">
                <span className="eyebrow">Connections</span>
                <span className="muted small">{connections.length} signals</span>
              </div>
              {connections.length === 0 ? (
                <p className="muted small">No tensions detected.</p>
              ) : (
                <div className="related-embed-list">
                  {connections.map((item, idx) => (
                    <div key={`${idx}-${item.description}`} className="related-embed-row">
                      <div className="related-embed-title">{item.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="search-section-header">
                <span className="eyebrow">Open questions</span>
                <span className="muted small">{questions.length} prompts</span>
              </div>
              {questions.length === 0 ? (
                <p className="muted small">No questions found.</p>
              ) : (
                <div className="related-embed-list">
                  {questions.map((question, idx) => (
                    <div key={`${idx}-${question}`} className="related-embed-row">
                      <div className="related-embed-title">{question}</div>
                      {onAddQuestion && (
                        <QuietButton onClick={() => onAddQuestion(question)}>
                          Add question
                        </QuietButton>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="search-section-header">
                <span className="eyebrow">Suggested links</span>
                <span className="muted small">{suggested.length} items</span>
              </div>
              {suggested.length === 0 ? (
                <p className="muted small">No suggestions yet.</p>
              ) : (
                <div className="related-embed-list">
                  {suggested.map((item) => (
                    <div key={`${item.objectType}-${item.objectId}`} className="related-embed-row">
                      <div>
                        <div className="related-embed-title">{item.title || 'Suggestion'}</div>
                        {item.snippet && <div className="muted small">{item.snippet}</div>}
                        {item.metadata?.tags?.length > 0 && (
                          <div className="concept-related-tags" style={{ marginTop: 6 }}>
                            {item.metadata.tags.slice(0, 3).map(tag => (
                              <TagChip key={`${item.objectId}-${tag}`}>{tag}</TagChip>
                            ))}
                          </div>
                        )}
                      </div>
                      {onLinkSuggested && item.objectType === 'highlight' && (
                        <QuietButton onClick={() => onLinkSuggested(item)}>
                          Link highlight
                        </QuietButton>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="modal-footer">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};

export default SynthesisModal;
