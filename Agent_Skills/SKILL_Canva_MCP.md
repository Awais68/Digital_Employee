# SKILL: Canva MCP Integration

## Description
Create, edit, and manage Canva designs programmatically using Canva's remote MCP server. Works locally and on cloud deployments.

## When to Use
- Creating social media graphics (posts, stories, covers)
- Generating marketing materials (flyers, posters, presentations)
- Designing brand assets (logos, business cards, letterheads)
- Exporting designs in various formats (PDF, PNG, JPG, PPTX)
- Searching and reusing existing Canva templates

## Architecture
```
Local/Cloud System → mcp-remote → https://mcp.canva.com/mcp → Canva APIs
```

## Prerequisites
1. Canva account (any plan - Free, Pro, Teams, Business)
2. Node.js v20+ installed
3. Internet connection (for remote MCP server)

## Setup - Local Development
MCP server auto-connects via `mcp-remote` package. First time login via browser popup.

## Setup - Cloud Deployment
For cloud (Oracle Cloud, AWS, etc.), same config works:
```json
{
  "canva-mcp": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "mcp-remote@latest", "https://mcp.canva.com/mcp"]
  }
}
```

**Note:** Each user must authenticate individually via OAuth. In cloud:
- First request triggers OAuth flow
- User gets redirect URL to authenticate in browser
- After auth, session persists for subsequent requests

## Available Tools

### Design Creation
- `create_design` - Generate new designs from text descriptions
- `create_from_template` - Use existing Canva templates
- `create_branded_design` - Apply brand kit colors/fonts

### Design Editing
- `edit_design` - Modify existing designs with natural language
- `add_elements` - Add text, images, shapes to designs
- `apply_brand_kit` - Apply brand colors and fonts

### Asset Management
- `search_templates` - Find Canva templates by keyword
- `search_brand_kits` - Access brand assets
- `upload_asset` - Upload images/logos to Canva

### Export & Share
- `export_design` - Download as PDF, PNG, JPG, PPTX, MP4
- `resize_design` - Adapt designs for different platforms (Pro+)
- `share_design` - Generate shareable links

## Usage Examples

### Create Social Media Post
```
Create an Instagram post for a summer sale with blue gradient background, 
white text saying "SUMMER SALE 50% OFF".
```

### Generate Marketing Flyer
```
Design a professional business flyer for "Digital Employee" 
with modern dark theme and purple accents.
```

### Export Design
```
Export the last created design as high-quality PNG.
```

## Integration with Digital Employee
- Designs saved to `generated_images/` directory
- Tasks in `Todos/` can trigger design creation
- Completed designs move to `Done/` with export files

## Rate Limits
- Canva enforces rate limits per operation
- Check https://www.canva.dev/docs/mcp/tools/ for details

## Troubleshooting
- **Auth Error**: Re-authenticate via browser popup
- **Timeout**: Increase `timeout` in MCP config
- **Cloud Issues**: Ensure outbound HTTPS to mcp.canva.com is allowed
