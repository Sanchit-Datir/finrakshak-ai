/**
 * The on-screen layer for demo videos: a caption bar, a visible mouse cursor (screen recorders do
 * not see Playwright's mouse), a highlight ring and full-screen title cards. It lives in a
 * `popover="manual"` element so it can sit in the browser's top layer, above the app's native
 * modal <dialog> drawers, and never takes clicks (pointer-events: none).
 *
 * `installOverlay` runs inside the page (added with page.addInitScript), so it must not use
 * anything defined outside its own body.
 */

export interface CaptionText {
  readonly kicker: string;
  readonly title: string;
  readonly text: string;
}

export interface TitleCardText {
  readonly kicker: string;
  readonly title: string;
  readonly subtitle: string;
  readonly points: readonly string[];
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DemoOverlayApi {
  caption: (c: CaptionText | null) => void;
  ring: (r: Rect | null) => void;
  card: (c: TitleCardText | null) => void;
}

declare global {
  interface Window {
    __demoOverlay?: DemoOverlayApi;
  }
}

export function installOverlay(): void {
  if (window.__demoOverlay !== undefined) return;
  const CSS = `
    #demo-overlay{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:hidden;pointer-events:none;color:#fff;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    #demo-overlay::backdrop{display:none}
    #demo-overlay *{box-sizing:border-box;pointer-events:none}
    .d-cursor{position:absolute;left:0;top:0;width:26px;height:26px;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));z-index:4}
    .d-click{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #2dd4bf;opacity:0;z-index:3}
    .d-ring{position:absolute;display:none;border:3px solid #f59e0b;border-radius:12px;box-shadow:0 0 0 6px rgba(245,158,11,.25),0 0 24px rgba(245,158,11,.55);animation:d-pulse 1.2s ease-in-out infinite;z-index:2}
    @keyframes d-pulse{50%{box-shadow:0 0 0 10px rgba(245,158,11,.12),0 0 32px rgba(245,158,11,.7)}}
    .d-caption{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);width:min(720px,calc(100vw - 32px));display:none;padding:14px 18px;border-radius:14px;background:rgba(9,25,43,.93);border:1px solid rgba(45,212,191,.45);box-shadow:0 12px 32px rgba(0,0,0,.35);z-index:1}
    .d-kicker{margin:0;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5eead4}
    .d-title{margin:2px 0 0;font-size:18px;font-weight:700}
    .d-text{margin:4px 0 0;color:#dbe7f3}
    .d-card{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:radial-gradient(circle at 30% 20%,rgba(20,72,104,.97),rgba(6,18,32,.97));z-index:5}
    .d-card-box{width:min(880px,calc(100vw - 48px))}
    .d-card .d-kicker{font-size:14px}
    .d-card h1{margin:10px 0 0;font-size:44px;line-height:1.15;font-weight:800}
    .d-card .d-sub{margin:14px 0 0;font-size:20px;color:#cfe3f3}
    .d-card ul{margin:26px 0 0;padding:0;list-style:none}
    .d-card li{margin:10px 0 0;padding-left:28px;position:relative;font-size:18px;color:#e6f0f8}
    .d-card li::before{content:"";position:absolute;left:4px;top:9px;width:10px;height:10px;border-radius:50%;background:#2dd4bf}
  `;
  const CURSOR =
    '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5 19.5 13l-6.8 1.3 3.9 7.2-3 1.6-3.9-7.3L4.5 20z" fill="#fff" stroke="#0b1f33" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const KEY = 'demo-overlay-cursor';
  let root: HTMLElement | null = null;

  const el = (cls: string, tag = 'div'): HTMLElement => {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
  };
  const part = (cls: string): HTMLElement => {
    const found = ensure().querySelector<HTMLElement>(`.${cls}`);
    if (found === null) throw new Error(`Demo overlay part missing: ${cls}`);
    return found;
  };
  const ensure = (): HTMLElement => {
    if (root?.isConnected === true) return root;
    root = el('');
    root.id = 'demo-overlay';
    root.setAttribute('popover', 'manual');
    root.setAttribute('aria-hidden', 'true');
    const style = document.createElement('style');
    style.textContent = CSS;
    const cursor = el('d-cursor');
    cursor.innerHTML = CURSOR;
    const caption = el('d-caption');
    caption.append(el('d-kicker', 'p'), el('d-title', 'p'), el('d-text', 'p'));
    const card = el('d-card');
    const box = el('d-card-box');
    box.append(el('d-kicker', 'p'), el('', 'h1'), el('d-sub', 'p'), el('', 'ul'));
    card.append(box);
    root.append(style, el('d-ring'), el('d-click'), cursor, caption, card);
    document.body.append(root);
    const saved = sessionStorage.getItem(KEY);
    if (saved !== null) cursor.style.transform = saved;
    return root;
  };
  /** Re-entering the top layer puts the overlay above a dialog opened after it. */
  const raise = (): void => {
    const r = ensure();
    if (r.matches(':popover-open')) r.hidePopover();
    r.showPopover();
  };
  const ready = (): void => {
    raise();
    new MutationObserver((records) => {
      if (records.some((m) => m.target instanceof HTMLDialogElement && m.target.open)) raise();
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  };

  window.addEventListener(
    'mousemove',
    (e) => {
      if (root === null) return;
      const t = `translate(${e.clientX - 4}px, ${e.clientY - 2}px)`;
      part('d-cursor').style.transform = t;
      sessionStorage.setItem(KEY, t);
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    'mousedown',
    (e) => {
      if (root === null) return;
      const c = part('d-click');
      c.style.left = `${e.clientX}px`;
      c.style.top = `${e.clientY}px`;
      c.animate(
        [
          { opacity: 1, transform: 'scale(.4)' },
          { opacity: 0, transform: 'scale(1.6)' },
        ],
        { duration: 650, easing: 'ease-out' },
      );
    },
    { capture: true, passive: true },
  );

  window.__demoOverlay = {
    caption: (c) => {
      const box = part('d-caption');
      if (c === null) {
        box.style.display = 'none';
        return;
      }
      part('d-kicker').textContent = c.kicker;
      part('d-title').textContent = c.title;
      part('d-text').textContent = c.text;
      box.style.display = 'block';
      box.animate(
        [
          { opacity: 0, transform: 'translate(-50%, 12px)' },
          { opacity: 1, transform: 'translate(-50%, 0)' },
        ],
        { duration: 350, easing: 'ease-out' },
      );
      raise();
    },
    ring: (r) => {
      const ring = part('d-ring');
      if (r === null) {
        ring.style.display = 'none';
        return;
      }
      const pad = 6;
      Object.assign(ring.style, {
        display: 'block',
        left: `${r.x - pad}px`,
        top: `${r.y - pad}px`,
        width: `${r.width + pad * 2}px`,
        height: `${r.height + pad * 2}px`,
      });
      raise();
    },
    card: (c) => {
      const card = part('d-card');
      if (c === null) {
        card.style.display = 'none';
        return;
      }
      const box = card.firstElementChild;
      const [kicker, h1, sub, ul] = box === null ? [] : Array.from(box.children);
      if (kicker === undefined || h1 === undefined || sub === undefined || ul === undefined)
        throw new Error('Demo overlay title card is incomplete');
      kicker.textContent = c.kicker;
      h1.textContent = c.title;
      sub.textContent = c.subtitle;
      ul.replaceChildren(
        ...c.points.map((p) => {
          const li = document.createElement('li');
          li.textContent = p;
          return li;
        }),
      );
      card.style.display = 'flex';
      card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
      raise();
    },
  };

  // Init scripts run before the page is parsed, when there is no <body> yet.
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
}
