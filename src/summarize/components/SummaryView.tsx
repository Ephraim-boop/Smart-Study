import type { ReactNode } from 'react';
import type { SummaryResult } from '../types';
import { useI18n } from '../../i18n/LanguageProvider';

/**
 * Renders a structured Smart Summarize result. Shared by the summarize page
 * (just-generated result) and the saved-summaries library (reviewing later),
 * so a saved summary always looks identical to when it was first produced.
 */
export function SummaryView({ result }: { result: SummaryResult }) {
  const { t } = useI18n();
  return (
    <div className="space-y-6 break-words">
      <Block title={t('summarize.view.main')}>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
          {result.mainSummary}
        </p>
      </Block>

      {result.keyPoints.length > 0 && (
        <Block title={t('summarize.view.keyPoints')}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {result.keyPoints.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </Block>
      )}

      {result.definitions.length > 0 && (
        <Block title={t('summarize.view.definitions')}>
          <dl className="space-y-2 text-sm">
            {result.definitions.map((d, i) => (
              <div key={i}>
                <dt className="font-semibold text-brand-navy">{d.term}</dt>
                <dd className="text-slate-600">{d.definition}</dd>
              </div>
            ))}
          </dl>
        </Block>
      )}

      {result.facts.length > 0 && (
        <Block title={t('summarize.view.facts')}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {result.facts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </Block>
      )}

      {result.topics.length > 0 && (
        <div id="summary-topics" className="scroll-mt-20">
          <Block title={t('summarize.view.topics')}>
            <div className="space-y-3 break-words text-sm">
              {result.topics.map((t, i) => (
                <div key={i}>
                  <p className="font-semibold text-brand-navy">{t.title}</p>
                  <p className="text-slate-600">{t.explanation}</p>
                </div>
              ))}
            </div>
          </Block>
        </div>
      )}

      {result.revisionTips.length > 0 && (
        <Block title={t('summarize.view.tips')}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {result.revisionTips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-600">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}
