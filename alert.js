// Simple alert/toast module for JayaApp
// Usage: window.showAlert(text, durationMs, options)
// Alias: window.showAllert
(function () {
    if (window.__jayaapp_alert_initialized) return;
    window.__jayaapp_alert_initialized = true;

    const DEFAULTS = {
        location: 'bottom-left', // 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
        h_margin: '2px',
        v_margin: '2px',
        bg_color: 'orange',
        tx_color: 'darkblue',
        tx_font: '16px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
        background_transparency: 1.0, // 0..1
        animation: 'horizontal' // 'off' | 'vertical' | 'horizontal'
    };

    let styleEl = null;
    let container = null;

    function ensureInjected(opts) {
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'jayaapp-alert-styles';
            document.head.appendChild(styleEl);
        }

        if (!container) {
            container = document.createElement('div');
            container.id = 'jayaapp-alert-container';
            document.body.appendChild(container);
        }

        // apply positioning styles on container according to opts
        const loc = opts.location || DEFAULTS.location;
        const h = opts.h_margin || DEFAULTS.h_margin;
        const v = opts.v_margin || DEFAULTS.v_margin;

        let css = `
#jayaapp-alert-container { position: fixed; z-index: 99999; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
#jayaapp-alert-container .jayaapp-alert { pointer-events: auto; min-width: 220px; max-width: 420px; padding: 10px 14px; border-radius: 6px; box-shadow: 0 6px 18px rgba(0,0,0,0.12); color: ${opts.tx_color}; font: ${opts.tx_font}; }
#jayaapp-alert-container .jayaapp-alert.enter { opacity: 1; transform: translate(0,0); }
#jayaapp-alert-container .jayaapp-alert.exit { opacity: 0; }
#jayaapp-alert-container .jayaapp-alert.hidden { display: none; }
`;

        // location-specific layout and animations
        switch (loc) {
            case 'bottom-left':
                css += `#jayaapp-alert-container { left: ${h}; bottom: ${v}; align-items: flex-start; }`;
                if (opts.animation === 'horizontal') {
                    css += `#jayaapp-alert-container .jayaapp-alert { transform: translateX(-110%); transition: transform 260ms ease, opacity 200ms ease; opacity: 0; }
#jayaapp-alert-container .jayaapp-alert.enter { transform: translateX(0); }
#jayaapp-alert-container .jayaapp-alert.exit { transform: translateX(-110%); }`;
                } else if (opts.animation === 'vertical') {
                    css += `#jayaapp-alert-container { flex-direction: column-reverse; }
#jayaapp-alert-container .jayaapp-alert { transform: translateY(20%); transition: transform 260ms ease, opacity 200ms ease; opacity: 0; }
#jayaapp-alert-container .jayaapp-alert.enter { transform: translateY(0); }
#jayaapp-alert-container .jayaapp-alert.exit { transform: translateY(20%); }`;
                } else {
                    css += `#jayaapp-alert-container .jayaapp-alert { opacity: 1; transform: none; transition: none; }`;
                }
                break;
            case 'bottom-right':
                css += `#jayaapp-alert-container { right: ${h}; bottom: ${v}; align-items: flex-end; }`;
                if (opts.animation === 'horizontal') {
                    css += `#jayaapp-alert-container .jayaapp-alert { transform: translateX(110%); transition: transform 260ms ease, opacity 200ms ease; opacity: 0; }
#jayaapp-alert-container .jayaapp-alert.enter { transform: translateX(0); }
#jayaapp-alert-container .jayaapp-alert.exit { transform: translateX(110%); }`;
                } else if (opts.animation === 'vertical') {
                    css += `#jayaapp-alert-container { flex-direction: column-reverse; }
#jayaapp-alert-container .jayaapp-alert { transform: translateY(20%); transition: transform 260ms ease, opacity 200ms ease; opacity: 0; }
#jayaapp-alert-container .jayaapp-alert.enter { transform: translateY(0); }
#jayaapp-alert-container .jayaapp-alert.exit { transform: translateY(20%); }`;
                } else {
                    css += `#jayaapp-alert-container .jayaapp-alert { opacity: 1; transform: none; transition: none; }`;
                }
                break;
            case 'top-left':
                css += `#jayaapp-alert-container { left: ${h}; top: ${v}; align-items: flex-start; }`;
                if (opts.animation === 'vertical') {
                    css += `#jayaapp-alert-container .jayaapp-alert { transform: translateY(-20%); transition: transform 260ms ease, opacity 200ms ease; opacity: 0; }
#jayaapp-alert-container .jayaapp-alert.enter { transform: translateY(0); }
#jayaapp-alert-container .jayaapp-alert.exit { transform: translateY(-20%); }`;
                } else {
                    css += `#jayaapp-alert-container .jayaapp-alert { opacity: 1; transform: none; transition: none; }`;
                }
                break;
            case 'top-right':
                css += `#jayaapp-alert-container { right: ${h}; top: ${v}; align-items: flex-end; }`;
                if (opts.animation === 'vertical') {
                    css += `#jayaapp-alert-container .jayaapp-alert { transform: translateY(-20%); transition: transform 260ms ease, opacity 200ms ease; opacity: 0; }
#jayaapp-alert-container .jayaapp-alert.enter { transform: translateY(0); }
#jayaapp-alert-container .jayaapp-alert.exit { transform: translateY(-20%); }`;
                } else {
                    css += `#jayaapp-alert-container .jayaapp-alert { opacity: 1; transform: none; transition: none; }`;
                }
                break;
            default:
                css += `#jayaapp-alert-container { left: ${h}; bottom: ${v}; align-items: flex-start; }`;
        }

        styleEl.textContent = css;
    }

    // helper: convert color name/hex to rgba(a)
    function colorToRgba(color, alpha) {
        if (!color) return `rgba(255,165,0,${alpha})`;
        const el = document.createElement('div');
        el.style.color = color;
        el.style.display = 'none';
        document.body.appendChild(el);
        const cs = getComputedStyle(el).color;
        document.body.removeChild(el);
        // cs is like 'rgb(r,g,b)' or 'rgba(r,g,b,a)'
        const m = cs.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
        if (!m) return `rgba(255,165,0,${alpha})`;
        const r = m[1], g = m[2], b = m[3];
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function showAlert(text, duration = 3500, options = {}) {
        const opts = Object.assign({}, DEFAULTS, options || {});
        ensureInjected(opts);

        const bg = colorToRgba(opts.bg_color, typeof opts.background_transparency === 'number' ? opts.background_transparency : DEFAULTS.background_transparency);

        const msg = document.createElement('div');
        msg.className = 'jayaapp-alert';
        msg.setAttribute('role', 'alert');
        msg.style.background = bg;
        msg.style.color = opts.tx_color;
        msg.style.font = opts.tx_font;
        msg.style.opacity = '0';
        msg.style.transition = 'opacity 200ms ease';
        msg.textContent = String(text || '');

        // append and animate
        container.appendChild(msg);

        // force reflow then add enter class
        requestAnimationFrame(() => {
            msg.classList.add('enter');
            msg.style.opacity = '1';
        });

        let removed = false;
        const remove = (immediate) => {
            if (removed) return;
            removed = true;
            msg.classList.remove('enter');
            msg.classList.add('exit');
            // wait for transition to finish
            setTimeout(() => { try { msg.remove(); } catch (e) {} }, immediate ? 0 : 280);
        };

        // auto remove after duration
        const to = setTimeout(() => remove(false), Math.max(700, duration));

        // allow click to dismiss
        msg.addEventListener('click', () => { clearTimeout(to); remove(true); });
    }

    // alias with the typo present in the request to avoid breaking callers
    window.showAlert = showAlert;
    window.showAllert = showAlert;

})();
