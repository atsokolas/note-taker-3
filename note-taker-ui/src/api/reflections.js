import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/**
 * @typedef {Object} ReflectionConcept
 * @property {string} name
 * @property {string} description
 * @property {number} highlightsCount
 * @property {number} notesCount
 * @property {number} questionsOpenCount
 * @property {string} [lastActivityAt]
 */

/**
 * @typedef {Object} ReflectionNote
 * @property {string} id
 * @property {string} title
 * @property {string} updatedAt
 * @property {string} snippet
 * @property {string[]} conceptMentions
 */

/**
 * @typedef {Object} ReflectionQuestion
 * @property {string} id
 * @property {string} text
 * @property {string} linkedTagName
 * @property {string} updatedAt
 * @property {string} [linkedNotebookEntryId]
 */

/**
 * @typedef {Object} ReflectionResponse
 * @property {number} rangeDays
 * @property {ReflectionConcept[]} activeConcepts
 * @property {ReflectionNote[]} notesInProgress
 * @property {{ groups: { concept: string, questions: ReflectionQuestion[] }[] }} openQuestions
 * @property {string[]} deltaSummary
 */

export const getReflections = async (range = '14d') => {
  const res = await api.get(`/api/reflections?range=${encodeURIComponent(range)}`, getAuthHeaders());
  return res.data;
};
