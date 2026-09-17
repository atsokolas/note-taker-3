import React, { cloneElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const allowed = new Set(['lineage', 'stress', 'watch', 'public', 'portable']);

const JudgmentContextTools = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const routedActive = params.get('context') === 'judgment-tool' && allowed.has(params.get('contextTool'))
    ? params.get('contextTool')
    : '';
  const [localActive, setLocalActive] = useState(routedActive);
  const active = routedActive || localActive;
  const depth = active ? Math.max(0, Number(location.state?.judgmentContextDepth) || 0) : 0;

  useEffect(() => {
    if (routedActive) setLocalActive(routedActive);
    else if (params.get('context') !== 'judgment-tool') setLocalActive('');
  }, [params, routedActive]);

  const close = useCallback(() => {
    setLocalActive('');
    if (depth > 0) {
      navigate(-depth);
      return;
    }
    const next = new URLSearchParams(location.search);
    next.delete('context');
    next.delete('contextTool');
    navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { replace: true });
  }, [depth, location.hash, location.pathname, location.search, navigate]);

  const setActive = useCallback((id, nextOpen) => {
    if (!nextOpen) {
      close();
      return;
    }
    setLocalActive(id);
    const next = new URLSearchParams(location.search);
    ['observation', 'contextView', 'sourceEvent'].forEach(key => next.delete(key));
    next.set('context', 'judgment-tool');
    next.set('contextTool', id);
    navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, {
      state: { ...location.state, judgmentContextDepth: 1 }
    });
  }, [close, location.hash, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const mobile = window.matchMedia?.('(max-width: 640px)')?.matches;
    const background = [];
    if (mobile && rootRef.current) {
      let branch = rootRef.current;
      while (branch.parentElement && branch !== document.body) {
        const parent = branch.parentElement;
        for (const node of parent.children) {
          if (node !== branch) background.push({ node, inert: node.inert, ariaHidden: node.getAttribute('aria-hidden') });
        }
        branch = parent;
      }
      background.forEach(({ node }) => {
        node.inert = true;
        node.setAttribute('aria-hidden', 'true');
      });
      document.body.classList.add('judgment-context-open');
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('judgment-context-open');
      background.forEach(({ node, inert, ariaHidden }) => {
        node.inert = inert;
        if (ariaHidden == null) node.removeAttribute('aria-hidden');
        else node.setAttribute('aria-hidden', ariaHidden);
      });
    };
  }, [active, close]);

  return (
    <div ref={rootRef} className={`judgment-tools judgment-context-tools${active ? ' is-open' : ''}`} role="group" aria-label="What you can still do">
      {active ? <button type="button" className="judgment-context-tools__close" onClick={close}>Close context</button> : null}
      {React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        const id = child.props.contextId;
        if (!id) return active ? null : child;
        if (active && id !== active) return null;
        return cloneElement(child, {
          expanded: active === id,
          onExpandedChange: next => setActive(id, next)
        });
      })}
    </div>
  );
};

export default JudgmentContextTools;
