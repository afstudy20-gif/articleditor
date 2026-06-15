'use client';

import type { ProjectNote } from '@/store/types';

type Props = {
  notes: ProjectNote[];
  hasProject: boolean;
  onDelete: (noteId: string) => void;
};

export function NotesPanel({ notes, hasProject, onDelete }: Props) {
  if (!hasProject) {
    return (
      <p className="p-3 text-xs text-gray-500">
        Not eklemek için yukarıdan bir proje seçin.
      </p>
    );
  }

  if (notes.length === 0) {
    return (
      <p className="p-3 text-xs text-gray-500">
        Metni seçip “Not ekle” ile bu projeye kaydedin.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 p-2">
      {notes.map((note) => (
        <li key={note.id} className="rounded border border-gray-200 bg-white p-2 text-sm">
          <p className="text-gray-800">{note.text}</p>
          {note.translation && (
            <p className="mt-1 border-l-2 border-teal-200 pl-2 text-xs text-teal-800">
              {note.translation}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400">
            {note.page != null && <span>s. {note.page}</span>}
            <button
              onClick={() => navigator.clipboard?.writeText(note.text)}
              className="rounded px-1 hover:bg-gray-100 hover:text-gray-600"
            >
              Kopyala
            </button>
            <button
              onClick={() => onDelete(note.id)}
              className="rounded px-1 hover:bg-gray-100 hover:text-red-600"
            >
              Sil
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
