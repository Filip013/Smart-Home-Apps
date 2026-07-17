# Private Cloudflare Worker CORS Proxy for Tuya API

When running your web application in production (e.g. on GitHub Pages), your browser will enforce CORS (Cross-Origin Resource Sharing) restrictions. 

Public CORS proxies (like `corsproxy.io` or `cors-anywhere`) cannot be used because they strip custom headers or headers with underscores (like `client_id`), which the Tuya API requires.

Deploying a free, private Cloudflare Worker acts as a secure proxy that forwards headers correctly and bypasses CORS.

---

## Deployment Steps

### 1. Create a Cloudflare Account
Sign up for a free developer account at [dash.cloudflare.com](https://dash.cloudflare.com).

### 2. Create a Worker
1. Navigate to **Workers & Pages** -> **Create Application** -> **Create Worker**.
2. Name your worker (e.g. `tuya-cors-proxy`).
3. Click **Deploy**.

### 3. Replace Worker Code
1. Click **Edit Code** inside your new worker.
2. Replace the default template with the script below:

```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const targetUrl = url.searchParams.get('url')
  if (!targetUrl) return new Response('Missing ?url= parameter', { status: 400 })

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400',
      }
    })
  }

  const forwardHeaders = new Headers()
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase().startsWith('cf-') || key.toLowerCase() === 'host') continue
    forwardHeaders.set(key, value)
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : null
    })

    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Allow-Headers', '*')
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    return new Response(response.body, { status: response.status, headers: responseHeaders })
  } catch (err) {
    return new Response('Proxy Error: ' + err.message, { status: 500 })
  }
}
```

3. Click **Save and Deploy**.

### 4. Configure Web App
1. Copy the public URL of your worker (e.g. `https://tuya-cors-proxy.your-username.workers.dev`).
2. Go to the **Settings** page in the smart home web app.
3. Paste the URL into the **Custom CORS Proxy URL** field.
4. Click **Save Configuration**.
