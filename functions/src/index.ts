import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { askGemini } from './callable/askGemini.js';
export { health } from './callable/health.js';
export { decideProposal } from './callable/decideProposal.js';
export { publicData } from './http/publicData.js';
