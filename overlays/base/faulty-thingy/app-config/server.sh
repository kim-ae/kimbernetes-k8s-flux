#!/bin/sh
set -e
apk add --no-cache iproute2 python3 2>/dev/null

CONNECT_DELAY_SECONDS="${CONNECT_DELAY_SECONDS:-65}"

# Delay only outbound SYN-ACK packets from tcp source port 8080 so the TCP
# handshake itself takes more than 60 seconds to complete while established
# traffic can flow normally after the connection is created.
echo "==> tc: delaying outbound SYN-ACK packets from :8080 by ${CONNECT_DELAY_SECONDS}s"
tc qdisc replace dev eth0 root handle 1: prio bands 3
tc qdisc replace dev eth0 parent 1:3 handle 30: netem delay "${CONNECT_DELAY_SECONDS}s"
tc filter replace dev eth0 protocol ip parent 1:0 prio 3 u32 \
    match ip protocol 6 0xff \
    match ip sport 8080 0xffff \
    match u8 0x12 0xff at 33 \
    flowid 1:3

tc -s qdisc show dev eth0
echo "==> Starting HTTP server on :8080 (TCP connect takes > ${CONNECT_DELAY_SECONDS}s)"
exec python3 /scripts/server.py
