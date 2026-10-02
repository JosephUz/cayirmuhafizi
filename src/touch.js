/**
 * Dokunmatik kontroller (telefon, tablet, Android uygulaması). Çoklu dokunuş pointer olaylarıyla izlenir, her parmak
 * ayrı iş görür:
 *  - Sol yarı: parmağın değdiği yerde beliren **joystick** (analog hareket; sonuna kadar itmek koşu).
 *  - Sağ yarı: parmak kaydırmak **bakış** (farenin karşılığı); kısa dokunuş `tap(x, y)`, kıpırdamadan basılı tutmak
 *    `hold(x, y)` olarak bildirilir.
 *  - Sağ alttaki düğmeler (buttons: { id, label, sub?, cls? }): basınca down(id), kalkınca up(id). Düğmeye basılıyken
 *    parmağı kaydırmak da bakışı çevirir (nişan başparmak kalkmadan alınır).
 * DOM'u kendisi kurar (`#touch`), görünümü style.css'teki `.touch-*` kurallarıdır.
 *
 * hooks: down(id), up(id), look(dx, dy), tap?(x, y), hold?(x, y)
 */
export const TOUCH = Object.freeze({ stick: 60, dead: 0.14, push: 0.94, look: 1.9, tapTime: 250, tapMove: 12, holdTime: 0.5 });

export const touchDevice = () =>
  new URLSearchParams(location.search).has('touch') || matchMedia('(pointer: coarse)').matches;

export function createTouch(parent, buttons, hooks) {
  const pad = document.createElement('div');
  pad.id = 'touch';
  pad.hidden = true;
  pad.innerHTML =
    '<div class="touch-zone left" data-t="stick"></div><div class="touch-zone right" data-t="look"></div>' +
    '<div class="touch-stick" hidden><i></i></div><div class="touch-buttons">' +
    buttons
      .map(
        b =>
          `<div class="tbtn ${b.cls || ''}" data-t="${b.id}" role="button" aria-label="${b.label}"><b>${b.label}</b>` +
          (b.sub ? `<small>${b.sub}</small>` : '') +
          '</div>',
      )
      .join('') +
    '</div>';
  parent.append(pad);
  const stick = pad.querySelector('.touch-stick'),
    knob = stick.firstElementChild,
    fingers = new Map();
  let axis = { x: 0, z: 0, push: 0 };

  const setStick = (x, z) => {
    const d = Math.hypot(x, z),
      k = d < TOUCH.dead ? 0 : Math.min(1, (d - TOUCH.dead) / (1 - TOUCH.dead)) / (d || 1);
    axis = { x: x * k, z: z * k, push: d };
  };
  function down(e) {
    const target = e.target.closest('[data-t]');
    if (!target) return;
    e.preventDefault();
    try {
      target.setPointerCapture?.(e.pointerId);
    } catch {
      /* fare kilidi açıkken yakalanamaz: olaylar yine de pad'e gelir */
    }
    const kind = target.dataset.t,
      f = { kind, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, at: performance.now(), target };
    if (kind === 'stick') {
      if ([...fingers.values()].some(o => o.kind === 'stick')) return;
      stick.hidden = false;
      // Konum dokunmatik katmana göre: kök görünür alana kilitlendiğinde (telefonda adres çubuğu) katman pencerenin
      // tepesinden aşağıda başlayabilir.
      const r = pad.getBoundingClientRect();
      stick.style.transform = `translate(${e.clientX - r.left}px,${e.clientY - r.top}px)`;
      knob.style.transform = '';
      setStick(0, 0);
    } else if (kind === 'look') {
      if (hooks.hold)
        f.timer = setTimeout(() => {
          f.held = true;
          hooks.hold(f.x0, f.y0);
        }, TOUCH.holdTime * 1000);
    } else {
      target.classList.add('on');
      hooks.down(kind);
    }
    fingers.set(e.pointerId, f);
  }
  function move(e) {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    e.preventDefault();
    if (f.kind === 'stick') {
      let dx = e.clientX - f.x,
        dy = e.clientY - f.y;
      const d = Math.hypot(dx, dy);
      if (d > TOUCH.stick) {
        dx *= TOUCH.stick / d;
        dy *= TOUCH.stick / d;
      }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      setStick(dx / TOUCH.stick, dy / TOUCH.stick);
      return;
    }
    if (Math.hypot(e.clientX - f.x0, e.clientY - f.y0) >= TOUCH.tapMove) clearTimeout(f.timer);
    hooks.look((e.clientX - f.x) * TOUCH.look, (e.clientY - f.y) * TOUCH.look);
    f.x = e.clientX;
    f.y = e.clientY;
  }
  function release(f, e) {
    if (f.kind === 'stick') {
      stick.hidden = true;
      setStick(0, 0);
      // Joystick bölgesine kısa ve hareketsiz dokunuş da seçim/inşa dokunuşudur: ekranın sol %44'ündeki yapılar
      // aksi halde hiç seçilemiyordu (mobil test raporu 2026-09-28).
      const still = e && Math.hypot(e.clientX - f.x0, e.clientY - f.y0) < TOUCH.tapMove;
      if (still && performance.now() - f.at < TOUCH.tapTime) hooks.tap?.(e.clientX, e.clientY);
    } else if (f.kind === 'look') {
      clearTimeout(f.timer);
      if (f.held) return;
      const still = e && Math.hypot(e.clientX - f.x0, e.clientY - f.y0) < TOUCH.tapMove;
      if (still && performance.now() - f.at < TOUCH.tapTime) hooks.tap?.(e.clientX, e.clientY);
    } else {
      f.target.classList.remove('on');
      hooks.up(f.kind);
    }
  }
  function up(e) {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    fingers.delete(e.pointerId);
    release(f, e.type === 'pointerup' ? e : null);
  }
  pad.addEventListener('pointerdown', down);
  pad.addEventListener('pointermove', move);
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
  pad.addEventListener('contextmenu', e => e.preventDefault());

  return {
    el: pad,
    /** Joystick: x sağ, z geri (0-1 analog), push: itme oranı (koşu için). */
    poll: () => axis,
    /** Bütün parmakları bırakır (menü, ekran değişimi). */
    clear() {
      for (const f of fingers.values()) release(f, null);
      fingers.clear();
    },
    show(on) {
      pad.hidden = !on;
      if (!on) this.clear();
    },
    button: id => pad.querySelector(`[data-t="${id}"]`),
  };
}

/** Tarayıcıda (uygulama dışında) oyuna girerken tam ekran ve yatay yön; desteklenmezse sessizce geçer. */
export function enterFullscreen() {
  if (window.Capacitor?.isNativePlatform?.() || document.fullscreenElement) return;
  const go = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  Promise.resolve(go)
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}
