import {
  NOEIS_SURFACE_DEFINITIONS,
  resolveNoeisSurfaceDefinition
} from '../system/noeisSurfaceDefinitions';

export const NOEIS_ROOMS = Object.freeze(Object.fromEntries(
  NOEIS_SURFACE_DEFINITIONS
    .filter(item => item.room)
    .map(item => [item.room, Object.freeze({
      id: item.room,
      label: item.name,
      verb: item.verb,
      orientation: item.orientation
    })])
));

const DEFAULT_SURFACE = Object.freeze({
  room: '',
  label: '',
  verb: '',
  orientation: '',
  objectType: '',
  objectId: '',
  title: ''
});

export const resolveNoeisRoom = (pathname = '') => {
  const definition = resolveNoeisSurfaceDefinition(pathname);
  return definition ? NOEIS_ROOMS[definition.room] : null;
};

export const buildNoeisSurface = ({ pathname = '', descriptor = null } = {}) => {
  const room = resolveNoeisRoom(pathname);
  const declared = descriptor && typeof descriptor === 'object' ? descriptor : {};
  return {
    ...DEFAULT_SURFACE,
    ...(room ? {
      room: room.id,
      label: room.label,
      verb: room.verb,
      orientation: room.orientation
    } : {}),
    ...declared,
    room: declared.room || room?.id || ''
  };
};

export default buildNoeisSurface;
