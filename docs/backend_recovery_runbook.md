# Continuous-Learning Backend Recovery Runbook

## Current production state

The recovery is complete. Xrypt now calls the replacement compatibility service through the HTTPS endpoint:

```text
https://learning.xrypt.net
```

The production path is **Xrypt feedback outbox → authenticated HTTPS reverse proxy → compatibility service on `127.0.0.1:3001` → durable local outcome store**. The service has only three public contract endpoints: `/api/health`, `/api/ai/stats`, and authenticated `POST /api/feedback/signal-outcome`. It does not accept exchange credentials, execute orders, or control the stopped auto-trader.

The old host, `146.190.233.46:3001`, is retired from the Xrypt configuration. External checks had shown an incomplete SSH handshake and empty HTTP replies, so the prior host was treated as unavailable rather than repeatedly restarted. **The exact root cause was not confirmed** because no old-host console inspection was completed before recovery. Retained verified outcomes remained in `feedbackOutbox` during that outage. After recovery, seven real verified outcomes were delivered exactly once through the durable retry callback.

## Historical outage evidence

The external checks prove that the backend is unavailable, but they do **not** prove one exact root cause yet.

| Observed symptom | What it proves | Likely classes of cause | What it does not prove |
|---|---|---|---|
| SSH times out during banner exchange on port 22 | The external SSH handshake never completes. | Droplet networking, Cloud Firewall, host firewall, `sshd`, or a stalled/offline host. | Whether the Node application is running. |
| Public port `3001` returns an empty reply | No valid HTTP response is returned from the expected backend path. | Crashed app, reverse-proxy issue, listener mismatch, resource exhaustion, or network reset. | The exact application exception. |
| Xrypt feedback delivery times out | The external backend does not answer within the delivery timeout. | Any of the host, firewall, process, or HTTP issues above. | Whether verified outcomes were lost; they remain queued locally. |

The DigitalOcean console is required to establish the actual cause because it bypasses the failed external SSH path.

## Access the DigitalOcean console

1. Sign in to [DigitalOcean](https://cloud.digitalocean.com/).
2. Select **Droplets** and open the replacement droplet for `learning.xrypt.net`.
3. Open **Access**.
4. Select **Launch Droplet Console**.

The browser console works even when the SSH port is not reachable externally.

## Current service diagnostic commands

Run the following from the Droplet Console:

```bash
echo '=== host ==='
date; uptime; free -h; df -h

echo '=== compatibility service ==='
systemctl status inverseiq-continuous-learning --no-pager
curl -fsS http://127.0.0.1:3001/api/health && echo
curl -fsS http://127.0.0.1:3001/api/ai/stats && echo
ss -ltnp | grep ':3001' || true

echo '=== reverse proxy and firewall ==='
nginx -t
systemctl status nginx --no-pager
sudo ufw status verbose
```

The listener must be `127.0.0.1:3001`, not a public interface. Nginx owns public HTTP(S), and certificate renewal can be tested with `certbot renew --dry-run`.

## Interpret the Results

| Console result | Most likely cause | Safe next step |
|---|---|---|
| Service inactive | The Node process stopped or failed on startup. | Review `journalctl -u inverseiq-continuous-learning -n 100 --no-pager` before restarting. |
| Local health succeeds but HTTPS health fails | Nginx, certificate, Cloud Firewall, or DNS issue. | Review Nginx logs, UFW, Cloud Firewall, and DNS; do not expose port 3001. |
| Local health fails | Nothing is listening, or the environment/service configuration is invalid. | Review the systemd journal and environment-file permissions; never print the raw key. |
| Disk full or OOM evidence | Resource exhaustion. | Free disk space and review swap/Node process limits before restart. |

## Expected health checks

The backend should be listening only on `127.0.0.1:3001`; Nginx should expose standard HTTPS externally. Validate:

```bash
systemctl is-active inverseiq-continuous-learning
curl -fsS http://127.0.0.1:3001/api/health && echo
curl -fsS https://learning.xrypt.net/api/health && echo
certbot renew --dry-run
```

Do not delete feedback outbox rows. The protected feedback-delivery callback retries eligible outcomes with bounded exponential backoff. If authentication fails, compare only the approved non-reversible configuration fingerprints; do not display either raw key.
