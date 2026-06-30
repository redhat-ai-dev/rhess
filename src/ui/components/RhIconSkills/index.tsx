import React, { useEffect, useRef } from 'react';
import skillsIcon from '@rhds/icons/standard/skills.js';

interface RhIconSkillsProps {
  size?: number;
  className?: string;
}

/** Red Hat standard icon set — skills (rh-icon set="standard" icon="skills"). */
const RhIconSkills: React.FC<RhIconSkillsProps> = ({ size = 32, className }) => {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const node = skillsIcon.cloneNode(true);
    const svg = (
      node instanceof SVGSVGElement
        ? node
        : node instanceof DocumentFragment
          ? node.querySelector('svg')
          : null
    ) as SVGSVGElement | null;

    if (svg) {
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
      svg.setAttribute('fill', 'currentColor');
      svg.querySelectorAll('path').forEach((path) => path.setAttribute('fill', 'currentColor'));
    }

    host.replaceChildren(node);
  }, [size]);

  return (
    <span
      ref={hostRef}
      className={className}
      aria-hidden="true"
      style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}
    />
  );
};

export default RhIconSkills;
