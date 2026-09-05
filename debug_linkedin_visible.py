#!/usr/bin/env python3
"""
debug_linkedin_visible.py - Visual Debug LinkedIn Posting (non-interactive)

Opens a VISIBLE browser and walks through the posting process step by step.
Takes screenshots at each step for analysis.

Usage:
    python3 debug_linkedin_visible.py
"""

import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

def debug_posting():
    """Debug LinkedIn posting with visible browser"""
    BASE_DIR = Path(__file__).parent
    cookies_file = BASE_DIR / "linkedin_session" / "cookies.json"
    
    if not cookies_file.exists():
        print("❌ No session found")
        print("Run: python3 setup_linkedin_session.py")
        return
    
    print("🔍 Debugging LinkedIn Posting...")
    print("=" * 70)
    print()
    
    screenshots_dir = BASE_DIR / "debug_screenshots"
    screenshots_dir.mkdir(exist_ok=True)
    
    try:
        with sync_playwright() as p:
            # Launch VISIBLE browser
            print("🚀 Launching visible browser...")
            browser = p.chromium.launch(headless=False, slow_mo=500)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720}
            )
            context.add_cookies(json.load(open(cookies_file, 'r')))
            page = context.new_page()
            
            # Step 1: Navigate
            print("\n📍 Step 1: Navigating to LinkedIn feed...")
            page.goto("https://www.linkedin.com/feed/", timeout=60000, wait_until="domcontentloaded")
            page.wait_for_timeout(5000)
            print(f"   URL: {page.url}")
            try:
                page.screenshot(path=str(screenshots_dir / "01_feed.png"), full_page=True)
                print("   📸 Screenshot: 01_feed.png")
            except Exception as e:
                print(f"   ⚠️  Screenshot failed: {e}")
            
            # Check if logged in
            if "login" in page.url.lower() or "signin" in page.url.lower():
                print("❌ Session expired - redirected to login")
                print("Browser will stay open for 60 seconds...")
                time.sleep(60)
                browser.close()
                return
            
            print("✅ Logged in successfully")
            
            # Step 2: Debug - find all potential "Start a post" elements
            print("\n🔍 Step 2: Searching for 'Start a post' elements...")
            debug_info = page.evaluate("""() => {
                const results = [];
                const candidates = document.querySelectorAll('a, div, span, button');
                for (const el of candidates) {
                    const t = (el.textContent || '').trim().toLowerCase();
                    if ((t.includes('start a post') || t === 'start a post' || t.includes('start a post') || t === 'post') && el.offsetHeight > 0) {
                        results.push({
                            tag: el.tagName,
                            text: t.substring(0, 60),
                            cls: (el.className || '').substring(0, 80),
                            id: el.id || '',
                            role: el.getAttribute('role') || '',
                            href: el.getAttribute('href') || '',
                            aria_label: el.getAttribute('aria-label') || '',
                            visible: el.offsetHeight > 0 && el.offsetWidth > 0,
                            rect_top: el.getBoundingClientRect().top.toFixed(0),
                            rect_left: el.getBoundingClientRect().left.toFixed(0)
                        });
                    }
                    if (results.length > 20) break;
                }
                return results;
            }""")
            print(f"   Found {len(debug_info)} 'Start a post' candidates:")
            for i, item in enumerate(debug_info):
                print(f"   {i+1}. <{item['tag']}> text='{item['text']}' cls='{item['cls']}' id='{item['id']}' role='{item['role']}' aria='{item['aria_label']}' top={item['rect_top']}")
            
            page.screenshot(path=str(screenshots_dir / "02_before_click.png"), full_page=True)
            print("   📸 Screenshot: 02_before_click.png")
            
            # Step 3: Click "Start a post"
            print("\n🖱️  Step 3: Clicking 'Start a post'...")
            start_post_selectors = [
                "a:has-text('Start a post')",
                "div:has-text('Start a post')",
                "a[href*='post']",
                "div[role='button']:has-text('Start a post')",
                "button:has-text('Start a post')",
                "div.feed-shared-create-post__cta",
                "span:has-text('Start a post')",
                "div[data-control-name='create_post']",
            ]

            clicked = False
            for selector in start_post_selectors:
                try:
                    el = page.locator(selector).first
                    if el.count() > 0 and el.is_visible(timeout=2000):
                        print(f"   Trying: {selector}")
                        el.click()
                        print(f"   ✅ Clicked: {selector}")
                        clicked = True
                        break
                except Exception as e:
                    print(f"   ⚠️  {selector}: {str(e)[:50]}")
                    continue
            
            # Fallback JS click
            if not clicked:
                print("   Trying JS fallback...")
                try:
                    clicked = page.evaluate("""() => {
                        const anchors = document.querySelectorAll('a, div[role="button"], button, span');
                        for (const a of anchors) {
                            const t = (a.textContent || '').trim().toLowerCase();
                            if (t.includes('start a post') && a.offsetHeight > 0) {
                                a.click();
                                return true;
                            }
                        }
                        return false;
                    }""")
                    if clicked:
                        print("   ✅ Clicked via JS")
                except Exception as e:
                    print(f"   ❌ JS click error: {e}")
            
            page.wait_for_timeout(3000)
            try:
                page.screenshot(path=str(screenshots_dir / "03_after_click.png"), full_page=True)
                print("   📸 Screenshot: 03_after_click.png")
            except Exception as e:
                print(f"   ⚠️  Screenshot failed: {e}")
            
            # Step 4: Debug - find editor elements
            print("\n🔍 Step 4: Searching for editor elements...")
            editor_info = page.evaluate("""() => {
                const results = [];
                const candidates = [];
                
                // 1. Contenteditable
                document.querySelectorAll('[contenteditable="true"], [contenteditable="plaintext-only"]').forEach(el => {
                    if (el.offsetHeight > 0 && el.offsetWidth > 0) {
                        candidates.push({el, type: 'contenteditable', tag: el.tagName, cls: el.className.substring(0,80), id: el.id, placeholder: el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || '', role: el.getAttribute('role') || ''});
                    }
                });
                
                // 2. role=textbox
                document.querySelectorAll('[role="textbox"]').forEach(el => {
                    if (el.offsetHeight > 0 && el.offsetWidth > 0) {
                        candidates.push({el, type: 'textbox', tag: el.tagName, cls: el.className.substring(0,80), id: el.id, placeholder: el.getAttribute('placeholder') || '', role: 'textbox'});
                    }
                });
                
                // 3. Quill
                document.querySelectorAll('.ql-editor').forEach(el => {
                    if (el.offsetHeight > 0 && el.offsetWidth > 0) {
                        candidates.push({el, type: 'ql-editor', tag: el.tagName, cls: el.className.substring(0,80), id: el.id, placeholder: '', role: ''});
                    }
                });
                
                // 4. ProseMirror
                document.querySelectorAll('.ProseMirror').forEach(el => {
                    if (el.offsetHeight > 0 && el.offsetWidth > 0) {
                        candidates.push({el, type: 'ProseMirror', tag: el.tagName, cls: el.className.substring(0,80), id: el.id, placeholder: '', role: ''});
                    }
                });
                
                // 5. data-placeholder
                document.querySelectorAll('[data-placeholder]').forEach(el => {
                    if (el.offsetHeight > 0 && el.offsetWidth > 0) {
                        if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.getAttribute('role') === 'textbox') {
                            candidates.push({el, type: 'data-placeholder', tag: el.tagName, cls: el.className.substring(0,80), id: el.id, placeholder: el.getAttribute('data-placeholder'), role: el.getAttribute('role') || ''});
                        }
                    }
                });
                
                // 6. textarea
                document.querySelectorAll('textarea').forEach(el => {
                    if (el.offsetHeight > 0 && el.offsetWidth > 0 && !el.id.includes('captcha') && !el.id.includes('recaptcha')) {
                        candidates.push({el, type: 'textarea', tag: el.tagName, cls: el.className.substring(0,80), id: el.id, placeholder: el.getAttribute('placeholder') || '', role: ''});
                    }
                });
                
                // 7. Any div in dialog
                document.querySelectorAll('[role="dialog"] div').forEach(el => {
                    if (el.offsetHeight > 20 && el.offsetWidth > 50 && (el.isContentEditable || el.getAttribute('contenteditable') === 'true')) {
                        candidates.push({el, type: 'dialog-div', tag: el.tagName, cls: el.className.substring(0,80), id: el.id, placeholder: '', role: ''});
                    }
                });
                
                // Return all candidates
                for (const c of candidates) {
                    results.push({
                        type: c.type,
                        tag: c.tag,
                        cls: c.cls,
                        id: c.id,
                        placeholder: c.placeholder,
                        role: c.role,
                        rect_top: c.el.getBoundingClientRect().top.toFixed(0),
                        rect_left: c.el.getBoundingClientRect().left.toFixed(0),
                        rect_width: c.el.getBoundingClientRect().width.toFixed(0),
                        rect_height: c.el.getBoundingClientRect().height.toFixed(0),
                        is_content_editable: c.el.isContentEditable,
                        content_editable: c.el.getAttribute('contenteditable'),
                        inner_html_preview: (c.el.innerHTML || '').substring(0, 100)
                    });
                }
                return results;
            }""")
            
            print(f"   Found {len(editor_info)} editor candidates:")
            for i, item in enumerate(editor_info):
                print(f"   {i+1}. type={item['type']} <{item['tag']}> cls='{item['cls']}' id='{item['id']}' placeholder='{item['placeholder']}' role='{item['role']}' contenteditable='{item['content_editable']}' top={item['rect_top']} left={item['rect_left']} w={item['rect_width']} h={item['rect_height']} html='{item['inner_html_preview']}'")
            
            try:
                page.screenshot(path=str(screenshots_dir / "04_editor_search.png"), full_page=True)
                print("   📸 Screenshot: 04_editor_search.png")
            except Exception as e:
                print(f"   ⚠️  Screenshot failed: {e}")
            
            # Also dump the dialog HTML
            dialog_html = page.evaluate("""() => {
                const dialog = document.querySelector('[role="dialog"]');
                if (dialog) return dialog.outerHTML.substring(0, 5000);
                return 'No dialog found';
            }""")
            print(f"\n   Dialog HTML (first 5000 chars):\n   {dialog_html}")
            
            # Step 5: Try to fill content
            print("\n✍️  Step 5: Trying to fill content...")
            test_content = f"Debug test post - {time.strftime('%H:%M:%S')}"
            
            if editor_info:
                first_editor = editor_info[0]
                print(f"   Using editor type: {first_editor['type']}")
                
                if first_editor['type'] == 'textarea':
                    page.evaluate("(content) => { const ta = document.querySelector('textarea'); if (ta) { ta.value = content; ta.dispatchEvent(new Event('input', {bubbles: true})); } }", test_content)
                elif first_editor['type'] == 'ql-editor':
                    page.evaluate("(content) => { const el = document.querySelector('.ql-editor'); if (el) { el.focus(); el.innerHTML = '<p>' + content.replace(/\\n/g, '</p><p>') + '</p>'; el.dispatchEvent(new Event('input', {bubbles: true})); } }", test_content)
                elif first_editor['type'] == 'ProseMirror':
                    page.evaluate("(content) => { const el = document.querySelector('.ProseMirror'); if (el) { el.focus(); el.innerHTML = '<p>' + content.replace(/\\n/g, '</p><p>') + '</p>'; el.dispatchEvent(new Event('input', {bubbles: true})); } }", test_content)
                else:
                    page.evaluate("(content) => { const editable = document.querySelectorAll('[contenteditable=\"true\"], [contenteditable=\"plaintext-only\"], [role=\"textbox\"]'); for (let el of editable) { if (el.offsetHeight > 0 && el.offsetWidth > 0) { el.focus(); el.textContent = content; el.dispatchEvent(new Event('input', {bubbles: true})); return true; } } return false; }", test_content)
                
                print("   ✅ Content filled")
            else:
                print("   ❌ No editor found!")
            
            page.wait_for_timeout(2000)
            try:
                page.screenshot(path=str(screenshots_dir / "05_after_fill.png"), full_page=True)
                print("   📸 Screenshot: 05_after_fill.png")
            except Exception as e:
                print(f"   ⚠️  Screenshot failed: {e}")
            
            # Step 6: Find Post button
            print("\n🚀 Step 6: Searching for 'Post' button...")
            post_selectors = [
                "button.share-actions__primary-action",
                "button.artdeco-button--primary",
                "button.share-actions__primary-action:not([disabled])",
                "div.share-box_actions--primary button",
                "div.share-box_actions button",
                "button[aria-label='Post']",
                "button[aria-label='Post now']",
                "button[aria-label*='Post']",
                "button[data-control-name='post']",
                "div[data-control-name='post']",
                "button:has-text('Post')",
                "div[role='button']:has-text('Post')",
                "button:has(span:has-text('Post'))",
            ]

            found = False
            for selector in post_selectors:
                try:
                    btn = page.locator(selector).first
                    if btn.is_visible(timeout=3000):
                        disabled = btn.get_attribute('disabled')
                        aria_disabled = btn.get_attribute('aria-disabled')
                        print(f"   ✅ FOUND: {selector} - disabled={disabled}, aria-disabled={aria_disabled}")
                        found = True
                        break
                except Exception as e:
                    pass
            
            if not found:
                print("   ❌ Post button NOT FOUND with selectors")
                # JS fallback
                post_info = page.evaluate("""() => {
                    const results = [];
                    const buttons = document.querySelectorAll('button, div[role="button"]');
                    for (const b of buttons) {
                        const t = (b.textContent || '').trim();
                        if (t.toLowerCase().includes('post') && b.offsetHeight > 0) {
                            results.push({
                                tag: b.tagName,
                                text: t,
                                cls: (b.className || '').substring(0, 80),
                                id: b.id || '',
                                role: b.getAttribute('role') || '',
                                aria_label: b.getAttribute('aria-label') || '',
                                disabled: b.disabled,
                                aria_disabled: b.getAttribute('aria-disabled'),
                                rect_top: b.getBoundingClientRect().top.toFixed(0),
                                rect_left: b.getBoundingClientRect().left.toFixed(0)
                            });
                        }
                    }
                    return results;
                }""")
                print(f"   JS found {len(post_info)} post button candidates:")
                for i, item in enumerate(post_info):
                    print(f"   {i+1}. <{item['tag']}> text='{item['text']}' cls='{item['cls']}' disabled={item['disabled']} aria-disabled={item['aria_disabled']} top={item['rect_top']}")
            
            try:
                page.screenshot(path=str(screenshots_dir / "06_post_button.png"), full_page=True)
                print("   📸 Screenshot: 06_post_button.png")
            except Exception as e:
                print(f"   ⚠️  Screenshot failed: {e}")
            
            print("\n✅ Debug complete!")
            print(f"📁 Screenshots saved to: {screenshots_dir}")
            print("\nBrowser will stay open for 60 seconds for manual inspection...")
            time.sleep(60)
            browser.close()
    
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_posting()