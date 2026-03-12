#!/bin/sh
set -e
apk add --no-cache iptables python3 2>/dev/null

# Drop 30% of incoming SYN packets before the kernel completes the TCP handshake.
# --syn       : match only the initial SYN (not established connections)
# --mode random --probability 0.30 : stateless per-packet random drop
echo "==> iptables: DROP 30% SYN packets on :8080"
iptables -A INPUT -p tcp --dport 8080 --syn \
    -m statistic --mode random --probability 0.30 \
    -j DROP

iptables -L INPUT -n -v | grep 8080 || true
echo "==> Starting HTTP server on :8080 (70% will connect successfully)"
exec python3 /scripts/server.py
