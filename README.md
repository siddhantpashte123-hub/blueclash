# BlueClash

A self-hosted tournament platform for Minecraft, Free Fire, and other games. Players can browse without logging in, accept a tournament's terms, create an account, enter their player details, and submit a UPI payment screenshot for an organizer to review. Includes a private admin panel and a VPS manager.

## One-command VPS manager

On a **Debian or Ubuntu VPS running systemd** (x86-64 or ARM64, glibc 2.28 or newer), run this single command:

```bash
curl -fsSL 'https://github.com/siddhantpashte123-hub/blueclash/raw/refs/heads/main/install.sh' -o /tmp/blueclash-install.sh && bash /tmp/blueclash-install.sh
```

The manager shows:

```text
1) Install / update
2) Uninstall
3) Status
4) Back / exit
```

Choose **1** and enter an administrator email and password when asked. It installs a dedicated Node.js runtime, builds the app, creates a systemd service, and starts it on **port 8989**. The installer requires root or a user with `sudo`, internet access to GitHub, npm, and nodejs.org, and enough disk/memory to build the app (at least 1 GB RAM recommended). The installer does not change the system-wide Node.js installation.

After installation:

- Website: `http://YOUR_VPS_IP:8989`
- Admin panel: `http://YOUR_VPS_IP:8989/admin`
- Open the manager again: `sudo blueclash`
- Service logs: `sudo journalctl -u blueclash -n 100 --no-pager`

Allow inbound TCP port **8989** in your VPS provider's firewall/security group. The installer also adds a UFW rule if UFW is active. On a fresh install, sample tournaments are clearly labelled and cannot accept entries. Sign in to the admin panel and, under **Payment settings**, either upload your UPI payment QR or enter your UPI ID and payee name to generate one. Then create and publish a real tournament (or edit a sample and explicitly convert it to a real one). Paid tournaments cannot accept registrations until a payment method is configured. Free tournaments work without one.

**If the install health check fails:**

The installer checks `http://127.0.0.1:8989/api/health` locally; a successful response is `{"ok":true}`. A 404 or connection failure does not by itself identify the cause. Check the service, its logs, the port owner, and a direct request that bypasses proxies:

```bash
sudo systemctl status blueclash --no-pager -l
sudo journalctl -u blueclash -n 80 --no-pager
sudo ss -ltnp | grep ':8989'
curl -q --noproxy '*' -i --max-time 5 http://127.0.0.1:8989/api/health
```

If another program is using port 8989, identify it before changing anything; do not stop an unrelated service blindly. Once the conflict or other reported error is resolved, re-run the one-command manager and choose **1**. A failed install keeps `/var/lib/blueclash`, including an administrator already created there; it will not ask to create that account again. Keep passwords and session tokens out of shared logs and screenshots.

For an uploaded QR, use a **reusable open-amount UPI QR**, not one fixed to a different amount. The app cannot inspect or validate its payee or amount: scan it yourself to check it leads to the correct account. Players must enter the exact fee shown at checkout if their app does not pre-fill it. A UPI-ID-generated QR includes the entry amount automatically.

> **Important:** The IP-and-port URL is plain HTTP. Before accepting real registrations or payments, put the app behind HTTPS using a domain and a trusted reverse proxy such as Caddy or Nginx with a TLS certificate. Keep direct port 8989 private once the proxy is in place. Set `TRUST_PROXY=true` and `COOKIE_SECURE=true` for the systemd service when it is served exclusively over HTTPS (see below). Never send passwords or payment screenshots over public plain HTTP.

### Example HTTPS deployment

Point a domain to the VPS and configure a reverse proxy to forward requests to `http://127.0.0.1:8989`, preserving the `Host` header and setting `X-Forwarded-Proto`. For example, with Caddy and DNS already configured:

```caddyfile
arena.example.com {
    reverse_proxy 127.0.0.1:8989
}
```

Caddy can provision a certificate for a publicly reachable domain; configure ports 80 and 443 and check your DNS/firewall first. Then run `sudo systemctl edit blueclash` and add:

```ini
[Service]
Environment=TRUST_PROXY=true
Environment=COOKIE_SECURE=true
Environment=SITE_URL=https://arena.example.com
```

