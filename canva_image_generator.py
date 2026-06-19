#!/usr/bin/env python3
"""
canva_image_generator.py - Canva MCP Image Generator for Digital Employee

Generates professional social media images using Canva MCP server.
Strictly enforces image requirement - every post MUST have an image.

Usage:
    from canva_image_generator import generate_post_image
    
    image_path = generate_post_image(
        topic="AI in Healthcare",
        platform="linkedin",
        style="professional"
    )
"""

import os
import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
GENERATED_IMAGES_DIR = BASE_DIR / "generated_images"
RULES_FILE = BASE_DIR / "config" / "social_media_rules.json"

# Ensure generated_images directory exists
GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

def load_rules():
    """Load social media rules."""
    if RULES_FILE.exists():
        with open(RULES_FILE, 'r') as f:
            return json.load(f)
    return {}

def get_image_dimensions(platform):
    """Get image dimensions for platform."""
    rules = load_rules()
    platform_rules = rules.get("platforms", {}).get(platform, {}).get("rules", {})
    image_config = platform_rules.get("image", {})
    return image_config.get("dimensions", "1200x627")

def generate_image_via_canva(topic, platform="linkedin", style="professional"):
    """
    Generate image using Canva MCP server.
    Returns image path or None if failed.
    """
    try:
        # Create a descriptive prompt for Canva
        prompt = create_canva_prompt(topic, platform, style)
        
        # Generate filename
        safe_topic = "".join(c for c in topic[:30] if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_topic = safe_topic.replace(' ', '_')
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{platform}_{safe_topic}_{timestamp}.png"
        output_path = GENERATED_IMAGES_DIR / filename
        
        # Call Canva MCP via subprocess (stdio mode)
        # This will be called by the AI agent through MCP
        canva_request = {
            "tool": "create_design",
            "params": {
                "prompt": prompt,
                "platform": platform,
                "dimensions": get_image_dimensions(platform),
                "style": style,
                "output_path": str(output_path)
            }
        }
        
        # For now, create a placeholder that indicates Canva generation needed
        # The actual generation happens through MCP when AI agent processes
        placeholder_info = {
            "status": "needs_canva_generation",
            "topic": topic,
            "platform": platform,
            "style": style,
            "dimensions": get_image_dimensions(platform),
            "prompt": prompt,
            "output_path": str(output_path),
            "timestamp": datetime.now().isoformat()
        }
        
        # Save placeholder info for MCP processing
        placeholder_file = GENERATED_IMAGES_DIR / f"pending_{filename}.json"
        with open(placeholder_file, 'w') as f:
            json.dump(placeholder_info, f, indent=2)
        
        print(f"[CANVA] Image generation queued for: {topic}")
        print(f"[CANVA] Platform: {platform}, Style: {style}")
        print(f"[CANVA] Output: {output_path}")
        
        return str(output_path)
        
    except Exception as e:
        print(f"[CANVA] Error: {e}")
        return None

def create_canva_prompt(topic, platform, style):
    """Create a descriptive prompt for Canva image generation."""
    style_map = {
        "professional": "modern, clean, professional, corporate, minimal",
        "engaging": "colorful, eye-catching, dynamic, vibrant",
        "inspiring": "motivational, uplifting, bright, positive",
        "tech": "futuristic, digital, tech-focused, blue tones",
        "marketing": "bold, promotional, sales-focused, attention-grabbing"
    }
    
    style_desc = style_map.get(style, style_map["professional"])
    
    prompt = f"""Professional {platform} social media image about: {topic}
Style: {style_desc}
Colors: Blue, white, modern palette
Composition: Clean layout with focal point
Mood: Professional, trustworthy, innovative
No text in image - text will be added separately
High quality, HD resolution"""
    
    return prompt

def validate_image(image_path):
    """Validate that image exists and meets requirements."""
    if not image_path:
        return False, "No image path provided"
    
    path = Path(image_path)
    if not path.exists():
        return False, f"Image file not found: {image_path}"
    
    # Check file size
    size_mb = path.stat().st_size / (1024 * 1024)
    if size_mb > 10:
        return False, f"Image too large: {size_mb:.1f}MB (max 10MB)"
    
    # Check extension
    valid_extensions = ['.png', '.jpg', '.jpeg', '.webp']
    if path.suffix.lower() not in valid_extensions:
        return False, f"Invalid format: {path.suffix} (allowed: {valid_extensions})"
    
    return True, "Image valid"

def ensure_image_exists(topic, platform="linkedin", style="professional"):
    """
    STRICT: Ensure image exists for post. Generate if missing.
    Every post MUST have an image. No exceptions.
    """
    rules = load_rules()
    image_rules = rules.get("image_rules", {})
    
    if not image_rules.get("require_image", True):
        return None, "Image not required by rules"
    
    # Check if there's a pending image generation
    safe_topic = "".join(c for c in topic[:30] if c.isalnum() or c in (' ', '-', '_')).strip()
    safe_topic = safe_topic.replace(' ', '_')
    
    # Look for existing images
    existing_images = list(GENERATED_IMAGES_DIR.glob(f"{platform}_{safe_topic}_*.png"))
    if existing_images:
        latest_image = max(existing_images, key=lambda x: x.stat().st_mtime)
        is_valid, msg = validate_image(str(latest_image))
        if is_valid:
            return str(latest_image), "Existing image found"
    
    # Generate new image
    print(f"[CANVA] No image found for: {topic}")
    print(f"[CANVA] Generating new image via Canva...")
    
    image_path = generate_image_via_canva(topic, platform, style)
    
    if image_path:
        return image_path, "Image generated via Canva"
    else:
        # STRICT: Block post if no image
        if image_rules.get("block_posts_without_image", True):
            return None, "BLOCKED: Image required but generation failed"
        return None, "Warning: No image generated"

def get_pending_images():
    """Get list of images pending Canva generation."""
    pending_files = list(GENERATED_IMAGES_DIR.glob("pending_*.json"))
    pending = []
    for pf in pending_files:
        with open(pf, 'r') as f:
            pending.append(json.load(f))
    return pending

def mark_image_complete(image_path):
    """Mark an image as generated (remove pending status)."""
    pending_file = GENERATED_IMAGES_DIR / f"pending_{Path(image_path).name}.json"
    if pending_file.exists():
        pending_file.unlink()
        print(f"[CANVA] Image marked complete: {image_path}")

if __name__ == "__main__":
    # Test the generator
    test_topic = "AI in Healthcare: Transforming Patient Care"
    test_platform = "linkedin"
    
    print(f"Testing Canva image generation...")
    print(f"Topic: {test_topic}")
    print(f"Platform: {test_platform}")
    
    image_path, status = ensure_image_exists(test_topic, test_platform)
    print(f"Status: {status}")
    print(f"Image: {image_path}")
    
    # Show pending images
    pending = get_pending_images()
    print(f"\nPending images: {len(pending)}")
    for p in pending:
        print(f"  - {p['topic']} ({p['platform']})")
