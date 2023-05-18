SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

PREFIX="$SCRIPTPATH/envs/aroma"

# Check conda/mamba/etc.
echo "- Finding conda command..."
if command -v micromamba 2>&1 > /dev/null
then
  MAMBA=micromamba
  echo "- Found micromamba"
elif command -v mamba 2>&1 > /dev/null
then
  MAMBA=mamba
  echo "- Found mamba"
elif command -v conda 2>&1 > /dev/null
then
  MAMBA=conda
  echo "- Found conda"
else
  echo "[ERROR] Cannot find micromamba/mamba/conda"
  exit 1
fi

echo "- Initialize shell"
eval "$($MAMBA shell hook -s bash)"

# Test activate
echo "- Try to activate $PREFIX"
if ! $MAMBA activate "$PREFIX" 2>&1 > /dev/null
then
  # if uname is Darwin, use mac.yaml
  echo "- Failed to activate $PREFIX, create new environment"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "- Detected macOS, use mac.yaml"
    $MAMBA create -y -p "$PREFIX" -f "$SCRIPTPATH/environment/mac.yaml"
  else
    echo "- Use linux.yaml"
    $MAMBA create -y -p "$PREFIX" -f "$SCRIPTPATH/environment/linux.yaml"
  fi
  echo "- Re-try to activate $PREFIX"
  $MAMBA activate "$PREFIX"
fi