Apply the change with `sudo systemctl restart blueclash`. `TRUST_PROXY` must only be enabled behind your own trusted reverse proxy. Replace `arena.example.com` with your public HTTPS domain; `SITE_URL` is an origin only, with no path or query. Remove any public 8989 firewall rule and block it in the cloud firewall when the domain is working. The proxy and TLS setup are deliberately not automated because they depend on your domain and VPS provider.

### Search and link previews

BlueClash serves page titles, descriptions, Open Graph/Twitter tags, a 1200 × 630 branded preview image, a favicon, `robots.txt`, and a dynamic `sitemap.xml`. Public, non-sample published/completed tournaments get their own crawlable descriptions and canonical URLs; drafts, sample events, sign-in, entries, tickets, chat, and admin pages are marked `noindex`. This is a search-engine instruction, **not** an access-control mechanism; private APIs continue to require authorization. The sitemap includes the homepage plus up to 49,999 real public tournaments.

The default canonical origin is **`https://www.blueclash.bond`**. If your public domain is different, set `SITE_URL` as shown above (for example, `https://arena.example.com`), then restart the service. It must be a complete `http://` or `https://` origin with no path, credentials, query or fragment. Use HTTPS for production and make sure the public domain, the `og:image` URL in the page source (under `/brand/` by default or `/api/brand-assets/` for customized branding), `/robots.txt`, and `/sitemap.xml` are reachable without a login or bot-blocking challenge. Canonical and image URLs are generated from this trusted setting, not from request headers. Configure your reverse proxy or DNS provider to redirect alternate hosts and HTTP to the one HTTPS origin; the app does not configure these redirects or TLS for you.

After deploying, verify your domain in Google Search Console and submit `https://YOUR-DOMAIN/sitemap.xml`. Social services can cache an older preview, so use their preview/debugging tools where available or wait for a refresh. Search engines decide when to crawl, whether to use the metadata and how to rank or display a page; updates do not guarantee a particular result or timeline.

### Change the website name and logo

Sign in as an administrator and open **Admin → Website branding**. Enter a website name (up to 40 characters), upload a PNG, JPEG or WebP logo (up to 5 MB, non-animated, 16–4096 pixels per side), and check the live preview before selecting **Save branding**. A square image is recommended. You can replace the logo, select the default logo, discard unsaved edits, or choose **Restore defaults** and save to return to BlueClash. Concurrent edits by another admin require reloading the latest version before saving.

The saved name and logo appear throughout the website, on tickets, in page titles, the favicon and generated social previews. Existing `BC-` ticket codes and payment settings do not change. An already-open page may need a refresh; search engines and social services can retain an older preview in their caches. The submitted logo is re-encoded and public derivative images are served separately from private payment screenshots/QRs; do not upload confidential images as logos.

The name is stored in the database and the generated branding images are stored under `/var/lib/blueclash/branding` (or `$DATA_DIR/branding`). They survive service restarts and normal updates as long as the entire data directory is preserved and backed up. If a saved image is missing, the admin panel shows a warning and the default logo is used until it is uploaded again or reset.

## How registration and payments work

1. Visitors browse tournaments and their rules without signing in.
2. A player accepts the tournament's terms and selects **Enter Tournament**. If needed, they sign in or create an account and are returned to the tournament details.
3. The player provides first name, last name, in-game ID, optional UID, and in-game name.
4. For paid events, the app reserves a spot for 30 minutes and shows the configured payment QR and locked-in price. The player pays the exact amount in their UPI app, selects **I have paid**, and uploads a screenshot of the **successful payment** (PNG/JPEG/WebP, up to 5 MB), not a screenshot of the QR. An optional UPI transaction reference can be supplied.
5. The entry becomes **Pending review**. In **Admin → Player entries**, the organizer checks the actual incoming payment in their bank/UPI app and approves or rejects it. A rejected proof can be resubmitted without paying again. If the hold expired, players can reserve again before paying; someone who already paid can still submit proof for manual review, but a spot is not guaranteed.
6. Once approved, a ticket is created automatically under **My Entries → View Ticket**. Free entries skip payment and receive a ticket immediately. The player can download a PNG or print/save a PDF. Existing approved entries get tickets when the application is updated.
7. The ticket's QR is **not a payment QR**. It opens an admin-only page where an organizer can sign in and look up the confirmed ticket. Alternatively, use **Admin → Verify ticket** and paste its code or QR link. Verification does not record check-ins or prevent a ticket from being used more than once; organizers must check the player's identity and manage attendance separately.

