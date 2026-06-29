import React, { useCallback, useEffect, useState } from 'react';
import {
  PageSection,
  PageSectionVariants,
  Title,
  Gallery,
  GalleryItem,
  Card,
  CardTitle,
  CardBody,
  CardFooter,
  Button,
  SearchInput,
  Badge,
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateActions,
  Skeleton,
  Tooltip,
  Content,
  Flex,
  FlexItem,
  ToggleGroup,
  ToggleGroupItem,
  Pagination,
  Label,
} from '@patternfly/react-core';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  ThProps,
} from '@patternfly/react-table';
import { SearchIcon, CubeIcon, ThIcon, ThListIcon } from '@patternfly/react-icons';
import { ExternalLinkButton } from '@patternfly/react-component-groups';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSkills, searchSkills } from '../../api/client';
import type { Skill } from '../../api/types';
import InstallCommand from '../../components/InstallCommand';
import { categoryColor, formatSourcePath, resolveSkillSourceUrl } from '../../utils/category';

const SKELETON_COUNT = 9;
const PER_PAGE_OPTIONS = [10, 20, 50, 100];

type SortCol = 'name' | 'category' | 'lastModified' | 'source';
type SortOrder = 'asc' | 'desc';

interface SortState { col: SortCol; order: SortOrder }

const COLUMN_SORT: Record<number, SortCol> = { 0: 'name', 2: 'source' };

