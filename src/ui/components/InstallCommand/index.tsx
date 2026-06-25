import React, { useState } from 'react';
import { Tooltip } from '@patternfly/react-core';
import { CopyIcon, CheckCircleIcon } from '@patternfly/react-icons';

const InstallCommand: React.FC<{ command: string; compact?: boolean }> = ({ command, compact }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip content={copied ? 'Copied!' : command} isContentLeftAligned>
      <button
        onClick={handleCopy}
        aria-label="Copy install command"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          width: '100%',
          background: 'var(--pf-t--global--background--color--secondary--default)',
          border: '1px solid var(--pf-t--global--border--color--default)',
          borderRadius: 'var(--pf-t--global--border--radius--md, 6px)',
          padding: compact ? '0.3rem 0.5rem' : '0.45rem 0.6rem',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e =>
          (e.currentTarget.style.borderColor = 'var(--pf-t--global--border--color--hover, #0066cc)')
        }
        onMouseLeave={e =>
          (e.currentTarget.style.borderColor = 'var(--pf-t--global--border--color--default)')
        }
      >
        <code
          style={{
            flex: 1,
            fontSize: compact ? '0.75em' : '0.8em',
            fontFamily: 'var(--pf-t--global--font--family--mono, monospace)',
            color: 'var(--pf-t--global--text--color--regular)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {command}
        </code>
        <span
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            color: copied
              ? 'var(--pf-t--global--icon--color--status--success--default)'
              : 'var(--pf-t--global--icon--color--subtle)',
            fontSize: compact ? '0.85rem' : '0.95rem',
            transition: 'color 0.15s',
          }}
        >
          {copied ? <CheckCircleIcon /> : <CopyIcon />}
        </span>
      </button>
    </Tooltip>
  );
};

export default InstallCommand;
