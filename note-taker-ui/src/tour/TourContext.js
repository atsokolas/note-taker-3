import { createContext } from 'react';

/**
 * TourContext lives apart from TourProvider so that consumers which only need to
 * read it — useTourSignal, mounted at action sites all over the app — do not pull
 * the tour API layer (and axios) in through the import graph.
 */
const TourContext = createContext(null);

export default TourContext;
export { TourContext };
