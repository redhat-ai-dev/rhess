import React from 'react';
import {
  Page,
  Masthead,
  MastheadMain,
  MastheadBrand,
  MastheadContent,
  SkipToContent,
  Button,
  Flex,
  FlexItem,
  Tooltip,
} from '@patternfly/react-core';
import { OutlinedMoonIcon, RhUiLightModeIcon, LockIcon, ArrowLeftIcon } from '@patternfly/react-icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../hooks/useTheme';

interface AppLayoutProps {
  children: React.ReactNode;
}

const MAIN_ID = 'rhess-main-content';

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { isDark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = location.pathname === '/admin';

  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand onClick={() => navigate('/skills')} style={{ cursor: 'pointer' }}>
          <img
            src={isDark ? '/logo-dark.png' : '/logo-light.png'}
            alt="Red Hat Enterprise Skills Server"
            style={{ height: '32px', width: 'auto' }}
          />
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Flex
          alignItems={{ default: 'alignItemsCenter' }}
          justifyContent={{ default: 'justifyContentFlexEnd' }}
          gap={{ default: 'gapMd' }}
          style={{ width: '100%' }}
        >
          <FlexItem>
            <Tooltip position="bottom" content={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <button
                onClick={toggleTheme}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  padding: '3px',
                  borderRadius: '2rem',
                  border: '1px solid var(--pf-t--global--border--color--default)',
                  background: 'var(--pf-t--global--background--color--secondary--default)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <span
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '1.4rem', height: '1.4rem', borderRadius: '50%',
                    background: !isDark ? 'var(--pf-t--global--color--brand--default)' : 'transparent',
                    color: !isDark ? 'var(--pf-t--global--text--color--on-brand--default, #fff)' : 'var(--pf-t--global--icon--color--subtle)',
                    transition: 'background 0.2s, color 0.2s', fontSize: '1rem',
                  }}
                >
                  <RhUiLightModeIcon />
                </span>
                <span
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '1.4rem', height: '1.4rem', borderRadius: '50%',
                    background: isDark ? 'var(--pf-t--global--color--brand--default)' : 'transparent',
                    color: isDark ? 'var(--pf-t--global--text--color--on-brand--default, #fff)' : 'var(--pf-t--global--icon--color--subtle)',
                    transition: 'background 0.2s, color 0.2s', fontSize: '1rem',
                  }}
                >
                  <OutlinedMoonIcon />
                </span>
              </button>
            </Tooltip>
          </FlexItem>
          <FlexItem>
            <Button
              variant={isAdmin ? 'secondary' : 'secondary'}
              size="sm"
              icon={isAdmin ? <ArrowLeftIcon /> : <LockIcon />}
              onClick={() => navigate(isAdmin ? '/skills' : '/admin')}
            >
              {isAdmin ? 'Back to skills' : 'Admin'}
            </Button>
          </FlexItem>
        </Flex>
      </MastheadContent>
    </Masthead>
  );

  return (
    <Page
      masthead={masthead}
      mainContainerId={MAIN_ID}
      skipToContent={<SkipToContent href={`#${MAIN_ID}`}>Skip to content</SkipToContent>}
    >
      {children}
    </Page>
  );
};

export default AppLayout;
