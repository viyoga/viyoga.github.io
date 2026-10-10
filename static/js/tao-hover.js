/**
 * ══════════════════════════════════════════════════════════════════════════════
 * TAO (道) ASCIILOGO — INTERACTIVE FLUID HARMONIC HOVER & WAVE PHYSICS
 * ══════════════════════════════════════════════════════════════════════════════
 * Colors:
 *   - Strictly honors each theme's active palette (Amber, Mallow, Gruvbox, Safelight, Tungsten)
 *   - At rest: theme --accent
 *   - In motion/hover: dynamic theme --accent-2 and luminous theme --cat-light
 *   - Zero generic white override
 * ══════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // Dissolution spectrums based on character density
  const DISSOLUTION_MAP = {
    '█': ['█', '▓', '▒', '░', '✦', '·'],
    '▓': ['▓', '▒', '░', '✧', '⋆', '·'],
    '▒': ['▒', '░', '∿', '≈', '·', ' '],
    '░': ['░', '·', '⋆', '✦', '·', ' '],
    '▄': ['▄', '▃', '▂', ' ', '·', ' '],
    '▀': ['▀', '¯', '·', ' ', ' ', ' ']
  };

  // Known fallback palette maps for the 5 official site themes
  const THEME_PALETTES = {
    'amber': {
      accent: '#FFB454',
      accent2: '#FF7A3D',
      glow: '#FFD9A0',
      border: 'rgba(10, 8, 6, 0.9)'
    },
    'mallow': {
      accent: '#C89BFF',
      accent2: '#FF84C0',
      glow: '#E2B8FF',
      border: 'rgba(10, 7, 18, 0.9)'
    },
    'gruvbox-material': {
      accent: '#a9b665',
      accent2: '#d8a657',
      glow: '#fabd2f',
      border: 'rgba(40, 40, 40, 0.9)'
    },
    'gruvbox': {
      accent: '#a9b665',
      accent2: '#d8a657',
      glow: '#fabd2f',
      border: 'rgba(40, 40, 40, 0.9)'
    },
    'safelight': {
      accent: '#FF4D6A',
      accent2: '#C9285C',
      glow: '#FFB3C0',
      border: 'rgba(15, 6, 10, 0.9)'
    },
    'tungsten': {
      accent: '#F2F5FA',
      accent2: '#9FB0C4',
      glow: '#FFFFFF',
      border: 'rgba(10, 10, 12, 0.9)'
    },
    'opal': {
      accent: '#2563EB',
      accent2: '#7C3AED',
      glow: '#3B82F6',
      border: 'rgba(28, 42, 74, 0.15)'
    }
  };

  class TaoParticle {
    constructor(char, col, row, baseX, baseY) {
      this.origChar = char;
      this.col = col;
      this.row = row;
      this.baseX = baseX;
      this.baseY = baseY;
      this.x = baseX;
      this.y = baseY;

      // Natural elasticity mass variation
      this.density = Math.random() * 8 + 6; // Range: 6 to 14
      this.energy = 0; // Excitation level [0..1]
    }
  }

  function initTaoHover() {
    const pre = document.querySelector('.ascii-logo');
    if (!pre) return;

    // Respect user motion preferences
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    // Extract ASCII text grid
    const rawText = pre.textContent || '';
    const rawLines = rawText.split('\n');
    while (rawLines.length && !rawLines[0].trim()) rawLines.shift();
    while (rawLines.length && !rawLines[rawLines.length - 1].trim()) rawLines.pop();

    if (!rawLines.length) return;

    const rows = rawLines.length;
    let maxCols = 0;
    for (let i = 0; i < rows; i++) {
      if (rawLines[i].length > maxCols) maxCols = rawLines[i].length;
    }

    // Setup wrapper to preserve exact flow and prevent layout shift
    let wrap = pre.parentElement;
    if (!wrap.classList.contains('ascii-logo-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'ascii-logo-wrap';
      wrap.style.position = 'relative';
      wrap.style.display = 'block';
      wrap.style.margin = '0 auto';
      wrap.style.maxWidth = '100%';
      wrap.style.userSelect = 'none';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
    }

    // Create interactive canvas
    let canvas = wrap.querySelector('canvas.tao-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'tao-canvas';
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '50%';
      canvas.style.transform = 'translateX(-50%)';
      canvas.style.touchAction = 'none';
      canvas.style.cursor = 'crosshair';
      canvas.style.display = 'block';
      wrap.appendChild(canvas);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles = [];
    let mouse = { x: -9999, y: -9999, active: false, vx: 0, vy: 0 };
    let lastMouse = { x: -9999, y: -9999 };
    let ripples = [];
    let animationId = null;

    let charWidth = 10;
    let charHeight = 16;
    let logicalWidth = 280;
    let logicalHeight = 150;
    let currentFont = '';

    // Active theme colors (strictly extracted from current theme)
    let colorAccent = '#FFB454';
    let colorAccent2 = '#FF7A3D';
    let colorGlow = '#FFD9A0';
    let colorBorder = 'rgba(0,0,0,0.8)';
    let time = 0;

    function readTheme() {
      const html = document.documentElement;
      let themeKey = html.getAttribute('data-theme') || 'amber';
      if (themeKey === 'gruvbox' || themeKey === 'slick') themeKey = 'gruvbox-material';

      const rootCs = getComputedStyle(html);
      const preCs = getComputedStyle(pre);

      const parsedAccent = rootCs.getPropertyValue('--accent').trim() || preCs.getPropertyValue('--accent').trim() || preCs.color;
      const parsedAccent2 = rootCs.getPropertyValue('--accent-2').trim();
      const parsedGlow = rootCs.getPropertyValue('--cat-light').trim() || rootCs.getPropertyValue('--cat-base').trim();
      const parsedBorder = rootCs.getPropertyValue('--border').trim() || preCs.getPropertyValue('--border').trim();

      const preset = THEME_PALETTES[themeKey] || THEME_PALETTES['amber'];

      colorAccent = parsedAccent || preset.accent;
      colorAccent2 = parsedAccent2 || preset.accent2;
      colorGlow = parsedGlow || preset.glow;
      colorBorder = parsedBorder || preset.border;
    }

    function build() {
      readTheme();

      const cs = getComputedStyle(pre);
      const fontSize = cs.fontSize || '14px';
      const fontFamily = cs.fontFamily || 'monospace';
      const fontWeight = cs.fontWeight || 'normal';

      currentFont = `${fontWeight} ${fontSize} ${fontFamily}`;
      ctx.font = currentFont;

      const testMetric = ctx.measureText('M');
      charWidth = testMetric.width || (parseFloat(fontSize) * 0.6);
      charHeight = parseFloat(cs.lineHeight) || (parseFloat(fontSize) * 1.15);

      logicalWidth = Math.ceil(maxCols * charWidth) + 8;
      logicalHeight = Math.ceil(rows * charHeight) + 6;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(logicalWidth * dpr);
      canvas.height = Math.round(logicalHeight * dpr);
      canvas.style.width = logicalWidth + 'px';
      canvas.style.height = logicalHeight + 'px';

      ctx.scale(dpr, dpr);

      // Hide original <pre> visually while keeping container flow
      pre.style.visibility = 'hidden';
      wrap.style.width = logicalWidth + 'px';
      wrap.style.height = logicalHeight + 'px';

      // Build particle grid
      particles = [];
      const offsetX = charWidth * 0.5 + 4;
      const offsetY = charHeight * 0.5 + 3;

      for (let r = 0; r < rows; r++) {
        const line = rawLines[r];
        for (let c = 0; c < line.length; c++) {
          const ch = line[c];
          if (ch && ch !== ' ') {
            const bx = offsetX + c * charWidth;
            const by = offsetY + r * charHeight;
            particles.push(new TaoParticle(ch, c, r, bx, by));
          }
        }
      }
    }

    function updateCursor(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * (logicalWidth / rect.width);
      const y = (clientY - rect.top) * (logicalHeight / rect.height);

      if (lastMouse.x !== -9999) {
        mouse.vx = x - lastMouse.x;
        mouse.vy = y - lastMouse.y;
      }
      lastMouse.x = x;
      lastMouse.y = y;

      mouse.x = x;
      mouse.y = y;
      mouse.active = true;
    }

    function clearCursor() {
      mouse.x = -9999;
      mouse.y = -9999;
      mouse.vx = 0;
      mouse.vy = 0;
      lastMouse.x = -9999;
      lastMouse.y = -9999;
      mouse.active = false;
    }

    function triggerRipple(x, y) {
      ripples.push({
        x: x,
        y: y,
        radius: 0,
        maxRadius: Math.max(logicalWidth, logicalHeight) * 0.85,
        speed: 4.8,
        strength: 1.0
      });
    }

    canvas.addEventListener('mousemove', (e) => updateCursor(e.clientX, e.clientY));
    canvas.addEventListener('mouseleave', clearCursor);

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        updateCursor(e.touches[0].clientX, e.touches[0].clientY);
        triggerRipple(mouse.x, mouse.y);
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) updateCursor(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    canvas.addEventListener('touchend', clearCursor);
    canvas.addEventListener('touchcancel', clearCursor);

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * (logicalWidth / rect.width);
      const cy = (e.clientY - rect.top) * (logicalHeight / rect.height);
      triggerRipple(cx, cy);
    });

    const RADIUS = 62;
    const RADIUS_SQ = RADIUS * RADIUS;

    // 60 FPS Render loop
    function loop() {
      time += 0.035;
      ctx.clearRect(0, 0, logicalWidth, logicalHeight);
      ctx.font = currentFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const mx = mouse.x;
      const my = mouse.y;

      // 1. Process click/tap shockwave ripples
      for (let ri = ripples.length - 1; ri >= 0; ri--) {
        const rp = ripples[ri];
        rp.radius += rp.speed;
        rp.strength *= 0.94;
        if (rp.strength < 0.03 || rp.radius > rp.maxRadius) {
          ripples.splice(ri, 1);
        }
      }

      // 2. Update and render particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = mx - p.x;
        const dy = my - p.y;
        const distSq = dx * dx + dy * dy;

        // Proximity to cursor
        if (distSq < RADIUS_SQ && distSq > 0) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;
          const prox = (RADIUS - dist) / RADIUS; // Normalized [0..1]

          // Tangent vortex vector
          const tx = ny;
          const ty = -nx;

          // Organic harmonic fluid wave
          const wavePhase = dist * 0.14 - time * 4.5;
          const waveForce = Math.sin(wavePhase) * 2.8 * prox;

          // Fluid velocity wake
          const wakeX = mouse.vx * 0.3 * prox;
          const wakeY = mouse.vy * 0.3 * prox;

          // Swirl and gentle buoyant repulsion
          const curlFactor = 1.35;
          const pushFactor = 0.55;
          const fx = (tx * curlFactor - nx * pushFactor) * prox * (p.density * 0.5) + wakeX + waveForce * nx;
          const fy = (ty * curlFactor - ny * pushFactor) * prox * (p.density * 0.5) + wakeY + waveForce * ny;

          p.x += fx;
          p.y += fy;
          p.energy = Math.min(1.0, p.energy + prox * 0.35 + 0.08);
        } else {
          // Damped harmonic spring ease-back
          const diffX = p.x - p.baseX;
          const diffY = p.y - p.baseY;

          p.x -= diffX / (p.density * 0.76);
          p.y -= diffY / (p.density * 0.76);

          // Sub-pixel snapping
          if (Math.abs(p.x - p.baseX) < 0.15) p.x = p.baseX;
          if (Math.abs(p.y - p.baseY) < 0.15) p.y = p.baseY;

          // Energy cooling
          p.energy *= 0.91;
        }

        // Apply active shockwave ripple impulses
        for (let ri = 0; ri < ripples.length; ri++) {
          const rp = ripples[ri];
          const rdx = p.x - rp.x;
          const rdy = p.y - rp.y;
          const rDist = Math.hypot(rdx, rdy);
          const ringDist = Math.abs(rDist - rp.radius);
          if (ringDist < 26) {
            const factor = (1 - ringDist / 26) * rp.strength;
            const rAngle = Math.atan2(rdy, rdx);
            p.x += Math.cos(rAngle) * factor * 5.0;
            p.y += Math.sin(rAngle) * factor * 5.0;
            p.energy = Math.min(1.0, p.energy + factor * 0.75);
          }
        }

        // 3. Dynamic Glyph Density Dissolution
        let renderChar = p.origChar;
        const lookup = DISSOLUTION_MAP[p.origChar];
        if (lookup && p.energy > 0.12) {
          const step = Math.min(lookup.length - 1, Math.floor(p.energy * lookup.length));
          renderChar = lookup[step];
        }

        // 4. Strict Theme-Adaptive Coloring (Strictly vivid theme colors, never white)
        if (p.energy > 0.35) {
          // Peak excitation: Theme vibrant secondary accent with primary accent glow
          ctx.fillStyle = colorAccent2;
          ctx.shadowColor = colorAccent;
          ctx.shadowBlur = Math.round(p.energy * 10);
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        } else if (p.energy > 0.08) {
          // Mid excitation: Theme primary accent with secondary accent glow
          ctx.fillStyle = colorAccent;
          ctx.shadowColor = colorAccent2;
          ctx.shadowBlur = Math.round(p.energy * 6);
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
        } else {
          // At rest: Theme primary accent color with crisp terminal drop shadow
          ctx.fillStyle = colorAccent;
          ctx.shadowColor = colorBorder;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          ctx.shadowBlur = 0;
        }

        ctx.fillText(renderChar, p.x, p.y);
      }

      // Smooth deceleration of mouse velocity
      mouse.vx *= 0.6;
      mouse.vy *= 0.6;

      animationId = requestAnimationFrame(loop);
    }

    // Dynamic Theme Observers: Live sync on ANY theme change or attribute mutation
    document.addEventListener('themechange', readTheme);

    const themeObserver = new MutationObserver(() => {
      readTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    document.addEventListener('fontchange', () => {
      setTimeout(build, 20);
    });

    window.addEventListener('resize', build);

    build();
    animationId = requestAnimationFrame(loop);

    window.addEventListener('beforeunload', () => {
      if (animationId) cancelAnimationFrame(animationId);
      themeObserver.disconnect();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTaoHover);
  } else {
    initTaoHover();
  }
})();
