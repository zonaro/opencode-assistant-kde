/* ============================================================
   pet.js — Pet renderer (spritesheet atlas 8×9, formato OpenPets)
   Atlas: 1536×1872, cells 192×208
   Rows (0-8): idle(6), running-right(8), running-left(8),
               waving(4), jumping(5), failed(8), waiting(6),
               running(6), review(6)
   ============================================================ */
const Pet = (() => {
  'use strict';

  const COLS = 8;
  const ROWS = 9;
  const CELL_W = 192;
  const CELL_H = 208;

  const DEFAULT_PET = 'tux';

  const ANIM = {
    idle:           { row: 0, frames: 6 },
    runningRight:   { row: 1, frames: 8 },
    runningLeft:    { row: 2, frames: 8 },
    waving:         { row: 3, frames: 4 },
    jumping:        { row: 4, frames: 5 },
    failed:         { row: 5, frames: 8 },
    waiting:        { row: 6, frames: 6 },
    running:        { row: 7, frames: 6 },
    review:         { row: 8, frames: 6 },
  };

  // state → animation mapping
  const STATE_MAP = {
    idle:      'idle',
    thinking:  'review',
    streaming: 'running',
    waiting:   'waiting',
    testing:   'waiting',
    success:   'jumping',
    error:     'failed',
    waving:    'waving',
  };

  let canvas = null;
  let ctx = null;
  let img = null;
  let loaded = false;
  let currentAnim = 'idle';
  let frame = 0;
  let lastFrameTime = 0;
  let fps = 10;
  let rafId = null;
  let displaySize = 120;
  let reducedMotion = false;
  let onWavingCallback = null;
  let petId = DEFAULT_PET;

  function init(canvasEl, size, pet) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    displaySize = size || 120;
    petId = pet || DEFAULT_PET;
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    canvas.width = CELL_W;
    canvas.height = CELL_H;
    canvas.style.width = displaySize + 'px';
    canvas.style.height = Math.round(displaySize * (CELL_H / CELL_W)) + 'px';

    loadSpritesheet();

    canvas.addEventListener('click', () => {
      if (currentAnim === 'idle') {
        setAnimation('waving');
        if (onWavingCallback) onWavingCallback();
      }
    });

    // listen for reduced motion changes
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      reducedMotion = e.matches;
      if (reducedMotion) {
        frame = 0;
        drawFrame();
      }
    });
  }

  function loadSpritesheet(petOverride) {
    if (petOverride) petId = petOverride;
    loaded = false;
    img = new Image();
    img.src = `api/pets/${petId}/spritesheet`;
    img.onload = () => {
      loaded = true;
      drawFrame();
    };
    img.onerror = () => drawPlaceholder();
  }

  function setPet(pet) {
    if (petId === pet) return;
    loadSpritesheet(pet);
  }

  function drawPlaceholder() {
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.arc(CELL_W / 2, CELL_H / 2, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#999';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐾', CELL_W / 2, CELL_H / 2 + 6);
  }

  function drawFrame() {
    if (!loaded || !ctx) return;
    const anim = ANIM[currentAnim] || ANIM.idle;
    const col = frame % COLS;
    const row = anim.row;
    const sx = col * CELL_W;
    const sy = row * CELL_H;

    ctx.clearRect(0, 0, CELL_W, CELL_H);
    ctx.drawImage(img, sx, sy, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
  }

  function tick(timestamp) {
    if (!loaded) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    const anim = ANIM[currentAnim] || ANIM.idle;
    const interval = 1000 / fps;

    if (timestamp - lastFrameTime >= interval) {
      lastFrameTime = timestamp;
      frame++;
      if (frame >= anim.frames) {
        // animation finished
        if (currentAnim === 'waving' || currentAnim === 'jumping' || currentAnim === 'failed') {
          // one-shot: go back to idle
          currentAnim = 'idle';
          frame = 0;
        } else {
          frame = 0;
        }
      }
      drawFrame();
    }

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function setAnimation(name) {
    if (reducedMotion && name !== 'idle') {
      // show first frame of the animation statically
      currentAnim = name;
      frame = 0;
      drawFrame();
      return;
    }
    if (currentAnim === name) return;
    currentAnim = name;
    frame = 0;
  }

  function setState(state) {
    const anim = STATE_MAP[state] || 'idle';
    setAnimation(anim);
  }

  function setSize(size) {
    displaySize = size;
    if (canvas) {
      canvas.style.width = size + 'px';
      canvas.style.height = Math.round(size * (CELL_H / CELL_W)) + 'px';
    }
  }

  function onWaving(cb) {
    onWavingCallback = cb;
  }

  return { init, start, stop, setAnimation, setState, setSize, setPet, onWaving };
})();
