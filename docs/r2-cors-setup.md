# R2 CORS Setup

Without a CORS policy, browsers will block the presigned PUT upload because the request
goes from your domain (e.g. `localhost:3000` or `raivstream.com`) directly to R2.
This is a one-time setup in the Cloudflare dashboard.

## Steps

### 1. Open your R2 bucket in the Cloudflare dashboard

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Go to **R2** → click your bucket (e.g. `raivstream-videos`)
3. Click the **Settings** tab
4. Scroll to **CORS Policy**

### 2. Paste this CORS policy

Click **Edit CORS policy** and replace the contents with:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://raivstream.com",
      "https://*.raivstream.com"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length", "Cache-Control"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

> **Customise `AllowedOrigins`** to match your actual domains.
> Add `https://your-preview-url.vercel.app` if you use Vercel preview deployments.

### 3. Save and verify

Click **Save**. To verify it works, open browser DevTools → Network tab on your upload
page and confirm the preflight (`OPTIONS`) request to R2 returns `200` with
`Access-Control-Allow-Origin` set.

## Why only PUT, GET, HEAD?

- `PUT` — used for direct browser → R2 presigned uploads
- `GET` / `HEAD` — used by `<video>` range requests for seeking

`DELETE`, `POST` etc. are not needed from the browser and are intentionally excluded.

## Local development without a custom domain

If your `R2_PUBLIC_URL` points to the raw R2 bucket hostname
(`https://<account>.r2.cloudflarestorage.com`), add that origin too:

```json
"http://localhost:3000",
"https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com"
```

Once you add a custom domain in R2 → Settings → Custom Domains, only that
domain needs to be in `AllowedOrigins` for production.
