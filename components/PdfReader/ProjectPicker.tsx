'use client';

import { useEffect, useState } from 'react';
import { listProjects } from '@/store/db';
import type { Project } from '@/store/types';

type Props = {
  value: string | null;
  onChange: (id: string) => void;
};

export function ProjectPicker({ value, onChange }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let cancelled = false;
    listProjects().then((ps) => {
      if (!cancelled) {
        const sorted = [...ps].sort((a, b) => b.updatedAt - a.updatedAt);
        setProjects(sorted);
        if (!value && sorted[0]) onChange(sorted[0].id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value, onChange]);

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs"
    >
      <option value="" disabled>
        Select project…
      </option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title} ({p.refs.length})
        </option>
      ))}
    </select>
  );
}
