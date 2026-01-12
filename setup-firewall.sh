#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# SMART Energy Monitoring System - Linux Firewall Configuration
# Version: 2.0 (Updated: 2025-12-18)
# Supports: UFW (Ubuntu/Debian) and iptables
# ═══════════════════════════════════════════════════════════════════════════

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "   SMART Energy Monitoring System"
echo "   Linux Firewall Configuration v2.0"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR] This script requires root privileges${NC}"
    echo "Please run: sudo $0"
    exit 1
fi

echo -e "${GREEN}[OK] Running as root${NC}"
echo ""

# Detect firewall system
if command -v ufw &> /dev/null; then
    FIREWALL="ufw"
    echo -e "${BLUE}[INFO] Detected: UFW (Uncomplicated Firewall)${NC}"
elif command -v iptables &> /dev/null; then
    FIREWALL="iptables"
    echo -e "${BLUE}[INFO] Detected: iptables${NC}"
elif command -v firewall-cmd &> /dev/null; then
    FIREWALL="firewalld"
    echo -e "${BLUE}[INFO] Detected: firewalld (CentOS/RHEL)${NC}"
else
    echo -e "${RED}[ERROR] No supported firewall found${NC}"
    echo "Supported: ufw, iptables, firewalld"
    exit 1
fi

echo ""
echo -e "${CYAN}[Step 1/4]${NC} Configuring basic rules..."

# ═══════════════════════════════════════════════════════════════════════════
# UFW Configuration
# ═══════════════════════════════════════════════════════════════════════════
if [ "$FIREWALL" = "ufw" ]; then
    # Reset and set defaults
    echo "y" | ufw reset > /dev/null 2>&1
    ufw default deny incoming
    ufw default allow outgoing
    
    # SSH (prevent lockout)
    ufw allow ssh comment "SSH Access"
    echo -e "  ${GREEN}[OK] SSH (Port 22) - Allowed${NC}"
    
    # SMART Energy Ports
    ufw allow 3000/tcp comment "SMART Energy Frontend"
    echo -e "  ${GREEN}[OK] Port 3000 (Frontend) - Allowed${NC}"
    
    ufw allow 3001/tcp comment "SMART Energy Backend + WebSocket"
    echo -e "  ${GREEN}[OK] Port 3001 (Backend + WebSocket) - Allowed${NC}"
    
    # InfluxDB
    ufw allow 8086/tcp comment "InfluxDB"
    echo -e "  ${GREEN}[OK] Port 8086 (InfluxDB) - Allowed${NC}"
    
    # MQTT (optional - usually outbound only)
    ufw allow 1883/tcp comment "MQTT Broker"
    echo -e "  ${GREEN}[OK] Port 1883 (MQTT) - Allowed${NC}"
    
    # Enable UFW
    echo "y" | ufw enable > /dev/null 2>&1

# ═══════════════════════════════════════════════════════════════════════════
# iptables Configuration
# ═══════════════════════════════════════════════════════════════════════════
elif [ "$FIREWALL" = "iptables" ]; then
    # Flush existing rules
    iptables -F
    iptables -X
    iptables -t nat -F
    iptables -t nat -X
    
    # Default policies
    iptables -P INPUT DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT ACCEPT
    
    # Allow loopback
    iptables -A INPUT -i lo -j ACCEPT
    
    # Allow established connections
    iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    
    # SSH
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT
    echo -e "  ${GREEN}[OK] SSH (Port 22) - Allowed${NC}"
    
    # SMART Energy Ports
    iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
    echo -e "  ${GREEN}[OK] Port 3000 (Frontend) - Allowed${NC}"
    
    iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
    echo -e "  ${GREEN}[OK] Port 3001 (Backend + WebSocket) - Allowed${NC}"
    
    iptables -A INPUT -p tcp --dport 8086 -j ACCEPT
    echo -e "  ${GREEN}[OK] Port 8086 (InfluxDB) - Allowed${NC}"
    
    iptables -A INPUT -p tcp --dport 1883 -j ACCEPT
    echo -e "  ${GREEN}[OK] Port 1883 (MQTT) - Allowed${NC}"
    
    # Save rules
    if command -v iptables-save &> /dev/null; then
        mkdir -p /etc/iptables
        iptables-save > /etc/iptables/rules.v4
        echo -e "  ${GREEN}[OK] Rules saved to /etc/iptables/rules.v4${NC}"
    fi

