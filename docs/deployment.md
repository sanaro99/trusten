# Deploy Trusten to a private TrueNAS cloud

Trusten follows this deployment path:

`GitHub Actions -> GHCR -> Watchtower -> TrueNAS app -> Traefik -> Cloudflare Tunnel`

The deployment runs three containers inside one TrueNAS app:

- `proxy` exposes your chosen host port and routes the public origin.
- `web` runs the SvelteKit dashboard on the private Compose network.
- `api` runs Bun/Hono, Chromium, SQLite, reports, video, and WebSockets. Its
  persistent data is mounted from your private apps dataset.

No database service is needed. Trusten currently uses SQLite.

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
sudo mkdir -p /mnt/YOUR_APPS_POOL/trusten /mnt/YOUR_APPS_POOL/appconfig
sudo chown -R 1000:1000 /mnt/YOUR_APPS_POOL/trusten
sudo chmod 750 /mnt/YOUR_APPS_POOL/trusten
sudo tee /mnt/YOUR_APPS_POOL/appconfig/trusten.env >/dev/null <<'EOF'
TZ=America/Los_Angeles
LOG_LEVEL=info
# Optional: uncomment one provider and replace the value.
# TRUSTEN_LLM_PROVIDER=nvidia-nim
# NVIDIA_NIM_API_KEY=REPLACE_ME
EOF
sudo chmod 600 /mnt/YOUR_APPS_POOL/appconfig/trusten.env
```

The full non-secret template is `deploy/trusten.env.example`. An LLM key is
optional; deterministic scanning and fixed deep-scan workflows work without it.
Never commit the real `.env` file or paste its secrets into chat.

## 3. Install the TrueNAS app

In **Apps -> Discover -> menu -> Install via YAML**:

1. Set the application name to `trusten`.
2. Copy `deploy/compose.yml` privately and replace every `REPLACE_*` token with
   your GHCR owner, public hostname, host port, and apps dataset name.
3. Paste the resolved private copy. Do not commit it.
4. Save and wait until all three services are healthy.
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

The SQLite database and generated evidence remain on
your private Trusten dataset, independent of image rollbacks. Take periodic ZFS
snapshots of that dataset and snapshot it before deploying any future database
migration.
