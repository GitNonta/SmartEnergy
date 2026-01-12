import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders dashboard tab in navbar', () => {
  render(<App />);
  const tab = screen.getByText(/dashboard/i);
  expect(tab).toBeInTheDocument();
});
