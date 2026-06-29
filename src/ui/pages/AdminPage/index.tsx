import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  PageSection,
  PageSectionVariants,
  Title,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
  SearchInput,
  Alert,
  AlertGroup,
  ActionGroup,
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateActions,
  Skeleton,
  Content,
  Flex,
  FlexItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Divider,
  Tooltip,
  Label,
  Pagination,
  Dropdown,
  DropdownList,
  DropdownItem,
  MenuToggle,
  MenuToggleCheckbox,
  Select,
  SelectOption,
  SelectList,
  Card,
  DataList,
  DataListItem,
  DataListItemRow,
  DataListCheck,
  DataListItemCells,
  DataListCell,
  Tabs,
  Tab,
  TabTitleText,
  Badge,
} from '@patternfly/react-core';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  ExpandableRowContent,
} from '@patternfly/react-table';
import {
  LockIcon,
  PlusCircleIcon,
  TrashIcon,
  SyncAltIcon,
  CubeIcon,
  CubesIcon,
  PencilAltIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  SearchIcon,
} from '@patternfly/react-icons';
import { ExternalLinkButton } from '@patternfly/react-component-groups';
import {
  getSkills,
  searchSkills,
  addSource,
  updateSource,
  syncSource,
  deleteSkill,
  getSources,
  deleteSource,

  syncSources,
} from '../../api/client';
import type { Skill, SkillSource } from '../../api/types';
import { categoryColor, formatSourcePath, resolveSkillSourceUrl, resolveSourceUrl } from '../../utils/category';

const SESSION_KEY = 'rhess_admin_token';
const storage = localStorage;

interface Toast {
  id: number;
  variant: 'success' | 'danger' | 'info';
  title: string;
  body?: string;
}

let toastId = 0;

const modalFieldLabel = (text: string) => (
  <span style={{ fontWeight: 'var(--pf-t--global--font--weight--body--bold)' }}>{text}</span>
);

