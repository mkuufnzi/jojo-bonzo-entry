# HTML Preview Feature - Summary

## What Was Added

Added live HTML preview functionality to the Raw HTML tab so users can see their HTML content rendered in real-time.

## Features

### 1. **Automatic Preview on Tab Switch**
When users switch to the "Raw HTML" tab:
- If HTML content exists → automatically generates and shows preview
- If no content → shows empty state
- Preview uses the same `/services/html-to-pdf/preview` endpoint

### 2. **Live Preview While Editing**
- **Debounced auto-update**: Preview refreshes 1.5 seconds after user stops typing
- Only updates when HTML tab is active (doesn't waste resources on URL tab)
- Shows loading spinner during preview generation

### 3. **AI Generation Integration**
When AI generates HTML:
1. HTML populates in textarea
2. Switches to HTML tab
3. `switchTab('html')` automatically triggers preview
4. User sees AI-generated content rendered immediately

## How It Works

```javascript
// When switching to HTML tab
switchTab('html') {
  // ... tab switching logic ...
  
  // Check if HTML content exists
  if (htmlContent) {
    updateHtmlPreview(); // Generate preview
  }
}

// Auto-update while typing (debounced)
htmlTextarea.addEventListener('input', () => {
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(() => {
    if (tabHtml.classList.contains('tab-active')) {
      updateHtmlPreview(); // Refresh preview after 1.5s
    }
  }, 1500);
});

// Preview generation
async function updateHtmlPreview() {
  // POST to /services/html-to-pdf/preview with HTML content
  // Display screenshot in preview pane
}
```

## User Experience Flow

### Scenario 1: Manual HTML Entry
1. User clicks "Raw HTML" tab
2. Types/pastes HTML content
3. After 1.5 seconds of no typing → preview auto-generates
4. User sees live preview on the right
5. Can continue editing → preview updates automatically

### Scenario 2: AI Generation
1. User clicks "Generate With AI"
2. Enters prompt and clicks "Generate HTML"
3. AI returns HTML
4. HTML populates in textarea
5. Automatically switches to HTML tab
6. **Preview generates immediately** ✨
7. User sees AI-generated document rendered
8. Can edit HTML → preview updates live
9. Click "Convert to PDF" when satisfied

## Technical Details

- **Preview Endpoint**: `/services/html-to-pdf/preview` (POST)
- **Request**: `{ html: string, appId: string }`
- **Response**: JPEG image blob
- **Debounce Delay**: 1500ms (1.5 seconds)
- **Loading States**: Shows spinner during generation
- **Error Handling**: Displays error message if preview fails

## Benefits

✅ **Immediate Feedback**: Users see AI-generated content instantly  
✅ **Live Editing**: Preview updates as users modify HTML  
✅ **No Manual Action**: Preview happens automatically  
✅ **Resource Efficient**: Debounced to avoid excessive API calls  
✅ **Consistent UX**: Same preview mechanism for URL and HTML tabs
