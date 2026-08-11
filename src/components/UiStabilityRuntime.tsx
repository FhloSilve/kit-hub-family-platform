import { useEffect } from "react";

const MODAL_SELECTOR = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  '.modal-backdrop',
  '.shared-home-backdrop',
  '.family-tools-backdrop',
  '.silvi-backdrop',
  '.admin-modal-backdrop',
].join(',');

function visible(element: Element) {
  const node = element as HTMLElement;
  const style = window.getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
}

function topModal() {
  return [...document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)].filter(visible).at(-1) ?? null;
}

function closeButton(modal: HTMLElement) {
  return modal.querySelector<HTMLButtonElement>('[data-dialog-close],.modal-close,.admin-modal-close,.shared-home-close,header button[aria-label*="close" i],header button[title*="close" i]');
}

export function UiStabilityRuntime() {
  useEffect(() => {
    let previousFocus: HTMLElement | null = null;
    let locked = false;
    let originalOverflow = '';
    let originalPaddingRight = '';

    const syncModalState = () => {
      const modal = topModal();
      const shouldLock = Boolean(modal);
      document.body.dataset.uiModalOpen = shouldLock ? 'true' : 'false';

      if (shouldLock && !locked) {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        originalOverflow = document.body.style.overflow;
        originalPaddingRight = document.body.style.paddingRight;
        const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
        document.body.style.overflow = 'hidden';
        if (scrollbar) document.body.style.paddingRight = `${scrollbar}px`;
        locked = true;

        if (window.innerWidth > 760 && modal) {
          window.requestAnimationFrame(() => {
            const target = modal.querySelector<HTMLElement>('[autofocus],input:not([type="hidden"]),textarea,select,button');
            target?.focus({ preventScroll: true });
          });
        }
      } else if (!shouldLock && locked) {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
        locked = false;
        previousFocus?.focus?.({ preventScroll: true });
        previousFocus = null;
      }
    };

    const syncViewport = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const keyboardInset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      document.documentElement.style.setProperty('--kh-visual-viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--kh-keyboard-inset', `${keyboardInset}px`);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const modal = topModal();
      if (!modal) return;
      const close = closeButton(modal);
      if (close) {
        event.preventDefault();
        close.click();
      }
    };

    const observer = new MutationObserver(syncModalState);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style','aria-hidden'] });
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    document.addEventListener('keydown', onKeyDown);
    syncViewport();
    syncModalState();

    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', syncViewport);
      window.visualViewport?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
      document.removeEventListener('keydown', onKeyDown);
      if (locked) {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      }
      delete document.body.dataset.uiModalOpen;
    };
  }, []);

  return null;
}
