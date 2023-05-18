#!/bin/bash

echo "[INFO] --- Preparing to start daemon ---"

echo "- Find script path"
set -e
SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

echo "- pwd=$PWD"

echo "- Activate environment"
. $SCRIPTPATH/activate.sh

. $SCRIPTPATH/run_without_activate.sh $@