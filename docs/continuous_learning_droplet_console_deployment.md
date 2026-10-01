# Continuous-Learning Backend: DigitalOcean Console Deployment

**Purpose.** This guide deploys the lightweight compatibility service committed to [`bjan212/inverse-iq`](https://github.com/bjan212/inverse-iq) at commit `a7096e3`. The service only provides Xrypt’s required health, statistics, and authenticated verified-feedback endpoints. It does not handle exchange credentials, execute orders, or control the stopped auto-trader.

> Keep the terminal-generated feedback key private. Do not paste it into chat, commit it to Git, or expose it in a browser variable.

## 1. Prepare the low-memory Ubuntu host

The new Droplet has approximately 458 MB RAM and 6.5 GB free disk. The following setup adds a 1 GB swap file, installs a supported Node LTS binary, creates an unprivileged service user, and configures the host firewall. Swap reduces immediate out-of-memory risk but is not a substitute for RAM. Node recommends using an Active or Maintenance LTS line in production; the current LTS download is Node v24.20.0. [1] [2]

Run this entire block from the DigitalOcean Console as `root`:

```bash
apt-get update && apt-get upgrade -y
apt-get install -y ca-certificates curl xz-utils ufw git

# Add persistent 1 GB swap only if the Droplet does not already have it.
if ! swapon --show | grep -q '^/swapfile'; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-inverseiq-swap.conf
sysctl --system
free -h

# Install the current Node LTS binary with the published SHA-256 checksum.
NODE_VERSION=v24.20.0
cd /tmp
curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz"
curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"
grep " node-${NODE_VERSION}-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum -c -
tar -xJf "node-${NODE_VERSION}-linux-x64.tar.xz" -C /usr/local --strip-components=1
/usr/local/bin/node --version
/usr/local/bin/npm --version

# Create a non-login account that owns only this service’s files.
if ! id inverseiq >/dev/null 2>&1; then
  adduser --system --group --home /opt/inverse-iq inverseiq
fi
install -d -m 750 -o inverseiq -g inverseiq /opt/inverse-iq /var/lib/inverseiq-learning

# Lock down inbound traffic before the service is exposed. Do not open port 3001.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable
ufw status verbose
```

DigitalOcean documents the swap-file sequence and UFW host firewall process. Keep SSH allowed before enabling UFW so your existing key-based access remains available. [3] [4]

## 2. Give this Droplet read-only access to only the backend repository

Create a dedicated deploy key on the Droplet. It is limited to one repository and is read-only unless write permission is explicitly granted in GitHub; leave **Allow write access** unchecked. [5]

Run:

```bash
sudo -u inverseiq -H bash -c 'umask 077; ssh-keygen -t ed25519 -f ~/.ssh/inverseiq_deploy -N "" -C "inverseiq-backend-droplet"'
cat /opt/inverse-iq/.ssh/inverseiq_deploy.pub
```

In a separate browser tab, open [the backend repository settings](https://github.com/bjan212/inverse-iq/settings/keys), choose **Deploy keys → Add deploy key**, give it the title `inverseiq-backend-droplet`, paste the displayed public key, **leave write access off**, and save. Only the public key is entered on GitHub.

Return to the Droplet Console and verify the GitHub host fingerprint. When prompted, type `yes` only if the displayed Ed25519 fingerprint is exactly `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`. [6]

```bash
sudo -u inverseiq -H ssh -i /opt/inverse-iq/.ssh/inverseiq_deploy -o IdentitiesOnly=yes -T git@github.com
```

The expected successful message says that authentication succeeded but GitHub does not provide shell access.

## 3. Clone and start the compatibility service locally

Run these commands after the deploy key verifies successfully:

```bash
sudo -u inverseiq -H env GIT_SSH_COMMAND='ssh -i /opt/inverse-iq/.ssh/inverseiq_deploy -o IdentitiesOnly=yes' git clone git@github.com:bjan212/inverse-iq.git /opt/inverse-iq/app
sudo -u inverseiq -H git -C /opt/inverse-iq/app rev-parse --short HEAD
# Expected revision: a7096e3 or a newer approved revision.

install -m 600 -o root -g root /dev/null /etc/inverseiq-continuous-learning.env
nano /etc/inverseiq-continuous-learning.env
```

In the editor, enter exactly the following four lines. Generate a **new random key of 32 characters or more** on the Droplet with `openssl rand -base64 48`, then paste it in place of `REPLACE_WITH_NEW_RANDOM_KEY`.

```dotenv
PORT=3001
BIND_HOST=127.0.0.1
LEARNING_DATA_PATH=/var/lib/inverseiq-learning/outcomes.json
CONTINUOUS_LEARNING_API_KEY=REPLACE_WITH_NEW_RANDOM_KEY
```

Save the file, then install and start the service:

```bash
install -m 644 /opt/inverse-iq/app/deploy/inverseiq-continuous-learning.service /etc/systemd/system/inverseiq-continuous-learning.service
systemctl daemon-reload
systemctl enable --now inverseiq-continuous-learning
systemctl status inverseiq-continuous-learning --no-pager

curl -fsS http://127.0.0.1:3001/api/health && echo
curl -fsS http://127.0.0.1:3001/api/ai/stats && echo
ss -ltnp | grep ':3001'
```

The last command must show a listener at `127.0.0.1:3001`, not `0.0.0.0:3001`. This intentionally prevents unencrypted public access to the feedback key.

## 4. Stop here and provide non-sensitive verification output

Paste the output of the following commands into the task, redacting nothing except the key itself. Do **not** run any command that prints `/etc/inverseiq-continuous-learning.env`.

```bash
systemctl is-active inverseiq-continuous-learning
curl -fsS http://127.0.0.1:3001/api/health && echo
curl -fsS http://127.0.0.1:3001/api/ai/stats && echo
ss -ltnp | grep ':3001'
```

The next stage is an HTTPS reverse proxy on a dedicated hostname, such as `learning.xrypt.net`. Create the DNS A record only after the local checks succeed. Because the feedback request contains an authentication key, the public Xrypt application must communicate with the Droplet over HTTPS; raw port 3001 will remain closed.

## References

[1] [Node.js Releases](https://nodejs.org/en/about/previous-releases) — production applications should use Active LTS or Maintenance LTS releases.

[2] [Node.js Download](https://nodejs.org/en/download) — current LTS download and published checksum manifest.

[3] [DigitalOcean: Add Swap Space on Ubuntu](https://www.digitalocean.com/community/tutorials/how-to-add-swap-space-on-ubuntu-22-04).

[4] [DigitalOcean: Set Up a Firewall with UFW on Ubuntu](https://www.digitalocean.com/community/tutorials/how-to-set-up-a-firewall-with-ufw-on-ubuntu).

[5] [GitHub Docs: Managing Deploy Keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

[6] [GitHub Docs: SSH Key Fingerprints](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints).
