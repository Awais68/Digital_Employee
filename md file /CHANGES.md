# LinkedIn Playwright Skill — v2 → v3 Change Log
# Every breaking difference that caused silent failures

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 1 + 2  fill() / JS textContent  →  keyboard.type()
           (Post button stayed disabled; root cause of failure)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OLD (v2):
  # Try JavaScript approach first
  page.evaluate("""(content) => {
      const editable = document.querySelectorAll('[contenteditable="true"]');
      for (let el of editable) {
          if (el.offsetHeight > 0) {
              el.focus();
              el.textContent = content;           ← BYPASSES REACT
              el.dispatchEvent(new Event('input', {bubbles: true}));  ← NOT TRUSTED
              return true;
          }
      }
  }""", content)

  # Fallback
  editor.fill(content)       ← fill() doesn't work on contenteditable

NEW (v3):
  editor.click()
  page.keyboard.press("Control+A")
  page.keyboard.press("Delete")
  page.keyboard.type(content, delay=25)   ← Real OS-level key events
  page.wait_for_timeout(800)              ← Let React re-render

WHY: React uses synthetic events that wrap native DOM events.
     keyboard.type() fires real KeyboardEvent + InputEvent objects
     with isTrusted=true. React's event delegation picks these up,
     updates component state, and ENABLES the Post button.
     textContent assignment and fill() never trigger isTrusted events.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 3  Disabled-button check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OLD (v2):
  is_disabled = btn.get_attribute('disabled')      ← None when absent
  is_aria_disabled = btn.get_attribute('aria-disabled')
  if is_disabled or is_aria_disabled == 'true':
      page.wait_for_timeout(3000)
      btn.click()                 ← clicks even if still disabled

NEW (v3):
  for i in range(20):            ← poll up to 10 seconds
      if btn.is_enabled(): break
      page.wait_for_timeout(500)
  btn.click()                    ← only after confirmed enabled

WHY: is_enabled() correctly combines disabled attribute, aria-disabled,
     pointer-events:none, and other CSS-based disabling. get_attribute
     returns None (falsy) whether the attribute is absent OR absent
     with a default; it cannot detect CSS-only disabling.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 4  Stale class-name selectors
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OLD (v2):
  "div.feed-shared-create-post__cta"      ← removed from LinkedIn DOM
  "button.share-actions__primary-action"  ← removed from LinkedIn DOM
  "div.feed-shared-create-post__trigger"  ← removed from LinkedIn DOM

NEW (v3):  ordered by stability (aria-label > data-* > class > text)
  "button[aria-label*='Create a post']"   ← aria-labels change rarely
  "button[aria-label*='Start a post']"
  "[data-control-name='share.post']"      ← data-* attributes stable
  "div.share-box-feed-entry__trigger"     ← current class (2025)
  "button:has-text('Start a post')"       ← text fallback (most robust)
  "div[role='button']:has-text('Start a post')"

WHY: LinkedIn ships CSS Modules; class names like
     feed-shared-create-post__cta get renamed every major deploy.
     aria-label and data-* attributes are part of LinkedIn's
     accessibility/analytics contract and change far less often.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 5  Headless fingerprinting
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OLD (v2):
  browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
  # navigator.webdriver = true  ← LinkedIn can detect this

NEW (v3):
  browser = p.chromium.launch(
      headless=True,
      args=[
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled",  ← KEY
          "--disable-infobars",
      ],
  )
  context.add_init_script("""() => {
      Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
      Object.defineProperty(navigator, 'plugins',   {get: () => [1,2,3,4,5]});
      window.chrome = {runtime: {}};
  }""")

WHY: --disable-blink-features=AutomationControlled removes the
     webdriver flag that LinkedIn (and most major sites) check.
     Without this, LinkedIn may render a degraded UI that omits
     the post creation toolbar entirely.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 6  wait_until=domcontentloaded fires too early
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OLD (v2):
  page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded")
  page.wait_for_timeout(5000)   ← fixed 5s wait

NEW (v3):
  page.goto("https://www.linkedin.com/feed/", wait_until="commit")
  page.wait_for_selector("nav, .global-nav", timeout=30_000)   ← real sentinel
  page.wait_for_timeout(2000)

WHY: domcontentloaded fires when the HTML shell is parsed but before
     React mounts any components. The post creation UI is React-rendered;
     it does not exist in the DOM at domcontentloaded time.
     wait_for_selector("nav") waits until the actual navigation bar
     component has mounted, which is a reliable signal that the full
     React app is running and the feed UI is available.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADDITIONAL IMPROVEMENTS (v3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Screenshots at every step → Logs/linkedin_debug/  (no more blind failures)
• _first_visible() helper  → tries all selectors, returns first visible one
• _type_into_editor()      → reusable, tested in isolation
• _click_post_button()     → polls is_enabled() before clicking
• _make_context()          → stealth context factory (DRY)
• "debug" CLI command      → session check without posting
• Escape key press on diagnostic → never actually submits a test post