const SkillCard: React.FC<{ skill: Skill }> = ({ skill }) => {
  const navigate = useNavigate();
  const sourceHref = resolveSkillSourceUrl(skill);

  return (
    <Card isGlass isFullHeight style={{ display: 'flex', flexDirection: 'column' }}>
      <CardTitle>
        {/* Name + category label on the same row */}
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsFlexStart' }} flexWrap={{ default: 'nowrap' }} gap={{ default: 'gapSm' }}>
          <FlexItem>
            <span style={{ fontWeight: 600 }}>{skill.name}</span>
          </FlexItem>
          {skill.category && (
            <FlexItem style={{ flexShrink: 0 }}>
              <Label
                color={categoryColor(skill.category)}
                isCompact
                onClick={(e) => { e.stopPropagation(); navigate(`/skills?category=${encodeURIComponent(skill.category!)}`); }}
                style={{ cursor: 'pointer' }}
              >{skill.category}</Label>
            </FlexItem>
          )}
        </Flex>
        {/* Source link below name */}
        {sourceHref && (
          <div style={{ marginTop: '0.3rem' }}>
            <ExternalLinkButton
              href={sourceHref}
              variant="link"
              isInline
              style={{ fontFamily: 'var(--pf-t--global--font--family--mono)', fontSize: '0.75rem' }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {formatSourcePath(sourceHref)}
            </ExternalLinkButton>
          </div>
        )}
      </CardTitle>
      <CardBody style={{ flex: 1 }}>
        {skill.description ? (
          <Tooltip content={skill.description} isContentLeftAligned>
            <Content component="p" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 'var(--pf-t--global--spacer--sm)', cursor: 'default' }}>
              {skill.description}
            </Content>
          </Tooltip>
        ) : (
          <Content component="p" style={{ color: 'var(--pf-t--global--color--nonstatus--gray--default)', fontStyle: 'italic', marginBottom: 'var(--pf-t--global--spacer--sm)' }}>
            No description provided.
          </Content>
        )}
      </CardBody>
      <CardBody><InstallCommand command={skill.installCommand} /></CardBody>
      <CardFooter>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/skills/${encodeURIComponent(skill.id)}`)}>
          View details
        </Button>
      </CardFooter>
    </Card>
  );
};


interface SkillsTableProps {
  skills: Skill[];
  sort: SortState;
  onSort: (col: SortCol, order: SortOrder) => void;
}

const SkillsTable: React.FC<SkillsTableProps> = ({ skills, sort, onSort }) => {
  const navigate = useNavigate();

  const getSortParams = (colIdx: number): ThProps['sort'] => {
    const col = COLUMN_SORT[colIdx];
    if (!col) return undefined;
    return {
      sortBy: {
        index: Object.entries(COLUMN_SORT).find(([, v]) => v === sort.col)?.[0] !== undefined
          ? Number(Object.entries(COLUMN_SORT).find(([, v]) => v === sort.col)![0])
          : 0,
        direction: sort.order,
      },
      onSort: (_e, _idx, direction) => {
        onSort(col, direction as SortOrder);
      },
      columnIndex: colIdx,
    };
  };

  return (
    <Table aria-label={`Skills (${skills.length})`} style={{ tableLayout: 'fixed', width: '100%' }} isStriped>
      <Thead>
        <Tr>
          <Th {...(getSortParams(0) ? { sort: getSortParams(0)! } : {})} style={{ width: '14%' }}>Name</Th>
          <Th style={{ width: '28%' }}>Description</Th>
          <Th {...(getSortParams(2) ? { sort: getSortParams(2)! } : {})} style={{ width: '20%' }}>Source</Th>
          <Th style={{ width: '24%' }}>Install command</Th>
          <Th style={{ width: '14%' }}>Actions</Th>
        </Tr>
      </Thead>
      <Tbody>
        {skills.map((skill) => {
          const sourceHref = resolveSkillSourceUrl(skill);
          return (
          <Tr key={skill.id}>
            <Td dataLabel="Name" style={{ verticalAlign: 'middle' }}>
              <strong>{skill.name}</strong>
              {skill.category && (
                <div style={{ marginTop: '0.25rem' }}>
                  <Label
                    color={categoryColor(skill.category)}
                    isCompact
                    onClick={(e) => { e.stopPropagation(); navigate(`/skills?category=${encodeURIComponent(skill.category!)}`); }}
                    style={{ cursor: 'pointer' }}
                  >{skill.category}</Label>
                </div>
              )}
            </Td>
            <Td dataLabel="Description" style={{ verticalAlign: 'middle' }}>
              {skill.description ? (
                <Tooltip content={skill.description} isContentLeftAligned>
                  <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', cursor: 'default', lineHeight: 1.5 }}>
                    {skill.description}
                  </span>
                </Tooltip>
              ) : (
                <Content component="small" style={{ color: 'var(--pf-t--global--color--nonstatus--gray--default)', fontStyle: 'italic' }}>
                  No description
                </Content>
              )}
            </Td>
            <Td dataLabel="Source" style={{ verticalAlign: 'middle' }}>
              {sourceHref ? (
                <ExternalLinkButton
                  href={sourceHref}
                  variant="link"
                  isInline
                  style={{ fontFamily: 'var(--pf-t--global--font--family--mono)', fontSize: '0.78rem', paddingInline: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  iconProps={{ title: 'Opens in new tab' }}
                >
                  {formatSourcePath(sourceHref)}
                </ExternalLinkButton>
              ) : (
                <Content component="small" style={{ color: 'var(--pf-t--global--text--color--subtle)', fontStyle: 'italic' }}>—</Content>
              )}
            </Td>
            <Td dataLabel="Install command" style={{ verticalAlign: 'middle', paddingInlineEnd: 'var(--pf-t--global--spacer--lg)' }}>
              <InstallCommand command={skill.installCommand} compact />
            </Td>
            <Td dataLabel="Actions" style={{ verticalAlign: 'middle' }}>
              <Button variant="secondary" size="sm" onClick={() => navigate(`/skills/${encodeURIComponent(skill.id)}`)}>
                View details
              </Button>
            </Td>
          </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
};

type ViewMode = 'card' | 'table';

const SkillsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // Full catalog — all pages fetched on mount
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  // Backend search results (null = not in search mode)
  const [searchResults, setSearchResults] = useState<Skill[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const selectedCategory = searchParams.get('category');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_OPTIONS[0] ?? 10);
  const [sort, setSort] = useState<SortState>({ col: 'name', order: 'asc' });

  // Fetch the full catalog by iterating all pages (backend cap is 100 per page)
  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const batches: Skill[][] = [];
      let currentPage = 1;
      let totalPages = 1;
      do {
        const data = await getSkills({ page: currentPage, per_page: 100 });
        batches.push(data.skills);
        totalPages = data.total_pages;
        currentPage++;
      } while (currentPage <= totalPages);
      setAllSkills(batches.flat());
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSkills(); }, []);  

  // Delegate search to the backend (Fuse.js fuzzy match) with a 300 ms debounce
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { skills } = await searchSkills(search);
        setSearchResults(skills);
      } catch {
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Derive unique categories from the full catalog (not just the current results)
  const categories = [...new Set(allSkills.map((s) => s.category).filter(Boolean) as string[])].sort();

  // Use backend results when searching; full catalog otherwise. Apply category filter client-side.
  const baseSkills = searchResults ?? allSkills;
  const filteredSkills = baseSkills
    .filter((s) => {
      const matchesCategory = !selectedCategory || s.category === selectedCategory;
      return matchesCategory;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sort.col === 'source') {
        const sA = a.sourceUrl ? (a.sourceUrl.startsWith('http') ? a.sourceUrl.replace(/^https?:\/\/[^/]+\//, '') : a.sourceUrl) : '';
        const sB = b.sourceUrl ? (b.sourceUrl.startsWith('http') ? b.sourceUrl.replace(/^https?:\/\/[^/]+\//, '') : b.sourceUrl) : '';
        cmp = sA.localeCompare(sB);
      } else {
        cmp = a.name.localeCompare(b.name);
      }
      return sort.order === 'asc' ? cmp : -cmp;
    });

  const totalFiltered = filteredSkills.length;
  const pageSkills = filteredSkills.slice((page - 1) * perPage, page * perPage);

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const handleCategory = (cat: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (next.get('category') === cat) next.delete('category');
      else next.set('category', cat);
      return next;
    });
    setPage(1);
  };
  const handleSort = (col: SortCol, order: SortOrder) => { setSort({ col, order }); setPage(1); };

  return (
    <>
      {/* ── Hero search section ── */}
      <PageSection
        style={{
          paddingBlockStart: 'var(--pf-t--global--spacer--lg)',
          paddingBlockEnd: 'var(--pf-t--global--spacer--2xl)',
          paddingInline: 'var(--pf-t--global--spacer--lg)',
        }}
      >
        {/* View toggle — flows to top-right, never overlaps card */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <ToggleGroup aria-label="View mode">
            <ToggleGroupItem icon={<ThListIcon />} aria-label="Table view" isSelected={viewMode === 'table'} onChange={() => setViewMode('table')} />
            <ToggleGroupItem icon={<ThIcon />} aria-label="Card view" isSelected={viewMode === 'card'} onChange={() => setViewMode('card')} />
          </ToggleGroup>
        </div>
        <Card isGlass style={{ maxWidth: '680px', margin: '0 auto', overflow: 'hidden' }}>
          <CardBody style={{ textAlign: 'center', padding: 'var(--pf-t--global--spacer--xl)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: 'var(--pf-t--global--spacer--xs)' }}>
              <Title headingLevel="h1" size="2xl">Skills</Title>
              {!loading && !searchLoading && <Badge isRead>{totalFiltered}</Badge>}
            </div>
            <Content component="p" style={{ color: 'var(--pf-t--global--text--color--subtle)', marginBottom: 'var(--pf-t--global--spacer--xl)' }}>
              Add reusable procedural knowledge to your AI agents with a single-command skill installation.
            </Content>

            <SearchInput
              placeholder="Search skills…"
              value={search}
              onChange={(_e, val) => handleSearch(val)}
              onClear={() => handleSearch('')}
              aria-label="Search skills"
              style={{ width: '100%', fontSize: '1rem' }}
            />

            {categories.length > 0 && (
              <div style={{ marginTop: 'var(--pf-t--global--spacer--lg)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                {categories.map((cat) => (
                  <Label
                    key={cat}
                    color={categoryColor(cat)}
                    isCompact
                    onClick={() => handleCategory(cat)}
                    style={{
                      cursor: 'pointer',
                      opacity: selectedCategory && selectedCategory !== cat ? 0.45 : 1,
                      outline: selectedCategory === cat ? '2px solid var(--pf-t--global--border--color--status--info--default)' : undefined,
                      outlineOffset: '2px',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {cat}
                  </Label>
                ))}
              </div>
            )}

          </CardBody>
        </Card>
      </PageSection>

      {/* ── Table / Gallery section ── */}
      <PageSection
        variant={PageSectionVariants.default}
        style={{ paddingBlockStart: 0, paddingBlockEnd: 'var(--pf-t--global--spacer--md)', paddingInline: 'var(--pf-t--global--spacer--lg)' }}
      >

        {(loading || searchLoading) && viewMode === 'table' && (
          <Card>
            <Table aria-label="Loading skills" isStriped style={{ tableLayout: 'fixed', width: '100%' }}>
              <Thead>
                <Tr>
                  <Th style={{ width: '14%' }}>Name</Th>
                  <Th style={{ width: '28%' }}>Description</Th>
                  <Th style={{ width: '20%' }}>Source</Th>
                  <Th style={{ width: '24%' }}>Install command</Th>
                  <Th style={{ width: '14%' }}>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                  <Tr key={i}>
                    <Td><Skeleton width="70%" /><Skeleton width="40%" height="1.2rem" style={{ marginTop: '0.35rem' }} /></Td>
                    <Td><Skeleton width="90%" /><Skeleton width="65%" style={{ marginTop: '0.4rem' }} /></Td>
                    <Td><Skeleton width="80%" /></Td>
                    <Td><Skeleton width="85%" height="1.8rem" /></Td>
                    <Td><Skeleton width="60px" /></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        )}

        {(loading || searchLoading) && viewMode === 'card' && (
          <Gallery hasGutter minWidths={{ default: '280px', md: '300px' }}>
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <GalleryItem key={i}>
                <Card isGlass isFullHeight>
                  <CardTitle><Skeleton width="60%" height="1.2rem" /></CardTitle>
                  <CardBody>
                    <Skeleton width="100%" height="0.9rem" style={{ marginBottom: '0.5rem' }} />
                    <Skeleton width="80%" height="0.9rem" style={{ marginBottom: '1rem' }} />
                    <Skeleton width="40%" height="1.4rem" />
                  </CardBody>
                  <CardFooter><Skeleton width="30%" height="2rem" /></CardFooter>
                </Card>
              </GalleryItem>
            ))}
          </Gallery>
        )}

        {!loading && !searchLoading && error && (
          <EmptyState headingLevel="h2" titleText="Could not load skills" icon={SearchIcon}>
            <EmptyStateBody>{error} — make sure the RHESS server is running on port 3001.</EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" onClick={loadSkills}>Retry</Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        )}

        {!loading && !searchLoading && !error && filteredSkills.length === 0 && (
          <EmptyState headingLevel="h2" titleText={search || selectedCategory ? 'No skills match your filters' : 'No skills found'} icon={CubeIcon}>
            <EmptyStateBody>
              {search
                ? 'No skills matched your search. Try a different query or clear the search.'
                : selectedCategory
                  ? 'No skills in this category. Try clearing the category filter.'
                  : 'Add skill sources in the Admin section to get started.'}
            </EmptyStateBody>
            {(search || selectedCategory) && (
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button variant="link" onClick={() => { handleSearch(''); setSearchParams({}); }}>Clear filters</Button>
                </EmptyStateActions>
              </EmptyStateFooter>
            )}
          </EmptyState>
        )}

        {!loading && !searchLoading && !error && filteredSkills.length > 0 && viewMode === 'card' && (
          <Gallery hasGutter minWidths={{ default: '280px', md: '300px' }}>
            {pageSkills.map((skill) => (
              <GalleryItem key={skill.id}><SkillCard skill={skill} /></GalleryItem>
            ))}
          </Gallery>
        )}

        {!loading && !searchLoading && !error && filteredSkills.length > 0 && viewMode === 'table' && (
          <Card>
            <SkillsTable skills={pageSkills} sort={sort} onSort={handleSort} />
          </Card>
        )}

        {!loading && !searchLoading && !error && totalFiltered > 0 && (
          <Pagination
            itemCount={totalFiltered}
            perPage={perPage}
            page={page}
            onSetPage={(_e, p) => setPage(p)}
            onPerPageSelect={(_e, pp) => { setPerPage(pp); setPage(1); }}
            perPageOptions={PER_PAGE_OPTIONS.map((n) => ({ title: `${n}`, value: n }))}
            style={{ marginTop: 'var(--pf-t--global--spacer--lg)' }}
          />
        )}
      </PageSection>
    </>
  );
};

export default SkillsPage;
