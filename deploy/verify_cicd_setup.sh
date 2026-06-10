#!/bin/bash
# verify_cicd_setup.sh - Verify CI/CD configuration is ready
set -euo pipefail

echo "=== CI/CD Setup Verification ==="
echo ""

# Check if GitHub CLI is available
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI found"
    
    # Check if authenticated
    if gh auth status &> /dev/null; then
        echo "✅ GitHub CLI authenticated"
        
        # Check repository secrets
        echo ""
        echo "Checking GitHub repository secrets..."
        REPO="Awais68/Digital_Employee"
        
        if gh secret list -R "$REPO" 2>/dev/null | grep -q "ORACLE_SSH_KEY"; then
            echo "✅ ORACLE_SSH_KEY secret configured"
        else
            echo "❌ ORACLE_SSH_KEY secret NOT configured"
            echo "   → Add it: gh secret set ORACLE_SSH_KEY -R $REPO < oracle-new-key"
        fi
        
        if gh secret list -R "$REPO" 2>/dev/null | grep -q "ORACLE_HOST"; then
            echo "✅ ORACLE_HOST secret configured"
        else
            echo "❌ ORACLE_HOST secret NOT configured"
            echo "   → Add it: gh secret set ORACLE_HOST -R $REPO --body 144.24.142.167"
        fi
        
        if gh secret list -R "$REPO" 2>/dev/null | grep -q "ORACLE_USER"; then
            echo "✅ ORACLE_USER secret configured"
        else
            echo "❌ ORACLE_USER secret NOT configured"
            echo "   → Add it: gh secret set ORACLE_USER -R $REPO --body ubuntu"
        fi
    else
        echo "⚠️  GitHub CLI not authenticated - run: gh auth login"
    fi
else
    echo "⚠️  GitHub CLI not installed"
    echo "   → Install: brew install gh (macOS) or sudo apt install gh (Linux)"
    echo "   → Or configure secrets manually in GitHub web interface"
fi

echo ""
echo "=== Local Files Check ==="

# Check if deployment files exist
if [ -f ".github/workflows/deploy-oracle.yml" ]; then
    echo "✅ GitHub Actions workflow exists"
else
    echo "❌ GitHub Actions workflow missing"
fi

if [ -f "deploy/push_to_oracle.sh" ]; then
    echo "✅ Local deployment script exists"
    if [ -x "deploy/push_to_oracle.sh" ]; then
        echo "   (executable)"
    else
        echo "   (not executable - run: chmod +x deploy/push_to_oracle.sh)"
    fi
else
    echo "❌ Local deployment script missing"
fi

if [ -f "deploy/remote_deploy.sh" ]; then
    echo "✅ Remote deployment script exists"
else
    echo "❌ Remote deployment script missing"
fi

echo ""
echo "=== SSH Key Check ==="

if [ -f "$HOME/Downloads/oracle-new-key" ]; then
    echo "✅ SSH key found at ~/Downloads/oracle-new-key"
else
    echo "⚠️  SSH key not found at default location"
    echo "   → Update ORACLE_SSH_KEY env var or move key to ~/Downloads/oracle-new-key"
fi

echo ""
echo "=== Next Steps ==="
echo "1. Configure GitHub secrets (see CICD_SETUP.md for details)"
echo "2. Push changes to main branch to trigger deployment"
echo "3. Monitor deployment in GitHub Actions tab"
echo ""
echo "For manual deployment:"
echo "  ./deploy/push_to_oracle.sh"
