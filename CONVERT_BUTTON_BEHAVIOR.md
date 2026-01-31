# Convert Button Behavior - Confirmation

## Current Implementation ✅

The convert button **already correctly detects** which input method is active and processes accordingly.

### How It Works

#### Frontend (Form Submission)
```javascript
// Form has both URL and HTML inputs
<input name="url" />        // In URL tab group
<textarea name="html" />    // In HTML tab group

// Only the VISIBLE input is filled and submitted
FormData automatically includes only non-empty fields
```

#### Backend Detection
```typescript
// pdf.service.ts - Line 61-64
const { url, html, format, landscape, appId } = body;
const payload = {
  source: {
    type: url ? 'url' : 'html',  // ✅ Auto-detects
    content: url || html          // ✅ Uses whichever exists
  }
};
```

### User Flows

#### Flow 1: URL Input
1. User on **URL tab**
2. Enters URL: `https://example.com`
3. Clicks "Convert to PDF"
4. Backend receives: `{ url: "https://example.com", html: "" }`
5. Detects: `type: 'url'`
6. Generates PDF from URL ✅

#### Flow 2: Raw HTML Input (Manual)
1. User switches to **Raw HTML tab**
2. Types/pastes HTML content
3. Preview shows live rendering
4. Clicks "Convert to PDF"
5. Backend receives: `{ url: "", html: "<html>...</html>" }`
6. Detects: `type: 'html'`
7. Generates PDF from HTML ✅

#### Flow 3: AI-Generated HTML
1. User clicks "Generate With AI"
2. AI generates HTML
3. HTML populates in Raw HTML textarea
4. **Automatically switches to Raw HTML tab**
5. Preview shows AI-generated content
6. User clicks "Convert to PDF"
7. Backend receives: `{ url: "", html: "<html>AI content...</html>" }`
8. Detects: `type: 'html'`
9. Generates PDF from AI-generated HTML ✅

## Preview Behavior

### URL Tab
- Shows screenshot of the URL
- Preview endpoint: `POST /services/html-to-pdf/preview { url }`

### Raw HTML Tab
- Shows screenshot of rendered HTML
- Preview endpoint: `POST /services/html-to-pdf/preview { html }`
- **Auto-updates** 1.5s after typing stops
- **Immediately shows** AI-generated content

## Conclusion

✅ **No changes needed** - the convert button already works correctly for both URL and HTML inputs  
✅ **AI integration** seamlessly works with existing flow  
✅ **Preview** works for both input methods  
✅ **Backend** automatically detects input type

The implementation is complete and working as expected!
