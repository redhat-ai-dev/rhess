import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SkillsPage from '../../../src/ui/pages/SkillsPage/index';
import type { PaginatedSkills } from '../../../src/ui/api/types';

vi.mock('../../../src/ui/api/client', () => ({
  getSkills: vi.fn(),
  searchSkills: vi.fn(),
}));

import * as client from '../../../src/ui/api/client';

function makeSkill(n: number) {
  return {
    id: `src/skill-${n}`,
    slug: `skill-${n}`,
    name: `Skill ${n}`,
    description: `Description ${n}`,
    category: null,
    allowedTools: [] as string[],
    sourceId: 'src',
    sourceLabel: 'Source',
    sourceUrl: null,
    skillPath: `skill-${n}.md`,
    frontmatter: {},
    installCommand: `/install skill-${n}`,
    lastModified: '2024-01-01T00:00:00Z',
  };
}

function pagedResult(skills: ReturnType<typeof makeSkill>[], total = skills.length): PaginatedSkills {
  return { skills, total, page: 1, per_page: 100, total_pages: 1 };
}

describe('SkillsPage', () => {
  beforeEach(() => {
    vi.mocked(client.getSkills).mockResolvedValue(pagedResult([makeSkill(1), makeSkill(2)]));
    vi.mocked(client.searchSkills).mockResolvedValue({ skills: [makeSkill(1)], total: 1, query: 'skill' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all skills after initial load', async () => {
    render(
      <MemoryRouter>
        <SkillsPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Skill 1')).toBeInTheDocument());
    expect(screen.getByText('Skill 2')).toBeInTheDocument();
  });

  it('shows search results when a query is entered', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SkillsPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Skill 1')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Search skills…');
    await user.type(input, 'skill');

    await waitFor(() => expect(vi.mocked(client.searchSkills)).toHaveBeenCalledWith('skill'));
  });

  describe('RHDHBUGS-3425 regression: stuck loading skeleton when search is quickly cleared', () => {
    it('does not leave loading skeleton visible when search text is cleared before the debounce fires', async () => {
      // Make searchSkills never settle — the debounce timer will be cancelled before it fires
      vi.mocked(client.searchSkills).mockImplementation(() => new Promise(() => {}));

      render(
        <MemoryRouter>
          <SkillsPage />
        </MemoryRouter>
      );

      // Wait for initial load to complete
      await waitFor(() =>
        expect(screen.queryByRole('table', { name: /loading skills/i })).not.toBeInTheDocument()
      );

      const input = screen.getByPlaceholderText('Search skills…');

      // Type one character — triggers setSearchLoading(true) immediately before the 300ms timer
      await act(async () => {
        fireEvent.change(input, { target: { value: 'u' } });
      });

      // Immediately clear — triggers the empty-search early-return branch.
      // The fix adds setSearchLoading(false) there; without it, the skeleton stays forever.
      await act(async () => {
        fireEvent.change(input, { target: { value: '' } });
      });

      // Loading skeleton must NOT be shown
      expect(screen.queryByRole('table', { name: /loading skills/i })).not.toBeInTheDocument();
    });
  });
});
