#!/bin/bash

echo "[INFO] --- Preparing to start daemon ---"

echo "- Find script path"
set -e
SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

echo "- pwd=$PWD"

echo "- Activate environment"
. $SCRIPTPATH/activate.sh

echo "[INFO] --- Preparing done! ---"
echo "       Run: python $SCRIPTPATH/src/main.py $@"

# Create signal forwarding for
# - SIGINT
# - SIGTERM
# - SIGHUP

_int() {
  echo "Caught SIGINT signal!"
  kill -HUP "$child" 2>/dev/null
}
trap _int SIGINT

_term() {
  echo "Caught SIGTERM signal!"
  kill -HUP "$child" 2>/dev/null
}
trap _term SIGTERM

_hup() {
  echo "Caught SIGHUP signal!"
  kill -HUP "$child" 2>/dev/null
}
trap _hup SIGHUP

# Create child process

python $SCRIPTPATH/src/main.py $@ &
child=$!
echo "[INFO] Child process PID: $child"
wait "$child"
