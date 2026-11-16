import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkTaskRow } from './WorkPlanItem';
import { TASK_DRAG } from './workTaskDrag';

test('daily task rows expose the same canonical drag as the weekly tray', () => {
  render(<WorkTaskRow item={{ _id: 'saved-task', clientId: 'local-task', title: 'Charger matrix', completed: false }} onAction={() => {}} onEdit={() => {}} />);
  const row = screen.getByText('Charger matrix').closest('.work-planner-task');
  expect(row).toHaveAttribute('draggable', 'true');
  const dataTransfer = { setData: jest.fn() };
  fireEvent.dragStart(row, { dataTransfer });
  expect(dataTransfer.setData).toHaveBeenCalledWith(TASK_DRAG, 'saved-task');
});