const AdminPage: React.FC = () => {
  const [token, setToken] = useState<string>(() => storage.getItem(SESSION_KEY) ?? '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'skills' | 'sources'>('sources');


  const [skills, setSkills] = useState<Skill[]>([]);
  const [sources, setSources] = useState<SkillSource[]>([]);
  const [totalSkillsCount, setTotalSkillsCount] = useState(0);
  const [totalSourcesCount, setTotalSourcesCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [sourceFilterOpen, setSourceFilterOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [splitBulkOpen, setSplitBulkOpen] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // Sorting
  type SortCol = 'name' | 'lastSynced' | 'source' | 'category';
  type SortDir = 'asc' | 'desc';
  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (col: SortCol) => {
    if (col === sortCol) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  };

  const [toasts, setToasts] = useState<Toast[]>([]);

  // Login modal
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Register source modal
  const [addOpen, setAddOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  // Derive a friendly name from a repo URL
  const parseSourceName = (url: string): string => {
    const clean = url.replace(/^https?:\/\//, '').replace(/\.git$/, '');
    const parts = clean.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const normalizeRepoUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('http') ? trimmed : `https://github.com/${trimmed}`;
  };

  const handleUrlChange = (_e: React.FormEvent, val: string) => {
    setNewUrl(val);
    if (!newLabel) setNewLabel('');
  };

  const handleAddSource = async () => {
    setAddError('');
    const url = normalizeRepoUrl(newUrl.trim());
    if (!url) { setAddError('Please enter a repository URL.'); return; }
    const label = newLabel.trim() || parseSourceName(newUrl.trim());
    setAddLoading(true);
    try {
      const { source } = await addSource(token, { path: url, label });
      addToast('success', `Source registered — ${source.skillCount ?? 0} skill${(source.skillCount ?? 0) !== 1 ? 's' : ''} indexed`);
      resetAddModal();
      loadData(search);
    } catch (err: unknown) {
      setAddError((err as Error).message);
    } finally {
      setAddLoading(false);
    }
  };

  const resetAddModal = () => {
    setAddOpen(false);
    setNewUrl('');
    setNewLabel('');
    setAddError('');
  };

  // Edit source modal (per skill row)
  const [editTarget, setEditTarget] = useState<SkillSource | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editPath, setEditPath] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editSelectedSkillIds, setEditSelectedSkillIds] = useState<Set<string>>(new Set());

  // Delete skill modal
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Sources tab — compound expansion + per-source actions + bulk
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);
  const [sourceSearch, setSourceSearch] = useState('');
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  type SourceSortCol = 'source' | 'skills' | 'lastSynced';
  const [sourceSortCol, setSourceSortCol] = useState<SourceSortCol>('source');
  const [sourceSortDir, setSourceSortDir] = useState<SortDir>('asc');
  const handleSourceSort = (col: SourceSortCol) => {
    if (col === sourceSortCol) setSourceSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSourceSortCol(col); setSourceSortDir('asc'); }
  };
  const [sourceSplitBulkOpen, setSourceSplitBulkOpen] = useState(false);
  const [sourceBulkSyncing, setSourceBulkSyncing] = useState(false);
  const [deleteSourceTarget, setDeleteSourceTarget] = useState<SkillSource | null>(null);
  const [deleteSourceLoading, setDeleteSourceLoading] = useState(false);

  const toggleSourceExpand = (id: string) =>
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const openSourceEdit = (source: SkillSource) => {
    const sourceSkillIds = skills.filter((s) => s.sourceId === source.id).map((s) => s.id);
    setEditTarget(source);
    setEditLabel(source.label);
    setEditPath(source.path);
    setEditSelectedSkillIds(new Set(sourceSkillIds));
  };

  const handleSourceSync = async (source: SkillSource) => {
    const sourceDisplay = formatSourcePath(resolveSourceUrl(source) ?? undefined) || source.label;
    const skillCount = skills.filter((s) => s.sourceId === source.id).length;
    const skillSuffix = `— ${skillCount} skill${skillCount !== 1 ? 's' : ''}`;
    setSyncingSourceId(source.id);
    try {
      await syncSource(token, source.id);
    } catch { /* optimistic */ }
    const now = new Date().toISOString();
    setSources((prev) =>
      prev.map((s) => s.id === source.id ? { ...s, lastSynced: now } : s)
    );
    addToast('success', `Synced "${sourceDisplay}" ${skillSuffix}`);
    setSyncingSourceId(null);
    loadData(search);
  };

  const handleDeleteSource = async () => {
    if (!deleteSourceTarget) return;
    setDeleteSourceLoading(true);
    try {
      await deleteSource(token, deleteSourceTarget.id);
    } catch { /* optimistic */ }
    setSkills((prev) => prev.filter((s) => s.sourceId !== deleteSourceTarget.id));
    setSources((prev) => prev.filter((s) => s.id !== deleteSourceTarget.id));
    addToast('success', `Removed source "${deleteSourceTarget.label}"`);
    setDeleteSourceTarget(null);
    setDeleteSourceLoading(false);
  };

  const handleSourceBulkSync = async () => {
    setSourceBulkSyncing(true);
    const syncAll = selectedSources.size === 0;
    try {
      const ids = syncAll ? sources.map((s) => s.id) : [...selectedSources];
      await Promise.all(ids.map((id) => syncSource(token, id).catch(() => {})));
      const now = new Date().toISOString();
      setSources((prev) =>
        prev.map((s) => ids.includes(s.id) ? { ...s, lastSynced: now } : s)
      );
      const skillCount = skills.filter((sk) => ids.includes(sk.sourceId ?? '')).length;
      const skillSuffix = `— ${skillCount} skill${skillCount !== 1 ? 's' : ''}`;
      addToast(
        'success',
        syncAll
          ? `Synced all sources ${skillSuffix}`
          : `Synced ${ids.length} source${ids.length !== 1 ? 's' : ''} ${skillSuffix}`,
      );
      loadData(search);
    } finally {
      setSourceBulkSyncing(false);
    }
  };

  const handleSourceBulkDelete = () => {
    const ids = [...selectedSources];
    ids.forEach((id) => {
      setSkills((prev) => prev.filter((s) => s.sourceId !== id));
      setSources((prev) => prev.filter((s) => s.id !== id));
      deleteSource(token, id).catch(() => {});
    });
    addToast('success', `Removed ${ids.length} source${ids.length !== 1 ? 's' : ''}`);
    setSelectedSources(new Set());
  };

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeq = useRef(0);

  const addToast = (variant: Toast['variant'], title: string, body?: string) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, variant, title, ...(body !== undefined ? { body } : {}) }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  };

  const loadData = useCallback(async (q = '') => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const [skillsRes, sourcesRes] = await Promise.all([
        q.trim()
          ? searchSkills(q.trim()).then((r) => ({ skills: r.skills, total: r.total }))
          : (async () => {
              const batches: Skill[][] = [];
              let currentPage = 1;
              let totalPages = 1;
              let total = 0;
              do {
                const data = await getSkills({ page: currentPage, per_page: 100 });
                batches.push(data.skills);
                totalPages = data.total_pages;
                total = data.total;
                currentPage++;
              } while (currentPage <= totalPages);
              return { skills: batches.flat(), total };
            })(),
        getSources(),
      ]);
      if (seq !== loadSeq.current) return;
      setSkills(skillsRes.skills);
      // Preserve any optimistic lastSynced updates that are newer than what the server returned
      setSources((prev) =>
        sourcesRes.sources.map((s: SkillSource) => {
          const existing = prev.find((p) => p.id === s.id);
          if (existing?.lastSynced && s.lastSynced) {
            return new Date(existing.lastSynced) > new Date(s.lastSynced) ? { ...s, lastSynced: existing.lastSynced } : s;
          }
          return existing?.lastSynced && !s.lastSynced ? { ...s, lastSynced: existing.lastSynced } : s;
        })
      );
      if (!q.trim()) {
        setTotalSkillsCount(skillsRes.total);
        setTotalSourcesCount(sourcesRes.sources.length);
      }
    } catch (err: unknown) {
      if (seq !== loadSeq.current) return;
      addToast('danger', 'Could not load skills', (err as Error).message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  const handleLogin = async () => {
    setLoginError('');
    try {
      await syncSources(loginInput);
      storage.setItem(SESSION_KEY, loginInput);
      setToken(loginInput);
      setIsAuthenticated(true);
      setLoginOpen(false);
      setLoginInput('');
      loadData(search);
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.toLowerCase().includes('unauthorized')) {
        setLoginError('Invalid token. Check the server startup logs.');
      } else {
        storage.setItem(SESSION_KEY, loginInput);
        setToken(loginInput);
        setIsAuthenticated(true);
        setLoginOpen(false);
        setLoginInput('');
        loadData(search);
      }
    }
  };

  const handleLogout = () => {
    storage.removeItem(SESSION_KEY);
    setToken('');
    setIsAuthenticated(false);
    setSkills([]);
  };

  useEffect(() => {
    if (token) {
      getSources()
        .then(({ sources }) => {
          setSources(sources);
          setIsAuthenticated(true);
          loadData();
        })
        .catch(() => {
          syncSources(token).catch((err) => {
            if ((err as Error).message?.toLowerCase().includes('unauthorized')) {
              storage.removeItem(SESSION_KEY);
              setToken('');
            } else {
              setIsAuthenticated(true);
              loadData();
            }
          });
        });
    }
  }, []);  

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadData(search), 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [search]);  

  const handleEditSave = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await updateSource(token, editTarget.id, { path: editPath.trim(), label: editLabel.trim() });
      const removedSkills = skills.filter((s) => s.sourceId === editTarget.id && !editSelectedSkillIds.has(s.id));
      await Promise.allSettled(removedSkills.map((s) => deleteSkill(token, s.id)));
      if (removedSkills.length > 0) {
        setSkills((prev) => prev.filter((s) => !removedSkills.some((r) => r.id === s.id)));
      }
      addToast('success', `Source updated`);
      setEditTarget(null);
      loadData(search);
    } catch (err: unknown) {
      addToast('danger', 'Update failed', (err as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  // (handleAddSource moved above — real backend call)

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      // Try to delete the source if it exists, else just the skill file
      const source = sources.find((s) => s.id === deleteTarget.sourceId);
      if (source) {
        await deleteSource(token, source.id);
        addToast('success', `Removed "${deleteTarget.name}" and its source`);
      } else {
        await deleteSkill(token, deleteTarget.id);
        addToast('success', `Deleted "${deleteTarget.name}"`);
      }
      setDeleteTarget(null);
      loadData(search);
    } catch (err: unknown) {
      addToast('danger', 'Delete failed', (err as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Relative time formatter
  const relativeTime = (iso?: string): string => {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  // Sort then paginate
  const filteredSkillsBySource = skills.filter((s) => {
    if (sourceFilter && s.sourceId !== sourceFilter) return false;
    if (categoryFilter && s.category !== categoryFilter) return false;
    return true;
  });

  const availableCategories = [...new Set(skills.map((s) => s.category).filter(Boolean) as string[])].sort();

  const sortedSkills = [...filteredSkillsBySource].sort((a, b) => {
    if (sortCol === 'name') {
      const cmp = a.name.localeCompare(b.name);
      return sortDir === 'asc' ? cmp : -cmp;
    }
    if (sortCol === 'source') {
      const sA = a.sourceUrl ? (a.sourceUrl.startsWith('http') ? a.sourceUrl.replace(/^https?:\/\/[^/]+\//, '') : a.sourceUrl) : '';
      const sB = b.sourceUrl ? (b.sourceUrl.startsWith('http') ? b.sourceUrl.replace(/^https?:\/\/[^/]+\//, '') : b.sourceUrl) : '';
      const cmp = sA.localeCompare(sB);
      return sortDir === 'asc' ? cmp : -cmp;
    }
    if (sortCol === 'category') {
      const cmp = (a.category ?? '').localeCompare(b.category ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    }
    // lastSynced — null sinks to the bottom regardless of direction
    const srcA = sources.find((s) => s.id === a.sourceId);
    const srcB = sources.find((s) => s.id === b.sourceId);
    const tA = srcA?.lastSynced ? new Date(srcA.lastSynced).getTime() : null;
    const tB = srcB?.lastSynced ? new Date(srcB.lastSynced).getTime() : null;
    if (tA === null && tB === null) return 0;
    if (tA === null) return 1;
    if (tB === null) return -1;
    return sortDir === 'asc' ? tA - tB : tB - tA;
  });
  const pageSkills = sortedSkills.slice((page - 1) * perPage, page * perPage);

  // Shared sortBy objects — all columns in a table must reference the same sortBy
  // so only the active column shows the highlighted indicator.
  const skillsColIndex: Record<string, number> = { name: 0, source: 2, category: 3, lastSynced: 4 };
  const skillsSortBy = { index: skillsColIndex[sortCol] ?? 0, direction: sortDir };

  const sourcesColIndex: Record<string, number> = { source: 2, skills: 3, lastSynced: 5 };
  const sourcesSortBy = { index: sourcesColIndex[sourceSortCol] ?? 2, direction: sourceSortDir };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleSelectNone = () => setSelected(new Set());
  const handleSelectPage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      pageSkills.forEach((s) => next.add(s.id));
      return next;
    });
  const handleSelectAll = () => setSelected(new Set(skills.map((s) => s.id)));

  const allSelected = skills.length > 0 && selected.size === skills.length;
  const someSelected = selected.size > 0 && !allSelected;

  const handleBulkSelectorCheck = (_checked: boolean) => {
    if (allSelected || someSelected) handleSelectNone();
    else handleSelectAll();
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all([...selected].map((id) => deleteSkill(token, id)));
      addToast('success', `Deleted ${selected.size} skill${selected.size !== 1 ? 's' : ''}`);
      setSelected(new Set());
      setBulkDeleteOpen(false);
      loadData(search);
    } catch (err: unknown) {
      addToast('danger', 'Delete failed', (err as Error).message);
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <>
      {toasts.length > 0 && (
        <AlertGroup isToast isLiveRegion>
          {toasts.map((t) => (
            <Alert key={t.id} variant={t.variant} title={t.title} timeout={5000} actionClose={<></>}>
              {t.body}
            </Alert>
          ))}
        </AlertGroup>
      )}

      <PageSection variant={PageSectionVariants.secondary}>
        <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl">Admin</Title>
            <Content component="p" style={{ marginTop: 'var(--pf-t--global--spacer--xs)' }}>
              Control your skill catalog from here - register new sources, sync the latest content, and remove what you no longer need.
            </Content>
          </FlexItem>
          <FlexItem>
            <Flex gap={{ default: 'gapMd' }} alignItems={{ default: 'alignItemsCenter' }}>
              {isAuthenticated && (
                <>
                  <Button variant="secondary" onClick={handleLogout}>Sign out</Button>
                  <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => setAddOpen(true)}>
                    Register source
                  </Button>
                </>
              )}
            </Flex>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection variant={PageSectionVariants.secondary} padding={{ default: 'noPadding' }}>
        <Divider />
      </PageSection>

      {/* Unauthenticated state */}
      {!isAuthenticated && (
        <PageSection>
          <EmptyState headingLevel="h2" titleText="Admin access required" icon={LockIcon}>
            <EmptyStateBody>
              Sign in with your admin token to manage skills and sources.
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" onClick={() => setLoginOpen(true)}>Sign in as admin</Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        </PageSection>
      )}

      {/* Tabs */}
      {isAuthenticated && (
        <PageSection variant={PageSectionVariants.default} padding={{ default: 'noPadding' }}>
          <Tabs
            activeKey={activeTab}
            onSelect={(_e, key) => { setActiveTab(key as 'skills' | 'sources'); setSourceFilter(null); setCategoryFilter(null); setPage(1); }}
            style={{ paddingInline: 'var(--pf-t--global--spacer--lg)' }}
          >
            <Tab eventKey="sources" title={<TabTitleText>Sources {totalSourcesCount > 0 && <Badge isRead>{totalSourcesCount}</Badge>}</TabTitleText>} />
            <Tab eventKey="skills" title={<TabTitleText>Skills {totalSkillsCount > 0 && <Badge isRead>{totalSkillsCount}</Badge>}</TabTitleText>} />
          </Tabs>
        </PageSection>
      )}

      {/* Skills tab */}
      {isAuthenticated && activeTab === 'skills' && (
        <PageSection variant={PageSectionVariants.default}>
          <Toolbar style={{ paddingBlockEnd: 0 }}>
            <ToolbarContent>
              {/* PF bulk selector: split button (checkbox + dropdown) */}
              <ToolbarItem>
                <Dropdown
                  isOpen={splitBulkOpen}
                  onOpenChange={(open) => setSplitBulkOpen(open)}
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      onClick={() => setSplitBulkOpen(!splitBulkOpen)}
                      isExpanded={splitBulkOpen}
                      splitButtonItems={[
                        <MenuToggleCheckbox
                          id="bulk-selector-checkbox"
                          key="bulk-selector-checkbox"
                          aria-label={allSelected ? 'Deselect all' : 'Select all'}
                          isChecked={allSelected ? true : someSelected ? null : false}
                          onChange={handleBulkSelectorCheck}
                        >
                          {selected.size > 0 ? `${selected.size} selected` : undefined}
                        </MenuToggleCheckbox>,
                      ]}
                      aria-label="Bulk select"
                    />
                  )}
                >
                  <DropdownList>
                    <DropdownItem
                      key="select-none"
                      onClick={() => { handleSelectNone(); setSplitBulkOpen(false); }}
                      isDisabled={selected.size === 0}
                    >
                      Select none {selected.size > 0 && `(${selected.size} items)`}
                    </DropdownItem>
                    <DropdownItem
                      key="select-page"
                      onClick={() => { handleSelectPage(); setSplitBulkOpen(false); }}
                    >
                      Select page ({pageSkills.length} items)
                    </DropdownItem>
                    <DropdownItem
                      key="select-all"
                      onClick={() => { handleSelectAll(); setSplitBulkOpen(false); }}
                      isDisabled={allSelected}
                    >
                      Select all ({skills.length} items)
                    </DropdownItem>
                  </DropdownList>
                </Dropdown>
              </ToolbarItem>

              <ToolbarItem>
                <SearchInput
                  placeholder="Search skills…"
                  value={search}
                  onChange={(_e, val) => { setSearch(val); setPage(1); setSelected(new Set()); }}
                  onClear={() => { setSearch(''); setPage(1); setSelected(new Set()); }}
                  aria-label="Search skills"
                  style={{ width: '320px' }}
                />
              </ToolbarItem>

              <ToolbarItem>
                <Select
                  isOpen={sourceFilterOpen}
                  selected={sourceFilter ?? ''}
                  onSelect={(_e, val) => {
                    setSourceFilter(val === '' ? null : val as string);
                    setSourceFilterOpen(false);
                    setPage(1);
                    setSelected(new Set());
                  }}
                  onOpenChange={setSourceFilterOpen}
                  toggle={(ref) => (
                    <MenuToggle
                      ref={ref}
                      onClick={() => setSourceFilterOpen((o) => !o)}
                      isExpanded={sourceFilterOpen}
                      style={{ width: '200px' }}
                    >
                      {sourceFilter
                        ? (sources.find((s) => s.id === sourceFilter) ? formatSourcePath((sources.find((s) => s.id === sourceFilter) as SkillSource & { url?: string }).url) || sources.find((s) => s.id === sourceFilter)!.label : 'All sources')
                        : 'All sources'}
                    </MenuToggle>
                  )}
                >
                  <SelectList>
                    <SelectOption value="">All sources</SelectOption>
                    {sources.map((s) => (
                      <SelectOption key={s.id} value={s.id}>
                        {formatSourcePath((s as SkillSource & { url?: string }).url) || s.label}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
              </ToolbarItem>

              <ToolbarItem>
                <Select
                  isOpen={categoryFilterOpen}
                  selected={categoryFilter ?? ''}
                  onSelect={(_e, val) => {
                    setCategoryFilter(val === '' ? null : val as string);
                    setCategoryFilterOpen(false);
                    setPage(1);
                    setSelected(new Set());
                  }}
                  onOpenChange={setCategoryFilterOpen}
                  toggle={(ref) => (
                    <MenuToggle
                      ref={ref}
                      onClick={() => setCategoryFilterOpen((o) => !o)}
                      isExpanded={categoryFilterOpen}
                      style={{ width: '180px' }}
                    >
                      {categoryFilter ?? 'All categories'}
                    </MenuToggle>
                  )}
                >
                  <SelectList>
                    <SelectOption value="">All categories</SelectOption>
                    {availableCategories.map((cat) => (
                      <SelectOption key={cat} value={cat}>
                        <Label color={categoryColor(cat)} isCompact style={{ pointerEvents: 'none' }}>{cat}</Label>
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
              </ToolbarItem>

              {selected.size > 0 && (
                <ToolbarItem>
                  <Button
                    variant="danger"
                    icon={<TrashIcon />}
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    Delete ({selected.size})
                  </Button>
                </ToolbarItem>
              )}

            </ToolbarContent>
          </Toolbar>

          <Card style={{ marginBlock: 'var(--pf-t--global--spacer--md)' }}>
          {loading ? (
            <Table aria-label="Loading skills">
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Description</Th>
                  <Th>Category</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Tr key={i}>
                    <Td><Skeleton width="60%" /></Td>
                    <Td><Skeleton width="85%" /></Td>
                    <Td><Skeleton width="90%" /></Td>
                    <Td><Skeleton width="80px" /></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ) : skills.length === 0 ? (
            <EmptyState headingLevel="h3" titleText={search ? 'No skills match your search' : 'No skills found'} icon={CubeIcon}>
              <EmptyStateBody>
                {search
                  ? `No skills matched "${search}".`
                  : 'Register a Git repository to start indexing skills.'}
              </EmptyStateBody>
              {!search && (
                <EmptyStateFooter>
                  <EmptyStateActions>
                    <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => setAddOpen(true)}>
                      Register source
                    </Button>
                  </EmptyStateActions>
                </EmptyStateFooter>
              )}
            </EmptyState>
          ) : (
            <Table aria-label={`Skills (${skills.length})`} style={{ tableLayout: 'fixed', width: '100%' }} isStriped>
              <Thead>
                <Tr>
                  <Th style={{ width: '3%' }} />
                  <Th
                    style={{ width: '16%' }}
                    sort={{ sortBy: skillsSortBy, onSort: () => handleSort('name'), columnIndex: 0 }}
                  >
                    Name
                  </Th>
                  <Th style={{ width: '31%' }}>Description</Th>
                  <Th style={{ width: '18%' }} sort={{ sortBy: skillsSortBy, onSort: () => handleSort('source'), columnIndex: 2 }}>Source</Th>
                  <Th style={{ width: '12%' }} sort={{ sortBy: skillsSortBy, onSort: () => handleSort('category'), columnIndex: 3 }}>Category</Th>
                  <Th
                    style={{ width: '10%' }}
                    sort={{ sortBy: skillsSortBy, onSort: () => handleSort('lastSynced'), columnIndex: 4 }}
                  >
                    Last sync
                  </Th>
                  <Th style={{ width: '10%' }}>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pageSkills.map((skill) => {
                  const source = sources.find((s) => s.id === skill.sourceId);
                  return (
                    <Tr key={skill.id} isRowSelected={selected.has(skill.id)}>
                      <Td
                        select={{
                          rowIndex: pageSkills.indexOf(skill),
                          onSelect: (_e, checked) => handleSelectRow(skill.id, checked),
                          isSelected: selected.has(skill.id),
                        }}
                        style={{ verticalAlign: 'middle' }}
                      />
                      <Td dataLabel="Name" style={{ verticalAlign: 'middle' }}>
                        <strong>{skill.name}</strong>
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
                        {(() => {
                          const sourceHref = resolveSkillSourceUrl(skill, sources);
                          return sourceHref ? (
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
                        );
                        })()}
                      </Td>
                      <Td dataLabel="Category" style={{ verticalAlign: 'middle' }}>
                        {skill.category
                          ? <Label color={categoryColor(skill.category)} isCompact>{skill.category}</Label>
                          : <Content component="small" style={{ fontStyle: 'italic', color: 'var(--pf-t--global--text--color--subtle)' }}>—</Content>}
                      </Td>
                      <Td dataLabel="Last sync" style={{ verticalAlign: 'middle' }}>
                        {source?.lastSynced ? (
                          <Tooltip content={new Date(source.lastSynced).toLocaleString()}>
                            <Content component="small" style={{ cursor: 'default', whiteSpace: 'nowrap' }}>
                              {relativeTime(source.lastSynced)}
                            </Content>
                          </Tooltip>
                        ) : (
                          <Content component="small" style={{ color: 'var(--pf-t--global--color--nonstatus--gray--default)', fontStyle: 'italic' }}>
                            Never
                          </Content>
                        )}
                      </Td>
                      <Td dataLabel="Actions" style={{ verticalAlign: 'middle', paddingInlineEnd: 0 }}>
                        <Flex gap={{ default: 'gapXs' }} flexWrap={{ default: 'nowrap' }} style={{ width: 'fit-content' }}>
                          <FlexItem>
                            <Tooltip content="Delete skill">
                              <Button variant="plain" aria-label={`Delete ${skill.name}`} onClick={() => setDeleteTarget(skill)}
                                style={{ color: 'var(--pf-t--global--icon--color--status--danger--default)' }}>
                                <TrashIcon />
                              </Button>
                            </Tooltip>
                          </FlexItem>
                        </Flex>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
          </Card>

          {/* Pagination footer */}
          {!loading && sortedSkills.length > 0 && (
            <Pagination
              itemCount={sortedSkills.length}
              page={page}
              perPage={perPage}
              onSetPage={(_e, p) => { setPage(p); setSelected(new Set()); }}
              onPerPageSelect={(_e, pp) => { setPerPage(pp); setPage(1); setSelected(new Set()); }}
              perPageOptions={[{ title: '10', value: 10 }, { title: '20', value: 20 }, { title: '50', value: 50 }]}
              style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
            />
          )}
        </PageSection>
      )}

      {/* Sources tab */}
      {isAuthenticated && activeTab === 'sources' && (
        <PageSection variant={PageSectionVariants.default}>
          {(() => {
            const getSourceStatus = (source: SkillSource): React.ReactElement => {
              if (!source.lastSynced) return (
                <Label color="grey" icon={<MinusCircleIcon />} isCompact>Never synced</Label>
              );
              const daysSince = (Date.now() - new Date(source.lastSynced).getTime()) / (1000 * 60 * 60 * 24);
              if (daysSince > 7) return (
                <Label color="orange" icon={<ExclamationTriangleIcon />} isCompact>Stale</Label>
              );
              return (
                <Label color="green" icon={<CheckCircleIcon />} isCompact>Synced</Label>
              );
            };

            const filteredSources = sources
              .filter((s) => {
                const q = sourceSearch.toLowerCase();
                const url = (s as SkillSource & { url?: string }).url ?? '';
                return !q || s.label.toLowerCase().includes(q) || url.toLowerCase().includes(q);
              })
              .sort((a, b) => {
                let cmp = 0;
                if (sourceSortCol === 'source') {
                  const aLabel = formatSourcePath((a as SkillSource & { url?: string }).url) || a.label;
                  const bLabel = formatSourcePath((b as SkillSource & { url?: string }).url) || b.label;
                  cmp = aLabel.localeCompare(bLabel);
                } else if (sourceSortCol === 'skills') {
                  const aCount = skills.filter((s) => s.sourceId === a.id).length;
                  const bCount = skills.filter((s) => s.sourceId === b.id).length;
                  cmp = aCount - bCount;
                } else if (sourceSortCol === 'lastSynced') {
                  const tA = a.lastSynced ? new Date(a.lastSynced).getTime() : 0;
                  const tB = b.lastSynced ? new Date(b.lastSynced).getTime() : 0;
                  cmp = tA - tB;
                }
                return sourceSortDir === 'asc' ? cmp : -cmp;
              });
            const allSourcesSelected = filteredSources.length > 0 && filteredSources.every((s) => selectedSources.has(s.id));
            const someSourcesSelected = selectedSources.size > 0 && !allSourcesSelected;
            return (
          <>
          <Toolbar style={{ paddingBlockEnd: 0 }}>
            <ToolbarContent>
              <ToolbarItem>
                <Dropdown
                  isOpen={sourceSplitBulkOpen}
                  onOpenChange={(open) => setSourceSplitBulkOpen(open)}
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      onClick={() => setSourceSplitBulkOpen(!sourceSplitBulkOpen)}
                      isExpanded={sourceSplitBulkOpen}
                      splitButtonItems={[
                        <MenuToggleCheckbox
                          id="source-bulk-checkbox"
                          key="source-bulk-checkbox"
                          aria-label={allSourcesSelected ? 'Deselect all' : 'Select all'}
                          isChecked={allSourcesSelected ? true : someSourcesSelected ? null : false}
                          onChange={(checked) => {
                            if (checked) setSelectedSources(new Set(filteredSources.map((s) => s.id)));
                            else setSelectedSources(new Set());
                          }}
                        >
                          {selectedSources.size > 0 ? `${selectedSources.size} selected` : undefined}
                        </MenuToggleCheckbox>,
                      ]}
                      aria-label="Bulk select sources"
                    />
                  )}
                >
                  <DropdownList>
                    <DropdownItem key="select-none" onClick={() => { setSelectedSources(new Set()); setSourceSplitBulkOpen(false); }} isDisabled={selectedSources.size === 0}>
                      Select none {selectedSources.size > 0 && `(${selectedSources.size} items)`}
                    </DropdownItem>
                    <DropdownItem key="select-all" onClick={() => { setSelectedSources(new Set(filteredSources.map((s) => s.id))); setSourceSplitBulkOpen(false); }} isDisabled={allSourcesSelected}>
                      Select all ({filteredSources.length} items)
                    </DropdownItem>
                  </DropdownList>
                </Dropdown>
              </ToolbarItem>

              <ToolbarItem>
                <SearchInput
                  placeholder="Search sources…"
                  value={sourceSearch}
                  onChange={(_e, val) => { setSourceSearch(val); setSelectedSources(new Set()); }}
                  onClear={() => { setSourceSearch(''); setSelectedSources(new Set()); }}
                  aria-label="Search sources"
                  style={{ width: '320px' }}
                />
              </ToolbarItem>

              <ToolbarItem>
                <Button variant="primary" icon={<SyncAltIcon />} onClick={handleSourceBulkSync} isLoading={sourceBulkSyncing} isDisabled={sourceBulkSyncing}>
                  {selectedSources.size > 0 ? `Sync (${selectedSources.size})` : 'Sync all'}
                </Button>
              </ToolbarItem>

              {selectedSources.size > 0 && (
                <ToolbarItem>
                  <Button variant="danger" icon={<TrashIcon />} onClick={handleSourceBulkDelete}>
                    Delete ({selectedSources.size})
                  </Button>
                </ToolbarItem>
              )}
            </ToolbarContent>
          </Toolbar>

          <Card style={{ marginBlock: 'var(--pf-t--global--spacer--md)' }}>
            {sources.length === 0 ? (
              <EmptyState headingLevel="h3" titleText="No sources registered" icon={CubeIcon}>
                <EmptyStateBody>Register a Git repository to start indexing skills.</EmptyStateBody>
                <EmptyStateFooter>
                  <EmptyStateActions>
                    <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => setAddOpen(true)}>
                      Register source
                    </Button>
                  </EmptyStateActions>
                </EmptyStateFooter>
              </EmptyState>
            ) : filteredSources.length === 0 ? (
              <EmptyState headingLevel="h3" titleText="No sources match your search" icon={SearchIcon}>
                <EmptyStateBody>Try a different search term or clear the search to see all sources.</EmptyStateBody>
                <EmptyStateFooter>
                  <EmptyStateActions>
                    <Button variant="link" onClick={() => setSourceSearch('')}>Clear search</Button>
                  </EmptyStateActions>
                </EmptyStateFooter>
              </EmptyState>
            ) : (
              <Table aria-label="Sources" style={{ tableLayout: 'auto', width: '100%' }} isStriped isExpandable>
                <Thead>
                  <Tr>
                    <Th
                      expand={{
                        areAllExpanded: filteredSources.length > 0 && filteredSources.every((s) => expandedSources.has(s.id)),
                        collapseAllAriaLabel: 'Expand/collapse all',
                        onToggle: (_e, _rowIndex, isOpen) => {
                          if (isOpen) {
                            setExpandedSources(new Set());
                          } else {
                            setExpandedSources(new Set(filteredSources.map((s) => s.id)));
                          }
                        },
                      }}
                      style={{ width: '40px', minWidth: '40px', paddingInlineEnd: '1rem' }}
                    />
                    <Th screenReaderText="Select row" style={{ width: '40px', minWidth: '40px', paddingInline: 0 }} />
                    <Th
                      style={{ width: '300px', minWidth: '300px' }}
                      sort={{ sortBy: sourcesSortBy, onSort: () => handleSourceSort('source'), columnIndex: 2 }}
                    >Source</Th>
                    <Th sort={{ sortBy: sourcesSortBy, onSort: () => handleSourceSort('skills'), columnIndex: 3 }}>Skills</Th>
                    <Th>Status</Th>
                    <Th sort={{ sortBy: sourcesSortBy, onSort: () => handleSourceSort('lastSynced'), columnIndex: 5 }}>Last sync</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                {filteredSources.map((source, rowIdx) => {
                  const sourceSkills = skills.filter((s) => s.sourceId === source.id);
                  const href = resolveSourceUrl(source);
                  const isExpanded = expandedSources.has(source.id);
                  const status = getSourceStatus(source);
                  return (
                    <Tbody key={source.id} isExpanded={isExpanded}>
                      <Tr isRowSelected={selectedSources.has(source.id)}
                        style={rowIdx % 2 !== 0 ? { backgroundColor: 'var(--pf-v6-c-table--m-striped__tr--OddRow--child--BackgroundColor, var(--pf-t--global--background--color--secondary--default))' } : undefined}>
                        <Td
                          expand={{
                            rowIndex: rowIdx,
                            isExpanded,
                            onToggle: () => toggleSourceExpand(source.id),
                            expandId: `source-expand-${source.id}`,
                          }}
                          style={{ width: '40px', minWidth: '40px', paddingInlineEnd: '1rem', paddingBlock: '0.75rem', verticalAlign: 'middle' }}
                        />
                        <Td
                          select={{
                            rowIndex: rowIdx,
                            onSelect: (_e, checked) => setSelectedSources((prev) => { const n = new Set(prev); if (checked) n.add(source.id); else n.delete(source.id); return n; }),
                            isSelected: selectedSources.has(source.id),
                          }}
                          style={{ width: '40px', minWidth: '40px', paddingInline: 0, paddingBlock: '0.75rem', verticalAlign: 'middle' }}
                        />
                        <Td dataLabel="Source" style={{ verticalAlign: 'middle', width: '300px', minWidth: '300px', paddingBlock: '0.75rem' }}>
                          {href ? (
                            <ExternalLinkButton
                              href={href}
                              variant="link"
                              isInline
                              style={{ fontFamily: 'var(--pf-t--global--font--family--mono)', fontSize: '0.78rem', paddingInline: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              iconProps={{ title: 'Opens in new tab' }}
                            >
                              {formatSourcePath(href)}
                            </ExternalLinkButton>
                          ) : (
                            <Content component="small" style={{ color: 'var(--pf-t--global--text--color--subtle)', fontStyle: 'italic' }}>—</Content>
                          )}
                        </Td>
                        <Td dataLabel="Skills" style={{ verticalAlign: 'middle', paddingBlock: '0.75rem' }}>
                          <Tooltip content={`View ${sourceSkills.length} skill${sourceSkills.length !== 1 ? 's' : ''} from this source`}>
                            <Button
                              variant="link"
                              isInline
                              icon={<CubesIcon />}
                              isDisabled={sourceSkills.length === 0}
                              onClick={() => {
                                setActiveTab('skills');
                                setSourceFilter(source.id);
                                setCategoryFilter(null);
                                setPage(1);
                                setSelected(new Set());
                              }}
                            >
                              {sourceSkills.length}
                            </Button>
                          </Tooltip>
                        </Td>
                        <Td dataLabel="Status" style={{ verticalAlign: 'middle', paddingBlock: '0.75rem' }}>
                          {status}
                        </Td>
                        <Td dataLabel="Last sync" style={{ verticalAlign: 'middle', paddingBlock: '0.75rem' }}>
                          {source.lastSynced ? (
                            <Tooltip content={new Date(source.lastSynced).toLocaleString()}>
                              <Content component="small" style={{ cursor: 'default', whiteSpace: 'nowrap' }}>
                                {relativeTime(source.lastSynced)}
                              </Content>
                            </Tooltip>
                          ) : (
                            <Content component="small" style={{ color: 'var(--pf-t--global--text--color--subtle)', fontStyle: 'italic' }}>—</Content>
                          )}
                        </Td>
                        <Td dataLabel="Actions" style={{ verticalAlign: 'middle', paddingInlineEnd: 0, paddingBlock: '0.75rem' }}>
                          <Flex gap={{ default: 'gapXs' }} flexWrap={{ default: 'nowrap' }}>
                            <FlexItem>
                              <Tooltip content="Edit source">
                                <Button variant="plain" aria-label={`Edit ${source.label}`} onClick={() => openSourceEdit(source)}
                                  style={{ color: 'var(--pf-t--global--icon--color--subtle)' }}>
                                  <PencilAltIcon />
                                </Button>
                              </Tooltip>
                            </FlexItem>
                            <FlexItem>
                              <Tooltip content="Sync source">
                                <Button variant="plain" aria-label={`Sync ${source.label}`} onClick={() => handleSourceSync(source)}
                                  isDisabled={syncingSourceId === source.id}
                                  style={{ color: 'var(--pf-t--global--icon--color--subtle)' }}>
                                  <SyncAltIcon style={{ animation: syncingSourceId === source.id ? 'spin 1s linear infinite' : undefined }} />
                                </Button>
                              </Tooltip>
                            </FlexItem>
                            <FlexItem>
                              <Tooltip content="Delete source">
                                <Button variant="plain" aria-label={`Delete ${source.label}`} onClick={() => setDeleteSourceTarget(source)}
                                  style={{ color: 'var(--pf-t--global--icon--color--status--danger--default)' }}>
                                  <TrashIcon />
                                </Button>
                              </Tooltip>
                            </FlexItem>
                          </Flex>
                        </Td>
                      </Tr>
                      {isExpanded && (
                        <Tr isExpanded isContentExpanded>
                          <Td colSpan={7} noPadding>
                            <ExpandableRowContent>
                              <div style={{ padding: '0.5rem 1rem', backgroundColor: rowIdx % 2 !== 0 ? 'var(--pf-v6-c-table--m-striped__tr--OddRow--child--BackgroundColor, var(--pf-t--global--background--color--secondary--default))' : undefined }}>
                                <Table aria-label={`Skills in ${source.label}`} style={{ tableLayout: 'fixed', width: '100%', fontSize: '0.8rem' }}>
                                  <Thead>
                                    <Tr>
                                      <Th style={{ width: '22%', paddingBlock: '0.5rem' }}>Skill name</Th>
                                      <Th style={{ width: '50%', paddingBlock: '0.5rem' }}>Description</Th>
                                      <Th style={{ width: '28%', paddingBlock: '0.5rem', paddingInlineStart: '2rem' }}>Category</Th>
                                    </Tr>
                                  </Thead>
                                  <Tbody>
                                    {sourceSkills.length === 0 ? (
                                      <Tr>
                                        <Td colSpan={3}>
                                          <Content component="small" style={{ color: 'var(--pf-t--global--text--color--subtle)', fontStyle: 'italic' }}>No skills found in this source.</Content>
                                        </Td>
                                      </Tr>
                                    ) : sourceSkills.map((sk) => (
                                      <Tr key={sk.id}>
                                        <Td dataLabel="Name" style={{ verticalAlign: 'middle', paddingBlock: '0.5rem' }}>{sk.name}</Td>
                                        <Td dataLabel="Description" style={{ verticalAlign: 'middle', paddingBlock: '0.5rem', maxWidth: 0 }}>
                                          {sk.description ? (
                                            <Tooltip content={sk.description}>
                                              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--pf-t--global--text--color--subtle)', cursor: 'default' }}>
                                                {sk.description}
                                              </span>
                                            </Tooltip>
                                          ) : (
                                            <Content component="small" style={{ fontStyle: 'italic', color: 'var(--pf-t--global--text--color--subtle)' }}>—</Content>
                                          )}
                                        </Td>
                                        <Td dataLabel="Category" style={{ verticalAlign: 'middle', paddingBlock: '0.5rem', paddingInlineStart: '2rem' }}>
                                          {sk.category
                                            ? <Label color={categoryColor(sk.category)} isCompact>{sk.category}</Label>
                                            : <Content component="small" style={{ fontStyle: 'italic', color: 'var(--pf-t--global--text--color--subtle)' }}>—</Content>}
                                        </Td>
                                      </Tr>
                                    ))}
                                  </Tbody>
                                </Table>
                              </div>
                            </ExpandableRowContent>
                          </Td>
                        </Tr>
                      )}
                    </Tbody>
                  );
                })}
              </Table>
            )}
          </Card>
          </>
            );
          })()}
        </PageSection>
      )}

      {/* Login modal */}
      <Modal isOpen={loginOpen} onClose={() => setLoginOpen(false)} variant="small">
        <ModalHeader title="Sign in as admin" />
        <ModalBody>
          {loginError && <Alert variant="danger" title={loginError} style={{ marginBottom: '1rem' }} />}
          <Form>
            <FormGroup label="Admin token" isRequired fieldId="admin-token">
              <TextInput
                id="admin-token"
                type="password"
                value={loginInput}
                onChange={(_e, val) => setLoginInput(val)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Enter admin token…"
                autoFocus
              />
            </FormGroup>
          </Form>
          <Content component="p" style={{ marginTop: 'var(--pf-t--global--spacer--sm)', fontSize: '0.85em' }}>
            The default token (<code>rhess-admin</code>) is printed in the server startup logs. Set{' '}
            <code>ADMIN_TOKEN</code> env var to change it.
          </Content>
        </ModalBody>
        <ModalFooter>
          <ActionGroup>
            <Button variant="primary" onClick={handleLogin} isDisabled={!loginInput.trim()}>Sign in</Button>
            <Button variant="link" onClick={() => { setLoginOpen(false); setLoginInput(''); setLoginError(''); }}>Cancel</Button>
          </ActionGroup>
        </ModalFooter>
      </Modal>

      {/* Register source modal */}
      <Modal isOpen={addOpen} onClose={resetAddModal} variant="medium">
        <ModalHeader
          title="Register source"
          description="Paste a Git repository URL. RHESS will clone the repo and discover SKILL.md files automatically."
        />
        <ModalBody>
          {addError && <Alert variant="danger" title={addError} style={{ marginBottom: '1rem' }} />}

          <Form>
            <FormGroup label="Repository URL" isRequired fieldId="source-url">
              <TextInput
                id="source-url"
                value={newUrl}
                onChange={handleUrlChange}
                placeholder="e.g. github.com/redhat-ux/agent-skills"
                autoFocus
                isDisabled={addLoading}
              />
              <FormHelperText>
                <HelperText><HelperTextItem>GitHub/GitLab <code>org/repo</code> or full URL</HelperTextItem></HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup label="Label (optional)" fieldId="source-label">
              <TextInput
                id="source-label"
                value={newLabel}
                onChange={(_e, val) => setNewLabel(val)}
                placeholder={newUrl.trim() ? parseSourceName(newUrl.trim()) : 'Friendly display name'}
                isDisabled={addLoading}
              />
              <FormHelperText>
                <HelperText><HelperTextItem>Defaults to the repository name if left blank</HelperTextItem></HelperText>
              </FormHelperText>
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <ActionGroup>
            <Flex gap={{ default: 'gapSm' }}>
              <FlexItem>
                <Button
                  variant="primary"
                  onClick={handleAddSource}
                  isLoading={addLoading}
                  isDisabled={!newUrl.trim() || addLoading}
                >
                  {addLoading ? 'Registering…' : 'Register source'}
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="link" onClick={resetAddModal} isDisabled={addLoading}>Cancel</Button>
              </FlexItem>
            </Flex>
          </ActionGroup>
        </ModalFooter>
      </Modal>

      {/* Edit source modal */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} variant="medium">
        <ModalHeader title={`Edit source`} />
        <ModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pf-t--global--spacer--md)' }}>
            {editTarget && (() => {
              const editSourceSkills = skills.filter((s) => s.sourceId === editTarget.id);
              const editSourceUrl = resolveSourceUrl(editTarget);
              return (
                <>
                  <FormGroup label={modalFieldLabel('Repository')} fieldId="edit-repo-url">
                    {editSourceUrl ? (
                      <ExternalLinkButton
                        href={editSourceUrl}
                        variant="link"
                        isInline
                        style={{ paddingInline: 0, fontSize: '0.875rem' }}
                        iconProps={{ title: 'Opens in new tab' }}
                      >
                        {editSourceUrl}
                      </ExternalLinkButton>
                    ) : (
                      <Content component="small" style={{ color: 'var(--pf-t--global--text--color--subtle)', fontStyle: 'italic' }}>No repository URL</Content>
                    )}
                  </FormGroup>
                  <FormGroup label={modalFieldLabel('Source name')} fieldId="edit-label-confirm">
                    <TextInput
                      id="edit-label-confirm"
                      value={formatSourcePath(editSourceUrl) || editLabel}
                      readOnlyVariant="default"
                      aria-label="Source name (read-only)"
                    />
                    <FormHelperText>
                      <HelperText><HelperTextItem>Derived from the repository URL</HelperTextItem></HelperText>
                    </FormHelperText>
                  </FormGroup>
                  <FormGroup label={modalFieldLabel('Skills')} fieldId="edit-skills">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pf-t--global--spacer--sm)' }}>
                      <Content component="p" style={{ color: 'var(--pf-t--global--text--color--subtle)', margin: 0 }}>
                        Found <strong>{editSourceSkills.length} skill{editSourceSkills.length !== 1 ? 's' : ''}</strong> in{' '}
                        <code style={{ fontSize: '0.85rem' }}>{formatSourcePath(editSourceUrl) || editTarget.label}</code>.{' '}
                        Uncheck any skills you want to remove.
                      </Content>
                      <DataList aria-label="Source skills" isCompact>
                        {editSourceSkills.map((s) => (
                          <DataListItem key={s.id} id={`edit-skill-${s.id}`} style={{ opacity: editSelectedSkillIds.has(s.id) ? 1 : 0.6 }}>
                            <DataListItemRow>
                              <DataListCheck
                                aria-labelledby={`edit-skill-label-${s.id}`}
                                isChecked={editSelectedSkillIds.has(s.id)}
                                onChange={() => setEditSelectedSkillIds((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                              />
                              <DataListItemCells dataListCells={[
                                <DataListCell key="name">
                                  <span id={`edit-skill-label-${s.id}`}>
                                    <strong style={{ fontSize: '0.82rem' }}>{s.name}</strong>
                                    {s.description && <Content component="p" style={{ fontSize: '0.76rem', color: 'var(--pf-t--global--text--color--subtle)', margin: '0.05rem 0 0' }}>{s.description}</Content>}
                                  </span>
                                </DataListCell>
                              ]} />
                            </DataListItemRow>
                          </DataListItem>
                        ))}
                      </DataList>
                    </div>
                  </FormGroup>
                </>
              );
            })()}
          </div>
        </ModalBody>
        <ModalFooter>
          <ActionGroup>
            <Button variant="primary" onClick={handleEditSave} isLoading={editSaving} isDisabled={editSaving || editSelectedSkillIds.size === 0}>
              {editSaving ? 'Saving…' : `Save (${editSelectedSkillIds.size} skills)`}
            </Button>
            <Button variant="link" onClick={() => setEditTarget(null)}>Cancel</Button>
          </ActionGroup>
        </ModalFooter>
      </Modal>

      {/* Delete confirm modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} variant="small">
        <ModalHeader title={`Delete "${deleteTarget?.name}"?`} />
        <ModalBody>
          <Content component="p">
            This will remove the skill and its source from the catalog. The action cannot be undone.
          </Content>
        </ModalBody>
        <ModalFooter>
          <ActionGroup>
            <Button variant="danger" onClick={handleDelete} isLoading={deleteLoading} isDisabled={deleteLoading}>
              {deleteLoading ? 'Deleting…' : 'Delete'}
            </Button>
            <Button variant="link" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          </ActionGroup>
        </ModalFooter>
      </Modal>

      {/* Bulk delete confirm modal */}
      <Modal isOpen={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} variant="small">
        <ModalHeader title={`Delete ${selected.size} skill${selected.size !== 1 ? 's' : ''}?`} />
        <ModalBody>
          <Content component="p">
            This will permanently delete the selected skills. This action cannot be undone.
          </Content>
        </ModalBody>
        <ModalFooter>
          <ActionGroup>
            <Button variant="danger" onClick={handleBulkDelete} isLoading={bulkDeleting} isDisabled={bulkDeleting}>
              {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} skill${selected.size !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="link" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
          </ActionGroup>
        </ModalFooter>
      </Modal>

      {/* Delete source confirm modal */}
      <Modal isOpen={!!deleteSourceTarget} onClose={() => setDeleteSourceTarget(null)} variant="small">
        <ModalHeader title={`Delete "${deleteSourceTarget?.label}"?`} />
        <ModalBody>
          <Content component="p">
            This will remove the source and all its skills from the catalog. This action cannot be undone.
          </Content>
        </ModalBody>
        <ModalFooter>
          <ActionGroup>
            <Button variant="danger" onClick={handleDeleteSource} isLoading={deleteSourceLoading} isDisabled={deleteSourceLoading}>
              {deleteSourceLoading ? 'Deleting…' : 'Delete'}
            </Button>
            <Button variant="link" onClick={() => setDeleteSourceTarget(null)}>Cancel</Button>
          </ActionGroup>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default AdminPage;
