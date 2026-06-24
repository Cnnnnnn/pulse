// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/preact';
import { AppShell } from '../../src/renderer/components/AppShell.jsx';
import { activeNav, setActiveNav } from '../../src/renderer/worldcup/navStore.js';

describe('AppShell worldcup nav', () => {
  beforeEach(() => {
    setActiveNav('worldcup');
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

  it('shows worldcup header when worldcup nav is active', async () => {
    activeNav.value = 'worldcup';
    const { getByText } = render(<AppShell onCheck={() => {}} />);
    await waitFor(() => {
      expect(getByText('世界杯 2026')).toBeTruthy();
      expect(document.querySelector('.match-card')).toBeTruthy();
    });
  });
});
