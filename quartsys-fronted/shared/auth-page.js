(function () {
  const api = window.QuartSysApi;
  if (!api) return;

  const form = document.querySelector('form');
  const textInput = form ? form.querySelector('input[type="text"]') : null;
  const pwdInput = form ? form.querySelector('input[type="password"]') : null;
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  const switchLink = Array.from(document.querySelectorAll('a')).find((a) => /register/i.test(a.textContent || ''));
  const forgotLink = Array.from(document.querySelectorAll('a')).find((a) => /forgot/i.test(a.textContent || ''));
  const eyeBtn = form ? form.querySelector('button[type="button"]') : null;

  if (!form || !textInput || !pwdInput || !submitBtn) return;

  let mode = 'login';
  const dashboardUrl = '../market_dashboard_updated/code.html';

  const msg = document.createElement('div');
  msg.className = 'text-sm text-on-surface-variant mt-2';
  form.appendChild(msg);

  function showMessage(text, isError) {
    msg.textContent = text || '';
    msg.className = `text-sm mt-2 ${isError ? 'text-red-400' : 'text-emerald-400'}`;
  }

  function applyMode() {
    if (mode === 'register') {
      submitBtn.textContent = 'REGISTER TERMINAL';
      showMessage('注册模式: 输入用户名/邮箱 + 密码', false);
    } else if (mode === 'reset') {
      submitBtn.textContent = 'RESET PASSWORD';
      showMessage('重置模式: 提交后会继续询问邮箱', false);
    } else {
      submitBtn.textContent = 'AUTHENTICATE TERMINAL';
      showMessage('', false);
    }
  }

  if (eyeBtn) {
    eyeBtn.addEventListener('click', () => {
      pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
    });
  }

  if (switchLink) {
    switchLink.addEventListener('click', (e) => {
      e.preventDefault();
      mode = mode === 'register' ? 'login' : 'register';
      applyMode();
    });
  }

  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      mode = 'reset';
      applyMode();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identity = (textInput.value || '').trim();
    const password = (pwdInput.value || '').trim();

    if (!identity || !password) {
      showMessage('请输入账号和密码', true);
      return;
    }

    submitBtn.disabled = true;
    try {
      if (mode === 'register') {
        const email = identity.includes('@') ? identity : `${identity}@example.com`;
        await api.post('/register', { username: identity, password, email });
        mode = 'login';
        applyMode();
        showMessage('注册成功，请使用账号密码登录', false);
      } else if (mode === 'reset') {
        const username = window.prompt('请输入用户名', identity) || identity;
        const emailDefault = identity.includes('@') ? identity : `${identity}@example.com`;
        const email = window.prompt('请输入注册邮箱', emailDefault) || emailDefault;
        await api.post('/reset_password', { username, email, new_password: password });
        mode = 'login';
        applyMode();
        showMessage('密码已重置，请登录', false);
      } else {
        const data = await api.post('/login', { username: identity, password });
        if (data && data.token) {
          api.setToken(data.token);
          localStorage.setItem('user', JSON.stringify(data.user || {}));
          showMessage('登录成功，正在跳转...', false);
          window.location.href = dashboardUrl;
          return;
        }
      }
    } catch (err) {
      showMessage(err.message || '操作失败', true);
    } finally {
      submitBtn.disabled = false;
    }
  });

  applyMode();
})();
