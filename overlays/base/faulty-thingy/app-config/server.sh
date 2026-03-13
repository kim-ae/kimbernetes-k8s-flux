#!/bin/sh
set -e
apk add --no-cache iproute2 iptables python3 2>/dev/null

CONNECT_DELAY_ENABLED="${CONNECT_DELAY_ENABLED:-true}"
CONNECT_DELAY_SECONDS="${CONNECT_DELAY_SECONDS:-65}"
SYN_ACK_DROP_PROBABILITY="${SYN_ACK_DROP_PROBABILITY:-0}"

if [ "${CONNECT_DELAY_ENABLED}" = "true" ] || [ "${CONNECT_DELAY_ENABLED}" = "1" ]; then
    echo "==> tc: delaying outbound SYN-ACK packets from :8080 by ${CONNECT_DELAY_SECONDS}s"
    tc qdisc replace dev eth0 root handle 1: prio bands 3
    tc qdisc replace dev eth0 parent 1:3 handle 30: netem delay "${CONNECT_DELAY_SECONDS}s"
    tc filter replace dev eth0 protocol ip parent 1:0 prio 3 u32 \
        match ip protocol 6 0xff \
        match ip sport 8080 0xffff \
        match u8 0x12 0xff at 33 \
        flowid 1:3
    tc -s qdisc show dev eth0
else
    echo "==> tc: SYN-ACK delay disabled"
fi

if [ "${SYN_ACK_DROP_PROBABILITY}" != "0" ]; then
    echo "==> iptables: dropping SYN-ACK packets from :8080 with probability ${SYN_ACK_DROP_PROBABILITY}"
    iptables -A OUTPUT -p tcp --sport 8080 --tcp-flags SYN,ACK SYN,ACK \
        -m statistic --mode random --probability "${SYN_ACK_DROP_PROBABILITY}" \
        -j DROP
    iptables -L OUTPUT -n -v | grep 8080 || true
else
    echo "==> iptables: SYN-ACK drop disabled"
fi

echo "==> Starting HTTP server on :8080"
exec python3 /scripts/server.py
