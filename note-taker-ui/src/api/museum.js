import api from '../api';

/* Your own museum is read once and shared by every "Hang in museum" on the
   page, so each one can say whether its piece is already on the wall. Any
   change re-reads it and tells them all. */
let mine = null;
const listeners = new Set();

export const readOwnMuseum = () => {
  mine ||= api.get('/api/museum').then(({ data }) => data).catch((error) => { mine = null; throw error; });
  return mine;
};

export const onOwnMuseum = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const changed = async (request) => {
  const { data } = await request;
  mine = null;
  readOwnMuseum().then(fresh => listeners.forEach(listener => listener(fresh))).catch(() => {});
  return data;
};

export const readSource = async (kind, id) => (
  (await api.get(`/api/museum/sources/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`)).data
);

export const hangPiece = piece => changed(api.post('/api/museum/pieces', piece));
export const editPiece = (accession, detail) => changed(api.patch(`/api/museum/pieces/${encodeURIComponent(accession)}`, detail));
export const takeDown = accession => changed(api.delete(`/api/museum/pieces/${encodeURIComponent(accession)}`));
export const rehang = order => changed(api.put('/api/museum/order', { order }));
export const saveMuseum = settings => changed(api.put('/api/museum', settings));

// A museum someone opened, read without an account.
export const readMuseum = async handle => (
  (await api.get(`/api/public/museums/${encodeURIComponent(handle)}`, { skipAuthHandling: true })).data?.museum || null
);
