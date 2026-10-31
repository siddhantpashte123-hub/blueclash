# BlueClash

A self-hosted tournament platform for Minecraft, Free Fire, and other games. Players can browse without logging in, accept a tournament's terms, create an account, enter their player details, and submit a UPI payment screenshot for an organizer to review. Includes a private admin panel and a VPS manager.

## One-command VPS manager

On a **Debian or Ubuntu VPS running systemd** (x86-64 or ARM64), run this single command:

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
```

Apply the change with `sudo systemctl restart blueclash`. `TRUST_PROXY` must only be enabled behind your own trusted reverse proxy. Remove any public 8989 firewall rule and block it in the cloud firewall when the domain is working. The proxy and TLS setup are deliberately not automated because they depend on your domain and VPS provider.

## How registration and payments work

1. Visitors browse tournaments and their rules without signing in.
2. A player accepts the tournament's terms and selects **Enter Tournament**. If needed, they sign in or create an account and are returned to the tournament details.
3. The player provides first name, last name, in-game ID, optional UID, and in-game name.
4. For paid events, the app reserves a spot for 30 minutes and shows the configured payment QR and locked-in price. The player pays the exact amount in their UPI app, selects **I have paid**, and uploads a screenshot of the **successful payment** (PNG/JPEG/WebP, up to 5 MB), not a screenshot of the QR. An optional UPI transaction reference can be supplied.
5. The entry becomes **Pending review**. In **Admin → Player entries**, the organizer checks the actual incoming payment in their bank/UPI app and approves or rejects it. A rejected proof can be resubmitted without paying again. If the hold expired, players can reserve again before paying; someone who already paid can still submit proof for manual review, but a spot is not guaranteed.
6. Once approved, a ticket is created automatically under **My Entries → View Ticket**. Free entries skip payment and receive a ticket immediately. The player can download a PNG or print/save a PDF. Existing approved entries get tickets when the application is updated.
7. The ticket's QR is **not a payment QR**. It opens an admin-only page where an organizer can sign in and look up the confirmed ticket. Alternatively, use **Admin → Verify ticket** and paste its code or QR link. Verification does not record check-ins or prevent a ticket from being used more than once; organizers must check the player's identity and manage attendance separately.

**BlueClash does not process or automatically verify payments, send refunds, or guarantee a payment. A screenshot alone is not proof of funds.** Verify the transaction independently before approving. The organizer is responsible for their event rules, refund policy, player communications, applicable local laws, taxes, and privacy obligations.

### Delete a test tournament

In **Admin → Tournaments**, select the trash icon, review the entry, ticket and screenshot counts, and type `DELETE` to confirm. This permanently removes the tournament and its associated entries, tickets and payment screenshots; player accounts, other tournaments and the organizer's payment QR are retained. No refunds are issued automatically. To preserve the records instead, cancel and set the tournament visibility to **Completed**. Deleting data from the app does not remove it from existing backups.

If a screenshot cannot be removed, the admin will see a warning. The app keeps a cleanup queue and retries when the service restarts; check `journalctl -u blueclash` for errors.

## Data, updates, and recovery

- Application files: `/opt/blueclash`
- Dedicated Node.js runtime: `/opt/blueclash-node`
- SQLite database and private screenshots: `/var/lib/blueclash`
- Service: `blueclash.service`

Choose **1** in `sudo blueclash` to update from GitHub `main` while retaining the database and uploads. If your manager was installed from an older release, first re-run the one-command installer above and choose **1** once; older managers were pinned to an old branch and will not fetch this release by themselves. Thereafter `sudo blueclash` uses the current manager and updates from `main` by default. Choose **2** to uninstall; data is kept unless you explicitly type `DELETE` when prompted. There is no automatic backup. To make a consistent backup, stop the service, archive the entire data directory (including any SQLite WAL files and uploads), and restart it:

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

React, Vite, Express, and SQLite. Passwords are salted and hashed with scrypt, sessions use HTTP-only same-site cookies, admin APIs enforce the admin role, and payment screenshots are stored outside the public web root. Payment QR codes are uploaded by the organizer or generated locally from a UPI ID; no payment processor is integrated. Ticket verification QR codes are generated locally and require an admin login.

BlueClash is an independent community platform and is not affiliated with Minecraft, Free Fire, or their publishers.
