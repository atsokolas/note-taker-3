import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buildNoeisSurface } from './noeisSurfaceModel';

const NoeisSurfaceContext = createContext(null);

export const NoeisSurfaceProvider = ({ children }) => {
  const location = useLocation();
  const [declaration, setDeclaration] = useState(null);
  const routeKey = `${location.pathname}${location.search}`;
  const previousRouteKey = useRef(routeKey);

  useEffect(() => {
    if (previousRouteKey.current === routeKey) return;
    previousRouteKey.current = routeKey;
    setDeclaration(null);
  }, [routeKey]);

  const declareSurface = useCallback((next) => {
    setDeclaration(next && typeof next === 'object' ? next : null);
  }, []);

  const surface = useMemo(() => buildNoeisSurface({
    pathname: location.pathname,
    descriptor: declaration
  }), [declaration, location.pathname]);

  const value = useMemo(() => ({ surface, declareSurface }), [declareSurface, surface]);
  return <NoeisSurfaceContext.Provider value={value}>{children}</NoeisSurfaceContext.Provider>;
};

export const useNoeisSurfaceState = () => useContext(NoeisSurfaceContext) || {
  surface: buildNoeisSurface(),
  declareSurface: () => {}
};

export const useNoeisSurface = (descriptor = null) => {
  const { surface, declareSurface } = useNoeisSurfaceState();
  const descriptorKey = JSON.stringify(descriptor || null);

  useEffect(() => {
    declareSurface(descriptor ? JSON.parse(descriptorKey) : null);
    return () => declareSurface(null);
  }, [declareSurface, descriptorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return surface;
};

export default NoeisSurfaceContext;
