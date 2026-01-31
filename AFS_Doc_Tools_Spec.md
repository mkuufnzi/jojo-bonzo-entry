# Floovioo  - API Specification

## Overview
Floovioo  is a SaaS platform providing document manipulation services. The flagship service is `htmltopdf`, a high-fidelity HTML to PDF conversion engine powered by Headless Chrome.

## Service: HTML to PDF

### Endpoint
`POST /api/v1/pdf/convert`

### Authentication
- **Type**: API Key
- **Header**: `X-API-Key: <your_api_key>`

### Request Format
The API supports `application/json` for URL and Raw HTML inputs.
*(Future support for `multipart/form-data` for direct file uploads)*

### Request Body Schema (JSON)

```json
{
  "source": {
    "type": "url" | "html",
    "content": "https://example.com" | "<h1>Raw HTML</h1>"
  },
  "options": {
    "format": "A4",
    "landscape": false,
    "printBackground": true,
    "scale": 1.0,
    "margin": {
      "top": "1cm",
      "right": "1cm",
      "bottom": "1cm",
      "left": "1cm"
    },
    "displayHeaderFooter": false,
    "headerTemplate": "<div>Header</div>",
    "footerTemplate": "<div>Footer</div>",
    "waitForNetworkIdle": true,
    "timeout": 30000
  },
  "auth": {
    "username": "optional_basic_auth_user",
    "password": "optional_basic_auth_password"
  },
  "cookies": [
    {
      "name": "session_id",
      "value": "123456",
      "domain": ".example.com"
    }
  ]
}
```

### Configuration Options Detail

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `format` | String | `A4` | Paper format. Options: `Letter`, `Legal`, `Tabloid`, `A0`-`A6`. |
| `landscape` | Boolean | `false` | Paper orientation. |
| `printBackground` | Boolean | `true` | Print background graphics. |
| `scale` | Number | `1.0` | Scale of the webpage rendering. |
| `margin` | Object | `1cm` (all) | Page margins. Units: `px`, `in`, `cm`, `mm`. |
| `displayHeaderFooter` | Boolean | `false` | Display header and footer. |
| `headerTemplate` | String | - | HTML template for the print header. Should be valid HTML markup with following classes used to inject printing values: `date`, `title`, `url`, `pageNumber`, `totalPages`. |
| `footerTemplate` | String | - | HTML template for the print footer. Same classes as header. |
| `waitForNetworkIdle` | Boolean | `true` | Wait for network to be idle (no requests for 500ms) before printing. Useful for JS-heavy sites. |
| `timeout` | Number | `30000` | Maximum time in ms to wait for the PDF generation. |

### Edge Cases & Handling

1.  **Invalid URL**: Returns `400 Bad Request`.
2.  **Unreachable URL / Timeout**: Returns `504 Gateway Timeout` or `422 Unprocessable Entity`.
3.  **Private Network Access (SSRF)**: The service must block attempts to access local network addresses (e.g., `localhost`, `127.0.0.1`, `192.168.x.x`, `169.254.x.x`).
4.  **Large Payloads**: Body size limit set to 50MB.
5.  **Concurrency**: Internal queue or semaphore to limit concurrent Chrome instances to prevent server crash.

### Response
- **Success**: `200 OK` with `Content-Type: application/pdf`. Body is the binary PDF stream.
- **Error**: `4xx` or `5xx` with JSON body:
  ```json
  {
    "error": "ErrorType",
    "message": "Detailed error message",
    "details": {}
  }
  ```

## Future Roadmap
- **Webhook Support**: For async processing of large jobs.
- **S3 Storage**: Option to store PDF and return URL instead of streaming.
- **Template Engine**: Support for Handlebars/EJS templates with data injection.
