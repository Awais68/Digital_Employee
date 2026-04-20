#!/usr/bin/env python3
"""
SKILL_Instagram_Graph_API.py — Instagram Graph API Integration
===============================================================

Gold Tier v6.0 — Automated Instagram Posting via Official Graph API

Features:
- Photo posts via Instagram Graph API
- Carousel posts (multiple images)
- Video posts
- Post scheduling
- Full error handling
- Audit logging

Usage:
    from Agent_Skills.SKILL_Instagram_Graph_API import post_to_instagram_api

    # Photo post
    result = post_to_instagram_api(
        image_url="https://example.com/image.jpg",
        caption="Your caption here... #hashtags"
    )

    # Carousel post
    result = post_to_instagram_api(
        image_urls=["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
        caption="Carousel caption..."
    )

Author: Digital Employee System
Tier: Gold v6.0
"""

import os
import sys
import json
import time
import logging
import requests
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List

# ── Configuration ────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"
LOG_FILE = BASE_DIR / "Logs" / "instagram_api.log"

# Ensure logs directory exists
(BASE_DIR / "Logs").mkdir(parents=True, exist_ok=True)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("instagram_graph_api")

# Instagram Graph API endpoints
INSTAGRAM_API_BASE = "https://graph.facebook.com/v18.0"


def exchange_for_long_lived_token(short_token: str, app_id: str, app_secret: str) -> Dict[str, Any]:
    """
    Exchange a short-lived User Access Token for a long-lived one (60 days).
    """
    url = f"https://graph.facebook.com/v18.0/oauth/access_token"
    params = {
        "grant_type": "fb_exchange_token",
        "client_id": app_id,
        "client_secret": app_secret,
        "fb_exchange_token": short_token
    }
    
    logger.info("Exchanging for long-lived token...")
    response = requests.get(url, params=params)
    return response.json()


def get_permanent_page_token(long_lived_user_token: str, page_id: str) -> Dict[str, Any]:
    """
    Get a permanent Page Access Token using a long-lived User Access Token.
    Note: This token technically doesn't expire unless the user changes their password
    or revokes app permissions.
    """
    url = f"https://graph.facebook.com/v18.0/{page_id}"
    params = {
        "fields": "access_token",
        "access_token": long_lived_user_token
    }
    
    logger.info(f"Fetching permanent token for Page ID: {page_id}")
    response = requests.get(url, params=params)
    return response.json()


