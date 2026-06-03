const appendQueryParam = (path = '', key = '', value = '') => {
  const [pathname, search = ''] = String(path || '').split('?');
  const params = new URLSearchParams(search);
  params.set(key, value);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

export const buildReferenceHandoffPath = ({ pathname = '', search = '' } = {}) => {
  const safePathname = pathname || '';
  const safeSearch = search || '';

  if (safePathname.startsWith('/wiki')) {
    const params = new URLSearchParams(safeSearch);
    params.set('pane', 'chat');
    params.set('pull', '1');
    return `/wiki/workspace?${params.toString()}`;
  }

  if (safePathname.startsWith('/think')) {
    return appendQueryParam(`${safePathname || '/think'}${safeSearch}`, 'pull', '1');
  }

  if (safePathname.startsWith('/library')) {
    const params = new URLSearchParams(safeSearch);
    if (params.get('articleId')) {
      params.set('pull', '1');
      return `/library?${params.toString()}`;
    }
  }

  return '/think?tab=home&pull=1';
};

export default buildReferenceHandoffPath;