**BlueClash does not process or automatically verify payments, send refunds, or guarantee a payment. A screenshot alone is not proof of funds.** Verify the transaction independently before approving. The organizer is responsible for their event rules, refund policy, player communications, applicable local laws, taxes, and privacy obligations.

### Private tournament chat

After an entry is confirmed, the player can open **My Entries → Chat with Admin** (free entries are confirmed immediately). The organizer can select **Admin → Player messages** or open a confirmed entry and choose **Chat with player**. Each entry has its own conversation; only that player and administrator accounts can access it. Organizers can start the conversation and manually send the server IP, port, match time and other details. The app does not create or detect a game server.

Messages are plain text, stored in the VPS database, and refresh every few seconds while the chat is open. Unread counts appear in the admin inbox and on the player's entry; there are no email or push notifications. Chats are access-controlled, but not end-to-end encrypted: all administrators can read them. Use HTTPS and do not send passwords, payment credentials or OTPs through chat.

### Delete a test tournament

In **Admin → Tournaments**, select the trash icon, review the entry, ticket, screenshot and message counts, and type `DELETE` to confirm. This permanently removes the tournament and its associated entries, tickets, payment screenshots and private chat messages; player accounts, other tournaments and the organizer's payment QR are retained. No refunds are issued automatically. To preserve the records instead, cancel and set the tournament visibility to **Completed**. Deleting data from the app does not remove it from existing backups.

If a screenshot cannot be removed, the admin will see a warning. The app keeps a cleanup queue and retries when the service restarts; check `journalctl -u blueclash` for errors.

## Data, updates, and recovery

- Application files: `/opt/blueclash`
- Dedicated Node.js runtime: `/opt/blueclash-node`
- SQLite database, private screenshots and saved branding assets: `/var/lib/blueclash`
- Service: `blueclash.service`

Choose **1** in `sudo blueclash` to update from GitHub `main` while retaining the database, uploads and branding. If your manager was installed from an older release, first re-run the one-command installer above and choose **1** once; older managers were pinned to an old branch and will not fetch this release by themselves. Thereafter `sudo blueclash` uses the current manager and updates from `main` by default. Choose **2** to uninstall; data is kept unless you explicitly type `DELETE` when prompted. There is no automatic backup. To make a consistent backup, stop the service, archive the entire data directory (including any SQLite WAL files, uploads and branding), and restart it:

```bash
sudo systemctl stop blueclash
sudo tar -czf blueclash-backup.tar.gz -C /var/lib blueclash
sudo systemctl start blueclash
```

Store the backup securely and test your restore procedure. Backups contain player data and payment screenshots. To reset/create an administrator from the VPS terminal (the password is prompted without echo and existing sessions for that account are invalidated):

```bash
sudo -u blueclash env DATA_DIR=/var/lib/blueclash /opt/blueclash-node/bin/node /opt/blueclash/server/admin-cli.js admin@example.com
```

## Local development

Requires Node.js **22.13+** (the app uses Node's built-in `node:sqlite` module), npm, and no external database.

```bash
npm ci
npm run admin        # create the first admin account; prompts for email and password
npm run build
npm start            # http://localhost:8989
```

For development, `npm run dev` runs Vite on port 5173 and proxies `/api` to the API server on port 3001. `DATA_DIR` can be set to choose a different database/upload directory; it defaults to `./data`. The app blocks cross-origin embedding by default; set `BLUECLASH_ALLOW_EMBED=true` only for a trusted HTTPS embedded preview, not a public payment deployment. This also enables a Secure, partitioned cross-site session cookie for that preview. Run the integration tests with `npm test`. The built-in SQLite module may emit an experimental warning on Node 22.

The default installation does not include public user password recovery or email delivery. An organizer can reset an administrator password via the terminal command above; player account recovery should be arranged before operating a public service.

## Tech

React, Vite, Express, SQLite, and Sharp for sanitized branding images. Passwords are salted and hashed with scrypt, sessions use HTTP-only same-site cookies, admin APIs enforce the admin role, and payment screenshots are stored outside the public web root. Payment QR codes are uploaded by the organizer or generated locally from a UPI ID; no payment processor is integrated. Ticket verification QR codes are generated locally and require an admin login. The Manrope and Noto Sans Devanagari fonts bundled for server-rendered previews are licensed under the SIL Open Font License; see the license files in `server/assets/`.

BlueClash is an independent community platform and is not affiliated with Minecraft, Free Fire, or their publishers.
