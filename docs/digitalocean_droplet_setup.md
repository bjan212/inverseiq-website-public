# DigitalOcean Droplet Setup for the InverseIQ Backend

This guide creates a replacement production server for the continuous-learning backend. It does **not** restart the Xrypt auto-trader, which remains stopped.

## 1. Create the Droplet

Open [DigitalOcean Droplets](https://cloud.digitalocean.com/droplets) and select **Create → Droplets**. Use the following configuration.

| Setting | Recommended choice | Reason |
|---|---|---|
| **Region** | Choose the region nearest to you and your users. If the old backend used a specific region, choose the same one for the simplest migration. | Reduces operational and network complexity. |
| **Image** | **Ubuntu 24.04 (LTS) x64** | Stable, supported Node.js server base. |
| **Plan** | **Basic / Regular CPU — 1 vCPU, 2 GB RAM, 50 GB SSD** | Sensible baseline for Node.js, PM2, reverse proxy, and backend workloads. |
| **Hostname** | `inverseiq-backend-prod` | Clear production identification. |
| **Tags** | `inverseiq`, `backend`, `production` | Easier asset management. |
| **Backups** | Enable weekly backups if the backend will retain any server-side state. | Supports recovery from host failures. |
| **Monitoring** | Enable. | Helps identify CPU, memory, and network issues. |

## 2. Select Your Existing SSH Key

Under **Authentication**, select **SSH Key** and choose your existing key from the list. DigitalOcean stores a **public** key. Never upload or paste the private key file (for example `id_ed25519` or `id_rsa` without a `.pub` suffix).

If your key is not listed, open a terminal on the computer that contains it and copy the public key:

```bash
cat ~/.ssh/id_ed25519.pub
```

If your key has another name, replace `id_ed25519.pub` with the file ending in `.pub`. Add that public-key text through **Settings → Security → SSH keys**, then return to Droplet creation and select it. DigitalOcean supports adding an SSH public key before a Droplet is created so it can be installed at provisioning time.[1]

## 3. Keep the Initial Firewall Tight

After creating the Droplet, create or attach a Cloud Firewall with these initial inbound rules.

| Protocol | Port | Source | Purpose |
|---|---:|---|---|
| TCP | 22 | **Your current public IP only** | SSH administration. |
| TCP | 80 | Public | HTTP, only if a reverse proxy is later configured. |
| TCP | 443 | Public | HTTPS, only if a reverse proxy and TLS are later configured. |

Do **not** expose the Node.js backend port `3001` publicly as the long-term configuration. We will first verify it locally through SSH or the Droplet Console, then decide whether to place it behind an HTTPS reverse proxy. DigitalOcean recommends SSH keys, a non-root sudo user, disabled root-password login, and a restricted Cloud Firewall for production Droplets.[2]

## 4. Confirm Access

Once creation completes, copy the new public IP address. You can use **Access → Launch Droplet Console** from the Droplet page if regular SSH is unavailable; the console is intended for recovery and access troubleshooting.[3]

From your local terminal, use the private half of your existing key:

```bash
chmod 600 ~/.ssh/id_ed25519
ssh -i ~/.ssh/id_ed25519 root@NEW_DROPLET_IP
```

Replace the key path and `NEW_DROPLET_IP` as needed. On first connection, accept the new host fingerprint only after confirming that the IP matches the newly created Droplet.

## 5. Stop Here and Send Me the New IP

After you can reach the server, reply with the **new Droplet IP address** and confirm that the command below prints the Ubuntu hostname:

```bash
hostname
```

I will then provide the exact backend-installation commands, deploy the existing backend package, configure process supervision, and validate the health endpoint and queued feedback delivery.

## References

[1]: https://docs.digitalocean.com/products/droplets/how-to/add-ssh-keys/ "DigitalOcean: Add SSH Keys to Droplets"

[2]: https://docs.digitalocean.com/products/droplets/getting-started/recommended-droplet-setup/ "DigitalOcean: Recommended Droplet Setup"

[3]: https://docs.digitalocean.com/products/droplets/how-to/connect-with-console/ "DigitalOcean: Connect with the Droplet Console"
