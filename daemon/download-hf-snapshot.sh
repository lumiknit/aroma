#!/bin/bash

echo "[INFO] --- Preparing to start daemon ---"

echo "- Find script path"
set -e
SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

echo "- pwd=$PWD"

echo "- Activate environment"
. $SCRIPTPATH/activate.sh

echo "[INFO] --- Preparing done! ---"
echo "       Run: python $SCRIPTPATH/src/download_hf_snapshot.py $@"

python $SCRIPTPATH/src/download_hf_snapshot.py $@
