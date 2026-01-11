import React, { useState } from 'react';
import { Button } from '../../ui';

const QuestionInput = ({ onSubmit, placeholder = 'Add a question…', disabled }) => {
  const [value, setValue] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue('');
  };

  return (
    <form className="think-question-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
      />
      <Button type="submit" disabled={disabled || !value.trim()}>
        Add
      </Button>
    </form>
  );
};

export default QuestionInput;
