const express = require('express');

const buildAiInsightsRouter = ({
  mongoose,
  authenticateToken,
  Article,
  TagMeta,
  Question,
  NotebookEntry,
  buildRangeStart,
  buildEmbeddingId,
  aiGetEmbeddings,
  labelCluster,
  kMeans,
  cosineSimilarity,
  fetchSimilarEmbeddings,
  getObjectIdFromEmbedding,
  findHighlightById,
  EmbeddingError,
  sendEmbeddingError,
  fetchHighlightsByIds,
  buildSnippet,
  applySynthesisLimits,
  parseAiServiceUrl,
  joinUrl,
  toPositiveInt,
  aiEmbedTexts,
  sentimentScore,
  extractQuestions,
  ensureBestEffortSynthesis,
  aiSemanticSearch,
  hydrateSemanticResults,
  isGenerationEnabled,
  generateDraftInsights
}) => {
  const router = express.Router();

  router.get('/api/ai/themes', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const range = String(req.query.range || '7d');
      const limit = 500;
      const since = buildRangeStart(range);
      const highlights = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.createdAt': { $gte: since } } },
        { $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          tags: '$highlights.tags',
          articleId: '$_id',
          articleTitle: '$title',
          createdAt: '$highlights.createdAt'
        } },
        { $sort: { 'highlights.createdAt': -1 } },
        { $limit: limit }
      ]);
      if (!highlights.length) {
        return res.status(200).json({ clusters: [] });
      }
      const embeddingIds = highlights.map(h => buildEmbeddingId({
        userId: String(userId),
        objectType: 'highlight',
        objectId: String(h._id)
      }));
      const embedResponse = await aiGetEmbeddings(embeddingIds, { requestId: req.requestId });
      const embedItems = Array.isArray(embedResponse?.results) ? embedResponse.results : [];
      const embeddingMap = new Map(embedItems.map(item => [item.id, item.embedding]));
      const vectors = [];
      const highlightRecords = [];
      highlights.forEach((highlight) => {
        const id = buildEmbeddingId({
          userId: String(userId),
          objectType: 'highlight',
          objectId: String(highlight._id)
        });
        const vector = embeddingMap.get(id);
        if (!vector) return;
        vectors.push(vector);
        highlightRecords.push({
          id: String(highlight._id),
          text: highlight.text || '',
          tags: highlight.tags || [],
          articleId: String(highlight.articleId),
          articleTitle: highlight.articleTitle || ''
        });
      });
      if (vectors.length < 3) {
        return res.status(200).json({
          clusters: vectors.length ? [{
            title: labelCluster(highlightRecords),
            highlightIds: highlightRecords.map(h => h.id),
            topTags: [],
            representativeHighlights: highlightRecords.slice(0, 5)
          }] : []
        });
      }
      const k = Math.min(7, Math.max(2, Math.round(Math.sqrt(vectors.length / 2))));
      const { centroids, assignments } = kMeans(vectors, k);
      const clusterMap = new Map();
      assignments.forEach((clusterIdx, idx) => {
        if (!clusterMap.has(clusterIdx)) clusterMap.set(clusterIdx, []);
        clusterMap.get(clusterIdx).push({ vector: vectors[idx], highlight: highlightRecords[idx] });
      });
      const clusters = Array.from(clusterMap.entries()).map(([clusterIdx, items]) => {
        const highlightsForCluster = items.map(item => item.highlight);
        const tagCounts = new Map();
        highlightsForCluster.forEach(item => {
          (item.tags || []).forEach(tag => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          });
        });
        const topTags = Array.from(tagCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tag]) => tag);
        const centroid = centroids[clusterIdx];
        const sorted = items
          .map(item => ({
            highlight: item.highlight,
            score: cosineSimilarity(item.vector, centroid)
          }))
          .sort((a, b) => b.score - a.score)
          .map(item => item.highlight);
        return {
          title: labelCluster(highlightsForCluster),
          highlightIds: highlightsForCluster.map(h => h.id),
          topTags,
          representativeHighlights: sorted.slice(0, 5)
        };
      }).sort((a, b) => b.highlightIds.length - a.highlightIds.length);
      res.status(200).json({ clusters: clusters.slice(0, 7) });
    } catch (error) {
      if (error.payload || error instanceof EmbeddingError) {
        return sendEmbeddingError(res, error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/ai/connections', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const limit = Math.min(Number(req.query.limit) || 20, 40);
      const concepts = await TagMeta.find({ userId })
        .select('name description')
        .limit(50);
      if (concepts.length < 2) {
        return res.status(200).json({ pairs: [] });
      }
      const embeddingIds = concepts.map(concept => buildEmbeddingId({
        userId: String(userId),
        objectType: 'concept',
        objectId: String(concept._id)
      }));
      const embedResponse = await aiGetEmbeddings(embeddingIds, { requestId: req.requestId });
      const embedItems = Array.isArray(embedResponse?.results) ? embedResponse.results : [];
      const embeddingMap = new Map(embedItems.map(item => [item.id, item.embedding]));
      const conceptVectors = concepts.map((concept) => ({
        id: String(concept._id),
        name: concept.name,
        embeddingId: buildEmbeddingId({
          userId: String(userId),
          objectType: 'concept',
          objectId: String(concept._id)
        }),
        vector: embeddingMap.get(buildEmbeddingId({
          userId: String(userId),
          objectType: 'concept',
          objectId: String(concept._id)
        })) || null
      })).filter(item => item.vector);
      const pairs = [];
      for (let i = 0; i < conceptVectors.length; i += 1) {
        for (let j = i + 1; j < conceptVectors.length; j += 1) {
          const score = cosineSimilarity(conceptVectors[i].vector, conceptVectors[j].vector);
          pairs.push({
            conceptA: conceptVectors[i],
            conceptB: conceptVectors[j],
            score
          });
        }
      }
      const topPairs = pairs.sort((a, b) => b.score - a.score).slice(0, limit);
      const hydrated = await Promise.all(topPairs.map(async (pair) => {
        const [aSimilar, bSimilar] = await Promise.all([
          fetchSimilarEmbeddings({
            userId,
            sourceId: pair.conceptA.embeddingId,
            types: ['highlight'],
            limit: 20,
            requestId: req.requestId
          }),
          fetchSimilarEmbeddings({
            userId,
            sourceId: pair.conceptB.embeddingId,
            types: ['highlight'],
            limit: 20,
            requestId: req.requestId
          })
        ]);
        const toIds = (items) => new Set(
          items
            .map(item => getObjectIdFromEmbedding(item))
            .filter(Boolean)
        );
        const setA = toIds(aSimilar);
        const sharedIds = Array.from(setA).filter(id => toIds(bSimilar).has(id));
        const sharedHighlights = await Promise.all(
          sharedIds.slice(0, 5).map(async (id) => {
            const highlight = await findHighlightById(userId, id);
            if (!highlight) return null;
            return {
              objectId: String(highlight._id),
              title: highlight.text || 'Highlight',
              snippet: highlight.articleTitle || '',
              metadata: {
                articleId: highlight.articleId,
                articleTitle: highlight.articleTitle,
                tags: highlight.tags || []
              }
            };
          })
        );
        return {
          conceptA: { id: pair.conceptA.id, name: pair.conceptA.name },
          conceptB: { id: pair.conceptB.id, name: pair.conceptB.name },
          score: pair.score,
          sharedSuggestedHighlights: sharedHighlights.filter(Boolean)
        };
      }));
      res.status(200).json({ pairs: hydrated });
    } catch (error) {
      if (error.payload || error instanceof EmbeddingError) {
        return sendEmbeddingError(res, error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/ai/synthesize', authenticateToken, async (req, res) => {
    try {
      const routeStartedAt = Date.now();
      const userId = req.user.id;
      const {
        scopeType = 'custom',
        scopeId = '',
        itemIds = [],
        range
      } = req.body || {};

      const scopeSets = {
        highlight: new Set(),
        article: new Set(),
        notebook: new Set(),
        question: new Set(),
        concept: new Set()
      };
      const sourceTexts = [];
      const highlightRecords = [];
      const synthesisItems = [];
      let synthesisOrder = 0;

      const addSynthesisItem = ({ type, id, text, createdAt }) => {
        const cleanText = String(text || '').trim();
        if (!cleanText) return;
        synthesisItems.push({
          type: String(type || 'text'),
          id: String(id || ''),
          text: cleanText,
          createdAt: createdAt ? new Date(createdAt).getTime() : null,
          order: synthesisOrder
        });
        synthesisOrder += 1;
      };

      const addHighlightRecord = (highlight) => {
        if (!highlight) return;
        const id = String(highlight._id || highlight.objectId || '');
        if (!id) return;
        if (scopeSets.highlight.has(id)) return;
        scopeSets.highlight.add(id);
        highlightRecords.push({
          id,
          text: highlight.text || '',
          note: highlight.note || '',
          tags: highlight.tags || [],
          articleId: String(highlight.articleId || ''),
          articleTitle: highlight.articleTitle || '',
          createdAt: highlight.createdAt || null
        });
        const highlightText = [highlight.text, highlight.note].filter(Boolean).join(' ');
        sourceTexts.push(highlightText);
        addSynthesisItem({
          type: 'highlight',
          id,
          text: highlightText,
          createdAt: highlight.createdAt
        });
      };

      if (scopeType === 'range') {
        const since = buildRangeStart(range || '7d');
        const highlights = await Article.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(userId) } },
          { $unwind: '$highlights' },
          { $match: { 'highlights.createdAt': { $gte: since } } },
          { $project: {
            _id: '$highlights._id',
            text: '$highlights.text',
            note: '$highlights.note',
            tags: '$highlights.tags',
            articleId: '$_id',
            articleTitle: '$title',
            createdAt: '$highlights.createdAt'
          } },
          { $limit: 300 }
        ]);
        highlights.forEach(addHighlightRecord);
      } else if (scopeType === 'concept') {
        const query = mongoose.Types.ObjectId.isValid(scopeId)
          ? { _id: scopeId, userId }
          : { name: scopeId, userId };
        const concept = await TagMeta.findOne(query)
          .select('name description pinnedHighlightIds');
        if (!concept) {
          return res.status(404).json({ error: 'Concept not found.' });
        }
        scopeSets.concept.add(String(concept._id || concept.name));
        const conceptText = `${concept.name}\n${concept.description || ''}`;
        sourceTexts.push(conceptText);
        addSynthesisItem({
          type: 'concept',
          id: concept._id || concept.name,
          text: conceptText
        });
        const pinned = await fetchHighlightsByIds(userId, concept.pinnedHighlightIds || []);
        pinned.forEach(addHighlightRecord);
        if (pinned.length === 0 && concept.name) {
          const tagged = await Article.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            { $unwind: '$highlights' },
            { $match: { 'highlights.tags': concept.name } },
            { $project: {
              _id: '$highlights._id',
              text: '$highlights.text',
              note: '$highlights.note',
              tags: '$highlights.tags',
              articleId: '$_id',
              articleTitle: '$title',
              createdAt: '$highlights.createdAt'
            } },
            { $limit: 200 }
          ]);
          tagged.forEach(addHighlightRecord);
        }
      } else if (scopeType === 'question') {
        const question = await Question.findOne({ _id: scopeId, userId })
          .select('text blocks linkedHighlightIds');
        if (!question) {
          return res.status(404).json({ error: 'Question not found.' });
        }
        scopeSets.question.add(String(question._id));
        sourceTexts.push(question.text || '');
        addSynthesisItem({
          type: 'question',
          id: question._id,
          text: question.text || ''
        });
        const highlightIds = new Set(question.linkedHighlightIds || []);
        (question.blocks || []).forEach((block, idx) => {
          if (block.highlightId) highlightIds.add(block.highlightId);
          if (block.text) {
            sourceTexts.push(block.text);
            addSynthesisItem({
              type: 'question-block',
              id: block.id || `${question._id}-block-${idx}`,
              text: block.text
            });
          }
        });
        const highlights = await fetchHighlightsByIds(userId, Array.from(highlightIds));
        highlights.forEach(addHighlightRecord);
      } else if (scopeType === 'notebook') {
        const entry = await NotebookEntry.findOne({ _id: scopeId, userId })
          .select('title blocks linkedHighlightIds');
        if (!entry) {
          return res.status(404).json({ error: 'Notebook entry not found.' });
        }
        scopeSets.notebook.add(String(entry._id));
        sourceTexts.push(entry.title || '');
        addSynthesisItem({
          type: 'notebook',
          id: entry._id,
          text: entry.title || ''
        });
        const highlightIds = new Set(entry.linkedHighlightIds || []);
        (entry.blocks || []).forEach((block, idx) => {
          if (block.highlightId) highlightIds.add(block.highlightId);
          if (block.text) {
            sourceTexts.push(block.text);
            addSynthesisItem({
              type: 'notebook-block',
              id: block.id || `${entry._id}-block-${idx}`,
              text: block.text
            });
          }
        });
        const highlights = await fetchHighlightsByIds(userId, Array.from(highlightIds));
        highlights.forEach(addHighlightRecord);
      } else if (scopeType === 'custom' && Array.isArray(itemIds)) {
        for (const item of itemIds) {
          const objectType = item?.objectType;
          const objectId = item?.objectId;
          if (!objectType || !objectId) continue;
          if (objectType === 'highlight') {
            const highlight = await findHighlightById(userId, objectId);
            addHighlightRecord(highlight);
          }
          if (objectType === 'article') {
            const article = await Article.findOne({ _id: objectId, userId }).select('title content');
            if (article) {
              scopeSets.article.add(String(article._id));
              const articleText = `${article.title}\n${buildSnippet(article.content || '', 400)}`;
              sourceTexts.push(articleText);
              addSynthesisItem({
                type: 'article',
                id: article._id,
                text: articleText
              });
            }
          }
          if (objectType === 'concept') {
            const concept = await TagMeta.findOne({ _id: objectId, userId }).select('name description');
            if (concept) {
              scopeSets.concept.add(String(concept._id));
              const conceptText = `${concept.name}\n${concept.description || ''}`;
              sourceTexts.push(conceptText);
              addSynthesisItem({
                type: 'concept',
                id: concept._id,
                text: conceptText
              });
            }
          }
          if (objectType === 'question') {
            const question = await Question.findOne({ _id: objectId, userId }).select('text');
            if (question) {
              scopeSets.question.add(String(question._id));
              sourceTexts.push(question.text || '');
              addSynthesisItem({
                type: 'question',
                id: question._id,
                text: question.text || ''
              });
            }
          }
          if (objectType === 'notebook') {
            const entry = await NotebookEntry.findOne({ _id: objectId, userId }).select('title blocks');
            if (entry) {
              scopeSets.notebook.add(String(entry._id));
              sourceTexts.push(entry.title || '');
              addSynthesisItem({
                type: 'notebook',
                id: entry._id,
                text: entry.title || ''
              });
              (entry.blocks || []).forEach((block, idx) => {
                if (block.text) {
                  sourceTexts.push(block.text);
                  addSynthesisItem({
                    type: 'notebook-block',
                    id: block.id || `${entry._id}-block-${idx}`,
                    text: block.text
                  });
                }
              });
            }
          }
        }
      }

      const synthLimits = {
        maxItems: process.env.AI_SYNTH_MAX_ITEMS,
        maxTotalChars: process.env.AI_SYNTH_MAX_CHARS,
        maxItemChars: process.env.AI_SYNTH_MAX_ITEM_CHARS
      };
      const { items: synthItems, stats: synthStats } = applySynthesisLimits(synthesisItems, synthLimits);
      const { origin: upstreamOrigin, hasPath: upstreamHasPath } = parseAiServiceUrl(
        process.env.AI_SERVICE_URL || ''
      );
      const upstreamUrl = upstreamOrigin ? joinUrl(upstreamOrigin, '/synthesize') : '';
      if (upstreamUrl) {
        console.log('AI upstream URL:', upstreamUrl);
      }
      console.log('[AI-SYNTH] payload', {
        route: 'ai_synthesize',
        scopeType,
        scopeId,
        item_count: synthStats.item_count,
        total_chars: synthStats.total_chars,
        max_item_chars: synthStats.max_item_chars,
        upstream_url: upstreamUrl
      });
      if (upstreamHasPath) {
        console.warn('[AI-SYNTH] AI_SERVICE_URL includes a path; using origin only.');
      }

      const vectors = [];
      const vectorHighlights = [];
      const synthesisWarnings = [];

      if (highlightRecords.length > 0) {
        const embedInputs = highlightRecords
          .map(record => ({
            record,
            text: [record.text, record.note].filter(Boolean).join(' ').trim()
          }))
          .filter(item => item.text);
        if (embedInputs.length) {
          let embedResponse;
          try {
            embedResponse = await aiEmbedTexts(
              embedInputs.map(item => item.text),
              { requestId: req.requestId }
            );
          } catch (error) {
            synthesisWarnings.push('embed_unavailable');
            console.warn('[AI-SYNTH] embed unavailable; continuing with text-only synthesis', {
              requestId: req.requestId,
              status: Number(error?.status) || 0
            });
          }
          const embedVectors = Array.isArray(embedResponse?.vectors)
            ? embedResponse.vectors
            : [];
          embedVectors.forEach((vector, idx) => {
            if (!Array.isArray(vector)) return;
            vectors.push(vector);
            vectorHighlights.push(embedInputs[idx].record);
          });
        }
      }

      let themes = [];
      if (vectors.length >= 3) {
        const k = Math.min(5, Math.max(2, Math.round(Math.sqrt(vectors.length / 2))));
        const { centroids, assignments } = kMeans(vectors, k);
        const clusters = new Map();
        assignments.forEach((clusterIdx, idx) => {
          if (!clusters.has(clusterIdx)) clusters.set(clusterIdx, []);
          clusters.get(clusterIdx).push({ vector: vectors[idx], highlight: vectorHighlights[idx] });
        });
        themes = Array.from(clusters.entries()).map(([clusterIdx, items]) => {
          const highlights = items.map(item => item.highlight);
          const centroid = centroids[clusterIdx];
          const ranked = items
            .map(item => ({
              highlight: item.highlight,
              score: cosineSimilarity(item.vector, centroid)
            }))
            .sort((a, b) => b.score - a.score)
            .map(item => item.highlight);
          return {
            title: labelCluster(highlights),
            evidence: highlights.map(h => h.id),
            representative: ranked.slice(0, 4).map(h => h.id)
          };
        });
      } else if (vectorHighlights.length > 0) {
        themes = [{
          title: labelCluster(vectorHighlights),
          evidence: vectorHighlights.map(h => h.id),
          representative: vectorHighlights.map(h => h.id).slice(0, 4)
        }];
      }

      let connections = [];
      if (vectorHighlights.length >= 2) {
        const pairs = [];
        for (let i = 0; i < vectorHighlights.length; i += 1) {
          for (let j = i + 1; j < vectorHighlights.length; j += 1) {
            const sim = cosineSimilarity(vectors[i], vectors[j]);
            if (sim < 0.75) continue;
            const s1 = sentimentScore(vectorHighlights[i].text);
            const s2 = sentimentScore(vectorHighlights[j].text);
            if (s1 === 0 || s2 === 0 || Math.sign(s1) === Math.sign(s2)) continue;
            pairs.push({
              a: vectorHighlights[i],
              b: vectorHighlights[j],
              score: sim
            });
          }
        }
        pairs.sort((a, b) => b.score - a.score);
        pairs.slice(0, 5).forEach(pair => {
          connections.push({
            description: `Possible tension between "${buildSnippet(pair.a.text, 90)}" and "${buildSnippet(pair.b.text, 90)}"`,
            evidence: [pair.a.id, pair.b.id]
          });
        });
      }

      let questions = extractQuestions(sourceTexts);
      if (synthItems.length > 0) {
        const aiSecret = String(process.env.AI_SHARED_SECRET || '').trim();
        if (!upstreamUrl || !aiSecret) {
          synthesisWarnings.push('upstream_not_configured');
          console.warn('[AI-SYNTH] upstream not configured; continuing with local synthesis', {
            requestId: req.requestId
          });
        } else {
          const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
          const synthTimeoutEnv = Number(process.env.AI_SYNTH_UPSTREAM_TIMEOUT_MS || 0);
          const timeoutMs = Number.isFinite(synthTimeoutEnv) && synthTimeoutEnv > 0
            ? Math.floor(synthTimeoutEnv)
            : toPositiveInt(process.env.AI_SERVICE_TIMEOUT_MS, 12000);
          const retryEnv = Number(process.env.AI_SYNTH_UPSTREAM_RETRIES || 0);
          const maxRetries = Number.isFinite(retryEnv)
            ? Math.max(0, Math.min(2, Math.floor(retryEnv)))
            : 0;
          const backoffs = [250, 750].slice(0, maxRetries);
          let synthData = null;
          let synthError = null;
          for (let attempt = 0; attempt <= backoffs.length; attempt += 1) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            try {
              console.log('AI upstream URL:', upstreamUrl);
              const res = await fetch(upstreamUrl, {
                method: 'POST',
                headers: {
                  'x-ai-shared-secret': aiSecret,
                  'Content-Type': 'application/json',
                  'X-Request-Id': req.requestId
                },
                body: JSON.stringify({
                  items: synthItems.map(item => ({
                    type: item.type,
                    id: item.id,
                    text: item.text
                  }))
                }),
                signal: controller.signal
              });
              clearTimeout(timeout);
              const bodyText = await res.text().catch(() => '');
              let parsedBody = null;
              try {
                parsedBody = bodyText ? JSON.parse(bodyText) : null;
              } catch (_err) {
                parsedBody = null;
              }
              const bodySnippet = /<[a-z][\s\S]*>/i.test(String(bodyText || ''))
                ? String(bodyText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
                : String(bodyText || '').slice(0, 200);
              console.log('[AI-SYNTH] upstream response', {
                upstream_url: upstreamUrl,
                status: res.status
              });
              if (!res.ok) {
                console.error('[AI-SYNTH] upstream error', {
                  upstream_url: upstreamUrl,
                  status: res.status,
                  body_snippet: bodySnippet
                });
                if ([429, 502, 503, 504].includes(res.status) && attempt < backoffs.length) {
                  await sleep(backoffs[attempt]);
                  continue;
                }
                synthError = {
                  status: res.status,
                  bodySnippet,
                  body: parsedBody && typeof parsedBody === 'object' ? parsedBody : null
                };
                break;
              }
              try {
                synthData = parsedBody ?? JSON.parse(bodyText);
              } catch (_err) {
                synthError = { status: res.status, bodySnippet };
              }
              break;
            } catch (err) {
              clearTimeout(timeout);
              const isTimeout = err.name === 'AbortError';
              if (isTimeout && attempt < backoffs.length) {
                await sleep(backoffs[attempt]);
                continue;
              }
              synthError = {
                status: isTimeout ? 504 : 502,
                bodySnippet: ''
              };
              break;
            }
          }
          if (synthError || !synthData) {
            synthesisWarnings.push('upstream_generate_failed');
            console.warn('[AI-SYNTH] upstream synthesis failed; continuing with local synthesis', {
              requestId: req.requestId,
              status: Number(synthError?.status) || 0,
              snippet: String(synthError?.bodySnippet || '').slice(0, 120)
            });
          } else {
            const upstreamThemes = Array.isArray(synthData.themes) ? synthData.themes : [];
            const upstreamConnections = Array.isArray(synthData.connections) ? synthData.connections : [];
            const upstreamQuestions = Array.isArray(synthData.questions) ? synthData.questions : [];
            themes = upstreamThemes.map(title => ({
              title,
              evidence: [],
              representative: []
            }));
            connections = upstreamConnections.map(description => ({ description }));
            questions = upstreamQuestions;
          }
        }
      }

      const ensuredSynthesis = ensureBestEffortSynthesis({
        themes,
        connections,
        questions,
        sourceTexts
      });
      themes = ensuredSynthesis.themes;
      connections = ensuredSynthesis.connections;
      questions = ensuredSynthesis.questions;

      const queryText = sourceTexts.slice(0, 6).join(' ');
      let suggestedLinks = [];
      if (queryText.trim()) {
        let response;
        try {
          response = await aiSemanticSearch({
            userId: String(userId),
            query: queryText,
            limit: 12
          }, { requestId: req.requestId });
        } catch (error) {
          synthesisWarnings.push('semantic_links_unavailable');
          console.warn('[AI-SYNTH] semantic links unavailable; returning synthesis without suggested links', {
            requestId: req.requestId,
            status: Number(error?.status) || 0
          });
          response = { results: [] };
        }
        const matches = Array.isArray(response?.results) ? response.results : [];
        const hydrated = await hydrateSemanticResults({ matches, userId });
        suggestedLinks = hydrated
          .filter(item => !scopeSets[item.objectType]?.has(String(item.objectId)))
          .slice(0, 10)
          .map(item => ({
            objectType: item.objectType,
            objectId: item.objectId,
            score: item.score,
            title: item.title,
            snippet: item.snippet,
            metadata: item.metadata || {}
          }));
      }

      let draftInsights = null;
      if (isGenerationEnabled()) {
        try {
          draftInsights = await generateDraftInsights({
            highlights: highlightRecords,
            themes,
            connections,
            questions
          });
        } catch (err) {
          console.error('Draft insights failed:', err);
        }
      }

      res.status(200).json({
        themes,
        connections,
        questions,
        suggestedLinks,
        draftInsights,
        meta: {
          degraded: synthesisWarnings.length > 0,
          warnings: synthesisWarnings,
          latency_ms: Date.now() - routeStartedAt
        }
      });
    } catch (error) {
      if (error.payload || error instanceof EmbeddingError) {
        return sendEmbeddingError(res, error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

module.exports = {
  buildAiInsightsRouter
};
