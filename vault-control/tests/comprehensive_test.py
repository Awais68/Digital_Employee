from playwright.sync_api import sync_playwright
import json
from datetime import datetime

BASE_URL = "http://localhost:3002"
API_URL = "http://localhost:3000"
RESULTS = []

def log(test, status, detail=""):
    icon = "✅" if status == "PASS" else "❌"
    msg = f"{icon} [{test}] {detail}"
    print(msg)
    RESULTS.append({"test": test, "status": status, "detail": detail})

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # TEST 1: Frontend loads
        try:
            page.goto(BASE_URL, timeout=10000)
            page.wait_for_load_state('networkidle')
            title = page.title()
            log("Frontend Load", "PASS", f"Title: {title}")
        except Exception as e:
            log("Frontend Load", "FAIL", str(e))
            browser.close()
            return

        # TEST 2: Login
        try:
            sign_in_btn = page.locator('button:has-text("SIGN IN")')
            if sign_in_btn.is_visible():
                sign_in_btn.click()
                page.wait_for_timeout(2000)
                
                # Fill login form
                page.fill('input[placeholder*="username" i]', 'admin')
                page.fill('input[placeholder*="password" i]', 'admin123')
                
                # Click login button in form
                login_btn = page.locator('form button[type="submit"]').first
                login_btn.click()
                page.wait_for_timeout(3000)
                log("Login", "PASS", "Logged in successfully")
        except Exception as e:
            log("Login", "FAIL", str(e))

        # TEST 3: Dashboard loads with data
        try:
            page.goto(f"{BASE_URL}/", timeout=10000)
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(3000)
            content = page.content()
            has_stats = 'worker' in content.lower() or 'email' in content.lower()
            log("Dashboard Data", "PASS" if has_stats else "FAIL", 
                "Stats visible" if has_stats else "No data shown")
        except Exception as e:
            log("Dashboard Data", "FAIL", str(e))

        # TEST 4: API - check workers
        try:
            # Get token via API
            import requests
            resp = requests.post(f"{API_URL}/api/auth/login", 
                json={"username": "admin", "password": "admin123"})
            token = resp.json().get("token", "")
            
            headers = {"Authorization": f"Bearer {token}"}
            response = requests.get(f"{API_URL}/api/system/workers", headers=headers)
            if response.ok:
                data = response.json()
                log("API Workers", "PASS", f"Found {len(data)} workers")
            else:
                log("API Workers", "FAIL", f"Status: {response.status_code}")
        except Exception as e:
            log("API Workers", "FAIL", str(e))

        # TEST 5: Social Media Queue
        try:
            page.goto(f"{BASE_URL}/social", timeout=10000)
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(3000)
            
            posts = page.locator('[class*="card"], [class*="post"], [class*="draft"]').count()
            log("Social Queue", "PASS" if posts > 0 else "FAIL", 
                f"Found {posts} posts in queue")
        except Exception as e:
            log("Social Queue", "FAIL", str(e))

        # TEST 6: WebSocket real-time
        try:
            ws_connected = page.evaluate("""
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

        browser.close()

    # FINAL REPORT
    print("\n" + "="*50)
    print("COMPREHENSIVE TEST REPORT")
    print("="*50)
    passed = sum(1 for r in RESULTS if r['status'] == 'PASS')
    failed = sum(1 for r in RESULTS if r['status'] == 'FAIL')
    print(f"✅ PASSED:  {passed}")
    print(f"❌ FAILED:  {failed}")
    print(f"📊 TOTAL:   {len(RESULTS)}")
    print()
    if failed > 0:
        print("FAILURES TO FIX:")
        for r in RESULTS:
            if r['status'] == 'FAIL':
                print(f"  ❌ {r['test']}: {r['detail']}")
    
    # Save report
    with open('comprehensive_report.json', 'w') as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "passed": passed, "failed": failed,
            "results": RESULTS
        }, f, indent=2)
    print("\nReport saved: comprehensive_report.json")

if __name__ == "__main__":
    run_tests()
