#!/usr/bin/env python3
"""
linkedin_mcp.py v1.0 - LinkedIn Publishing MCP for Digital Employee

LinkedIn MCP (Model Context Protocol) for the Digital Employee system.
Provides LinkedIn post publishing capabilities with LinkedIn API integration.

Features:
- LinkedIn API v2 integration (UGC Posts API)
- OAuth2 authentication support
- Environment-based credentials (.env)
- Dry-run mode for testing (DRY_RUN=true)
- Comprehensive logging
- Rich media support (images, videos)
- Hashtag entity tagging
- Post metrics tracking

Author: Digital Employee System
Tier: Silver v1.0 - LinkedIn MCP Integration
"""

import os
import sys
import json
import logging
import subprocess
import base64
import time
import re
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv

# Environment loading
try:
    from dotenv import load_dotenv
    BASE_DIR = Path(__file__).resolve().parent
    load_dotenv(BASE_DIR / ".env", override=True)
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "python-dotenv"])
    from dotenv import load_dotenv
    BASE_DIR = Path(__file__).resolve().parent
    load_dotenv(BASE_DIR / ".env", override=True)

# LinkedIn API imports with auto-install
try:
    import requests
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests


# =============================================================================
# CONFIGURATION
# =============================================================================

# Base directory (vault root)
BASE_DIR = Path(__file__).resolve().parent

# Session persistence directory
SESSION_DIR = BASE_DIR / ".linkedin_session"
SESSION_DIR.mkdir(parents=True, exist_ok=True)

# LinkedIn API configuration
LINKEDIN_API_BASE = "https://api.linkedin.com/v2"

# OAuth2 credentials from environment
LINKEDIN_CLIENT_ID = os.getenv("LINKEDIN_CLIENT_ID", "")
LINKEDIN_CLIENT_SECRET = os.getenv("LINKEDIN_CLIENT_SECRET", "")
LINKEDIN_ACCESS_TOKEN = os.getenv("LINKEDIN_ACCESS_TOKEN", "")
LINKEDIN_REFRESH_TOKEN = os.getenv("LINKEDIN_REFRESH_TOKEN", "")
LINKEDIN_PERSON_URN = os.getenv("LINKEDIN_PERSON_URN", "")  # e.g., "urn:li:person:ABC123"
LINKEDIN_ORGANIZATION_ID = os.getenv("LINKEDIN_ORGANIZATION_ID", "")  # For company pages

# Dry-run mode - if true, only logs without publishing
DRY_RUN = os.getenv("DRY_RUN", "false").lower() in ("true", "1", "yes")

# Logging configuration
LOGS_DIR = BASE_DIR / "Logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOGS_DIR / "linkedin_mcp.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("LinkedInMCP")


# =============================================================================
# LinkedIn MCP Class
# =============================================================================