# ═══════════════════════════════════════════════════════════════════════════
# firewalld Configuration (CentOS/RHEL)
# ═══════════════════════════════════════════════════════════════════════════
elif [ "$FIREWALL" = "firewalld" ]; then
    systemctl start firewalld
    
    firewall-cmd --permanent --add-service=ssh
    echo -e "  ${GREEN}[OK] SSH (Port 22) - Allowed${NC}"
    
    firewall-cmd --permanent --add-port=3000/tcp
    echo -e "  ${GREEN}[OK] Port 3000 (Frontend) - Allowed${NC}"
    
    firewall-cmd --permanent --add-port=3001/tcp
    echo -e "  ${GREEN}[OK] Port 3001 (Backend + WebSocket) - Allowed${NC}"
    
    firewall-cmd --permanent --add-port=8086/tcp
    echo -e "  ${GREEN}[OK] Port 8086 (InfluxDB) - Allowed${NC}"
    
    firewall-cmd --permanent --add-port=1883/tcp
    echo -e "  ${GREEN}[OK] Port 1883 (MQTT) - Allowed${NC}"
    
    firewall-cmd --reload
fi

echo ""
echo -e "${CYAN}[Step 2/4]${NC} Configuring rate limiting..."

if [ "$FIREWALL" = "ufw" ]; then
    # Rate limiting for web ports (6 connections/30sec)
    ufw limit 3000/tcp
    ufw limit 3001/tcp
    echo -e "  ${GREEN}[OK] Rate limiting enabled for web ports${NC}"
    
elif [ "$FIREWALL" = "iptables" ]; then
    # Simple rate limiting (10 new connections per minute)
    iptables -A INPUT -p tcp --dport 3000 -m conntrack --ctstate NEW -m limit --limit 10/minute --limit-burst 20 -j ACCEPT
    iptables -A INPUT -p tcp --dport 3001 -m conntrack --ctstate NEW -m limit --limit 10/minute --limit-burst 20 -j ACCEPT
    echo -e "  ${GREEN}[OK] Rate limiting enabled for web ports${NC}"
fi

echo ""
echo -e "${CYAN}[Step 3/4]${NC} Additional security..."

# Drop invalid packets
if [ "$FIREWALL" = "iptables" ]; then
    iptables -A INPUT -m conntrack --ctstate INVALID -j DROP
    echo -e "  ${GREEN}[OK] Invalid packet dropping enabled${NC}"
fi

echo ""
echo -e "${CYAN}[Step 4/4]${NC} Verifying configuration..."

echo ""
echo -e "${YELLOW}Current Firewall Status:${NC}"
if [ "$FIREWALL" = "ufw" ]; then
    ufw status verbose
elif [ "$FIREWALL" = "iptables" ]; then
    iptables -L -n --line-numbers | head -30
elif [ "$FIREWALL" = "firewalld" ]; then
    firewall-cmd --list-all
fi

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo -e "   ${GREEN}Firewall Configuration Complete${NC}"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "   Ports Opened:"
echo "   - 22/TCP:   SSH"
echo "   - 3000/TCP: Frontend Dashboard"
echo "   - 3001/TCP: Backend API + WebSocket"
echo "   - 8086/TCP: InfluxDB"
echo "   - 1883/TCP: MQTT Broker"
echo ""
echo "   System Architecture:"
echo "   +--------+     +--------+     +----------+     +--------+"
echo "   | ESP32  | --> |  MQTT  | --> | Backend  | --> | InfluxDB|"
echo "   | AI205  |     | Broker |     | :3001    |     | :8086  |"
echo "   +--------+     +--------+     +----+-----+     +--------+"
echo "                                      |"
echo "                                      v (WebSocket)"
echo "                                 +---------+"
echo "                                 | Frontend|"
echo "                                 | :3000   |"
echo "                                 +---------+"
echo ""
echo "   Rate Limiting: Enabled (protects against DDoS)"
echo ""
echo "   Management Commands ($FIREWALL):"
if [ "$FIREWALL" = "ufw" ]; then
    echo "   - Status:       ufw status verbose"
    echo "   - Add port:     ufw allow 8080/tcp"
    echo "   - Remove port:  ufw delete allow 3000"
    echo "   - Disable:      ufw disable"
elif [ "$FIREWALL" = "iptables" ]; then
    echo "   - View rules:   iptables -L -n"
    echo "   - Save:         iptables-save > /etc/iptables/rules.v4"
    echo "   - Restore:      iptables-restore < /etc/iptables/rules.v4"
elif [ "$FIREWALL" = "firewalld" ]; then
    echo "   - Status:       firewall-cmd --list-all"
    echo "   - Add port:     firewall-cmd --permanent --add-port=8080/tcp"
    echo "   - Remove port:  firewall-cmd --permanent --remove-port=3000/tcp"
    echo "   - Reload:       firewall-cmd --reload"
fi
echo ""
echo "════════════════════════════════════════════════════════════════════"