import React, { useEffect, useRef, useState } from 'react';
import { alreadyUsedHere } from '../../../utils/libraryPassageUse';
import {
  INQUIRY_SCOPE_LINE,
  bindInquiryToCurrentQuestion,
  emptyInquiry,
  inquiryAddressesEarlierWording,
  normalizeInquiry,
  runLibraryInquiry,
  stoppedInquiryRun
} from '../../../utils/questionInquiry';
import { searchKeyword } from '../../../api/retrieval';

const enoughLine = (enough) => (
  String(enough || '').trim()
    ? `You said this would be enough: ${enough.trim()}`
    : 'Nothing named yet that would be enough.'
);

const statusLine = ({ looking, run }) => {
  if (looking) return 'Looking through your Library.';
  const lines = {
    stopped: run.silence || 'Stopped.',
    partial: 'A partial result. It still belongs to the wording that was asked.',
    miss: run.silence || 'Nothing useful came back.',
    complete: run.boundQuestion ? `This looked for “${run.boundQuestion}”.` : '',
    idle: ''
  };
  return Object.prototype.hasOwnProperty.call(lines, run.status) ? lines[run.status] : '';
};

export default function QuestionInquiry({
  question,
  boundQuestion = '',
  excluded = [],
  onSave,
  onPlace,
  search = searchKeyword
}) {
  const inquiry = normalizeInquiry(question?.inquiry || emptyInquiry());
  const [brief, setBrief] = useState(inquiry.brief);
  const [looking, setLooking] = useState(false);
  const cancelled = useRef(false);
  const lookingRef = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    setBrief(inquiry.brief);
  }, [question?._id, inquiry.brief]);

  useEffect(() => () => {
    cancelled.current = true;
    lookingRef.current = false;
  }, []);

  if (!question?._id) return null;

  const persist = (next) => {
    onSave?.(normalizeInquiry({
      ...inquiry,
      brief: String(brief || '').trim(),
      ...next
    }));
  };

  const look = async () => {
    if (lookingRef.current) return;
    const gen = ++generation.current;
    cancelled.current = false;
    lookingRef.current = true;
    setLooking(true);
    persist({ brief: String(brief || '').trim() });
    try {
      const run = await runLibraryInquiry({
        search,
        brief,
        question: boundQuestion || question.text,
        enough: question.settledBy,
        cancelled
      });
      if (gen !== generation.current) return;
      persist({ brief: String(brief || '').trim(), run });
    } finally {
      if (gen === generation.current) {
        lookingRef.current = false;
        setLooking(false);
      }
    }
  };

  const stop = () => {
    if (!lookingRef.current) return;
    generation.current += 1;
    cancelled.current = true;
    lookingRef.current = false;
    setLooking(false);
    persist({
      brief: String(brief || '').trim(),
      run: stoppedInquiryRun({
        question: boundQuestion || question.text,
        brief,
        enough: question.settledBy
      })
    });
  };

  const keepWithCurrentQuestion = () => {
    persist({
      run: bindInquiryToCurrentQuestion(inquiry.run, boundQuestion || question.text)
    });
  };

  const run = inquiry.run;
  const earlier = inquiryAddressesEarlierWording(run, boundQuestion || question.text);
  const message = statusLine({ looking, run });

  return (
    <section className="question-inquiry" aria-label="Look through your Library">
      <h3>Look through your Library</h3>
      <p className="question-inquiry__scope">{INQUIRY_SCOPE_LINE}</p>
      <label className="question-inquiry__label">
        <span>In ordinary language</span>
        <textarea
          className="noeis-form-control question-inquiry__field"
          rows={3}
          value={brief}
          placeholder="Find an example that separates patience from avoidance."
          onChange={(event) => setBrief(event.target.value)}
          onBlur={() => {
            if (String(brief || '').trim() === inquiry.brief) return;
            persist({ brief: String(brief || '').trim() });
          }}
        />
      </label>
      <p className="question-inquiry__enough">{enoughLine(question.settledBy)}</p>
      <div className="question-inquiry__actions">
        {looking ? (
          <button type="button" onClick={stop}>Stop</button>
        ) : (
          <button type="button" onClick={look} disabled={!String(brief || '').trim()}>
            {run.id ? 'Look again' : 'Look through your Library'}
          </button>
        )}
      </div>
      {message ? <p className="question-inquiry__status">{message}</p> : null}
      {!looking && run.status !== 'idle' && run.boundEnough ? (
        <p className="question-inquiry__enough">Enough then: {run.boundEnough}</p>
      ) : null}
      {earlier && !looking ? (
        <div className="question-inquiry__earlier">
          <p>
            The question has changed. This result still belongs to
            {' '}
            “{run.boundQuestion}”.
          </p>
          <button type="button" onClick={keepWithCurrentQuestion}>
            Keep with this question
          </button>
        </div>
      ) : null}
      {run.passages.length ? (
        <ul className="question-inquiry__passages">
          {run.passages.map((row) => {
            const used = alreadyUsedHere(row, excluded);
            return (
              <li key={row.key || `${row.articleId}:${row.highlightId}:${row.passage}`}>
                <p className="question-inquiry__source">{row.title}</p>
                <blockquote>{row.passage}</blockquote>
                <div className="question-inquiry__passage-actions">
                  {row.href ? (
                    <a href={row.href}>Open in Library</a>
                  ) : null}
                  <button
                    type="button"
                    disabled={used}
                    onClick={() => onPlace?.(row)}
                  >
                    Place beside the question
                  </button>
                  {used ? (
                    <span className="question-inquiry__quiet">You already used this here.</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {run.gaps ? <p className="question-inquiry__gaps">{run.gaps}</p> : null}
    </section>
  );
}
