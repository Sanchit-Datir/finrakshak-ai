import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { askGemini } from './callable/askGemini.js';
export { analyseApplication } from './callable/analyseApplication.js';
export { assistRecord } from './callable/assistRecord.js';
export { getProfile } from './callable/getProfile.js';
export { health } from './callable/health.js';
export { decideProposal } from './callable/decideProposal.js';
export { publicData } from './http/publicData.js';
export { getRiskScores } from './callable/getRiskScores.js';
export { decidePattern } from './callable/decidePattern.js';
