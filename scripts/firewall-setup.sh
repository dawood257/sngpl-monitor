#!/bin/bash
LAN_CIDR="${1:-10.0.0.0/8}"
firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=$LAN_CIDR port port=3000 protocol=tcp accept"
firewall-cmd --reload
echo "Port 3000 open to $LAN_CIDR"