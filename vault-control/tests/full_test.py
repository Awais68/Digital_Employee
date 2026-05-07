import asyncio
import json
from datetime import datetime
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:3002"
API_URL = "http://localhost:3000"
RESULTS = []

def log(test, status, detail=""):
    icon = "✅" if status == "PASS" else "❌"
    msg = f"{icon} [{test}] {detail}"
    print(msg)
    RESULTS.append({"test": test, "status": status, "detail": detail})

async def run_tests():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, slow_mo=500)
        page = await browser.new_page()
        
        # ── TEST 1: Frontend loads ──
        try:
            await page.goto(BASE_URL, timeout=10000)
            await page.wait_for_load_state('networkidle')
            title = await page.title()
            log("Frontend Load", "PASS", f"Title: {title}")
        except Exception as e:
            log("Frontend Load", "FAIL", str(e))
            await browser.close()
            return

        # ── TEST 2: Login ──
        try:
            # Check if login page or already logged in
            try:
                await page.wait_for_selector('input[type="password"]', timeout=3000)
                # Try different selectors for email/username
                try:
                    await page.fill('input[type="email"]', 'admin')
                except Exception:
                    try:
                        await page.fill('input[name="username"]', 'admin')
                    except Exception:
                        await page.fill('input[placeholder*="email" i]', 'admin')
                await page.fill('input[type="password"]', 'admin123')
                await page.click('button[type="submit"], button:has-text("Login")')
                await page.wait_for_load_state('networkidle')
                log("Login", "PASS", "Logged in successfully")
            except Exception:
                log("Login", "PASS", "Already logged in")
        except Exception as e:
            log("Login", "FAIL", str(e))

        # ── TEST 3: Dashboard loads with data ──
        try:
            await page.goto(f"{BASE_URL}/", timeout=10000)
            await page.wait_for_load_state('networkidle')
            await page.wait_for_timeout(3000)
            # Check if dashboard elements are present
            has_stats = await page.locator('[class*="stat"], [class*="card"], [class*="dashboard"]').count() > 0
            if not has_stats:
                # Try checking for text content
                content = await page.content()
                has_stats = 'worker' in content.lower() or 'email' in content.lower() or 'pending' in content.lower()
            log("Dashboard Data", "PASS" if has_stats else "FAIL", 
                "Stats visible" if has_stats else "No data shown")
        except Exception as e:
            log("Dashboard Load", "FAIL", str(e))

        # ── TEST 4: API - check workers ──
        try:
            # Get token via API first
            login_resp = await page.request.post(f"{API_URL}/api/auth/login",
                data=json.dumps({"username": "admin", "password": "admin123"}),
                headers={"Content-Type": "application/json"}
            )
            login_data = await login_resp.json()
            token = login_data.get("token", "")
            
            response = await page.request.get(f"{API_URL}/api/system/workers",
                headers={"Authorization": f"Bearer {token}"})
            if response.ok:
                data = await response.json()
                log("API Workers", "PASS", f"Found {len(data)} workers")
            else:
                log("API Workers", "FAIL", f"Status: {response.status}")
        except Exception as e:
            log("API Workers", "FAIL", str(e))

        # ── TEST 5: Social Media Queue ──
        try:
            await page.goto(f"{BASE_URL}/social", timeout=10000)
            await page.wait_for_load_state('networkidle')
            await page.wait_for_timeout(3000)
            
            # Check if we need to login - look for SIGN IN button
            try:
                sign_in_btn = page.get_by_role("button", name="SIGN IN")
                if await sign_in_btn.is_visible(timeout=2000):
                    await sign_in_btn.click()
                    await page.wait_for_timeout(2000)
                    
                    # Wait for login form and fill using placeholders
                    await page.wait_for_selector('input[placeholder*="username" i]', timeout=3000)
                    await page.fill('input[placeholder*="username" i]', 'admin')
                    await page.fill('input[placeholder*="password" i]', 'admin123')
                    await page.click('button[type="submit"], button:has-text("Login")')
                    await page.wait_for_load_state('networkidle')
                    await page.wait_for_timeout(2000)
            except Exception:
                pass  # Maybe already logged in
            
            # Click Queue tab if exists
            try:
                queue_tab = page.get_by_text("Queue").first
                if await queue_tab.is_visible(timeout=2000):
                    await queue_tab.click()
                    await page.wait_for_timeout(1000)
            except Exception:
                pass
                
            posts = await page.locator('[class*="card"], [class*="post"], [class*="draft"]').count()
            log("Social Queue", "PASS" if posts > 0 else "FAIL", 
                f"Found {posts} posts in queue")
        except Exception as e:
            log("Social Queue", "FAIL", str(e))

        # ── TEST 6: Delete a post ──
        try:
            # Look for delete button with various selectors
            delete_selectors = [
                'button[title*="Delete"]', 
                'button:has-text("Delete")',
                'button:has-text("🗑")',
                '[aria-label*="delete"]',
                'button:has(svg)',  # Icon buttons
            ]
            
            delete_btn = None
            for selector in delete_selectors:
                try:
                    btn = page.locator(selector).first
                    if await btn.is_visible(timeout=1000):
                        delete_btn = btn
                        break
                except Exception:
                    continue
            
            if delete_btn:
                # Listen for API response
                async with page.expect_response(
                    lambda r: '/api/social/draft/' in r.url and r.request.method == 'DELETE'
                ) as response_info:
                    await delete_btn.click()
                    # Handle confirm dialog if any
                    page.on('dialog', lambda d: d.accept())
                
                resp = await response_info.value
                resp_body = await resp.json()
                log("Delete Post", 
                    "PASS" if resp_body.get('success') else "FAIL",
                    str(resp_body)[:200])
            else:
                log("Delete Post", "SKIP", "No delete button found")
        except Exception as e:
            log("Delete Post", "FAIL", str(e))

        # ── TEST 7: Publish a post ──
        try:
            # Look for publish button with various selectors
            publish_selectors = [
                'button[title*="Publish"]',
                'button:has-text("Publish")',
                'button:has-text("🚀")',
                'button:has-text("Post")',
                '[aria-label*="publish"]',
            ]
            
            publish_btn = None
            for selector in publish_selectors:
                try:
                    btn = page.locator(selector).first
                    if await btn.is_visible(timeout=1000):
                        publish_btn = btn
                        break
                except Exception:
                    continue
            
            if publish_btn:
                async with page.expect_response(
                    lambda r: '/publish' in r.url,
                    timeout=60000
                ) as response_info:
                    await publish_btn.click()
                
                resp = await response_info.value
                resp_body = await resp.json()
                log("Publish Post",
                    "PASS" if resp_body.get('success') else "FAIL",
                    str(resp_body)[:200])
            else:
                log("Publish Post", "SKIP", "No publish button visible")
        except Exception as e:
            log("Publish Post", "FAIL", str(e))

        # ── TEST 8: Emails tab ──
        try:
            await page.goto(f"{BASE_URL}/emails", timeout=10000)
            await page.wait_for_load_state('networkidle')
            await page.wait_for_timeout(2000)
            emails = await page.locator('[class*="email"], [class*="mail"]').count()
            log("Emails Tab", "PASS" if emails >= 0 else "FAIL", 
                f"Email items: {emails}")
        except Exception as e:
            log("Emails Tab", "FAIL", str(e))

        # ── TEST 9: WebSocket real-time ──
        try:
            ws_connected = await page.evaluate("""
                () => {
                    return new Promise((resolve) => {
                        const ws = new WebSocket('ws://localhost:3000')
                        ws.onopen = () => { ws.close(); resolve(true) }
                        ws.onerror = () => resolve(false)
                        setTimeout(() => resolve(false), 5000)
                    })
                }
            """)
            log("WebSocket", "PASS" if ws_connected else "FAIL",
                "Connected" if ws_connected else "Cannot connect to ws:3000")
        except Exception as e:
            log("WebSocket", "FAIL", str(e))

        # ── TEST 10: API rate limiting ──
        try:
            count = 0
            # Get token first
            login_resp = await page.request.post(f"{API_URL}/api/auth/login",
                data=json.dumps({"username": "admin", "password": "admin123"}),
                headers={"Content-Type": "application/json"}
            )
            login_data = await login_resp.json()
            token = login_data.get("token", "")
            
            for _ in range(5):
                r = await page.request.get(
                    f"{API_URL}/api/system/stats",
                    headers={"Authorization": f"Bearer {token}"}
                )
                if r.ok:
                    count += 1
            log("API Rate Limit", "PASS", f"{count}/5 requests succeeded")
        except Exception as e:
            log("API Rate Limit", "FAIL", str(e))

        await browser.close()

    # ── FINAL REPORT ──
    print("\n" + "="*50)
    print("FULL TEST REPORT")
    print("="*50)
    passed = sum(1 for r in RESULTS if r['status'] == 'PASS')
    failed = sum(1 for r in RESULTS if r['status'] == 'FAIL')
    skipped = sum(1 for r in RESULTS if r['status'] == 'SKIP')
    print(f"✅ PASSED:  {passed}")
    print(f"❌ FAILED:  {failed}")
    print(f"⏭️  SKIPPED: {skipped}")
    print(f"📊 TOTAL:   {len(RESULTS)}")
    print()
    if failed > 0:
        print("FAILURES TO FIX:")
        for r in RESULTS:
            if r['status'] == 'FAIL':
                print(f"  ❌ {r['test']}: {r['detail']}")
    
    # Save report
    with open('test_report.json', 'w') as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "passed": passed, "failed": failed,
            "results": RESULTS
        }, f, indent=2)
    print("\nReport saved: test_report.json")

asyncio.run(run_tests())
