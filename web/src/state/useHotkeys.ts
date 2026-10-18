import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ALL_NAV } from '../components/app-shell/nav.js';

/** Keys that open a page after pressing G (e.g. G then D for Dashboard). */
const GO_KEYS = new Map(ALL_NAV.filter((n) => n.key !== undefined).map((n) => [n.key ?? '', n.to]));
const SEQUENCE_MS = 1200;

function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * App-wide shortcuts: Ctrl/⌘ K or / opens the palette, Ctrl/⌘ J or I opens the copilot, ? lists shortcuts,
 * N starts an application, G + letter jumps to a page. Ignored while typing
 * or while another dialog is open.
 */
export function useGlobalHotkeys(handlers: {
  palette: () => void;
  shortcuts: () => void;
  copilot: () => void;
}): void {
  const navigate = useNavigate();
  const pendingG = useRef(0);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        latest.current.palette();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        latest.current.copilot();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target)) return;
      if (document.querySelector('dialog[open]') !== null) return;
      const key = e.key.toLowerCase();
      if (Date.now() - pendingG.current < SEQUENCE_MS) {
        pendingG.current = 0;
        const to = GO_KEYS.get(key);
        if (to !== undefined) {
          e.preventDefault();
          void navigate(to);
        }
        return;
      }
      if (key === 'g') pendingG.current = Date.now();
      else if (key === '/') {
        e.preventDefault();
        latest.current.palette();
      } else if (e.key === '?') latest.current.shortcuts();
      else if (key === 'n') void navigate('/applications/new');
      else if (key === 'i') latest.current.copilot();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [navigate]);
}
