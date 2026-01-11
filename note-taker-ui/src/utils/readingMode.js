export const getContextPanelOpen = ({ hasSelection, storedOpen, userOverride }) => {
  if (!hasSelection) return storedOpen;
  if (userOverride) return storedOpen;
  return false;
};
