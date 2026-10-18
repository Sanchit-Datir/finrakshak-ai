/**
 * Every state change in the app goes through these functions, so each one leaves an audit entry.
 * Grouped by area in `./actions/`; import from here.
 */

export {
  addApplicationNote,
  commentOnFinding,
  createDraftApplication,
  recordChecksRun,
  saveApplication,
  setApplicationStatus,
  setFindingStatus,
  setStep,
  submitApplication,
  toggleUnverified,
  unsavedApplication,
} from './actions/applications.js';

export {
  approveInvestigationQuestion,
  recordAiAnalysis,
  recordAiInvestigation,
  recordPublicRecordsCheck,
} from './actions/analysis.js';

export { addPublicWatch, recordWatchCheck, syncLoanWatches } from './actions/public-watch.js';

export type { NewWatch } from './actions/public-watch.js';

export {
  addUploadedDocument,
  attachSample,
  linkDocument,
  moveDocument,
  removeDocument,
  replaceDocumentFile,
  retryWithoutFile,
  rotatePage,
  setDocLanguage,
  setDocType,
  updateDocument,
} from './actions/documents.js';

export { addManualField, resetField, reviewField } from './actions/fields.js';

export { importTransactions, updateAlert } from './actions/monitoring.js';

export {
  addCaseEvidence,
  addCaseNote,
  addCaseTask,
  assignCase,
  createCase,
  setCaseStatus,
  toggleCaseTask,
} from './actions/cases.js';
