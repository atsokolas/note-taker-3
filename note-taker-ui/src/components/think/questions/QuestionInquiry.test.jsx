import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionInquiry from './QuestionInquiry';

const question = {
  _id: 'q1',
  text: 'Who bears the downside?',
  settledBy: 'A case where waiting is not hiding.',
  inquiry: { brief: '', scope: 'library', run: { status: 'idle', passages: [] } }
};

describe('QuestionInquiry', () => {
  it('looks through the Library and keeps the result bound to the earlier wording', async () => {
    const onSave = jest.fn();
    const onPlace = jest.fn();
    const search = jest.fn().mockResolvedValue({
      articles: [{
        _id: 'letter',
        title: 'Household letter',
        content: 'Patience is not the same as avoidance.'
      }],
      highlights: []
    });
    const { rerender } = render(
      <QuestionInquiry
        question={question}
        boundQuestion={question.text}
        onSave={onSave}
        onPlace={onPlace}
        search={search}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/patience from avoidance/i), {
      target: { value: 'Find an example that separates patience from avoidance.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look through your Library' }));
    expect(screen.getByText('Looking through your Library.')).toBeInTheDocument();
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      brief: 'Find an example that separates patience from avoidance.',
      run: expect.objectContaining({
        status: 'complete',
        boundQuestion: 'Who bears the downside?',
        passages: [expect.objectContaining({
          title: 'Household letter',
          passage: 'Patience is not the same as avoidance.'
        })]
      })
    })));

    const saved = onSave.mock.calls.at(-1)[0];
    rerender(
      <QuestionInquiry
        question={{ ...question, inquiry: saved }}
        boundQuestion="Whose recoverable mistake is this?"
        onSave={onSave}
        onPlace={onPlace}
        search={search}
      />
    );
    expect(screen.getByText(/still belongs to/)).toHaveTextContent('Who bears the downside?');
    fireEvent.click(screen.getByRole('button', { name: 'Keep with this question' }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({
      run: expect.objectContaining({ boundQuestion: 'Whose recoverable mistake is this?' })
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Place beside the question' }));
    expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({
      articleId: 'letter',
      passage: 'Patience is not the same as avoidance.'
    }));
  });

  it('names a miss instead of inventing a result', async () => {
    const onSave = jest.fn();
    const search = jest.fn().mockResolvedValue({
      articles: [{ _id: 'chores', title: 'Chores', content: 'Tuesday is laundry.' }],
      highlights: []
    });
    render(
      <QuestionInquiry
        question={question}
        boundQuestion={question.text}
        onSave={onSave}
        search={search}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/patience from avoidance/i), {
      target: { value: 'Find who bears the downside.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look through your Library' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({
        status: 'miss',
        silence: 'Nothing you already have speaks to “find bears downside”.'
      })
    })));
  });

  it('stops an in-flight look without keeping a later result', async () => {
    const onSave = jest.fn();
    let resolveSearch;
    const search = jest.fn(() => new Promise((resolve) => { resolveSearch = resolve; }));
    render(
      <QuestionInquiry
        question={question}
        boundQuestion={question.text}
        onSave={onSave}
        search={search}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/patience from avoidance/i), {
      target: { value: 'Find an example that separates patience from avoidance.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look through your Library' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({
        status: 'stopped',
        boundQuestion: 'Who bears the downside?',
        silence: 'Stopped before anything useful was found.'
      })
    }));
    await resolveSearch({
      articles: [{ _id: 'letter', title: 'Household letter', content: 'Patience is not the same as avoidance.' }],
      highlights: []
    });
    const runs = onSave.mock.calls.map((call) => call[0].run?.status).filter(Boolean);
    expect(runs.at(-1)).toBe('stopped');
  });
});
