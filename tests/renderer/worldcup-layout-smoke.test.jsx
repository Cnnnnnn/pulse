// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/preact';
import { WorldcupLayout } from '../../src/renderer/worldcup/WorldcupLayout.jsx';

describe('WorldcupLayout smoke', () => {
  beforeEach(() => {
    global.window.api = {
      worldcupFetchFixtures: async () => ({
        ok: true,
        data: {
          matches: [
            {
              team1: 'Mexico',
              team2: 'South Africa',
              date: '2026-06-11',
              time: '20:00',
              timezone: 'UTC-6',
              stage: 'Group A',
              venue: 'Test Stadium',
            },
          ],
        },
      }),
      worldcupLoadScores: async () => ({ ok: true, scores: {} }),
      worldcupRefreshScores: async () => ({ ok: true, scores: {} }),
      worldcupLoadInsights: async () => ({ ok: true, insights: {} }),
    };
  });

  it('renders header and schedule content', async () => {
    const { container, getByText } = render(<WorldcupLayout />);
    expect(getByText('世界杯 2026')).toBeTruthy();
    await waitFor(() => {
      expect(container.querySelector('.worldcup-day-section')).toBeTruthy();
    });
  });
});