class LinkedInMCP:
    """
    LinkedIn Model Context Protocol handler.

    Provides LinkedIn post publishing capabilities with LinkedIn API integration,
    dry-run support, and comprehensive logging.
    """

    def __init__(self, dry_run: Optional[bool] = None):
        """
        Initialize LinkedIn MCP.

        Args:
            dry_run: Override DRY_RUN environment variable if specified
        """
        self.dry_run = dry_run if dry_run is not None else DRY_RUN
        self.client_id = LINKEDIN_CLIENT_ID
        self.client_secret = LINKEDIN_CLIENT_SECRET
        self.access_token = LINKEDIN_ACCESS_TOKEN
        self.refresh_token = LINKEDIN_REFRESH_TOKEN
        self.person_urn = LINKEDIN_PERSON_URN
        self.organization_id = LINKEDIN_ORGANIZATION_ID
        self.api_base = LINKEDIN_API_BASE

        # Load saved session if exists
        self._load_session()

        self._validate_config()
        self.session = requests.Session()
        if self.access_token:
            self.session.headers.update({
                'Authorization': f'Bearer {self.access_token}',
                'X-Restli-Protocol-Version': '2.0.0',
                'Content-Type': 'application/json',
                'linkedin-version': '202402'
            })

    def _load_session(self) -> None:
        """Load saved LinkedIn session from file."""
        session_file = SESSION_DIR / "session.json"
        
        if not session_file.exists():
            logger.info("No saved LinkedIn session found")
            return
        
        try:
            with open(session_file, 'r', encoding='utf-8') as f:
                session_data = json.load(f)
            
            # Check if session is still valid (not expired)
            expires_at = session_data.get('expires_at')
            if expires_at:
                expires_datetime = datetime.fromisoformat(expires_at)
                if datetime.now() > expires_datetime:
                    logger.warning("⚠️  LinkedIn session has expired")
                    # Try to auto-refresh if we have refresh token
                    if session_data.get('refresh_token'):
                        logger.info("Attempting to refresh expired session...")
                        self.access_token = session_data.get('access_token')
                        self.refresh_token = session_data.get('refresh_token')
                        self.person_urn = session_data.get('person_urn', self.person_urn)
                        
                        # Refresh the token
                        refresh_result = self._refresh_token_with_data(
                            self.client_id,
                            self.client_secret,
                            self.refresh_token
                        )
                        
                        if refresh_result['success']:
                            logger.info("✅ Session refreshed successfully!")
                            self.access_token = refresh_result['access_token']
                            self.refresh_token = refresh_result.get('refresh_token', self.refresh_token)
                            self._save_session()
                            return
                        else:
                            logger.error(f"❌ Session refresh failed: {refresh_result['message']}")
                    return
            
            # Session is still valid
            self.access_token = session_data.get('access_token', self.access_token)
            self.refresh_token = session_data.get('refresh_token', self.refresh_token)
            self.person_urn = session_data.get('person_urn', self.person_urn)
            
            logger.info("✅ Restored previous LinkedIn session")
            
        except Exception as e:
            logger.error(f"Error loading session: {e}")

    def _save_session(self) -> None:
        """Save LinkedIn session to file for persistence."""
        session_file = SESSION_DIR / "session.json"
        
        try:
            # Calculate expiration time (access tokens expire in 30 days)
            expires_in_seconds = 2592000  # 30 days
            expires_at = datetime.now() + timedelta(seconds=expires_in_seconds)
            
            session_data = {
                'access_token': self.access_token,
                'refresh_token': self.refresh_token,
                'person_urn': self.person_urn,
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'expires_at': expires_at.isoformat(),
                'saved_at': datetime.now().isoformat()
            }
            
            with open(session_file, 'w', encoding='utf-8') as f:
                json.dump(session_data, f, indent=2)
            
            # Set restrictive permissions (owner only)
            os.chmod(session_file, 0o600)
            
            logger.info(f"💾 LinkedIn session saved successfully")
            logger.info(f"   Session expires: {expires_at.strftime('%Y-%m-%d %H:%M:%S')}")
            
        except Exception as e:
            logger.error(f"Error saving session: {e}")

    def _is_token_expired(self) -> bool:
        """Check if the current access token is expired."""
        session_file = SESSION_DIR / "session.json"
        
        if not session_file.exists():
            return True
        
        try:
            with open(session_file, 'r', encoding='utf-8') as f:
                session_data = json.load(f)
            
            expires_at = session_data.get('expires_at')
            if not expires_at:
                return True
            
            expires_datetime = datetime.fromisoformat(expires_at)
            return datetime.now() > expires_datetime
            
        except Exception:
            return True

    def _refresh_token_with_data(self, client_id: str, client_secret: str, refresh_token: str) -> Dict[str, Any]:
        """Refresh access token with provided credentials."""
        result = {
            "success": False,
            "message": "",
            "access_token": None,
            "refresh_token": None,
            "expires_in": None
        }

        if not client_id or not client_secret or not refresh_token:
            result["message"] = "Missing OAuth2 credentials"
            return result

        try:
            response = requests.post(
                "https://www.linkedin.com/oauth/v2/accessToken",
                data={
                    "grant_type": "refresh_token",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token
                }
            )

            if response.status_code == 200:
                token_data = response.json()
                result["success"] = True
                result["message"] = "Access token refreshed successfully"
                result["access_token"] = token_data.get("access_token")
                result["refresh_token"] = token_data.get("refresh_token", refresh_token)
                result["expires_in"] = token_data.get("expires_in", 2592000)

                logger.info("✅ Access token refreshed")
                logger.info(f"   New token expires in: {result['expires_in']} seconds")
            else:
                result["message"] = f"Token refresh failed: {response.text}"
                logger.error(result["message"])

        except Exception as e:
            result["message"] = f"Error refreshing token: {e}"
            logger.error(result["message"])

        return result

    def _auto_refresh_if_needed(self) -> bool:
        """Automatically refresh token if expired or about to expire."""
        if not self._is_token_expired():
            return True
        
        if not self.refresh_token:
            logger.error("❌ Token expired and no refresh token available")
            return False
        
        logger.info("🔄 Access token expired, attempting auto-refresh...")
        
        refresh_result = self._refresh_token_with_data(
            self.client_id,
            self.client_secret,
            self.refresh_token
        )
        
        if refresh_result['success']:
            self.access_token = refresh_result['access_token']
            self.refresh_token = refresh_result['refresh_token']
            
            # Update session headers
            self.session.headers.update({
                'Authorization': f'Bearer {self.access_token}'
            })
            
            # Save refreshed session
            self._save_session()
            return True
        else:
            logger.error(f"❌ Auto-refresh failed: {refresh_result['message']}")
            return False

    def _validate_config(self) -> None:
        """Validate LinkedIn configuration."""
        if not self.client_id:
            logger.warning("LINKEDIN_CLIENT_ID not configured in .env")

        if not self.client_secret:
            logger.warning("LINKEDIN_CLIENT_SECRET not configured in .env")

        if not self.access_token:
            logger.warning("LINKEDIN_ACCESS_TOKEN not configured - posts will fail")

        if not self.person_urn and not self.organization_id:
            logger.warning("Neither LINKEDIN_PERSON_URN nor LINKEDIN_ORGANIZATION_ID configured")

        if self.dry_run:
            logger.info("🔍 DRY_RUN mode enabled - posts will be logged but not published")

    def _get_author(self) -> str:
        """Get the author URN for posts (person or organization)."""
        if self.organization_id:
            return f"urn:li:organization:{self.organization_id}"
        elif self.person_urn:
            # Convert urn:li:person:XXX to urn:li:member:XXX for UGC Posts API
            person_urn = self.person_urn
            if person_urn.startswith("urn:li:person:"):
                member_id = person_urn.split(":")[-1]
                return f"urn:li:member:{member_id}"
            return person_urn
        else:
            # Try to get current user's URN
            person_urn = self._get_current_person_urn()
            if person_urn:
                if person_urn.startswith("urn:li:person:"):
                    member_id = person_urn.split(":")[-1]
                    return f"urn:li:member:{member_id}"
                return person_urn
            raise ValueError("Cannot determine author URN. Configure LINKEDIN_PERSON_URN or LINKEDIN_ORGANIZATION_ID")

    def _get_current_person_urn(self) -> Optional[str]:
        """Fetch current user's person URN from LinkedIn API."""
        if not self.access_token:
            return None

        try:
            response = self.session.get(
                f"{self.api_base}/me",
                headers={'Authorization': f'Bearer {self.access_token}'}
            )
            if response.status_code == 200:
                data = response.json()
                return data.get('id')
        except Exception as e:
            logger.error(f"Failed to get person URN: {e}")
        return None

    def create_post(
        self,
        content: str,
        media_urls: Optional[List[str]] = None,
        visibility: str = "PUBLIC",
        scheduled_time: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create and publish a LinkedIn post.

        Args:
            content: Post text content (supports hashtags)
            media_urls: Optional list of media URLs (images/videos)
            visibility: Post visibility (PUBLIC, CONNECTIONS, PRIVATE)
            scheduled_time: Optional ISO 8601 timestamp for scheduled posting

        Returns:
            Dictionary with post result:
            {
                "success": bool,
                "message": str,
                "post_id": str (if published),
                "post_url": str (if published),
                "dry_run": bool,
                "timestamp": str
            }
        """
        timestamp = datetime.now().isoformat()
        result = {
            "success": False,
            "message": "",
            "post_id": None,
            "post_url": None,
            "dry_run": self.dry_run,
            "timestamp": timestamp,
            "content_preview": content[:200] + "..." if len(content) > 200 else content
        }

        # Validate content
        if not content or not content.strip():
            error_msg = "Post content cannot be empty"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

        if len(content) > 3000:
            error_msg = "Post content exceeds 3000 character limit"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

        # Dry-run mode - log and return early
        if self.dry_run:
            logger.info("=" * 60)
            logger.info("🔍 DRY RUN - LinkedIn post would be published:")
            logger.info(f"   Content preview: {content[:200]}...")
            logger.info(f"   Visibility: {visibility}")
            logger.info(f"   Media: {len(media_urls) if media_urls else 0} items")
            if scheduled_time:
                logger.info(f"   Scheduled: {scheduled_time}")
            logger.info("=" * 60)
            result["success"] = True
            result["message"] = "Dry run - post logged but not published"
            result["post_id"] = f"DRYRUN-{datetime.now().strftime('%Y%m%d%H%M%S')}"
            self._log_post_action(result, content)
            return result

        # Validate authentication
        if not self.access_token:
            error_msg = "LinkedIn access token not configured. Set LINKEDIN_ACCESS_TOKEN in .env"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

        # Auto-refresh token if expired
        if not self._auto_refresh_if_needed():
            error_msg = "LinkedIn token expired and auto-refresh failed. Please regenerate token manually."
            logger.error(error_msg)
            result["message"] = error_msg
            return result

        try:
            # Get author URN
            author = self._get_author()
            logger.info(f"Using author: {author}")

            # Build post content with entities (hashtags)
            post_content, entities = self._build_post_content(content)

            # Build UGC Post payload
            payload = self._build_ugc_post_payload(
                author=author,
                content=post_content,
                entities=entities,
                media_urls=media_urls,
                visibility=visibility
            )

            # Create the post
            logger.info("Creating LinkedIn UGC Post...")
            response = self.session.post(
                f"{self.api_base}/ugcPosts",
                json=payload
            )

            if response.status_code == 201:
                # Success
                post_data = response.json()
                post_id = post_data.get('id', '')
                
                result["success"] = True
                result["message"] = f"LinkedIn post published successfully"
                result["post_id"] = post_id
                result["post_url"] = f"https://www.linkedin.com/feed/update/{post_id}"

                logger.info(f"✅ LinkedIn post published successfully")
                logger.info(f"   Post ID: {post_id}")
                logger.info(f"   URL: {result['post_url']}")

                self._log_post_action(result, content)
                return result
            else:
                # Error
                error_data = response.json() if response.content else {}
                error_msg = f"LinkedIn API error ({response.status_code}): {error_data}"
                logger.error(error_msg)
                result["message"] = error_msg
                return result

        except requests.exceptions.RequestException as e:
            error_msg = f"Network error: {e}"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

        except Exception as e:
            error_msg = f"Unexpected error creating post: {e}"
            logger.error(error_msg)
            result["message"] = error_msg
            return result

    def _build_post_content(self, content: str) -> tuple:
        """
        Build post content with entity positions for hashtags.

        Args:
            content: Raw post content

        Returns:
            Tuple of (formatted_content, entities_dict)
        """
        entities = {"hashtags": []}
        
        # Find all hashtags
        hashtag_pattern = re.compile(r'#(\w+)')
        
        for match in hashtag_pattern.finditer(content):
            hashtag = match.group(1)
            start = match.start()
            length = match.end() - start
            
            entities["hashtags"].append({
                "start": start,
                "length": length,
                "entityType": "HASHTAG",
                "text": hashtag
            })

        return content, entities

    def _build_ugc_post_payload(
        self,
        author: str,
        content: str,
        entities: Dict,
        media_urls: Optional[List[str]],
        visibility: str
    ) -> Dict:
        """Build the UGC Post API payload."""

        # Build shareCommentary with text and optional hashtag attributes
        share_commentary = {
            "text": content
        }

        # Add hashtag attributes if present
        if entities.get("hashtags"):
            share_commentary["attributes"] = []
            for hashtag in entities["hashtags"]:
                share_commentary["attributes"].append({
                    "start": hashtag["start"],
                    "length": hashtag["length"],
                    "entityType": "HASHTAG",
                    "hashtag": {
                        "tag": hashtag["text"]
                    }
                })

        # Build shareContent object
        share_content = {
            "shareCommentary": share_commentary,
            "shareMediaCategory": "NONE"
        }

        # Add media if provided
        if media_urls:
            share_content["shareMediaCategory"] = "IMAGE"
            share_content["media"] = {
                "contentEntities": {
                    "entities": [
                        {
                            "entityLocation": media_url,
                            "thumbnails": []
                        }
                        for media_url in media_urls
                    ]
                }
            }

        # Build full payload
        payload = {
            "author": author,
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": share_content
            },
            "visibility": {
                "com.linkedin.ugc.MemberNetworkVisibility": visibility
            }
        }

        return payload

    def upload_media(self, file_path: str, media_type: str = "IMAGE") -> Optional[str]:
        """
        Upload media (image/video) to LinkedIn.

        Args:
            file_path: Path to media file
            media_type: Type of media (IMAGE, VIDEO)

        Returns:
            Media URN if successful, None otherwise
        """
        if not self.access_token:
            logger.error("Access token not configured")
            return None

        try:
            # Step 1: Initialize upload
            file_size = os.path.getsize(file_path)
            
            init_payload = {
                "owner": self._get_author(),
                "mediaType": f"image/{media_type.lower()}",
                "sizeBytes": file_size
            }

            response = self.session.post(
                f"{self.api_base}/assets",
                json=init_payload
            )

            if response.status_code != 201:
                logger.error(f"Failed to initialize upload: {response.text}")
                return None

            upload_data = response.json()
            upload_url = upload_data.get('value', {}).get('uploadMechanism', {}).get(
                'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest', {}
            ).get('uploadUrl')

            asset_id = upload_data.get('id')

            if not upload_url or not asset_id:
                logger.error("Upload URL or asset ID missing")
                return None

            # Step 2: Upload file
            with open(file_path, 'rb') as f:
                file_data = f.read()

            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/octet-stream'
            }

            response = self.session.put(upload_url, data=file_data, headers=headers)

            if response.status_code not in (201, 204):
                logger.error(f"Failed to upload media: {response.text}")
                return None

            # Step 3: Finalize upload
            finalize_payload = {
                "asset": asset_id,
                "state": "READY"
            }

            response = self.session.post(
                f"{self.api_base}/com.linkedin.digitalmedia.media.IngestionStatus",
                json=finalize_payload
            )

            if response.status_code == 201:
                logger.info(f"✅ Media uploaded successfully: {asset_id}")
                return asset_id
            else:
                logger.error(f"Failed to finalize upload: {response.text}")
                return None

        except Exception as e:
            logger.error(f"Error uploading media: {e}")
            return None

    def get_post_metrics(self, post_id: str, time_range: str = "30d") -> Dict[str, Any]:
        """
        Fetch metrics for a LinkedIn post.

        Args:
            post_id: LinkedIn post ID (URN format: urn:li:ugcPost:123456)
            time_range: Time range for metrics (7d, 30d, 90d)

        Returns:
            Dictionary with post metrics
        """
        result = {
            "success": False,
            "message": "",
            "metrics": {},
            "timestamp": datetime.now().isoformat()
        }

        if not self.access_token:
            result["message"] = "Access token not configured"
            return result

        try:
            # Normalize post_id to URN format if needed
            if not post_id.startswith('urn:li:ugcPost:'):
                post_id = f"urn:li:ugcPost:{post_id}"

            # Fetch engagement metrics
            metrics_response = self.session.get(
                f"{self.api_base}/socialActions/{post_id}",
                headers={'Authorization': f'Bearer {self.access_token}'}
            )

            if metrics_response.status_code == 200:
                data = metrics_response.json()
                
                result["success"] = True
                result["message"] = "Metrics fetched successfully"
                result["metrics"] = {
                    "likes": data.get("totalShareImpressions", 0),
                    "comments": data.get("numComments", 0),
                    "shares": data.get("numShares", 0),
                    "impressions": data.get("totalShareImpressions", 0),
                    "engagement_rate": self._calculate_engagement_rate(data)
                }

                logger.info(f"✅ Metrics fetched for post {post_id}")
                logger.info(f"   Impressions: {result['metrics']['impressions']}")
                logger.info(f"   Engagement: {result['metrics']['engagement_rate']}%")
            else:
                result["message"] = f"Failed to fetch metrics: {metrics_response.status_code}"
                logger.error(result["message"])

        except Exception as e:
            result["message"] = f"Error fetching metrics: {e}"
            logger.error(result["message"])

        return result

    def _calculate_engagement_rate(self, data: Dict) -> float:
        """Calculate engagement rate from metrics."""
        likes = data.get("numLikes", 0)
        comments = data.get("numComments", 0)
        shares = data.get("numShares", 0)
        impressions = data.get("totalShareImpressions", 1)

        if impressions == 0:
            return 0.0

        engagement = likes + comments + shares
        return round((engagement / impressions) * 100, 2)

    def _log_post_action(self, result: Dict[str, Any], content: str) -> None:
        """Log post action to daily log file."""
        log_file = LOGS_DIR / f"linkedin_log_{datetime.now().strftime('%Y%m%d')}.md"

        status = "✅ Published" if result["success"] else "❌ Failed"
        if result["dry_run"]:
            status = "🔍 Dry Run"

        log_entry = f"""
## {status} - LinkedIn Post

| Field | Value |
|-------|-------|
| **Time** | {result['timestamp']} |
| **Post ID** | {result.get('post_id', 'N/A')} |
| **URL** | {result.get('post_url', 'N/A')} |
| **Status** | {status} |

**Content Preview:**
```
{content[:500]}{'...' if len(content) > 500 else ''}
```

---

"""
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_entry)

    def refresh_access_token(self) -> Dict[str, Any]:
        """
        Refresh OAuth2 access token.

        Returns:
            Dictionary with token refresh result
        """
        result = {
            "success": False,
            "message": "",
            "new_access_token": None,
            "expires_in": None
        }

        if not self.client_id or not self.client_secret or not self.refresh_token:
            result["message"] = "Missing OAuth2 credentials (client_id, client_secret, or refresh_token)"
            logger.error(result["message"])
            return result

        try:
            response = requests.post(
                "https://www.linkedin.com/oauth/v2/accessToken",
                data={
                    "grant_type": "refresh_token",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": self.refresh_token
                }
            )

            if response.status_code == 200:
                token_data = response.json()
                result["success"] = True
                result["message"] = "Access token refreshed successfully"
                result["new_access_token"] = token_data.get("access_token")
                result["expires_in"] = token_data.get("expires_in", 3600)

                logger.info("✅ Access token refreshed")
                logger.info(f"   New token expires in: {result['expires_in']} seconds")

                # Update tokens
                if result["new_access_token"]:
                    self.access_token = result["new_access_token"]
                    self.refresh_token = token_data.get("refresh_token", self.refresh_token)
                    
                    # Update session header
                    self.session.headers.update({
                        'Authorization': f'Bearer {self.access_token}'
                    })
                    
                    # Save the refreshed session
                    self._save_session()
            else:
                result["message"] = f"Token refresh failed: {response.text}"
                logger.error(result["message"])

        except Exception as e:
            result["message"] = f"Error refreshing token: {e}"
            logger.error(result["message"])

        return result

    def test_connection(self) -> Dict[str, Any]:
        """
        Test LinkedIn API connection.

        Returns:
            Dictionary with connection test result
        """
        result = {
            "success": False,
            "message": "",
            "timestamp": datetime.now().isoformat()
        }

        if self.dry_run:
            result["success"] = True
            result["message"] = "Dry run mode - connection test skipped"
            logger.info("🔍 DRY RUN - Connection test skipped")
            return result

        if not self.access_token:
            result["message"] = "Access token not configured"
            logger.error(result["message"])
            return result

        try:
            # Test by fetching current user info
            response = self.session.get(f"{self.api_base}/me")

            if response.status_code == 200:
                user_data = response.json()
                result["success"] = True
                result["message"] = f"Connected as: {user_data.get('localizedFirstName', 'Unknown')}"
                logger.info(f"✅ Connection test successful: {result['message']}")
            else:
                result["message"] = f"Connection test failed: {response.status_code}"
                logger.error(result["message"])

        except Exception as e:
            result["message"] = f"Connection test failed: {e}"
            logger.error(result["message"])

        return result


# =============================================================================
# Module-level Convenience Functions
# =============================================================================

# Global LinkedIn MCP instance
_linkedin_mcp: Optional[LinkedInMCP] = None


def get_linkedin_mcp(dry_run: Optional[bool] = None) -> LinkedInMCP:
    """Get or create LinkedIn MCP instance."""
    global _linkedin_mcp
    if _linkedin_mcp is None or dry_run is not None:
        _linkedin_mcp = LinkedInMCP(dry_run=dry_run)
    return _linkedin_mcp


def create_post(
    content: str,
    media_urls: Optional[List[str]] = None,
    visibility: str = "PUBLIC",
    dry_run: Optional[bool] = None
) -> Dict[str, Any]:
    """
    Convenience function to create a LinkedIn post.

    Args:
        content: Post text content
        media_urls: Optional list of media URLs
        visibility: Post visibility
        dry_run: Override DRY_RUN env var for this post

    Returns:
        Dictionary with post result
    """
    mcp = get_linkedin_mcp(dry_run=dry_run)
    return mcp.create_post(
        content=content,
        media_urls=media_urls,
        visibility=visibility
    )


def test_linkedin_connection() -> Dict[str, Any]:
    """Test LinkedIn API connection."""
    mcp = get_linkedin_mcp()
    return mcp.test_connection()


# =============================================================================
# CLI Interface
# =============================================================================

def main():
    """CLI entry point for LinkedIn MCP."""
    import sys

    print("=" * 60)
    print("📱 Silver Tier LinkedIn MCP v1.0")
    print("=" * 60)
    print(f"API Base: {LINKEDIN_API_BASE}")
    print(f"Client ID: {LINKEDIN_CLIENT_ID[:8]}..." if LINKEDIN_CLIENT_ID else "Client ID: Not configured")
    print(f"Dry Run: {DRY_RUN}")
    print("-" * 60)

    if len(sys.argv) < 2:
        print("Usage: python linkedin_mcp.py <command> [args]")
        print("\nCommands:")
        print("  test                    Test LinkedIn API connection")
        print("  refresh-token           Refresh OAuth2 access token")
        print("  post <content>          Create a text post")
        print("  post-file <file>        Create post from file content")
        print("  save-session            Save current session to file")
        print("  session-status          Check saved session status")
        print("\nEnvironment Variables:")
        print("  LINKEDIN_CLIENT_ID      LinkedIn OAuth2 Client ID")
        print("  LINKEDIN_CLIENT_SECRET  LinkedIn OAuth2 Client Secret")
        print("  LINKEDIN_ACCESS_TOKEN   LinkedIn API Access Token")
        print("  LINKEDIN_PERSON_URN     Your LinkedIn Person URN")
        print("  DRY_RUN=true            Enable dry-run mode (log only)")
        return

    command = sys.argv[1].lower()
    mcp = get_linkedin_mcp()

    if command == "test":
        print("Testing LinkedIn API connection...")
        result = mcp.test_connection()
        print(f"\nResult: {result['message']}")
        if result["success"]:
            print("✅ Connection test passed")
        else:
            print("❌ Connection test failed")

    elif command == "refresh-token":
        print("Refreshing access token...")
        result = mcp.refresh_access_token()
        print(f"\nResult: {result['message']}")
        if result["success"]:
            print(f"✅ New access token: {result['new_access_token'][:20]}...")
            print(f"   Expires in: {result['expires_in']} seconds")
        else:
            print("❌ Token refresh failed")

    elif command == "post":
        if len(sys.argv) < 3:
            print("Usage: python linkedin_mcp.py post <content>")
            return

        content = " ".join(sys.argv[2:])

        print(f"Creating LinkedIn post...")
        print(f"Content: {content[:100]}...")
        result = mcp.create_post(content=content)

        print(f"\nResult: {result['message']}")
        if result["success"]:
            print("✅ Post published successfully")
            if result["post_url"]:
                print(f"   URL: {result['post_url']}")
        else:
            print("❌ Post creation failed")

    elif command == "post-file":
        if len(sys.argv) < 3:
            print("Usage: python linkedin_mcp.py post-file <file.md>")
            return

        file_path = Path(sys.argv[2])
        if not file_path.exists():
            print(f"❌ File not found: {file_path}")
            return

        # Extract content from markdown file
        content = file_path.read_text(encoding='utf-8')
        
        # Try to extract from frontmatter or use full content
        if '---' in content:
            parts = content.split('---', 2)
            if len(parts) >= 3:
                # Skip frontmatter
                content = parts[2].strip()

        print(f"Creating LinkedIn post from file: {file_path}")
        result = mcp.create_post(content=content)

        print(f"\nResult: {result['message']}")
        if result["success"]:
            print("✅ Post published successfully")
            if result["post_url"]:
                print(f"   URL: {result['post_url']}")
        else:
            print("❌ Post creation failed")

    elif command == "save-session":
        print("Saving current LinkedIn session...")
        if mcp.access_token:
            mcp._save_session()
            print("✅ Session saved successfully!")
            print(f"   Session file: {SESSION_DIR / 'session.json'}")
            print(f"   Token expires in: 30 days")
        else:
            print("❌ No access token available to save")

    elif command == "session-status":
        session_file = SESSION_DIR / "session.json"
        if session_file.exists():
            try:
                with open(session_file, 'r', encoding='utf-8') as f:
                    session_data = json.load(f)
                
                expires_at = datetime.fromisoformat(session_data.get('expires_at', ''))
                saved_at = datetime.fromisoformat(session_data.get('saved_at', ''))
                is_expired = datetime.now() > expires_at
                
                print(f"\n📊 LinkedIn Session Status:")
                print(f"   Status: {'✅ ACTIVE' if not is_expired else '❌ EXPIRED'}")
                print(f"   Saved at: {saved_at.strftime('%Y-%m-%d %H:%M:%S')}")
                print(f"   Expires at: {expires_at.strftime('%Y-%m-%d %H:%M:%S')}")
                
                if not is_expired:
                    days_left = (expires_at - datetime.now()).days
                    print(f"   Days remaining: {days_left}")
                else:
                    print(f"   Expired: {(datetime.now() - expires_at).days} days ago")
                
                print(f"   Person URN: {session_data.get('person_urn', 'N/A')}")
                print(f"   Has refresh token: {'✅ Yes' if session_data.get('refresh_token') else '❌ No'}")
                
            except Exception as e:
                print(f"❌ Error reading session: {e}")
        else:
            print("❌ No saved session found")

    else:
        print(f"Unknown command: {command}")
        print("Use 'python linkedin_mcp.py' for usage information")


if __name__ == "__main__":
    main()