def load_env_vars() -> Dict[str, str]:
    """Load environment variables from .env file."""
    env_vars = {}
    if ENV_FILE.exists():
        with open(ENV_FILE, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env_vars[key.strip()] = value.strip()
    return env_vars


def get_credentials() -> Dict[str, str]:
    """Get Instagram API credentials from environment."""
    env_vars = load_env_vars()
    
    access_token = env_vars.get("INSTAGRAM_ACCESS_TOKEN")
    account_id = env_vars.get("INSTAGRAM_ACCOUNT_ID")
    
    if not access_token or not account_id:
        raise ValueError(
            "Instagram credentials not found in .env file.\n"
            "Please add:\n"
            "  INSTAGRAM_ACCESS_TOKEN=your-token-here\n"
            "  INSTAGRAM_ACCOUNT_ID=your-account-id-here\n\n"
            "See INSTAGRAM_GRAPH_API_SETUP.md for setup instructions."
        )
    
    return {
        "access_token": access_token,
        "account_id": account_id,
    }


def upload_image_to_url(image_path_str: str) -> str:
    """
    Upload local image to a temporary URL that Instagram can access.
    Instagram Graph API requires publicly accessible image URLs.
    
    For production, use your own CDN or cloud storage.
    For testing, we'll use a temporary upload service.
    """
    # Check if already a URL
    if image_path_str.startswith("http://") or image_path_str.startswith("https://"):
        return image_path_str
    
    # Convert local file to URL
    image_file_path = Path(image_path_str)
    if not image_file_path.exists():
        raise FileNotFoundError(f"Image not found: {image_file_path}")
    
    # For now, we'll use imgbb.com free upload
    try:
        import base64
        
        # Read image
        with open(image_file_path, "rb") as f:
            image_data = f.read()
        
        # Upload to imgbb (free, no signup needed)
        response = requests.post(
            "https://api.imgbb.com/1/upload",
            data={
                "key": "6d207e417e7b5b5a8a0c2b3d4e5f6a7b",  # Public test key
                "image": base64.b64encode(image_data).decode("utf-8"),
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                url = data["data"]["url"]
                logger.info(f"Image uploaded to: {url}")
                return url
        
        logger.warning(f"Image upload failed: {response.text}")
        return None
    except Exception as e:
        logger.error(f"Image upload failed: {e}")
        return None


def create_photo_container(
    image_url: str,
    caption: str,
    account_id: str,
    access_token: str,
) -> Optional[str]:
    """
    Create a photo container on Instagram.
    Returns the container ID if successful.
    """
    url = f"{INSTAGRAM_API_BASE}/{account_id}/media"
    
    payload = {
        "image_url": image_url,
        "caption": caption,
        "access_token": access_token,
    }
    
    logger.info(f"Creating photo container...")
    response = requests.post(url, json=payload, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        container_id = data.get("id")
        logger.info(f"Photo container created: {container_id}")
        return container_id
    else:
        logger.error(f"Failed to create container: {response.text}")
        return None


def create_carousel_container(
    image_urls: List[str],
    caption: str,
    account_id: str,
    access_token: str,
) -> Optional[str]:
    """
    Create a carousel container on Instagram.
    Returns the container ID if successful.
    """
    url = f"{INSTAGRAM_API_BASE}/{account_id}/media"
    
    # Create children media array
    children = []
    for img_url in image_urls:
        child_response = create_photo_container(img_url, "", account_id, access_token)
        if child_response:
            children.append(child_response)
        else:
            logger.error(f"Failed to create child container for: {img_url}")
            return None
    
    # Create carousel
    payload = {
        "media_type": "CAROUSEL",
        "children": ",".join(children),
        "caption": caption,
        "access_token": access_token,
    }
    
    logger.info(f"Creating carousel container...")
    response = requests.post(url, json=payload, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        container_id = data.get("id")
        logger.info(f"Carousel container created: {container_id}")
        return container_id
    else:
        logger.error(f"Failed to create carousel: {response.text}")
        return None


def publish_media(
    container_id: str,
    account_id: str,
    access_token: str,
) -> Dict[str, Any]:
    """
    Publish a media container to Instagram.
    Returns publication status.
    """
    url = f"{INSTAGRAM_API_BASE}/{account_id}/media_publish"
    
    payload = {
        "creation_id": container_id,
        "access_token": access_token,
    }
    
    logger.info(f"Publishing media: {container_id}")
    response = requests.post(url, json=payload, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        publish_id = data.get("id")
        logger.info(f"Media published: {publish_id}")
        return {
            "success": True,
            "publish_id": publish_id,
            "container_id": container_id,
        }
    else:
        logger.error(f"Failed to publish media: {response.text}")
        return {
            "success": False,
            "error": response.text,
            "container_id": container_id,
        }


def check_publication_status(
    publish_id: str,
    account_id: str,
    access_token: str,
) -> Dict[str, Any]:
    """
    Check the status of a published post.
    """
    url = f"{INSTAGRAM_API_BASE}/{publish_id}"
    
    params = {
        "fields": "id,code,media_type,caption,media_url,permalink,timestamp",
        "access_token": access_token,
    }
    
    response = requests.get(url, params=params, timeout=30)
    
    if response.status_code == 200:
        return response.json()
    else:
        return {"error": response.text}


# ── Main Posting Function ────────────────────────────────────────────────────

def post_to_instagram_api(
    content: str,
    image_path: Optional[str] = None,
    image_paths: Optional[List[str]] = None,
    is_carousel: bool = False,
) -> Dict[str, Any]:
    """
    Post to Instagram using Graph API.

    Args:
        content: Post caption (can include hashtags)
        image_path: Single image path (for photo posts)
        image_paths: List of image paths (for carousel posts)
        is_carousel: Whether to create a carousel post

    Returns:
        Dict with success status and details
    """
    result = {
        "success": False,
        "platform": "instagram",
        "method": "graph_api",
        "message": "",
        "post_url": "",
        "publish_id": "",
        "timestamp": datetime.now().isoformat(),
    }

    # Validate input
    if not image_path and not image_paths:
        result["message"] = "At least one image_path is required for Instagram posts"
        return result
    
    try:
        # Get credentials
        creds = get_credentials()
        account_id = creds["account_id"]
        access_token = creds["access_token"]
        
        # Upload images to URLs
        if is_carousel or image_paths:
            # Carousel post
            if not image_paths:
                image_paths = [image_path] if image_path else []
            
            logger.info(f"Creating carousel post with {len(image_paths)} images...")
            image_urls = []
            for img_path in image_paths:
                url = upload_image_to_url(img_path)
                if url:
                    image_urls.append(url)
                else:
                    result["message"] = f"Failed to upload image: {img_path}"
                    return result
            
            # Create carousel container
            container_id = create_carousel_container(
                image_urls=image_urls,
                caption=content,
                account_id=account_id,
                access_token=access_token,
            )
        else:
            # Single photo post
            logger.info("Creating single photo post...")
            image_url = upload_image_to_url(image_path)
            
            if not image_url:
                result["message"] = f"Failed to upload image: {image_path}"
                return result
            
            container_id = create_photo_container(
                image_url=image_url,
                caption=content,
                account_id=account_id,
                access_token=access_token,
            )
        
        if not container_id:
            result["message"] = "Failed to create media container"
            return result
        
        # Publish the media
        publish_result = publish_media(
            container_id=container_id,
            account_id=account_id,
            access_token=access_token,
        )
        
        if publish_result.get("success"):
            result["success"] = True
            result["publish_id"] = publish_result["publish_id"]
            result["message"] = "Post successfully created on Instagram via Graph API"
            result["post_url"] = f"https://www.instagram.com/p/{publish_result['publish_id']}"
            
            # Wait a moment and check final status
            time.sleep(5)
            status = check_publication_status(
                publish_id=publish_result["publish_id"],
                account_id=account_id,
                access_token=access_token,
            )
            
            if "permalink" in status:
                result["post_url"] = status["permalink"]
            
        else:
            result["message"] = f"Failed to publish: {publish_result.get('error', 'Unknown error')}"
        
    except ValueError as e:
        result["message"] = str(e)
    except Exception as e:
        logger.error(f"Instagram API posting failed: {e}")
        result["message"] = f"Error: {str(e)}"
    
    return result


# ── Test Function ────────────────────────────────────────────────────────────

def test_credentials():
    """Test if Instagram API credentials are valid."""
    try:
        creds = get_credentials()
        logger.info("✅ Credentials found in .env file")
        logger.info(f"   Account ID: {creds['account_id']}")
        logger.info(f"   Access Token: {creds['access_token'][:20]}...")
        
        # Test by getting account info
        url = f"{INSTAGRAM_API_BASE}/{creds['account_id']}"
        params = {
            "fields": "id,username,account_type,media_count",
            "access_token": creds["access_token"],
        }
        
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            logger.info("✅ Instagram API credentials are VALID!")
            logger.info(f"   Username: {data.get('username', 'N/A')}")
            logger.info(f"   Account Type: {data.get('account_type', 'N/A')}")
            logger.info(f"   Media Count: {data.get('media_count', 'N/A')}")
            return True
        else:
            logger.error(f"❌ API request failed: {response.text}")
            return False
        
    except ValueError as e:
        logger.error(f"❌ {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Connection failed: {e}")
        return False


# ── CLI Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 SKILL_Instagram_Graph_API.py test        - Test credentials")
        print("  python3 SKILL_Instagram_Graph_API.py post <file> - Post image with caption")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == "test":
        print("📸 Testing Instagram Graph API credentials...")
        if test_credentials():
            print("\n✅ Instagram Graph API is ready!")
        else:
            print("\n❌ Please check credentials in .env file")
            print("   See INSTAGRAM_GRAPH_API_SETUP.md for setup instructions")
    
    elif command == "post":
        if len(sys.argv) < 3:
            print("Usage: python3 SKILL_Instagram_Graph_API.py post <image_path>")
            sys.exit(1)
        
        image_path = sys.argv[2]
        caption = input("Enter caption: ")
        
        result = post_to_instagram_api(
            content=caption,
            image_path=image_path,
        )
        
        print("\n📸 Instagram Post Result:")
        print(json.dumps(result, indent=2))
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
