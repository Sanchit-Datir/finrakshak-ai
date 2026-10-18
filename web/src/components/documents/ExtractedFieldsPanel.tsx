import { FileSearch } from 'lucide-react';
import { useState } from 'react';
import { LANGUAGE_LABEL } from '../../domain/labels.js';
import type { FtDocument } from '../../domain/schemas.js';
import { getSample } from '../../demo/samples.js';
import { useDb } from '../../state/store.js';
import { EmptyState, Notice, SimulatedBadge } from '../ui/States.js';
import { Tabs } from '../ui/Tabs.js';
import { FieldList } from './FieldList.js';

type Tab = 'fields' | 'original' | 'translation' | 'raw';

export function ExtractedFieldsPanel({
  doc,
  selectedFieldId,
  onSelectField,
  actor,
}: {
  doc: FtDocument;
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  actor: string;
}): React.JSX.Element {
  const dev = useDb().settings.preferences.developerMode;
  const [tab, setTab] = useState<Tab>('fields');
  const sample = getSample(doc.sampleId);
  const simulated = doc.fields.some((f) => f.origin === 'simulated');
  const reviewed = doc.fields.filter((f) => f.state !== 'unreviewed').length;
  const tabs = [
    { key: 'fields' as const, label: 'Extracted fields', count: doc.fields.length },
    { key: 'original' as const, label: 'Original text' },
    { key: 'translation' as const, label: 'English translation' },
    ...(dev ? [{ key: 'raw' as const, label: 'Raw details' }] : []),
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-line border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Machine-extracted text — please verify.</p>
          {simulated && <SimulatedBadge />}
        </div>
        <p className="text-muted mt-0.5 text-xs">
          {reviewed} of {doc.fields.length} field(s) reviewed · Language:{' '}
          {doc.language === null ? 'not set' : LANGUAGE_LABEL[doc.language]} · Reading text does not
          establish that a document is genuine.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <Tabs label="Extraction views" tabs={tabs} value={tab} onChange={setTab} className="pt-1">
          {tab === 'fields' && (
            <FieldList
              doc={doc}
              selectedFieldId={selectedFieldId}
              onSelectField={onSelectField}
              actor={actor}
            />
          )}
          {tab === 'original' &&
            (sample === undefined ? (
              <EmptyState icon={FileSearch} title="No machine-extracted text">
                Automatic text extraction is not connected, so no text has been read from this file.
                Compare the image with the fields you enter manually.
              </EmptyState>
            ) : (
              <div className="space-y-4">
                <section>
                  <h4 className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
                    Original (as on document)
                  </h4>
                  <pre
                    lang={doc.language === 'en' ? 'en' : 'mr'}
                    className="bg-surface-2 border-line font-deva rounded-lg border p-3 text-sm whitespace-pre-wrap"
                  >
                    {sample.originalText}
                  </pre>
                </section>
                {sample.transliteration !== null && (
                  <section>
                    <h4 className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
                      Transliteration (Latin script)
                    </h4>
                    <pre className="bg-surface-2 border-line rounded-lg border p-3 font-sans text-sm whitespace-pre-wrap">
                      {sample.transliteration}
                    </pre>
                  </section>
                )}
                <p className="text-muted text-xs">
                  Simulated output. The original text is preserved; transliteration and translation
                  are shown separately and never overwrite it.
                </p>
              </div>
            ))}
          {tab === 'translation' &&
            ((sample?.translation ?? null) === null ? (
              <EmptyState icon={FileSearch} title="No translation available">
                {doc.language === 'en'
                  ? 'This document is in English.'
                  : 'Translation needs extracted text, which is not available for this file.'}
              </EmptyState>
            ) : (
              <div className="space-y-2">
                <Notice>
                  Machine translation (simulated). Use it as a reading aid only — the Marathi
                  original is authoritative.
                </Notice>
                <pre className="bg-surface-2 border-line rounded-lg border p-3 font-sans text-sm whitespace-pre-wrap">
                  {sample?.translation}
                </pre>
              </div>
            ))}
          {tab === 'raw' && (
            <pre className="bg-surface-2 border-line overflow-x-auto rounded-lg border p-3 text-xs">
              {JSON.stringify({ id: doc.id, sampleId: doc.sampleId, fields: doc.fields }, null, 2)}
            </pre>
          )}
        </Tabs>
      </div>
    </div>
  );
}
