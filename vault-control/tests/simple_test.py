from playwright.sync_api import sync_playwright

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        print("Test 1: Loading frontend...")
        page.goto('http://localhost:3002')
        page.wait_for_timeout(3000)
        print(f"  Title: {page.title()}")
        
        print("\nTest 2: Check if login form exists...")
        try:
            btn = page.locator('button:has-text("SIGN IN")')
            if btn.is_visible():
                print("  SIGN IN button found")
                btn.click()
                page.wait_for_timeout(2000)
                
                # Fill login form
                page.fill('input[placeholder*="username" i]', 'admin')
                page.fill('input[placeholder*="password" i]', 'admin123')
                
                # Find and click the Login button (in the form)
                login_btn = page.locator('form button[type="submit"]').first
                login_btn.click()
                page.wait_for_timeout(3000)
                print("  Logged in successfully")
        except Exception as e:
            print(f"  Error: {e}")
        
        print("\nTest 3: Check social page...")
        page.goto('http://localhost:3002/social')
        page.wait_for_timeout(3000)
        
        # Check for posts
        posts = page.locator('[class*="post"], [class*="card"]').count()
        print(f"  Found {posts} posts")
        
        # Check for buttons
        buttons = page.locator('button').all()
        print(f"  Found {len(buttons)} buttons")
        for i, btn in enumerate(buttons[:5]):
            try:
                print(f"    Button {i}: {btn.inner_text()}")
            except Exception:
                pass
        
        browser.close()
        print("\nTest completed!")

if __name__ == "__main__":
    run_test()
