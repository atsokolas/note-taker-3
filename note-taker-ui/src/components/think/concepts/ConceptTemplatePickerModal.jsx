import React, { useEffect, useMemo, useState } from 'react';
import {
  createWorkspaceFromTemplate,
  getWorkspaceTemplateDefinition,
  listWorkspaceTemplates
} from '../../../api/templates';
import { Button, QuietButton } from '../../ui';

const toSafeString = (value) => String(value || '').trim();
const TEMPLATE_TARGETS = {
  concept: 'concept',
  notebook: 'notebook'
};

const ConceptTemplatePickerModal = ({
  open,
  onClose,
  onCreated
}) => {
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState('');

  const [conceptName, setConceptName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createTarget, setCreateTarget] = useState(TEMPLATE_TARGETS.concept);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setTemplates([]);
    setTemplatesLoading(true);
    setTemplatesError('');
    setSelectedTemplateId('');
    setSelectedTemplate(null);
    setTemplateError('');
    setCreateError('');
    setConceptName('');
    setCreateTarget(TEMPLATE_TARGETS.concept);

    const load = async () => {
      try {
        const rows = await listWorkspaceTemplates();
        if (cancelled) return;
        const nextRows = Array.isArray(rows) ? rows : [];
        setTemplates(nextRows);
        if (nextRows.length > 0) {
          setSelectedTemplateId(String(nextRows[0].id || ''));
        }
      } catch (error) {
        if (!cancelled) {
          setTemplatesError(error.response?.data?.error || 'Failed to load templates.');
        }
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const safeTemplateId = toSafeString(selectedTemplateId);
    if (!safeTemplateId) {
      setSelectedTemplate(null);
      setTemplateError('');
      return;
    }

    let cancelled = false;
    setTemplateLoading(true);
    setTemplateError('');
    setCreateError('');

    const loadTemplate = async () => {
      try {
        const template = await getWorkspaceTemplateDefinition(safeTemplateId);
        if (cancelled) return;
        setSelectedTemplate(template || null);
        setConceptName(toSafeString(template?.name));
      } catch (error) {
        if (!cancelled) {
          setTemplateError(error.response?.data?.error || 'Failed to load template details.');
          setSelectedTemplate(null);
        }
      } finally {
        if (!cancelled) setTemplateLoading(false);
      }
    };

    loadTemplate();
    return () => {
      cancelled = true;
    };
  }, [open, selectedTemplateId]);

  const selectedTemplateSummary = useMemo(
    () => templates.find(template => String(template.id) === String(selectedTemplateId)) || null,
    [templates, selectedTemplateId]
  );

  if (!open) return null;

  const handleCreate = async () => {
    const templateId = toSafeString(selectedTemplateId);
    const safeName = toSafeString(conceptName);
    if (!templateId || !safeName) return;

    setCreating(true);
    setCreateError('');
    try {
      const payload = createTarget === TEMPLATE_TARGETS.notebook
        ? { target: 'notebook', notebookTitle: safeName }
        : { target: 'concept', conceptName: safeName };
      const created = await createWorkspaceFromTemplate(templateId, payload);
      if (onCreated) onCreated({ target: createTarget, ...(created || {}) });
      if (onClose) onClose();
    } catch (error) {
      setCreateError(error.response?.data?.error || 'Failed to create workspace from template.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" data-testid="concept-template-picker-modal">
      <div className="modal-content modal-content--wide concept-template-modal">
        <div className="modal-header concept-template-modal__header">
          <div>
            <h3>Start With a Template</h3>
            <p className="muted small">Create a concept workspace or notebook with starter structure.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close template picker">×</button>
        </div>

        <div className="concept-template-modal__body">
          <aside className="concept-template-modal__list" aria-label="Template list">
            {templatesLoading && <p className="muted small">Loading templates…</p>}
            {templatesError && <p className="status-message error-message">{templatesError}</p>}
            {!templatesLoading && !templatesError && templates.length === 0 && (
              <p className="muted small">No templates available.</p>
            )}
            {templates.map((template) => {
              const isActive = String(template.id) === String(selectedTemplateId);
              return (
                <button
                  key={template.id}
                  type="button"
                  className={`concept-template-modal__template-card ${isActive ? 'is-active' : ''}`}
                  onClick={() => setSelectedTemplateId(String(template.id || ''))}
                  data-testid={`template-card-${template.id}`}
                >
                  <div className="concept-template-modal__template-head">
                    <span className="concept-template-modal__template-icon" aria-hidden="true">{template.icon || '📌'}</span>
                    <div className="concept-template-modal__template-name">{template.name || template.id}</div>
                  </div>
                  <div className="concept-template-modal__template-description">{template.description || ''}</div>
                </button>
              );
            })}
          </aside>

          <section className="concept-template-modal__preview" aria-live="polite">
            {templateLoading && <p className="muted small">Loading template preview…</p>}
            {templateError && <p className="status-message error-message">{templateError}</p>}
            {!templateLoading && !templateError && selectedTemplate && (
              <>
                <div className="concept-template-modal__preview-title-row">
                  <h4>{selectedTemplate.icon || selectedTemplateSummary?.icon || '📌'} {selectedTemplate.name}</h4>
                </div>
                <p className="muted">{selectedTemplate.description}</p>

                <div className="concept-template-modal__target-section">
                  <span className="muted-label">Create as</span>
                  <div className="concept-template-modal__target-toggle" role="tablist" aria-label="Template target type">
                    <button
                      type="button"
                      className={`concept-template-modal__target-button ${createTarget === TEMPLATE_TARGETS.concept ? 'is-active' : ''}`}
                      role="tab"
                      aria-selected={createTarget === TEMPLATE_TARGETS.concept}
                      onClick={() => setCreateTarget(TEMPLATE_TARGETS.concept)}
                      data-testid="template-target-concept"
                    >
                      Concept workspace
                    </button>
                    <button
                      type="button"
                      className={`concept-template-modal__target-button ${createTarget === TEMPLATE_TARGETS.notebook ? 'is-active' : ''}`}
                      role="tab"
                      aria-selected={createTarget === TEMPLATE_TARGETS.notebook}
                      onClick={() => setCreateTarget(TEMPLATE_TARGETS.notebook)}
                      data-testid="template-target-notebook"
                    >
                      Notebook
                    </button>
                  </div>
                </div>

                <label className="feedback-field concept-template-modal__name-field">
                  <span>{createTarget === TEMPLATE_TARGETS.notebook ? 'Notebook title' : 'Concept name'}</span>
                  <input
                    type="text"
                    value={conceptName}
                    onChange={(event) => setConceptName(event.target.value)}
                    placeholder={createTarget === TEMPLATE_TARGETS.notebook ? 'Enter notebook title' : 'Enter concept name'}
                    data-testid="template-concept-name-input"
                  />
                </label>

                <div className="concept-template-modal__section">
                  <div className="muted-label">Sections</div>
                  <div className="concept-template-modal__chips">
                    {(selectedTemplate.groups || []).map((group) => (
                      <span key={`${selectedTemplate.id}-group-${group.id}`} className="concept-template-modal__chip">
                        {group.title}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="concept-template-modal__section">
                  <div className="muted-label">Sample entries</div>
                  <ul className="concept-template-modal__sample-list" data-testid="template-sample-list">
                    {(selectedTemplate.sampleEntries || []).map((entry, index) => (
                      <li key={`${selectedTemplate.id}-sample-${index}`}>
                        <strong>{entry.title}</strong>
                        <p className="muted small">{entry.content}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="concept-template-modal__section">
                  <div className="muted-label">Workflow tips</div>
                  <ul className="concept-template-modal__tips" data-testid="template-workflow-tips">
                    {(selectedTemplate.workflowTips || []).map((tip, index) => (
                      <li key={`${selectedTemplate.id}-tip-${index}`}>{tip}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </section>
        </div>

        {createError && <p className="status-message error-message">{createError}</p>}

        <div className="modal-actions concept-template-modal__actions">
          <QuietButton onClick={onClose} disabled={creating}>Cancel</QuietButton>
          <Button
            onClick={handleCreate}
            disabled={creating || !toSafeString(selectedTemplateId) || !toSafeString(conceptName)}
            data-testid="create-template-workspace-button"
          >
            {creating ? 'Creating…' : (createTarget === TEMPLATE_TARGETS.notebook ? 'Create notebook' : 'Create workspace')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConceptTemplatePickerModal;
