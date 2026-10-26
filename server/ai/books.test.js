const { askTheBook } = require('./books');

describe('askTheBook', () => {
  const questions = [{ _id: 'q1', note: 'Why does Dorothea marry him?' }, { _id: 'q2', note: 'Who pays for the hospital?' }];
  const passages = [
    { _id: 'm1', text: 'She had a great deal of mind, and a theoretic one.', page: 9 },
    { _id: 'm2', text: 'Mr. Casaubon seemed to her a living Bossuet.', page: 22 }
  ];
  const replying = text => jest.fn(async () => ({ text }));

  it('answers from the marked passages alone, each answer opening at the marks it leans on', async () => {
    const complete = replying('Here: {"answers":[{"question":1,"answer":"She mistook  learning for depth.","passages":[2,1,2]}]}');
    const answers = await askTheBook({ title: 'Middlemarch', questions, passages, complete });
    expect(answers).toEqual([{ questionId: 'q1', answer: 'She mistook learning for depth.', marks: [{ _id: 'm2', page: 22 }, { _id: 'm1', page: 9 }] }]);
    const sent = JSON.parse(complete.mock.calls[0][0].messages[1].content);
    expect(sent.passages.map(passage => passage.number)).toEqual([1, 2]);
    expect(sent.questions[1]).toEqual({ number: 2, question: 'Who pays for the hospital?' });
  });

  it('keeps no answer that cites nothing it was given, answers a question once, and asks nothing of an empty book', async () => {
    const complete = replying(JSON.stringify({ answers: [
      { question: 2, answer: 'Bulstrode.', passages: [7] },
      { question: 1, answer: 'For his mind.', passages: [2] },
      { question: 1, answer: 'Again.', passages: [1] },
      { question: 9, answer: 'Nobody asked.', passages: [1] }
    ] }));
    expect((await askTheBook({ questions, passages, complete })).map(found => found.answer)).toEqual(['For his mind.']);
    expect(await askTheBook({ questions, passages: [], complete })).toEqual([]);
    expect(await askTheBook({ questions, passages, complete: replying('no idea') })).toEqual([]);
  });
});
