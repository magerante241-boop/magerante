#!/data/data/com.termux/files/usr/bin/bash
set -e
ancien=$(grep -oP 'magerante-v\K[0-9]+' sw.js)
nouveau=$((ancien + 1))
sed -i "s/magerante-v${ancien}/magerante-v${nouveau}/" sw.js
echo "Cache bump : v${ancien} -> v${nouveau}"
