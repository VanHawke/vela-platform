// src/lib/useKikoPolish.js
// React-friendly version of kiko-polish.js
// Auto-attaches spotlight/sparkle/magnetic/count-up effects to elements with the corresponding classes.
// Usage: call useKikoPolish() once in your top-level layout — effects bind themselves on mount + on DOM mutations.

import { useEffect } from 'react'

export function useKikoPolish() {
  useEffect(() => {
    let raf = null
    const observers = new Set()

    const attachSpotlight = (el) => {
      if (el.dataset.spotlightAttached) return
      el.dataset.spotlightAttached = '1'
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect()
        el.style.setProperty('--mx', `${e.clientX - r.left}px`)
        el.style.setProperty('--my', `${e.clientY - r.top}px`)
      })
    }

    const attachMagnetic = (el) => {
      if (el.dataset.magneticAttached) return
      el.dataset.magneticAttached = '1'
      const strength = 0.25
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect()
        const x = (e.clientX - (r.left + r.width / 2)) * strength
        const y = (e.clientY - (r.top + r.height / 2)) * strength
        el.style.transform = `translate(${x}px, ${y}px)`
      })
      el.addEventListener('mouseleave', () => {
        el.style.transform = ''
      })
    }

    const attachSparkle = (el) => {
      if (el.dataset.sparkleAttached) return
      el.dataset.sparkleAttached = '1'
      el.addEventListener('mouseenter', () => {
        for (let i = 0; i < 5; i++) {
          const s = document.createElement('span')
          s.className = 'sparkle-particle'
          const angle = Math.random() * Math.PI * 2
          const dist = 30 + Math.random() * 20
          s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
          s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`)
          el.appendChild(s)
          setTimeout(() => s.remove(), 700)
        }
      })
    }

    const animateCount = (el) => {
      if (el.dataset.countAttached) return
      el.dataset.countAttached = '1'
      const target = parseFloat(el.dataset.countTo || '0')
      const decimals = parseInt(el.dataset.decimals || '0', 10)
      const suffix = el.dataset.suffix || ''
      const duration = 1400
      const start = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration)
        const eased = 1 - Math.pow(1 - t, 3)
        const v = (target * eased).toFixed(decimals)
        el.textContent = v + suffix
        if (t < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }

    const bindAll = () => {
      document.querySelectorAll('.spotlight').forEach(attachSpotlight)
      document.querySelectorAll('.magnetic').forEach(attachMagnetic)
      document.querySelectorAll('.sparkle-cta').forEach(attachSparkle)
    }

    const observeCounts = () => {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            animateCount(e.target)
            io.unobserve(e.target)
          }
        })
      }, { threshold: 0.3 })
      document.querySelectorAll('.count-up:not([data-count-attached])').forEach((el) => io.observe(el))
      observers.add(io)
    }

    // Initial bind
    bindAll()
    observeCounts()

    // Re-bind on DOM mutations (handles route changes / new elements)
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        bindAll()
        observeCounts()
      })
    })
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      mo.disconnect()
      observers.forEach((o) => o.disconnect())
      cancelAnimationFrame(raf)
    }
  }, [])
}

// Toast helper — same API as the static kikoToast
export function kikoToast({ title, type = 'info', meta = '' }) {
  let container = document.querySelector('.toast-container')
  if (!container) {
    container = document.createElement('div')
    container.className = 'toast-container'
    document.body.appendChild(container)
  }
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.innerHTML = `
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${meta ? `<div class="toast-meta">${meta}</div>` : ''}
    </div>
  `
  container.appendChild(toast)
  setTimeout(() => toast.classList.add('show'), 10)
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 300)
  }, 4000)
}
