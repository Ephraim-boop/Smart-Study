import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import {
  AlertIcon,
  ArrowLeftIcon,
  CameraIcon,
  FileTextIcon,
  ImageIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from '../components/icons';
import { CameraCapture } from './CameraCapture';
import { useNotes } from '../summarize/NotesProvider';
import { useI18n } from '../i18n/LanguageProvider';
import {
  formatBytes,
  MAX_FILE_BYTES,
  DOCUMENT_ACCEPT,
  IMAGE_ACCEPT,
  type NoteSource,
} from './types';

function MethodCard({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-w-0 flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-white hover:shadow-md sm:p-5"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
        {icon}
      </span>
      <span>
        <span className="block break-words font-semibold text-brand-navy">{title}</span>
        <span className="mt-0.5 block break-words text-sm text-slate-500">{hint}</span>
      </span>
    </button>
  );
}

function SourceBadge({ source }: { source: NoteSource }) {
  const { t } = useI18n();
  const label = source === 'camera' ? t('upload.badgeCamera') : source === 'pdf' ? t('upload.badgePdf') : t('upload.badgePhoto');
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      {label}
    </span>
  );
}

export function UploadNotesPage({
  onBack,
  onSummarize,
}: {
  onBack: () => void;
  onSummarize?: () => void;
}) {
  // Upload state is shared with Smart Summarize via NotesProvider, so the exact
  // same files can be summarized later without uploading again.
  const { t, tList } = useI18n();
  const { notes, errors, addFiles, removeNote, clearAll, loading, saving, cloudNotice } = useNotes();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const methodTitles = tList('upload.methodTitles');
  const methodHints = tList('upload.methodHints');

  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  function handleInputChange(
    e: ChangeEvent<HTMLInputElement>,
    source: NoteSource,
  ) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) addFiles(files, source);
    // Reset so selecting the same file again still fires change.
    e.target.value = '';
  }

  function handleCameraCapture(file: File) {
    addFiles([file], 'camera');
    setCameraOpen(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length) addFiles(files, 'pdf');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-700 via-blue-700 to-cyan-600 font-sans text-slate-700">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 px-3 py-3 sm:flex-nowrap sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 sm:text-base"
          >
            <ArrowLeftIcon width={18} height={18} className="text-white" />
            <span>{t('upload.back')}</span>
          </button>
          <h1 className="min-w-0 flex-1 break-words text-base font-bold text-slate-900 sm:text-xl">{t('upload.title')}</h1>
          {onSummarize && notes.length > 0 && (
            <button
              type="button"
              onClick={onSummarize}
              className="ml-auto inline-flex shrink-0 items-center justify-center rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:px-4 sm:text-sm"
            >
              {t('upload.smartSummarize')}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-4xl px-3 py-5 sm:px-6 sm:py-8">
        <div className="min-w-0 rounded-[2rem] border border-white/20 bg-slate-50/95 p-4 shadow-2xl backdrop-blur-sm sm:p-8">
          <p className="text-slate-600">
            {t('upload.intro')}
          </p>

        {/* Method cards */}
          <div className="mt-6 grid min-w-0 gap-3 sm:grid-cols-3 sm:gap-4">
            <MethodCard
              icon={<CameraIcon width={22} height={22} />}
              title={methodTitles[0]}
              hint={methodHints[0]}
              onClick={() => setCameraOpen(true)}
            />
            <MethodCard
              icon={<FileTextIcon width={22} height={22} />}
              title={methodTitles[1]}
              hint={methodHints[1]}
              onClick={() => pdfInputRef.current?.click()}
            />
            <MethodCard
              icon={<ImageIcon width={22} height={22} />}
              title={methodTitles[2]}
              hint={methodHints[2]}
              onClick={() => photoInputRef.current?.click()}
            />
          </div>

        <input
          ref={pdfInputRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handleInputChange(e, 'pdf')}
        />
        <input
          ref={photoInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handleInputChange(e, 'photo')}
        />

        {/* Drag & drop */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={`mt-4 flex min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition sm:p-8 ${
              dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white/80 hover:bg-slate-50'
            }`}
          >
          <UploadIcon width={26} height={26} className="text-slate-400" />
          <span className="text-sm font-medium text-brand-navy">
            {t('upload.dragTitle')}
          </span>
          <span className="text-xs text-slate-400">
            {t('upload.dragHintPrefix')}{formatBytes(MAX_FILE_BYTES)}{t('upload.dragHintSuffix')}
          </span>
          <input
            type="file"
            accept={`${DOCUMENT_ACCEPT},${IMAGE_ACCEPT}`}
            multiple
            className="hidden"
            onChange={(e) => handleInputChange(e, 'pdf')}
          />
        </label>

          {/* Saving / loading feedback for the account's own note vault */}
          {(saving || loading) && (
            <p className="mt-4 text-sm text-blue-700">
              {saving ? t('upload.savingNotes') : t('upload.loadingNotes')}
            </p>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="mt-4 rounded-xl bg-red-50 p-3 ring-1 ring-inset ring-red-200">
              <div className="flex items-start gap-2">
                <AlertIcon width={18} height={18} className="mt-0.5 shrink-0 text-red-500" />
                <ul className="space-y-1 text-sm text-red-700">
                  {errors.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Notes list */}
          <section className="mt-8 min-w-0">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('upload.yourUploads')} ({notes.length})
            </h2>
            {notes.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="shrink-0 text-right text-sm font-medium text-slate-500 hover:text-red-600"
              >
                {t('upload.clearAll')}
              </button>
            )}
          </div>

          {notes.length === 0 ? (
            <div className="mt-4 flex min-w-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-5 text-center sm:p-10">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <PlusIcon width={22} height={22} />
              </span>
              <p className="mt-3 text-sm text-slate-500">
                {t('upload.empty')}
              </p>
            </div>
          ) : (
            <ul className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-3"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 sm:h-14 sm:w-14">
                    {n.previewUrl ? (
                      <img src={n.previewUrl} alt={n.name} className="h-full w-full object-contain" />
                    ) : (
                      <FileTextIcon width={22} height={22} className="text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-navy">{n.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <SourceBadge source={n.source} />
                      <span className="text-xs text-slate-400">{formatBytes(n.size)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeNote(n.id)}
                    aria-label={`${t('upload.removeAria')} ${n.name}`}
                    className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <TrashIcon width={18} height={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

          <p className="mt-6 text-xs text-slate-400">
            {cloudNotice ? t('upload.localOnlySessionNote') : t('upload.sessionNote')}
          </p>

          {/*
            A missing cloud copy is an admin setup issue, never a reason to lose or
            hide the student's notes — so it is stated plainly instead of failing
            silently. The device copy is always kept.
          */}
          {cloudNotice && (
            <div className="mt-3 break-words rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
              <p className="font-semibold">{t('upload.deviceOnlyNotice')}</p>
              <p className="mt-1">{cloudNotice}</p>
            </div>
          )}
        </div>
      </main>

      {cameraOpen && (
        <CameraCapture onCapture={handleCameraCapture} onClose={() => setCameraOpen(false)} />
      )}
    </div>
  );
}
