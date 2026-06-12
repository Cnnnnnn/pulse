// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import MatchCard from '../../src/renderer/worldcup/MatchCard.jsx';

describe('MatchCard smoke', () => {
  it('renders without throw', () => {
    const match = {
      team1: 'Mexico',
      team2: 'South Africa',
      date: '2026-06-11',
      time: '20:00',
      timezone: 'UTC-6',
      stage: 'Group A',
      venue: 'Test Stadium',
    };
    const { container } = render(<MatchCard match={match} onClick={() => {}} />);
    expect(container.textContent).toContain('墨西哥');
  });
});
