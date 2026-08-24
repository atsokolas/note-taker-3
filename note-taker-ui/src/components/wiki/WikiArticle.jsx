import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { wikiPageEditPath } from '../../utils/wikiFeatureFlags';
import WikiPageReadView from './WikiPageReadView';

/*
 * The routed reader is an address adapter, not a second Wiki renderer.
 *
 * WikiPageReadView already owns the durable reading contract: ordinary pages
 * get an article and contents rail, while repository wikis and investment
 * dossiers keep their specialized projections. Keeping another article
 * renderer here made the same accepted page look different depending on which
 * link opened it and steadily forked citations, maintenance, and typography.
 */
const WikiArticle = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  return (
    <WikiPageReadView
      pageId={id}
      onEdit={() => navigate(wikiPageEditPath(id))}
    />
  );
};

export default WikiArticle;
