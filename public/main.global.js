(function () {
  'use strict';

  var subjects = [
    { label: 'Math', icon: 'math' }, { label: 'English', icon: 'english' },
    { label: 'Science', icon: 'science' }, { label: 'History', icon: 'history' },
    { label: 'General', icon: 'general' },
  ];

  var iconPaths = {
    math: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    english: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    science: '<path d="M9 3h6"/><path d="M10 3v7.4a2 2 0 0 1-.6 1.4L5 15.2V17h14v-1.8l-4.4-3.4a2 2 0 0 1-.6-1.4V3"/><path d="M7 17l2 4"/><path d="M17 17l-2 4"/>',
    history: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    general: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="8" y2="12.01"/><line x1="12" y1="12" x2="12" y2="12.01"/><line x1="16" y1="12" x2="16" y2="12.01"/><line x1="8" y1="16" x2="8" y2="16.01"/><line x1="12" y1="16" x2="12" y2="16.01"/><line x1="16" y1="16" x2="16" y2="16.01"/>',
  };

  function icon(name, size) {
    size = size || 18;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (iconPaths[name] || iconPaths.general) + '</svg>';
  }

  function mascot() {
    return '<div class="ai-tutor-float" aria-hidden="true"><div class="ai-tutor-mascot"><div class="ai-tutor-eyes"><div class="ai-tutor-eye"><span></span></div><div class="ai-tutor-eye"><span></span></div></div></div><span class="ai-tutor-label">AI Tutor</span></div>';
  }

  function mountCalculator(container, textarea) {
    window.AITutorCalculator.create(container, { textarea: textarea });
  }

  function mountMascot() {
    document.addEventListener('mousemove', function (event) {
      document.querySelectorAll('.ai-tutor-eye').forEach(function (eye) {
        var rect = eye.getBoundingClientRect();
        var dx = event.clientX - (rect.left + rect.width / 2);
        var dy = event.clientY - (rect.top + rect.height / 2);
        var distance = Math.hypot(dx, dy) || 1;
        eye.querySelector('span').style.transform = 'translate(' + ((dx / distance) * 1.5) + 'px, ' + ((dy / distance) * 1.5) + 'px)';
      });
    });
  }

  function mountCalculator(container, textarea) {
    container.innerHTML = calculator();
    var input = container.querySelector('.mini-calc-input');
    var output = container.querySelector('.mini-calc-result');
    container.querySelector('.mini-calc-run').addEventListener('click', function () {
      try {
        if (!/^[0-9+*/().%\s-]+$/.test(input.value)) throw new Error('Use numbers and operators only');
        var value = Function('"use strict"; return (' + input.value + ')')();
        output.textContent = Number.isFinite(value) ? String(value) : 'Invalid result';
        textarea.value = textarea.value ? textarea.value + ' ' + output.textContent : output.textContent;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (error) { output.textContent = (error && error.message) || 'Invalid expression'; }
    });
  }

  function mount() {
    var root = document.getElementById('root');
    if (!root) return;
    root.innerHTML = mascot() + '\n' +
      '<div class="landing">\n' +
      '  <header class="landing-header"><a href="/" class="landing-logo"><span class="logo-icon">✦</span><span class="logo-text">AITutor</span></a><a href="/chats" class="header-chats-link">' + icon('general', 16) + ' My Chats</a></header>\n' +
      '  <section class="landing-hero"><h1>Your AI Homework Helper</h1><p class="landing-subtitle">Snap a photo or type your question. Get clear, step-by-step answers in seconds.</p></section>\n' +
      '  <div class="subject-chips stagger-in">' + subjects.map(function (s) { return '<button class="chip" data-subject="' + s.label + '">' + icon(s.icon, 14) + s.label + '</button>'; }).join('') + '</div>\n' +
      '  <form class="input-card" id="landing-form"><div class="input-card-inner"><div class="image-preview-bar" hidden><img class="image-thumb" alt="Uploaded"><span class="image-name"></span><button type="button" class="image-remove">✕</button></div><div class="input-card-calc" hidden><div class="calculator"><div class="calc-header"><div class="calc-mode-tabs"><button type="button" class="calc-tab active" data-mode="basic">Calc</button><button type="button" class="calc-tab" data-mode="convert">Convert</button></div><span class="calc-title">AI Calc</span></div><div class="calc-panels"><div class="calc-panel" data-panel="calc"><div class="calc-display"><div class="calc-expr">0</div><div class="calc-result"></div></div><div class="calc-keys-sci"><button type="button" class="calc-key op" data-key="\u221a(">\u221a</button><button type="button" class="calc-key op" data-key="sin(">sin</button><button type="button" class="calc-key op" data-key="cos(">cos</button><button type="button" class="calc-key op" data-key="tan(">tan</button><button type="button" class="calc-key op" data-key="log(">log</button><button type="button" class="calc-key op" data-key="ln(">ln</button><button type="button" class="calc-key op" data-key="\u03c0">\u03c0</button><button type="button" class="calc-key op" data-key="^">^</button></div><div class="calc-keys"><button type="button" class="calc-key clear" data-key="C">C</button><button type="button" class="calc-key op" data-key="( )">( )</button><button type="button" class="calc-key op" data-key="%">%</button><button type="button" class="calc-key op" data-key="\u00f7">\u00f7</button><button type="button" class="calc-key op" data-key="7">7</button><button type="button" class="calc-key">8</button><button type="button" class="calc-key">9</button><button type="button" class="calc-key op" data-key="\u00d7">\u00d7</button><button type="button" class="calc-key">4</button><button type="button" class="calc-key">5</button><button type="button" class="calc-key">6</button><button type="button" class="calc-key op" data-key="\u2212">\u2212</button><button type="button" class="calc-key">1</button><button type="button" class="calc-key">2</button><button type="button" class="calc-key">3</button><button type="button" class="calc-key op" data-key="+">+</button><button type="button" class="calc-key">0</button><button type="button" class="calc-key">.</button><button type="button" class="calc-key op" data-key="\u232b">\u232b</button><button type="button" class="calc-key equals" data-key="=">=</button></div></div><div class="calc-panel calc-convert" hidden><div class="converter"><div class="converter-cats"><button type="button" class="converter-cat active" data-cat="length">Length</button><button type="button" class="converter-cat" data-cat="weight">Weight</button><button type="button" class="converter-cat" data-cat="temp">Temp</button><button type="button" class="converter-cat" data-cat="data">Data</button></div><div class="converter-body"></div></div></div></div><button type="button" class="calc-insert-btn">Insert into message \u2193</button></div><textarea class="input-textarea" rows="3" placeholder="Ask anything... e.g. Solve for x: 2x + 5 = 15"></textarea><div class="input-actions"><div class="input-tools">    <input id="homework-image" type="file" accept="image/*" hidden><button type="button" class="tool-btn camera-btn" title="Take a photo or upload">' + icon('camera', 20) + '</button><button type="button" class="tool-btn calc-toggle" title="Calculator">' + icon('calculator', 18) + '</button></div><button type="submit" class="send-btn">Solve <span class="btn-arrow">→</span></button></div></div><p class="input-error" hidden></p></form>\n' +
      '  <section class="features stagger-in"><div class="feature hover-3d"><div class="feature-icon-wrap">' + icon('camera', 24) + '</div><h3>Camera Input</h3><p>Snap a photo of any homework problem and get instant help.</p></div><div class="feature hover-3d"><div class="feature-icon-wrap">' + icon('calculator', 24) + '</div><h3>Calculator ×2</h3><p>Scientific calculator and unit conversion tools for everyday study.</p></div><div class="feature hover-3d"><div class="feature-icon-wrap">' + icon('general', 24) + '</div><h3>All Subjects</h3><p>Math, English, Science, History, and General topics in one tutor.</p></div></section>\n' +
      '  <section class="credits stagger-in"><div class="credits-heading"><p class="partnerships-kicker"><span class="kicker-dot"></span> Built with care</p><h2>The people behind AITutor.</h2><p class="partnerships-intro">Engineers, IT, AI, support staff, and designers working together to keep learning fast, friendly, and dependable.</p></div><div class="credits-grid"><div class="credit-card credit-founder"><span class="credit-avatar credit-emerald">RF</span><div><strong>Rhonod Fletcher</strong><span>Founder &amp; IT Lead</span></div></div><div class="credit-card"><span class="credit-avatar credit-indigo">MK</span><div><strong>Maya Kim</strong><span>Lead Developer</span></div></div><div class="credit-card"><span class="credit-avatar credit-cyan">RJ</span><div><strong>Rohan Jones</strong><span>IT Administrator</span></div></div><div class="credit-card"><span class="credit-avatar credit-amber">AN</span><div><strong>Avery Nguyen</strong><span>AI Manager</span></div></div><div class="credit-card"><span class="credit-avatar credit-rose">SC</span><div><strong>Sam Carter</strong><span>Learning Designer</span></div></div><div class="credit-card"><span class="credit-avatar credit-sky">DM</span><div><strong>Diego Morales</strong><span>Frontend Developer</span></div></div><div class="credit-card"><span class="credit-avatar credit-emerald">LF</span><div><strong>Lena Fischer</strong><span>Backend Developer</span></div></div><div class="credit-card"><span class="credit-avatar credit-indigo">PS</span><div><strong>Priya Sharma</strong><span>Full-Stack Developer</span></div></div><div class="credit-card"><span class="credit-avatar credit-cyan">OH</span><div><strong>Omar Haddad</strong><span>DevOps Engineer</span></div></div><div class="credit-card"><span class="credit-avatar credit-amber">GL</span><div><strong>Grace Lin</strong><span>QA Engineer</span></div></div><div class="credit-card"><span class="credit-avatar credit-rose">TB</span><div><strong>Tasha Brooks</strong><span>Support Lead</span></div></div><div class="credit-card"><span class="credit-avatar credit-sky">MR</span><div><strong>Marcus Reid</strong><span>Community Support</span></div></div></div></section>\n' +
      '  <section class="partnerships stagger-in"><div class="partnerships-heading"><div><p class="partnerships-kicker"><span class="kicker-dot"></span> The learning ecosystem</p><h2>Better together.</h2><p class="partnerships-intro">AITutor fits into the tools students already love — connecting explanations, practice, and progress in one calm place.</p></div><div class="partnerships-orbit">✦</div></div><div class="partnerships-cta"><span>Building something that helps students learn?</span><a href="mailto:partners@aitutor.app" class="partnerships-link">Become a partner <span>→</span></a></div></section>\n' +
      '  <footer class="landing-footer">AITutor — Learn anything, faster.</footer>\n' +
      '</div>';

    mountMascot();
    var selectedSubject = 'General';
    var form = root.querySelector('#landing-form');
    var textarea = root.querySelector('.input-textarea');
    var error = root.querySelector('.input-error');
    var image = '';
    var imageName = '';
    root.querySelectorAll('[data-subject]').forEach(function (button) {
      button.addEventListener('click', function () {
        selectedSubject = button.dataset.subject;
        root.querySelectorAll('[data-subject]').forEach(function (item) { item.classList.toggle('active', item === button); });
        textarea.focus();
      });
    });
    root.querySelector('.camera-btn').addEventListener('click', function () { root.querySelector('#homework-image').click(); });
    root.querySelector('#homework-image').addEventListener('change', function (event) {
      var file = event.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { error.textContent = 'Choose an image smaller than 5 MB.'; error.hidden = false; return; }
      var reader = new FileReader();
      reader.onload = function () {
        image = String(reader.result);
        imageName = file.name;
        var preview = root.querySelector('.image-preview-bar');
        preview.hidden = false;
        preview.querySelector('img').src = image;
        preview.querySelector('.image-name').textContent = imageName;
      };
      reader.readAsDataURL(file);
    });
    root.querySelector('.image-remove').addEventListener('click', function () {
      image = ''; imageName = '';
      root.querySelector('.image-preview-bar').hidden = true;
    });
    var calc = root.querySelector('.input-card-calc');
    var calcInstance = null;
    root.querySelector('.calc-toggle').addEventListener('click', function () {
      calc.hidden = !calc.hidden;
      if (!calc.hidden && !calcInstance) calcInstance = window.AITutorCalculator.create(calc, { textarea: textarea });
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!textarea.value.trim() && !image) { error.textContent = 'Type a question or add a photo.'; error.hidden = false; return; }
      sessionStorage.setItem('ai-tutor-pending', JSON.stringify({ prompt: textarea.value.trim(), image: image, subject: selectedSubject }));
      window.location.href = '/chats';
    });
  }

  mount();
})();
