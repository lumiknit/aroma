#!/bin/bash

echo "- Find script path"
set -e
SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

echo "[INFO] --- Preparing done! ---"
echo "       Run: python $SCRIPTPATH/src/main.py $@"

# Create signal forwarding for
# - SIGINT
# - SIGTERM
# - SIGHUP

_int() {
  echo "Caught SIGINT signal!"
  kill -INT "$child" 2>/dev/null
}
trap _int SIGINT

_term() {
  echo "Caught SIGTERM signal!"
  kill -TERM "$child" 2>/dev/null
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
wait "$child"
