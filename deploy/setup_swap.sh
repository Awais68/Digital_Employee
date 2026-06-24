#!/bin/bash
# setup_swap.sh — Run once on Oracle VM to add 2GB swap
set -euo pipefail

SWAP_SIZE="${1:-2G}"
SWAPFILE="/swapfile"

if swapon --show | grep -q "$SWAPFILE"; then
  echo "Swap already active on $SWAPFILE ($(swapon --show | grep "$SWAPFILE" | awk '{print $3}'))"
  exit 0
fi

echo "Creating ${SWAP_SIZE} swap file..."
sudo fallocate -l "$SWAP_SIZE" "$SWAPFILE"
sudo chmod 600 "$SWAPFILE"
sudo mkswap "$SWAPFILE"
sudo swapon "$SWAPFILE"

if ! grep -q "$SWAPFILE" /etc/fstab; then
  echo "$SWAPFILE none swap sw 0 0" | sudo tee -a /etc/fstab
fi

sudo sysctl vm.swappiness=10
if ! grep -q 'vm.swappiness' /etc/sysctl.conf; then
  echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
fi

echo "✅ Swap ${SWAP_SIZE} active:"
swapon --show
free -h
