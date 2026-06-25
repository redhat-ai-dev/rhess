import React, { useEffect, useState } from 'react';
import {
  PageSection,
  PageSectionVariants,
  Title,
  Breadcrumb,
  BreadcrumbItem,
  Grid,
  GridItem,
  Card,
  CardTitle,
  CardBody,
  Button,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateActions,
  Skeleton,
  Content,
  Divider,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
} from '@patternfly/react-core';
import { ArrowLeftIcon, ExclamationCircleIcon, FolderOpenIcon, FileIcon, TagIcon } from '@patternfly/react-icons';
import { ExternalLinkButton } from '@patternfly/react-component-groups';
import { useNavigate, useParams } from 'react-router-dom';
import { categoryColor, formatSourcePath, resolveSkillSourceUrl } from '../../utils/category';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getSkill } from '../../api/client';
import type { SkillDetail, SkillFile } from '../../api/types';
import InstallCommand from '../../components/InstallCommand';

/** Strip the leading YAML frontmatter block so it isn't duplicated in the rendered body. */
function stripFrontmatter(content: string): string {
  return content.startsWith('---')
    ? content.replace(/^---[\s\S]*?---\s*\n?/, '')
    : content;
}

const MarkdownSection: React.FC<{ content: string }> = ({ content }) => (
  <div className="pf-v6-c-content">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(content)}</ReactMarkdown>
  </div>
);

const MetadataCard: React.FC<{ skill: SkillDetail }> = ({ skill }) => {
  const navigate = useNavigate();
  const sourceUrl = resolveSkillSourceUrl(skill);

  const fmEntries = Object.entries(skill.frontmatter).filter(
    ([k]) => !['name', 'description', 'category', 'allowed-tools', 'source'].includes(k)
  );

  return (
    <Card isGlass isFullHeight>
      <CardTitle>Details</CardTitle>
      <CardBody>
        <DescriptionList isCompact>
          {sourceUrl && (
            <DescriptionListGroup>
              <DescriptionListTerm>Source</DescriptionListTerm>
              <DescriptionListDescription>
                <ExternalLinkButton
                  href={sourceUrl}
                  variant="link"
                  isInline
                  style={{ fontFamily: 'var(--pf-t--global--font--family--mono)', fontSize: '0.85em', paddingInline: 0 }}
                  iconProps={{ title: 'Opens in new tab' }}
                >
                  {formatSourcePath(sourceUrl) || sourceUrl}
                </ExternalLinkButton>
              </DescriptionListDescription>
            </DescriptionListGroup>
          )}

          {typeof skill.frontmatter.category === 'string' && (
            <DescriptionListGroup>
              <DescriptionListTerm>Category</DescriptionListTerm>
              <DescriptionListDescription>
                <Label
                  color={categoryColor(skill.frontmatter.category)}
                  isCompact
                  onClick={() => navigate(`/skills?category=${encodeURIComponent(skill.frontmatter.category as string)}`)}
                  style={{ cursor: 'pointer' }}
                >{skill.frontmatter.category}</Label>
              </DescriptionListDescription>
            </DescriptionListGroup>
          )}

          {skill.allowedTools?.length > 0 && (
            <DescriptionListGroup>
              <DescriptionListTerm>
                <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapXs' }}>
                  <FlexItem><TagIcon style={{ fontSize: '0.8em' }} /></FlexItem>
                  <FlexItem>Allowed tools</FlexItem>
                </Flex>
              </DescriptionListTerm>
              <DescriptionListDescription>
                <LabelGroup>
                  {skill.allowedTools.map((tool) => (
                    <Label key={tool} color="blue" isCompact>{tool}</Label>
                  ))}
                </LabelGroup>
              </DescriptionListDescription>
            </DescriptionListGroup>
          )}

          <DescriptionListGroup>
            <DescriptionListTerm>Slug</DescriptionListTerm>
            <DescriptionListDescription>
              <code style={{ fontSize: '0.8em' }}>{skill.slug}</code>
            </DescriptionListDescription>
          </DescriptionListGroup>

          <DescriptionListGroup>
            <DescriptionListTerm>Last modified</DescriptionListTerm>
            <DescriptionListDescription>
              <code style={{ fontSize: '0.8em' }}>
                {new Date(skill.lastModified).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </code>
            </DescriptionListDescription>
          </DescriptionListGroup>

          {fmEntries.map(([key, val]) => (
            <DescriptionListGroup key={key}>
              <DescriptionListTerm>{key}</DescriptionListTerm>
              <DescriptionListDescription>
                <code style={{ fontSize: '0.8em' }}>
                  {typeof val === 'string' ? val : JSON.stringify(val)}
                </code>
              </DescriptionListDescription>
            </DescriptionListGroup>
          ))}
        </DescriptionList>
      </CardBody>
    </Card>
  );
};

const FileTreeCard: React.FC<{ files: SkillFile[] }> = ({ files }) => {
  const [selected, setSelected] = useState<SkillFile | null>(
    files.find((f) => f.path === 'SKILL.md') ?? files[0] ?? null
  );
  if (!files.length) return null;
  return (
    <Card isGlass>
      <CardTitle>
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
          <FlexItem><FolderOpenIcon /></FlexItem>
          <FlexItem>Files</FlexItem>
        </Flex>
      </CardTitle>
      <CardBody style={{ padding: 0 }}>
        {files.map((file) => (
          <button
            key={file.path}
            onClick={() => setSelected(file)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.4rem 1rem',
              background: selected?.path === file.path
                ? 'var(--pf-t--global--background--color--secondary--default)'
                : 'transparent',
              border: 'none',
              borderLeft: selected?.path === file.path
                ? '3px solid var(--pf-t--global--color--brand--default)'
                : '3px solid transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '0.85em',
              fontFamily: 'var(--pf-t--global--font--family--mono, monospace)',
              color: 'var(--pf-t--global--text--color--regular)',
            }}
          >
            <FileIcon style={{ flexShrink: 0, fontSize: '0.8em', color: 'var(--pf-t--global--icon--color--subtle)' }} />
            {file.path}
          </button>
        ))}
        {selected && (
          <div style={{ borderTop: '1px solid var(--pf-t--global--border--color--default)', padding: '1rem' }}>
            <pre style={{ margin: 0, fontSize: '0.78em', overflow: 'auto', maxHeight: '300px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {selected.contents}
            </pre>
          </div>
        )}
      </CardBody>
    </Card>
  );
};

const InstallCard: React.FC<{ command: string }> = ({ command }) => (
  <Card isGlass>
    <CardTitle>Install command</CardTitle>
    <CardBody>
      <Content component="p" style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}>
        Copy this skill to your directory:
      </Content>
      <InstallCommand command={command} />
    </CardBody>
  </Card>
);

const DetailSkeleton: React.FC = () => (
  <>
    <PageSection variant={PageSectionVariants.secondary} isWidthLimited>
      <Skeleton width="30%" height="1rem" style={{ marginBottom: '1rem' }} />
      <Skeleton width="50%" height="2rem" style={{ marginBottom: '0.5rem' }} />
      <Skeleton width="70%" height="1rem" />
    </PageSection>
    <PageSection>
      <Grid hasGutter>
        <GridItem md={8}>
          <Card isGlass>
            <CardBody>
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton
                  key={i}
                  width={`${70 + Math.random() * 30}%`}
                  height="0.9rem"
                  style={{ marginBottom: '0.6rem' }}
                />
              ))}
            </CardBody>
          </Card>
        </GridItem>
        <GridItem md={4}>
          <Card isGlass>
            <CardTitle>
              <Skeleton width="40%" height="1.2rem" />
            </CardTitle>
            <CardBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} width="80%" height="0.9rem" style={{ marginBottom: '0.6rem' }} />
              ))}
            </CardBody>
          </Card>
        </GridItem>
      </Grid>
    </PageSection>
  </>
);

const SkillDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSkill(id)
      .then((data) => {
        setSkill(data);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <DetailSkeleton />;

  if (error || !skill) {
    return (
      <PageSection>
        <EmptyState
          headingLevel="h2"
          titleText="Skill not found"
          icon={ExclamationCircleIcon}
        >
          <EmptyStateBody>{error ?? 'The requested skill could not be loaded.'}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => navigate('/skills')}>
                Back to skills
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <>
      <PageSection variant={PageSectionVariants.secondary} isWidthLimited>
        <Breadcrumb style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}>
          <BreadcrumbItem onClick={() => navigate('/skills')} style={{ cursor: 'pointer' }}>
            Skills
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{skill.name}</BreadcrumbItem>
        </Breadcrumb>

        <Flex alignItems={{ default: 'alignItemsFlexStart' }}>
          <FlexItem>
            <Button
              variant="plain"
              aria-label="Go back"
              onClick={() => navigate('/skills')}
              style={{ padding: '0.2rem 0.5rem 0 0' }}
            >
              <ArrowLeftIcon />
            </Button>
          </FlexItem>
          <FlexItem grow={{ default: 'grow' }}>
            <Title headingLevel="h1" size="2xl">
              {skill.name}
            </Title>
            {skill.description && (
              <Content
                component="p"
                style={{ marginTop: 'var(--pf-t--global--spacer--xs)', maxWidth: '72ch' }}
              >
                {skill.description}
              </Content>
            )}
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection variant={PageSectionVariants.secondary} padding={{ default: 'noPadding' }}>
        <Divider />
      </PageSection>

      <PageSection>
        <Grid hasGutter>
          <GridItem md={8}>
            <Card isGlass isFullHeight>
              <CardTitle>SKILL.md</CardTitle>
              <CardBody>
                {skill.content ? (
                  <MarkdownSection content={skill.content} />
                ) : (
                  <Content
                    component="p"
                    style={{
                      color: 'var(--pf-t--global--color--nonstatus--gray--default)',
                      fontStyle: 'italic',
                    }}
                  >
                    No content available.
                  </Content>
                )}
              </CardBody>
            </Card>
          </GridItem>

          <GridItem md={4}>
            <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
              <FlexItem>
                <InstallCard command={skill.installCommand} />
              </FlexItem>
              {skill.files?.length > 1 && (
                <FlexItem>
                  <FileTreeCard files={skill.files} />
                </FlexItem>
              )}
              <FlexItem>
                <MetadataCard skill={skill} />
              </FlexItem>
            </Flex>
          </GridItem>
        </Grid>
      </PageSection>
    </>
  );
};

export default SkillDetailPage;
