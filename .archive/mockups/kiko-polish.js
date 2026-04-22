// ════════════════════════════════════════════════════════════════
// KIKO POLISH JS — interactive layer for the polish.css patterns
// Auto-initializes on DOMContentLoaded.
// ════════════════════════════════════════════════════════════════

(() => {
  // ── 1. SPOTLIGHT: cursor-following light on .spotlight cards ──
  function initSpotlight() {
    document.querySelectorAll('.spotlight').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mouse-x', `${e.clientX - r.left}px`);
        el.style.setProperty('--mouse-y', `${e.clientY - r.top}px`);
      });
    });
  }

  // ── 2. SPARKLE PARTICLES on .sparkle-cta hover ────────────────
  function initSparkle() {
    document.querySelectorAll('.sparkle-cta').forEach(el => {
      el.addEventListener('mouseenter', () => {
        // Remove old particles
        el.querySelectorAll('.sparkle-particle').forEach(p => p.remove());
        // Spawn 5 fresh particles with random directions
        for (let i = 0; i < 5; i++) {
          const p = document.createElement('span');
          p.className = 'sparkle-particle';
          const angle = Math.random() * Math.PI * 2;
          const dist = 18 + Math.random() * 22;
          p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
          p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
          p.style.left = '50%';
          p.style.top = '50%';
          p.style.animationDelay = `${i * 60}ms`;
          el.appendChild(p);
        }
      });
    });
  }

  // ── 3. MAGNETIC BUTTONS: subtle cursor-follow ─────────────────
  function initMagnetic() {
    document.querySelectorAll('.magnetic').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.18}px, ${y * 0.18}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'translate(0,0)';
      });
    });
  }

  // ── 4. COUNT-UP: animate numbers when scrolled into view ──────
  function initCountUp() {
    const animate = (el, from, to, duration, format) => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const val = from + (to - from) * eased;
        el.textContent = format(val);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.dataset.counted) {
          entry.target.dataset.counted = '1';
          const el = entry.target;
          const to = parseFloat(el.dataset.countTo);
          const prefix = el.dataset.prefix || '';
          const suffix = el.dataset.suffix || '';
          const decimals = parseInt(el.dataset.decimals || '0');
          const format = (v) => `${prefix}${v.toFixed(decimals)}${suffix}`;
          animate(el, 0, to, 1400, format);
          io.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('.count-up').forEach(el => io.observe(el));
  }

  // ── 5. TOAST: window.kikoToast({ title, type, meta }) ─────────
  let toastStack = null;
  window.kikoToast = function({ title, type = 'success', meta = '' }) {
    if (!toastStack) {
      toastStack = document.createElement('div');
      toastStack.className = 'toast-stack';
      document.body.appendChild(toastStack);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const iconPaths = {
      success: '<polyline points="20 6 9 17 4 12"/>',
      warning: '<path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>',
      error:   '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
      info:    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    };
    toast.innerHTML = `
      <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">${iconPaths[type] || iconPaths.success}</svg>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${meta ? `<div class="toast-meta">${meta}</div>` : ''}
      </div>
      <span class="toast-close" onclick="this.parentElement.remove()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </span>
    `;
    toastStack.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  };

  // ── 6. SMOOTH ACCORDION HELPER ────────────────────────────────
  window.kikoToggleAccordion = function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('open');
  };

  // ── 7. AURORA SVG INJECTION (auto-add to .aurora-bg if empty) ─
  function initAurora() {
    document.querySelectorAll('.aurora-bg').forEach(el => {
      if (el.querySelector('svg')) return;
      el.innerHTML = `
        <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <path class="aurora-path p1" d="M-100,200 Q300,80 700,260 T1300,180" />
          <path class="aurora-path p2" d="M-100,500 Q400,650 800,400 T1300,520" />
          <path class="aurora-path p3" d="M100,650 Q500,520 900,720 T1400,600" />
        </svg>
      `;
    });
  }

  // ── INIT ALL ──────────────────────────────────────────────────
  function initAll() {
    initAurora();
    initSpotlight();
    initSparkle();
    initMagnetic();
    initCountUp();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
