#!/bin/bash
# Install Docker Engine on Ubuntu 24.04 WSL
set -e

echo "🐳 Installing Docker..."

# 1. Update and install prerequisites
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# 2. Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# 3. Setup repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. Install Docker packages
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. Start Docker Service
echo "🚀 Starting Docker Service..."
sudo service docker start || sudo systemctl start docker

# 6. Add user to docker group
sudo usermod -aG docker $USER

echo ""
echo "✅ Docker installed successfully!"
echo "⚠️  NOTE: You may need to specify 'sudo' for docker commands in this session."
echo ""
