import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from '../../../src/ui/pages/AdminPage/index';
import type { PaginatedSkills } from '../../../src/ui/api/types';

vi.mock('../../../src/ui/api/client', () => ({
  getSkills: vi.fn(),
  searchSkills: vi.fn(),
  getSources: vi.fn(),
  syncSources: vi.fn(),
  addSource: vi.fn(),
  updateSource: vi.fn(),
  syncSource: vi.fn(),
  syncSkill: vi.fn(),
  deleteSource: vi.fn(),
  deleteSkill: vi.fn(),
  checkHealth: vi.fn(),
  isStaticDemo: false,
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

function pagedResult(
  skills: ReturnType<typeof makeSkill>[],
  page: number,
  totalPages: number,
  total: number,
): PaginatedSkills {
  return { skills, total, page, per_page: 100, total_pages: totalPages };
}

describe('AdminPage', () => {
  beforeEach(() => {
    localStorage.setItem('rhess_admin_token', 'test-token');

    vi.mocked(client.getSources).mockResolvedValue({ sources: [] });
    vi.mocked(client.searchSkills).mockResolvedValue({ skills: [], total: 0, query: '' });
    vi.mocked(client.syncSources).mockRejectedValue(new Error('network'));
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('RHDHBUGS-3426 regression: skills capped at 100 due to missing pagination', () => {
    it('calls getSkills for every page when the catalog spans multiple pages', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => makeSkill(i + 1));
      const page2 = Array.from({ length: 50 }, (_, i) => makeSkill(i + 101));

      vi.mocked(client.getSkills).mockImplementation(async (params = {}) => {
        const p = (params as { page?: number }).page ?? 1;
        if (p === 1) return pagedResult(page1, 1, 2, 150);
        if (p === 2) return pagedResult(page2, 2, 2, 150);
        return pagedResult([], p, 2, 150);
      });

      render(
        <MemoryRouter>
          <AdminPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(vi.mocked(client.getSkills)).toHaveBeenCalledWith({ page: 1, per_page: 100 });
        expect(vi.mocked(client.getSkills)).toHaveBeenCalledWith({ page: 2, per_page: 100 });
      });
    });

    it('shows the API total count in the Skills tab badge, not the per-page array length', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => makeSkill(i + 1));
      const page2 = Array.from({ length: 50 }, (_, i) => makeSkill(i + 101));

      vi.mocked(client.getSkills).mockImplementation(async (params = {}) => {
        const p = (params as { page?: number }).page ?? 1;
        if (p === 1) return pagedResult(page1, 1, 2, 150);
        if (p === 2) return pagedResult(page2, 2, 2, 150);
        return pagedResult([], p, 2, 150);
      });

      render(
        <MemoryRouter>
          <AdminPage />
        </MemoryRouter>
      );

      // The Skills tab badge must show the API total (150), not just the first page (100)
      await waitFor(() => {
        expect(screen.getByText('150')).toBeInTheDocument();
      });
    });
  });
});
