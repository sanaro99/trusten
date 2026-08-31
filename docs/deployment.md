# Deploy Trusten to a private TrueNAS cloud

Trusten follows this deployment path:

`GitHub Actions -> GHCR -> Watchtower -> TrueNAS app -> Traefik -> Cloudflare Tunnel`

The deployment runs four containers inside one TrueNAS app:

- `proxy` exposes your chosen host port and routes the public origin.
- `web` runs the SvelteKit dashboard on the private Compose network.
- `api` runs Bun/Hono, Chromium, reports, video, and WebSockets. Generated
  evidence is mounted from your private apps dataset.
- `postgres` is the private system of record for scans, jobs, quotas, and
  durable job state. It uses a separate persistent dataset.

The API waits for PostgreSQL's health check before starting. Database and
evidence storage remain separate so either can be restored independently.

## 1. Merge and publish the images

The workflow at `.github/workflows/deploy-image.yml` runs lint, type checks,
Svelte checks, tests, and a production build. On a push to `main`, it publishes:

- `ghcr.io/<github-owner>/trusten:latest` and `:sha-<commit>`
- `ghcr.io/<github-owner>/trusten:proxy-latest` and `:proxy-sha-<commit>`

Merge this branch to `main` (or run the workflow manually). After its first
successful run, open the Trusten package settings in GitHub Packages and change
its visibility to **Public**. This is a one-time step.

## 2. Prepare persistent storage and runtime configuration

Open **TrueNAS -> System -> Shell** and run:

Replace `YOUR_APPS_POOL` below with the private dataset name on the host. Do
not commit the resolved name or paths back to this public repository.

```sh
sudo mkdir -p /mnt/YOUR_APPS_POOL/trusten /mnt/YOUR_APPS_POOL/trusten-postgres /mnt/YOUR_APPS_POOL/appconfig
sudo chown -R 1000:1000 /mnt/YOUR_APPS_POOL/trusten
sudo chmod 750 /mnt/YOUR_APPS_POOL/trusten
sudo chown -R 70:70 /mnt/YOUR_APPS_POOL/trusten-postgres
sudo chmod 700 /mnt/YOUR_APPS_POOL/trusten-postgres
sudo tee /mnt/YOUR_APPS_POOL/appconfig/trusten.env >/dev/null <<'EOF'
TZ=America/Los_Angeles
LOG_LEVEL=info
DATABASE_URL=postgresql://trusten:REPLACE_POSTGRES_PASSWORD@postgres:5432/trusten
TRUSTEN_TURNSTILE_MODE=enforce
TRUSTEN_TURNSTILE_SECRET_KEY=REPLACE_WITH_PRIVATE_SECRET
TRUSTEN_TURNSTILE_EXPECTED_HOSTNAME=YOUR_TRUSTEN_HOSTNAME
TRUSTEN_TURNSTILE_EXPECTED_ACTION=scan-submit
# Optional: uncomment one provider and replace the value.
# TRUSTEN_LLM_PROVIDER=nvidia-nim
# NVIDIA_NIM_API_KEY=REPLACE_ME
EOF
sudo chmod 600 /mnt/YOUR_APPS_POOL/appconfig/trusten.env
```

Create a Managed Turnstile widget for the public hostname. Trusten explicitly
renders it with `interaction-only` appearance when a scan is submitted, so a
normal visitor usually sees no extra step. Keep its secret in this private
environment file. Its public site key replaces `REPLACE_TURNSTILE_SITE_KEY` in
the private Compose copy; no Cloudflare Worker is required. Production uses
`TRUSTEN_TURNSTILE_MODE=enforce`; the API verifies the token, hostname, and
`scan-submit` action before admitting work. With no public site key, the browser
skips Turnstile for local/test use.

Generate a separate random `TRUSTEN_CAPABILITY_HASH_KEY` of at least 32 bytes.
The API uses it to hash anonymous job capabilities; keep it stable across
deployments and never expose it to the web container. Production refuses to
start with placeholder secrets or with Turnstile disabled unless the explicit
emergency override is set.

The proxy owns `X-Trusten-Client-IP`; the API ignores public
`CF-Connecting-IP` and `X-Forwarded-For` headers. Keep the published origin
reachable only through the configured Cloudflare tunnel. Exposing the host
port directly would allow callers to forge Cloudflare-originated metadata.

