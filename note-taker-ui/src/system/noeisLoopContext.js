import { createContext, useContext } from 'react';
import { createCheckingLoopSnapshot } from './noeisLoopModel';

export const DEFAULT_NOEIS_LOOP_VALUE = Object.freeze({
  provided: false,
  loading: true,
  error: '',
  generatedAt: '',
  loops: createCheckingLoopSnapshot(),
  refresh: async () => {}
});

export const NoeisLoopContext = createContext(DEFAULT_NOEIS_LOOP_VALUE);
export const useNoeisLoops = () => useContext(NoeisLoopContext);

export default NoeisLoopContext;
