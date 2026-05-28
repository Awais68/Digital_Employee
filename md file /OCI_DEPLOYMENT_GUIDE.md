# 🚀 Oracle Cloud Infrastructure (OCI) Deployment Guide

This guide will walk you through deploying your **Digital Employee** project to Oracle Cloud Infrastructure (OCI) using the **Always Free** tier.

---

## 📋 Prerequisites

- An [Oracle Cloud Account](https://www.oracle.com/cloud/free/)
- Your project code pushed to a Git repository (e.g., GitHub, GitLab)
- Basic familiarity with the command line

---

## 1. Create your Compute Instance (VM)

OCI offers powerful ARM-based "Always Free" instances.

1.  **Login** to the OCI Console.
2.  Go to **Compute** > **Instances**.
3.  Click **Create Instance**.
4.  **Name:** `Digital-Employee-VM`
5.  **Image and Shape:**
    *   **Image:** Ubuntu 22.04 (Recommended for beginners)
    *   **Shape:** Click "Change Shape" -> Select **Ampere (ARM)** -> **VM.Standard.A1.Flex**.
    *   **Configuration:** 4 OCPUs and 24 GB RAM (This is the max for Always Free).
6.  **Networking:** Use the default VCN and subnet. Ensure "Assign a public IPv4 address" is checked.
7.  **Add SSH Keys:**
    *   Select **Generate a key pair for me**.
    *   **IMPORTANT:** Click **Save Private Key** and **Save Public Key** to your computer.
8.  **Boot Volume:** Default (47 GB) is fine.
9.  Click **Create**.

---

## 2. Configure Networking (Firewall)

By default, OCI blocks most traffic. Your bot mostly "pulls" data, but if you want to access any dashboards later, you need to open ports.

1.  On the Instance Details page, click on the **Virtual Cloud Network** link.
2.  Click on your **Subnet**.
3.  Click on the **Default Security List**.
4.  Click **Add Ingress Rules**.
    *   **Source CIDR:** `0.0.0.0/0`
    *   **IP Protocol:** `TCP`
    *   **Destination Port Range:** `80, 443` (For web access if needed)
5.  Click **Add Ingress Rules**.

---

## 3. Connect to your VM

1.  Find your **Public IP Address** on the Instance Details page.
2.  Open your terminal and run:
    ```bash
    chmod 400 ~/path/to/your/private_key.key
    ssh -i ~/path/to/your/private_key.key ubuntu@YOUR_PUBLIC_IP
    ```

---

## 4. Install Docker & Docker Compose

Once logged into the VM, run these commands:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install -y docker-compose-plugin

# Add your user to the docker group
sudo usermod -aG docker $USER
# Log out and log back in for this to take effect
exit
```

---

## 5. Deploy Your Code

1.  **Log back in** to the VM.
2.  **Clone your repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/Digital_Employee.git
    cd Digital_Employee
    ```
3.  **Setup Environment Variables:**
    ```bash
    cp .env.example .env
    nano .env
    ```
    *Fill in your API keys (OpenAI, Twilio, LinkedIn, etc.) and Gmail credentials.*

4.  **Gmail Authentication:**
    If you are using the Gmail Watcher, you'll need to place your `credentials.json` in the project root and run the auth script once:
    ```bash
    # This might require a local browser session; see GMAIL_SETUP_GUIDE.md
    python3 gmail_watcher.py --auth
    ```

---

## 6. Run the System

Now you can start the entire system in the background:

```bash
# Build and start containers
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f orchestrator
```

---

## 7. Maintenance & Tips

*   **View Dashboard:** Since the system uses `Dashboard.md`, you can view it by SSHing and running `cat Dashboard.md`.
*   **Automatic Restarts:** The `docker-compose.yml` is configured with `restart: unless-stopped`, so your bot will start automatically if the VM reboots.
*   **Updating:**
    ```bash
    git pull
    docker compose up -d --build
    ```

---

**Congratulations!** Your Digital Employee is now running 24/7 on the cloud.