Replace `REPLACE_POSTGRES_PASSWORD` in both `POSTGRES_PASSWORD` and
`DATABASE_URL` in the private Compose copy with the same strong generated
password. Do not publish PostgreSQL port 5432. Apply versioned database
migrations before the new application image serves traffic; production schema
must not depend on silent startup-time rewrites.

The full non-secret template is `deploy/trusten.env.example`. An LLM key is
optional; deterministic scanning and fixed deep-scan workflows work without it.
Never commit the real `.env` file or paste its secrets into chat.

## 3. Install the TrueNAS app

In **Apps -> Discover -> menu -> Install via YAML**:

1. Set the application name to `trusten`.
2. Copy `deploy/compose.yml` privately and replace every `REPLACE_*` token with
   your GHCR owner, public hostname, Turnstile site key, host port, and apps
   dataset name.
3. Paste the resolved private copy. Do not commit it.
4. Save and wait until PostgreSQL, API, web, and proxy are healthy.
5. Check the API logs for `Trusten server listening`.

Choose the next free host port from your private infrastructure runbook. Only
the proxy publishes it; the web and API services remain private.

If TrueNAS cannot read the GHCR image, confirm the package was made public. If
the API reports a permission error under `/data`, repeat the `chown` command in
step 2.

## 4. Add the Traefik route

Copy `deploy/traefik.yml` privately, replace its `REPLACE_*` tokens, and write
the resolved version to your watched dynamic configuration directory. The
example below deliberately retains placeholders:

```sh
sudo tee /mnt/YOUR_APPS_POOL/traefik/trusten.yml >/dev/null <<'EOF'
http:
  routers:
    trusten:
      rule: "Host(`YOUR_TRUSTEN_HOSTNAME`)"
      entryPoints:
        - websecure
      service: trusten
      tls:
        certResolver: letsencrypt
  services:
    trusten:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:YOUR_HOST_PORT"
        healthCheck:
          path: /health
          interval: "30s"
          timeout: "5s"
EOF
```

Traefik reloads the file automatically. Check its logs immediately for parsing,
entrypoint, certificate-resolver, or health-check errors.

## 5. Add the Cloudflare Tunnel route

In **Cloudflare Zero Trust -> Networks -> Tunnels -> your private tunnel ->
Routes**, add a Published application:

- Subdomain: `trusten`
- Domain: your public domain
- Service: `HTTPS`, URL `localhost:443`
- TLS Origin Server Name: the full Trusten hostname

Do not create routes for ports 3000 or 9200.

## 6. Verify the deployment

1. Open `https://YOUR_TRUSTEN_HOSTNAME/health`; expect JSON with
   `"status":"ok"`.
2. Open `https://YOUR_TRUSTEN_HOSTNAME`; expect the SvelteKit dashboard.
3. Run a Quick Scan, then a Deep Scan with live viewing.
4. Download a generated report and confirm it survives an app restart.
5. Push a harmless commit to `main`; within roughly 2-5 minutes Watchtower
   should recreate the services on the new `latest` digest.

## Rollback

In the TrueNAS YAML, replace `latest` with `sha-<known-good-commit>` for both
`web` and `api`, and replace `proxy-latest` with
`proxy-sha-<known-good-commit>` for `proxy`. Save the app. Restore the moving
tags after the issue is resolved.

An image rollback does not roll back a database schema. Deploy migrations that
are backward-compatible with the previous image, or document and test an
explicit down migration before release.

## PostgreSQL backup and restore

Create scheduled logical backups with `pg_dump`, including one immediately
before every schema migration. Store dumps outside the live PostgreSQL dataset
and apply an independent retention policy:

```sh
pg_dump --format=custom --dbname="$DATABASE_URL" --file=trusten-YYYYMMDD.dump
```

Snapshot the evidence dataset separately. A raw ZFS snapshot of a running
PostgreSQL data directory is not a substitute for a tested logical backup
unless the snapshot procedure guarantees database consistency. Regularly
restore a dump into a disposable PostgreSQL instance, apply migrations, and
verify scan/job counts plus a sample report. A backup is not complete until its
restore has been exercised.
