import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { askGemini } from './callable/askGemini.js';
export { health } from './callable/health.js';
