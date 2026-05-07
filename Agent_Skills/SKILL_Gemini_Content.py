import os
import json
import requests
from pathlib import Path
import google.generativeai as genai

genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
UNSPLASH_KEY = os.getenv('UNSPLASH_API_KEY', '')

def generate_topic_options(industry='AI & Technology', count=5):
    model = genai.GenerativeModel('gemini-pro')
    prompt = f'''
Generate {count} engaging LinkedIn post topics for {industry}.
Each topic should be:
- Trending and relevant
- Professional but engaging  
- Suitable for Pakistani tech audience

Return as JSON array:
[{{"topic": "...", "angle": "...", "hook": "..."}}]
'''
    response = model.generate_content(prompt)
    return json.loads(response.text)

def generate_post_content(topic, platform='linkedin'):
    model = genai.GenerativeModel('gemini-pro')
    platform_rules = {
        'linkedin': 'Professional tone, 150-300 words, 3-5 hashtags',
        'instagram': 'Casual engaging tone, 50-100 words, 10-15 hashtags',
        'facebook': 'Friendly tone, 100-200 words, 3-5 hashtags',
        'twitter': 'Punchy, max 280 chars, 2-3 hashtags'
    }
    prompt = f'''
Write a {platform} post about: {topic}
Rules: {platform_rules[platform]}
Include relevant emojis.
Make it authentic, not salesy.
'''
    response = model.generate_content(prompt)
    return response.text

def generate_post_image(topic, style='professional'):
    try:
        model = genai.GenerativeModel('imagen-3.0-generate-001')
        prompt = f'''
Professional social media image for: {topic}
Style: {style}, modern, clean
No text in image
Brand colors: blue and white
'''
        response = model.generate_images(prompt)
        image_path = Path('generated_images') / f"{topic[:20].replace(' ', '_')}.png"
        image_path.parent.mkdir(exist_ok=True)
        response.images[0].save(image_path)
        return str(image_path)
    except Exception:
        if not UNSPLASH_KEY:
            return None
        query = '+'.join(topic.split()[:3])
        url = f"https://api.unsplash.com/photos/random?query={query}&client_id={UNSPLASH_KEY}"
        img_url = requests.get(url).json()['urls']['regular']
        img_data = requests.get(img_url).content
        image_path = Path('generated_images') / f"{topic[:20].replace(' ', '_')}.jpg"
        image_path.parent.mkdir(exist_ok=True)
        image_path.write_bytes(img_data)
        return str(image_path)
