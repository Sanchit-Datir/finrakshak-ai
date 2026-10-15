/**
 * In-memory registry of user-selected files for this browser tab. There is no
 * upload backend yet, so originals are not stored anywhere else and are lost
 * when the tab closes. Object URLs are revoked when a document is removed.
 */

export interface LocalFile {
  file: File;
  url: string;
}

const files = new Map<string, LocalFile>();

export function registerFile(docId: string, file: File): LocalFile {
  const existing = files.get(docId);
  if (existing !== undefined) URL.revokeObjectURL(existing.url);
  const entry = { file, url: URL.createObjectURL(file) };
  files.set(docId, entry);
  return entry;
}

export function getLocalFile(docId: string): LocalFile | undefined {
  return files.get(docId);
}

export function releaseFile(docId: string): void {
  const entry = files.get(docId);
  if (entry !== undefined) URL.revokeObjectURL(entry.url);
  files.delete(docId);
}
