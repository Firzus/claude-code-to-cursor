/**
 * HTML templates for OAuth login flow
 */

export function htmlResult(message: string, success: boolean): string {
  const iconSVG = success
    ? `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5 5-5"/></svg>`
    : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ccproxy — ${success ? "Success" : "Error"}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#000;color:#ededed;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{width:min(420px,90vw);text-align:center;animation:fadeIn .4s ease both}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  .icon{margin-bottom:20px;opacity:${success ? '1' : '0.7'}}
  h2{font-size:1.25rem;font-weight:500;color:#fff;margin-bottom:16px;letter-spacing:-.02em}
  .msg{font-size:.875rem;line-height:1.7;color:#888}
  .msg code{font-family:'SF Mono',SFMono-Regular,Menlo,monospace;background:#111;border:1px solid #222;padding:2px 6px;border-radius:4px;font-size:.8em;color:#ededed}
  .back{display:inline-block;margin-top:28px;font-size:.8rem;color:#666;text-decoration:none;transition:color .15s}
  .back:hover{color:#fff}
</style>
</head><body>
<div class="card">
  <div class="icon">${iconSVG}</div>
  <h2>${success ? "Authenticated" : "Authentication Failed"}</h2>
  <div class="msg">${message}</div>
  <a href="/login" class="back">&larr; Back to login</a>
</div>
</body></html>`;
}

export function loginPage(authURL: string, state: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ccproxy — Login</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#000;color:#ededed;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}

  .wrapper{width:min(460px,100%)}

  .header{margin-bottom:32px;animation:fadeIn .4s ease both}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

  .logo{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .logo svg{width:20px;height:20px}
  .logo-text{font-size:.9375rem;font-weight:600;color:#fff;letter-spacing:-.01em}
  .subtitle{font-size:.8125rem;color:#666}

  .card{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;animation:fadeIn .5s .05s ease both}

  .steps{padding:24px 24px 0}
  .step{display:flex;gap:12px;margin-bottom:20px;position:relative}
  .step:last-child{margin-bottom:0}
  .step:not(:last-child)::after{content:'';position:absolute;left:13px;top:32px;bottom:-8px;width:1px;background:#1a1a1a}

  .step-num{flex-shrink:0;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    font-size:.75rem;font-weight:500;background:#111;color:#888;border:1px solid #222}
  .step-content{flex:1;padding-top:3px}
  .step-title{font-size:.8125rem;font-weight:500;color:#ededed;margin-bottom:4px}
  .step-desc{font-size:.75rem;color:#666;line-height:1.5}

  .auth-link{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:7px 14px;
    background:transparent;border:1px solid #333;border-radius:6px;color:#ededed;
    font-size:.8125rem;font-weight:500;text-decoration:none;transition:all .15s}
  .auth-link:hover{background:#111;border-color:#444}
  .auth-link svg{width:14px;height:14px;transition:transform .15s}
  .auth-link:hover svg{transform:translateX(2px)}

  .form-area{padding:20px 24px 24px;margin-top:20px;border-top:1px solid #1a1a1a}
  .input-label{display:block;font-size:.75rem;font-weight:500;color:#888;margin-bottom:8px}

  input[type=text]{width:100%;padding:10px 12px;background:#000;border:1px solid #333;border-radius:8px;
    color:#ededed;font-family:inherit;font-size:.875rem;outline:none;transition:border-color .15s}
  input[type=text]::placeholder{color:#444}
  input[type=text]:hover{border-color:#444}
  input[type=text]:focus{border-color:#ededed;box-shadow:0 0 0 1px #ededed}

  .submit-btn{width:100%;padding:10px 16px;border:none;border-radius:8px;cursor:pointer;
    font-family:inherit;font-size:.875rem;font-weight:500;margin-top:12px;
    background:#ededed;color:#000;transition:background .15s;position:relative}
  .submit-btn:hover{background:#fff}
  .submit-btn:active{background:#ccc}
  .submit-btn:disabled{opacity:.5;cursor:not-allowed}
  .submit-btn.loading{color:transparent;pointer-events:none}
  .submit-btn.loading::after{content:'';position:absolute;width:16px;height:16px;
    border:2px solid #666;border-top-color:#000;border-radius:50%;
    animation:spin .5s linear infinite;top:50%;left:50%;margin:-8px 0 0 -8px}
  @keyframes spin{to{transform:rotate(360deg)}}

  .footer{text-align:center;margin-top:20px;animation:fadeIn .4s .15s ease both}
  .footer-note{font-size:.75rem;color:#444}
</style>
</head><body>
<div class="wrapper">
  <div class="header">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="#ededed" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
      <span class="logo-text">ccproxy</span>
    </div>
    <p class="subtitle">Connect your Anthropic account via OAuth PKCE</p>
  </div>

  <div class="card">
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-content">
          <div class="step-title">Authorize with Anthropic</div>
          <div class="step-desc">Open the consent page to grant access to your account.</div>
          <a href="${authURL}" target="_blank" rel="noopener" class="auth-link" id="authLink">
            Open authorization page
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
          </a>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-content">
          <div class="step-title">Copy the authorization code</div>
          <div class="step-desc">After approving, copy the code from the callback page.</div>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-content">
          <div class="step-title">Paste it below</div>
          <div class="step-desc">Submit the code to complete the token exchange.</div>
        </div>
      </div>
    </div>

    <div class="form-area">
      <form method="POST" action="/oauth/callback" id="authForm">
        <input type="hidden" name="state" value="${state}">
        <label class="input-label" for="codeInput">Authorization Code</label>
        <input type="text" id="codeInput" name="code" placeholder="Paste code here..." required autofocus autocomplete="off" spellcheck="false">
        <button type="submit" class="submit-btn" id="submitBtn">Authenticate</button>
      </form>
    </div>
  </div>

  <div class="footer">
    <p class="footer-note">Code expires in ~10 minutes &middot; single-use only</p>
  </div>
</div>

<script>
  document.getElementById('authForm').addEventListener('submit', function() {
    var btn = document.getElementById('submitBtn');
    btn.classList.add('loading');
    btn.disabled = true;
  });
</script>
</body></html>`;
}
