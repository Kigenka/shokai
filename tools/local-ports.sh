#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Run a command in a private network namespace (loopback only) whose ephemeral ports are 5102-5179 (TIME_WAIT reuse on), so every test that listens on
# port 0 stays inside the builders' range and never meets another process's port (5101 included). No network out.
#   tools/local-ports.sh npm test
exec unshare -rn bash -c 'ip link set lo up && echo "5102 5179" > /proc/sys/net/ipv4/ip_local_port_range && echo 1 > /proc/sys/net/ipv4/tcp_tw_reuse && exec "$@"' bash "$@"
