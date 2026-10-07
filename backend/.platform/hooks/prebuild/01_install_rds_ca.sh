#!/usr/bin/env bash
set -euo pipefail

readonly ca_dir="/etc/pki/rds"
readonly ca_path="${ca_dir}/global-bundle.pem"
readonly ca_url="https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem"
readonly ca_temp="/tmp/aws-rds-global-bundle.pem"

install -d -m 0755 "$ca_dir"
curl --fail --silent --show-error --location --retry 3 \
  --output "$ca_temp" "$ca_url"
install -m 0644 "$ca_temp" "$ca_path"
