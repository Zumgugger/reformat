#!/bin/bash
# Helper script to run npm commands with nvm loaded

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Run the command passed as arguments
cd /mnt/e/Programmierenab24/reformat
"$@"
