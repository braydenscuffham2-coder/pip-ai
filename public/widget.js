/* Pip chat widget. Install with one line:
   <script src="https://pip-ai-drab.vercel.app/widget.js" data-skill="SKILL_ID" async></script>
   Optional: data-color="#5b3fe0" data-position="left". Self-contained, no dependencies. */
(function () {
  var me = document.currentScript;
  if (!me || window.__pipWidget) return;
  window.__pipWidget = true;
  var skill = me.getAttribute('data-skill') || '';
  var color = me.getAttribute('data-color') || '#5b3fe0';
  var left = me.getAttribute('data-position') === 'left';
  var base = new URL(me.src).origin;
  if (!/^[0-9a-f-]{36}$/i.test(skill)) { console.warn('[pip] data-skill is missing or invalid'); return; }

  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var convKey = 'pip-conv-' + skill;
  var conv = store.get(convKey);

  var host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483000;bottom:20px;' + (left ? 'left' : 'right') + ':20px';
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  root.innerHTML =
    '<style>' +
    ':host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '.btn{width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:radial-gradient(circle at 35% 30%,#fff,#cfc3ff 45%,' + color + ');box-shadow:0 12px 30px -8px rgba(60,40,160,.55);display:grid;place-items:center}' +
    '.btn svg{width:26px;height:26px}' +
    '.panel{position:absolute;bottom:72px;' + (left ? 'left' : 'right') + ':0;width:min(360px,calc(100vw - 32px));height:min(520px,calc(100vh - 120px));background:#fff;border-radius:20px;box-shadow:0 24px 60px -18px rgba(20,20,60,.45);border:1px solid rgba(11,13,31,.08);display:none;flex-direction:column;overflow:hidden}' +
    '.panel.open{display:flex}' +
    '.head{padding:14px 16px;background:linear-gradient(135deg,' + color + ',#26bcab);color:#fff}' +
    '.head b{display:block;font-size:15px}.head span{font-size:12px;opacity:.85}' +
    '.feed{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#fafaff}' +
    '.m{max-width:85%;padding:9px 12px;border-radius:16px;font-size:14px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.them{align-self:flex-start;background:#fff;border:1px solid rgba(11,13,31,.08);border-bottom-left-radius:5px;color:#0b0d1f}' +
    '.me{align-self:flex-end;background:#0b0d1f;color:#fff;border-bottom-right-radius:5px}' +
    '.dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#9aa;animation:b 1s infinite}.dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}' +
    '@keyframes b{50%{opacity:.25}}' +
    'form{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(11,13,31,.08)}' +
    'input{flex:1;min-width:0;height:40px;border-radius:12px;border:1px solid rgba(11,13,31,.15);padding:0 12px;font-size:14px}' +
    'input:focus{outline:2px solid ' + color + ';outline-offset:1px}' +
    'button.send{height:40px;padding:0 14px;border-radius:12px;border:0;background:#0b0d1f;color:#fff;font-weight:600;cursor:pointer}' +
    'button.send:disabled{opacity:.4}' +
    '.foot{font-size:10.5px;color:#888;text-align:center;padding:0 0 8px}' +
    '@media (prefers-reduced-motion:reduce){.dots span{animation:none}}' +
    '</style>' +
    '<div class="panel" role="dialog" aria-label="Chat"><div class="head"><b class="t">Chat with us</b><span>We usually reply right away</span></div>' +
    '<div class="feed" aria-live="polite"></div>' +
    '<form><label style="position:absolute;left:-9999px" for="pip-in">Message</label><input id="pip-in" maxlength="1000" autocomplete="off" placeholder="Type a message..."><button class="send" type="submit">Send</button></form>' +
    '<div class="foot">AI assistant. A person can step in anytime.</div></div>' +
    '<button class="btn" type="button" aria-label="Open chat"><svg viewBox="0 0 24 24" fill="none" stroke="#0b0d1f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"/></svg></button>';
  document.body.appendChild(host);

  var panel = root.querySelector('.panel'), feed = root.querySelector('.feed'), form = root.querySelector('form'), input = root.querySelector('input'), send = root.querySelector('.send');
  var greeted = false;

  function bubble(text, who) { var p = document.createElement('div'); p.className = 'm ' + who; p.textContent = text; feed.appendChild(p); feed.scrollTop = feed.scrollHeight; return p; }
  function typing() { var p = document.createElement('div'); p.className = 'm them dots'; p.innerHTML = '<span></span><span></span><span></span>'; feed.appendChild(p); feed.scrollTop = feed.scrollHeight; return p; }

  function greet() {
    if (greeted) return; greeted = true;
    fetch(base + '/api/runtime/skill?id=' + skill).then(function (r) { return r.json(); }).then(function (d) {
      if (d.business) root.querySelector('.t').textContent = d.business;
      bubble(d.opener || 'Hi! How can we help?', 'them');
    }).catch(function () { bubble('Hi! How can we help?', 'them'); });
  }

  root.querySelector('.btn').addEventListener('click', function () { panel.classList.toggle('open'); if (panel.classList.contains('open')) { greet(); input.focus(); } });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim(); if (!text) return;
    input.value = ''; send.disabled = true; bubble(text, 'me'); var t = typing();
    fetch(base + '/api/runtime/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skill: skill, conversation: conv, message: text }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { t.remove(); if (d.conversation) { conv = d.conversation; store.set(convKey, conv); } bubble(d.reply || 'Thanks! Someone will get back to you shortly.', 'them'); })
      .catch(function () { t.remove(); bubble("Sorry, that didn't go through. Please try again.", 'them'); })
      .then(function () { send.disabled = false; input.focus(); });
  });
})();
